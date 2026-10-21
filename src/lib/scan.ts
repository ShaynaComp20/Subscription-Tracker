import { todayISO } from "./dates";
import { detectSubscriptions, type DetectedSubscription } from "./detect";
import { getMessage, listMessageIds } from "./google";
import { parseEmail, type EmailSignal } from "./parser";
import { markScanned, saveDetections, type User } from "./repo";

// Gmail search that pulls likely billing emails from the last year.
export const SCAN_QUERY = [
  "newer_than:1y",
  "-in:chats",
  "-category:social",
  "-category:forums",
  "-category:promotions",
  '(subscription OR renewal OR renews OR receipt OR invoice OR "your plan" OR membership OR "free trial" OR "automatic payment" OR billed OR charged)',
].join(" ");

const MAX_MESSAGES = Number(process.env.SCAN_MAX_MESSAGES || 500);
const CONCURRENCY = 8;

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]);
      }
    }),
  );
  return results;
}

export async function scanGmail(user: User): Promise<{ scanned: number; detected: DetectedSubscription[] }> {
  const ids = await listMessageIds(user, SCAN_QUERY, MAX_MESSAGES);
  const signals = await mapPool(ids, CONCURRENCY, async (id): Promise<EmailSignal | null> => {
    try {
      return parseEmail(await getMessage(user, id));
    } catch (err) {
      console.warn(`Skipping message ${id}:`, err);
      return null;
    }
  });
  const detected = detectSubscriptions(signals.filter((s): s is EmailSignal => s !== null), todayISO());
  saveDetections(user.id, detected);
  markScanned(user.id);
  return { scanned: ids.length, detected };
}
