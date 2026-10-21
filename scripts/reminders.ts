// Run the daily reminder job directly, e.g. from crontab:
//   0 9 * * *  cd /path/to/app && npm run reminders
import fs from "node:fs";
import { runReminders } from "../src/lib/reminders";

// Next.js loads these automatically; a plain script has to do it itself.
for (const file of [".env.local", ".env"]) {
  if (fs.existsSync(file)) process.loadEnvFile(file);
}

runReminders()
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.errors.length ? 1 : 0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
