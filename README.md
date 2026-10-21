# Subscription Tracker

Finds the subscriptions you pay for by reading your Gmail, lets you add any it missed by hand, and
**emails you the day before each charge** ("Netflix will charge you $15.49 tomorrow — cancel it?") so you
can cancel in time.

## How it works

1. **Sign in with Google.** The app asks for read-only Gmail access (to find receipts) and send access
   (to email reminders to you, from your own account).
2. **Gmail scan.** It searches the last 12 months for billing emails (receipts, invoices, "your plan
   renews on…", free-trial notices), then for each sender works out:
   - the amount and currency (`$`, `₹`/`Rs`, `€`, `£`, `USD`, `INR`, …),
   - how often it bills (from wording like "per month", or from the spacing between receipts),
   - the next charge date (an explicit "renews on Nov 5, 2026" wins; otherwise last charge + one cycle).

   ~50 well-known services (Netflix, Spotify, YouTube, Apple, Amazon Prime, ChatGPT, Adobe, Hotstar, …)
   are recognised by sender and come with a direct cancellation link (`src/lib/merchants.ts`). PayPal /
   Stripe / Razorpay receipts are attributed to the company you actually paid.
3. **You review.** Findings show up under "Found in your Gmail" with a confidence score and the emails
   they came from. Click **Track it**, **Edit first**, or **Not a subscription** (it won't come back on
   re-scans).
4. **Add manually** anything that isn't in Gmail (gym, phone plan, …).
5. **Reminders.** A daily job emails you about every charge due tomorrow, with a red **Cancel it**
   button. Each charge is announced once; when a charge date passes, the next one is calculated
   automatically. The dashboard also shows a "Coming up this week" banner, and you can opt into
   browser notifications.

## Setup

Requires **Node.js 22.5+** (uses the built-in `node:sqlite`, so there is nothing native to compile).

### 1. Google Cloud credentials

1. Create a project at <https://console.cloud.google.com/>.
2. **APIs & Services → Library**: enable the **Gmail API**.
3. **APIs & Services → OAuth consent screen**: user type *External*, fill in the app name, and add the
   scopes `gmail.readonly` and `gmail.send`. While the app is in *Testing*, add your Gmail address under
   **Test users**.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID** (type *Web application*).
   Add the redirect URI `http://localhost:3000/api/auth/callback` (and your production URL's
   `/api/auth/callback` later).

### 2. Configure and run

```bash
cp .env.example .env      # then fill in GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SESSION_SECRET, CRON_SECRET
npm install
npm run dev               # http://localhost:3000
```

Generate secrets with `openssl rand -hex 32`. Set `TZ` to your timezone (e.g. `Asia/Kolkata`) so
"tomorrow" means your tomorrow. If you're outside the US, set `DEFAULT_DOLLAR_CURRENCY` (e.g. `CAD`) to
control what a bare `$` means.

### 3. Schedule the daily reminder

Pick one:

- **Crontab on the server** (simplest):
  `0 9 * * *  cd /path/to/Subscription-Tracker && npm run reminders`
- **Over HTTP** from any scheduler:
  `curl -H "Authorization: Bearer $CRON_SECRET" https://your-app/api/cron/reminders`
- **GitHub Actions**: `.github/workflows/reminders.yml` already does this daily. Add `APP_URL` and
  `CRON_SECRET` as repository secrets.

`REMIND_DAYS_BEFORE` (default `1`) changes how early the warning goes out.

## Deploying

Data is stored in a SQLite file (`DATABASE_PATH`, default `./data/tracker.db`), so deploy somewhere with a
persistent disk: a VPS, Railway, Render, or Fly.io with a volume. (Serverless hosts like Vercel wipe the
filesystem; you'd need to swap `src/lib/db.ts` for a hosted database.)

Things to know about Google:

- In **Testing** mode only listed test users can sign in, and **Google expires refresh tokens after 7
  days**, which stops reminders until you sign in again. Publish the app to avoid that.
- `gmail.readonly` is a *restricted* scope: making the app public for more than 100 users requires
  Google's verification and a security assessment.

## Project layout

```
src/lib/parser.ts      one email -> amount, currency, cycle, next date, merchant
src/lib/detect.ts      group emails by merchant -> subscription suggestions + confidence
src/lib/merchants.ts   known services, categories, cancellation links
src/lib/scan.ts        Gmail search + fetch + detection
src/lib/reminders.ts   daily job: roll dates forward, build + send reminder emails
src/lib/google.ts      OAuth + Gmail REST calls
src/lib/repo.ts        SQLite queries (users, subscriptions, detections)
src/app/               Next.js pages and API routes
tests/                 unit tests + an end-to-end test against a fake Gmail API
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm test` | Run tests |
| `npm run typecheck` | TypeScript check |
| `npm run build && npm start` | Production build and server |
| `npm run reminders` | Run the daily reminder job once |
