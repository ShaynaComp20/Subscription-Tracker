// Turns one raw email into structured "signals": who sent it, how much was charged,
// how often it bills, and when the next charge is. Detection (detect.ts) then looks at
// all the signals from one sender together.

import { dateToISO, type BillingCycle } from "./dates";
import { findMerchantByDomain, findMerchantByName, isPaymentProcessor, type Merchant } from "./merchants";

export interface RawEmail {
  id: string;
  from: string;
  subject: string;
  /** Milliseconds since epoch. */
  date: number;
  body: string;
}

export interface EmailSignal {
  emailId: string;
  subject: string;
  date: string;
  /** Groups emails that belong to the same subscription. */
  merchantKey: string;
  merchantName: string;
  merchant: Merchant | null;
  senderDomain: string;
  amount: number | null;
  currency: string | null;
  cycleHint: BillingCycle | null;
  /** An explicit "renews on ..." / "trial ends on ..." date found in the text. */
  nextBillingDate: string | null;
  isTrial: boolean;
  /** How strongly the wording suggests a recurring charge. */
  score: number;
}

const STRONG_WORDS = [
  "subscription",
  "renew",
  "recurring",
  "membership",
  "auto-renew",
  "next billing",
  "next payment",
  "free trial",
  "trial ends",
  "your plan",
  "billing period",
  "billed monthly",
  "billed annually",
  "automatic payment",
];
const WEAK_WORDS = ["receipt", "invoice", "payment", "charged", "billing", "paid", "premium"];
// Wording that usually means a one-off purchase or marketing rather than a charge.
const NEGATIVE_WORDS = ["has shipped", "out for delivery", "was delivered", "your order has", "% off", "limited time offer", "unsubscribe from this newsletter"];

// --- sender ----------------------------------------------------------------------------

export function parseSender(from: string): { name: string; email: string; domain: string } {
  const match = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  const email = (match ? match[2] : from).trim().toLowerCase();
  const name = (match ? match[1] : "").trim();
  const domain = rootDomain(email.split("@")[1] ?? "");
  return { name, email, domain };
}

/** "email.apple.com" -> "apple.com", "mail.amazon.co.uk" -> "amazon.co.uk". */
export function rootDomain(host: string): string {
  const parts = host.toLowerCase().split(".").filter(Boolean);
  if (parts.length <= 2) return parts.join(".");
  const secondLevel = parts[parts.length - 2];
  const tld = parts[parts.length - 1];
  const takeThree = tld.length === 2 && ["co", "com", "org", "net", "ac", "gov"].includes(secondLevel);
  return parts.slice(takeThree ? -3 : -2).join(".");
}

// --- amounts -----------------------------------------------------------------------------

const SYMBOL_CURRENCY: Record<string, string> = {
  "us$": "USD",
  $: "USD", // overridable with DEFAULT_DOLLAR_CURRENCY, see currencyFor()
  "ca$": "CAD",
  c$: "CAD",
  "au$": "AUD",
  a$: "AUD",
  "€": "EUR",
  "£": "GBP",
  "₹": "INR",
  rs: "INR",
  "rs.": "INR",
  inr: "INR",
  usd: "USD",
  eur: "EUR",
  gbp: "GBP",
  cad: "CAD",
  aud: "AUD",
};

const NUMBER = String.raw`(\d{1,3}(?:[,.]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)`;
// Letter prefixes need a word boundary so "hours 5" isn't read as "Rs 5".
const PREFIX_RE = new RegExp(String.raw`(\bUS\$|\bCA\$|\bAU\$|\bC\$|\bA\$|\$|€|£|₹|\bRs\.?|\bINR|\bUSD|\bEUR|\bGBP|\bCAD|\bAUD)\s?` + NUMBER, "gi");
const SUFFIX_RE = new RegExp(NUMBER + String.raw`\s?(€|£|USD|EUR|GBP|INR|CAD|AUD)(?![a-z])`, "gi");
const AMOUNT_CONTEXT = /(total|amount|charged|charge of|price|billed|payment of|you paid|renews? (?:at|for)|per (?:month|year))/i;

function currencyFor(symbol: string): string | undefined {
  const key = symbol.toLowerCase();
  if (key === "$") return process.env.DEFAULT_DOLLAR_CURRENCY || "USD";
  return SYMBOL_CURRENCY[key];
}

function toNumber(raw: string): number {
  // "1,299.00" / "1.299,00" / "9,99" / "9.99"
  const lastSep = Math.max(raw.lastIndexOf("."), raw.lastIndexOf(","));
  const decimals = lastSep >= 0 ? raw.length - lastSep - 1 : 0;
  if (lastSep >= 0 && decimals <= 2) {
    const intPart = raw.slice(0, lastSep).replace(/[.,]/g, "");
    return Number(`${intPart}.${raw.slice(lastSep + 1)}`);
  }
  return Number(raw.replace(/[.,]/g, ""));
}

export function extractAmount(text: string): { amount: number; currency: string } | null {
  const found: { amount: number; currency: string | undefined; index: number }[] = [];
  for (const m of text.matchAll(PREFIX_RE)) {
    found.push({ amount: toNumber(m[2]), currency: currencyFor(m[1]), index: m.index ?? 0 });
  }
  for (const m of text.matchAll(SUFFIX_RE)) {
    found.push({ amount: toNumber(m[1]), currency: currencyFor(m[2]), index: m.index ?? 0 });
  }
  const plausible = found.filter((f) => f.currency && Number.isFinite(f.amount) && f.amount > 0 && f.amount < 100_000);
  if (plausible.length === 0) return null;
  // Prefer an amount that sits right after words like "total" or "charged".
  const inContext = plausible.find((f) => AMOUNT_CONTEXT.test(text.slice(Math.max(0, f.index - 60), f.index)));
  const best = inContext ?? plausible.sort((a, b) => a.index - b.index)[0];
  return { amount: Math.round(best.amount * 100) / 100, currency: best.currency! };
}

// --- billing cycle -----------------------------------------------------------------------

export function extractCycle(text: string): BillingCycle | null {
  const t = text.toLowerCase();
  if (/\b(annual(ly)?|yearly|per year|a year|\/\s?(yr|year)|every year|12[- ]month)\b/.test(t)) return "yearly";
  if (/\b(quarterly|every 3 months|per quarter|3[- ]month plan)\b/.test(t)) return "quarterly";
  if (/\b(weekly|per week|a week|\/\s?(wk|week)|every week)\b/.test(t)) return "weekly";
  if (/\b(monthly|per month|a month|\/\s?(mo|month)|every month|1[- ]month plan)\b/.test(t)) return "monthly";
  return null;
}

// --- dates -------------------------------------------------------------------------------

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH = String.raw`(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)`;
const DATE_PATTERNS: { re: RegExp; parse: (m: RegExpMatchArray) => [number, number, number] }[] = [
  // March 5, 2026 / Mar 5 2026
  { re: new RegExp(String.raw`\b${MONTH}\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b`, "i"), parse: (m) => [Number(m[3]), monthIndex(m[1]), Number(m[2])] },
  // 5 March 2026 / 5th Mar, 2026
  { re: new RegExp(String.raw`\b(\d{1,2})(?:st|nd|rd|th)?\s+${MONTH}\.?,?\s+(\d{4})\b`, "i"), parse: (m) => [Number(m[3]), monthIndex(m[2]), Number(m[1])] },
  // 2026-03-05
  { re: /\b(\d{4})-(\d{2})-(\d{2})\b/, parse: (m) => [Number(m[1]), Number(m[2]) - 1, Number(m[3])] },
];

function monthIndex(name: string): number {
  return MONTHS.indexOf(name.slice(0, 3).toLowerCase());
}

function parseDate(text: string): string | null {
  let best: { index: number; iso: string } | null = null;
  for (const { re, parse } of DATE_PATTERNS) {
    const m = text.match(re);
    if (!m || m.index === undefined) continue;
    const [y, mo, d] = parse(m);
    const date = new Date(Date.UTC(y, mo, d));
    if (mo < 0 || date.getUTCMonth() !== mo || date.getUTCDate() !== d) continue;
    if (!best || m.index < best.index) best = { index: m.index, iso: dateToISO(date) };
  }
  return best?.iso ?? null;
}

const NEXT_DATE_TRIGGER = /(renews?(?:al)?(?: date)?(?: is)?(?: on)?|next (?:billing|payment|charge|renewal)(?: date)?(?: is)?(?: on)?|will (?:be )?(?:charged|billed|renew)(?: on)?|(?:free )?trial (?:ends|expires|will end)(?: on)?|billing date:?|due (?:on|date))/gi;

export function extractNextBillingDate(text: string): { date: string; isTrial: boolean } | null {
  for (const m of text.matchAll(NEXT_DATE_TRIGGER)) {
    const start = (m.index ?? 0) + m[0].length;
    const date = parseDate(text.slice(start, start + 60));
    if (date) return { date, isTrial: /trial/i.test(m[0]) };
  }
  return null;
}

// --- putting it together -------------------------------------------------------------------

function scoreText(text: string): number {
  const t = text.toLowerCase();
  let score = 0;
  for (const w of STRONG_WORDS) if (t.includes(w)) score += 2;
  for (const w of WEAK_WORDS) if (t.includes(w)) score += 1;
  for (const w of NEGATIVE_WORDS) if (t.includes(w)) score -= 3;
  return score;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function parseEmail(email: RawEmail): EmailSignal {
  const sender = parseSender(email.from);
  const text = `${email.subject}\n${email.body}`;

  let merchant = findMerchantByDomain(sender.domain, text);
  let merchantKey: string;
  let merchantName: string;

  if (merchant) {
    merchantKey = `m:${slug(merchant.name)}`;
    merchantName = merchant.name;
  } else if (isPaymentProcessor(sender.domain)) {
    // PayPal/Stripe/etc: figure out who the payment was actually to.
    merchant = findMerchantByName(text);
    const payee = email.subject.match(/(?:payment to|paid|receipt from|subscription to|invoice from)\s+([A-Z][\w&.' -]{1,40}?)(?:\s*[-–|(:]|$)/i)?.[1];
    merchantName = merchant?.name ?? payee?.trim() ?? sender.name ?? sender.domain;
    merchantKey = merchant ? `m:${slug(merchant.name)}` : `n:${slug(merchantName)}`;
  } else {
    merchantName = sender.name && !/no.?reply|billing|receipts?|support|team/i.test(sender.name)
      ? sender.name
      : titleCase(sender.domain.split(".")[0]);
    merchantKey = `d:${sender.domain}`;
  }

  const amount = extractAmount(text);
  const next = extractNextBillingDate(text);

  return {
    emailId: email.id,
    subject: email.subject,
    date: dateToISO(new Date(email.date)),
    merchantKey,
    merchantName,
    merchant,
    senderDomain: sender.domain,
    amount: amount?.amount ?? null,
    currency: amount?.currency ?? null,
    cycleHint: extractCycle(text),
    nextBillingDate: next?.date ?? null,
    isTrial: next?.isTrial ?? /free trial/i.test(text),
    score: scoreText(text) + (merchant ? 2 : 0) + (amount ? 1 : 0),
  };
}
