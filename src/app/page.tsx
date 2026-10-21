import { getCurrentUser } from "@/lib/session";
import { remindDaysBefore } from "@/lib/reminders";
import Dashboard from "./components/Dashboard";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  signin: "Sign-in was cancelled or failed. Please try again.",
  gmail_permission: "We need permission to read your Gmail to find subscriptions. Please sign in again and keep the Gmail boxes ticked.",
};

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await getCurrentUser();
  const { error } = await searchParams;

  if (!user) {
    return (
      <main className="landing">
        <h1>Subscription Tracker</h1>
        <p className="lead">
          We look through your Gmail for receipts and renewal emails, list every subscription you&apos;re paying for,
          and email you the day before each charge so you can cancel in time.
        </p>
        {error && ERRORS[error] && <p className="error">{ERRORS[error]}</p>}
        <a className="btn primary big" href="/api/auth/google">
          Sign in with Google
        </a>
        <ul className="fineprint">
          <li>Read-only access to find billing emails. We never delete or change anything.</li>
          <li>Send access is only used to email reminders to you, from you.</li>
          <li>You can also add subscriptions by hand.</li>
        </ul>
      </main>
    );
  }

  return <Dashboard user={{ email: user.email, name: user.name, lastScanAt: user.last_scan_at }} remindDaysBefore={remindDaysBefore()} />;
}
