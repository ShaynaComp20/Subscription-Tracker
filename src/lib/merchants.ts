// Well-known subscription services. Matching one of these raises detection confidence and
// gives us a category and a direct cancellation link for the reminder email.

export interface Merchant {
  name: string;
  /** Sender domains (subdomains match too, e.g. "email.apple.com" matches "apple.com"). */
  domains: string[];
  category: string;
  cancelUrl: string;
  /**
   * When set, an email from this domain only counts if the subject or body mentions one of these words.
   * Used for senders that also send lots of non-subscription mail (Amazon orders, Uber rides, ...).
   */
  keywords?: string[];
}

export const MERCHANTS: Merchant[] = [
  // Video & music
  { name: "Netflix", domains: ["netflix.com"], category: "Entertainment", cancelUrl: "https://www.netflix.com/cancelplan" },
  { name: "Spotify", domains: ["spotify.com"], category: "Music", cancelUrl: "https://www.spotify.com/account/subscription/" },
  { name: "YouTube Premium", domains: ["youtube.com"], category: "Entertainment", cancelUrl: "https://www.youtube.com/paid_memberships" },
  { name: "Disney+", domains: ["disneyplus.com"], category: "Entertainment", cancelUrl: "https://www.disneyplus.com/account/subscription" },
  { name: "Hulu", domains: ["hulu.com"], category: "Entertainment", cancelUrl: "https://secure.hulu.com/account" },
  { name: "Max", domains: ["max.com", "hbomax.com"], category: "Entertainment", cancelUrl: "https://auth.max.com/subscription" },
  { name: "Paramount+", domains: ["paramountplus.com"], category: "Entertainment", cancelUrl: "https://www.paramountplus.com/account/" },
  { name: "Peacock", domains: ["peacocktv.com"], category: "Entertainment", cancelUrl: "https://www.peacocktv.com/account/plans" },
  { name: "Crunchyroll", domains: ["crunchyroll.com"], category: "Entertainment", cancelUrl: "https://www.crunchyroll.com/account/membership" },
  { name: "Apple Music / TV / iCloud", domains: ["apple.com"], category: "Entertainment", cancelUrl: "https://apps.apple.com/account/subscriptions" },
  { name: "Amazon Prime", domains: ["amazon.com", "amazon.in", "amazon.co.uk", "amazon.ca", "amazon.de"], category: "Shopping", cancelUrl: "https://www.amazon.com/mc", keywords: ["prime"] },
  { name: "Audible", domains: ["audible.com", "audible.in", "audible.co.uk"], category: "Entertainment", cancelUrl: "https://www.audible.com/account/overview" },
  { name: "JioHotstar", domains: ["hotstar.com", "jiocinema.com"], category: "Entertainment", cancelUrl: "https://www.hotstar.com/in/mysubscriptions" },
  { name: "SonyLIV", domains: ["sonyliv.com"], category: "Entertainment", cancelUrl: "https://www.sonyliv.com/myaccount" },
  { name: "ZEE5", domains: ["zee5.com"], category: "Entertainment", cancelUrl: "https://www.zee5.com/myaccount/subscription" },

  // Software, cloud & AI
  { name: "Google One / Play", domains: ["google.com"], category: "Cloud Storage", cancelUrl: "https://play.google.com/store/account/subscriptions", keywords: ["google one", "google play", "subscription"] },
  { name: "Microsoft 365", domains: ["microsoft.com"], category: "Software", cancelUrl: "https://account.microsoft.com/services", keywords: ["subscription", "renew", "microsoft 365", "xbox"] },
  { name: "Adobe", domains: ["adobe.com"], category: "Software", cancelUrl: "https://account.adobe.com/plans" },
  { name: "Dropbox", domains: ["dropbox.com"], category: "Cloud Storage", cancelUrl: "https://www.dropbox.com/account/plan" },
  { name: "GitHub", domains: ["github.com"], category: "Software", cancelUrl: "https://github.com/settings/billing", keywords: ["receipt", "payment", "subscription", "billing"] },
  { name: "ChatGPT", domains: ["openai.com"], category: "AI", cancelUrl: "https://chatgpt.com/#settings/Subscription" },
  { name: "Claude", domains: ["anthropic.com"], category: "AI", cancelUrl: "https://claude.ai/settings/billing" },
  { name: "Notion", domains: ["notion.so", "makenotion.com"], category: "Productivity", cancelUrl: "https://www.notion.so/my-account" },
  { name: "Canva", domains: ["canva.com"], category: "Productivity", cancelUrl: "https://www.canva.com/settings/billing-and-teams" },
  { name: "Zoom", domains: ["zoom.us", "zoom.com"], category: "Productivity", cancelUrl: "https://zoom.us/billing" },
  { name: "Slack", domains: ["slack.com"], category: "Productivity", cancelUrl: "https://slack.com/help/articles/218915077" },
  { name: "Grammarly", domains: ["grammarly.com"], category: "Productivity", cancelUrl: "https://account.grammarly.com/subscription" },
  { name: "1Password", domains: ["1password.com"], category: "Software", cancelUrl: "https://my.1password.com/settings/billing" },
  { name: "NordVPN", domains: ["nordvpn.com", "nordaccount.com"], category: "Software", cancelUrl: "https://my.nordaccount.com/billing/" },
  { name: "ExpressVPN", domains: ["expressvpn.com"], category: "Software", cancelUrl: "https://www.expressvpn.com/subscriptions" },
  { name: "LinkedIn Premium", domains: ["linkedin.com"], category: "Productivity", cancelUrl: "https://www.linkedin.com/premium/manage/", keywords: ["premium"] },

  // News, learning, health
  { name: "The New York Times", domains: ["nytimes.com"], category: "News", cancelUrl: "https://myaccount.nytimes.com/seg/subscription" },
  { name: "Medium", domains: ["medium.com"], category: "News", cancelUrl: "https://medium.com/me/membership", keywords: ["membership", "receipt", "renew"] },
  { name: "Duolingo", domains: ["duolingo.com"], category: "Education", cancelUrl: "https://www.duolingo.com/settings/subscription", keywords: ["super", "plus", "max", "subscription", "receipt"] },
  { name: "Coursera", domains: ["coursera.org"], category: "Education", cancelUrl: "https://www.coursera.org/my-purchases", keywords: ["subscription", "receipt", "payment", "plus"] },
  { name: "Headspace", domains: ["headspace.com"], category: "Fitness & Health", cancelUrl: "https://www.headspace.com/subscription/manage" },
  { name: "Calm", domains: ["calm.com"], category: "Fitness & Health", cancelUrl: "https://www.calm.com/account" },
  { name: "Peloton", domains: ["onepeloton.com"], category: "Fitness & Health", cancelUrl: "https://members.onepeloton.com/preferences/subscriptions" },
  { name: "Strava", domains: ["strava.com"], category: "Fitness & Health", cancelUrl: "https://www.strava.com/account", keywords: ["subscription", "receipt", "renew"] },

  // Gaming, food & delivery memberships
  { name: "Xbox Game Pass", domains: ["xbox.com"], category: "Gaming", cancelUrl: "https://account.microsoft.com/services" },
  { name: "PlayStation Plus", domains: ["playstation.com", "sony.com"], category: "Gaming", cancelUrl: "https://www.playstation.com/acct/management", keywords: ["playstation plus", "subscription", "renew"] },
  { name: "Nintendo Switch Online", domains: ["nintendo.com", "nintendo.net"], category: "Gaming", cancelUrl: "https://accounts.nintendo.com/shop/subscriptions", keywords: ["switch online", "membership", "renew"] },
  { name: "Uber One", domains: ["uber.com"], category: "Food", cancelUrl: "https://account.uber.com/", keywords: ["uber one"] },
  { name: "DashPass", domains: ["doordash.com"], category: "Food", cancelUrl: "https://www.doordash.com/dashpass/manage", keywords: ["dashpass"] },
  { name: "Swiggy One", domains: ["swiggy.in", "swiggy.com"], category: "Food", cancelUrl: "https://www.swiggy.com/one", keywords: ["swiggy one"] },
  { name: "Zomato Gold", domains: ["zomato.com"], category: "Food", cancelUrl: "https://www.zomato.com/gold", keywords: ["gold"] },
];

/**
 * Payment processors send receipts on behalf of many different companies, so their domain alone
 * says nothing about which subscription the email is for.
 */
export const PAYMENT_PROCESSOR_DOMAINS = [
  "paypal.com",
  "stripe.com",
  "paddle.com",
  "paddle.net",
  "chargebee.com",
  "fastspring.com",
  "razorpay.com",
  "lemonsqueezy.com",
  "gumroad.com",
  "patreon.com",
];

export function domainMatches(senderDomain: string, domain: string): boolean {
  return senderDomain === domain || senderDomain.endsWith(`.${domain}`);
}

export function findMerchantByDomain(senderDomain: string, text: string): Merchant | null {
  const lower = text.toLowerCase();
  for (const merchant of MERCHANTS) {
    if (!merchant.domains.some((d) => domainMatches(senderDomain, d))) continue;
    if (merchant.keywords && !merchant.keywords.some((k) => lower.includes(k))) continue;
    return merchant;
  }
  return null;
}

/** For processor receipts: find a well-known service mentioned by name in the text. */
export function findMerchantByName(text: string): Merchant | null {
  const lower = text.toLowerCase();
  for (const merchant of MERCHANTS) {
    const names = merchant.name.toLowerCase().split(" / ");
    if (names.some((n) => new RegExp(`\\b${escapeRegExp(n)}\\b`).test(lower))) return merchant;
  }
  return null;
}

export function isPaymentProcessor(senderDomain: string): boolean {
  return PAYMENT_PROCESSOR_DOMAINS.some((d) => domainMatches(senderDomain, d));
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
