# PumpPal (MPS)

Petrol pump management for Mianwali Petroleum Service: sales, purchases,
customer and supplier ledgers, tanks and machine readings, inventory,
employees and payroll, expenses, investments and reports.

Next.js 15 (App Router), React 19, Tailwind CSS, shadcn/ui. Runs on Vercel with
a MySQL-compatible database (TiDB Cloud), the same design as Quarrybook.

## How it works

| Part | Where | Notes |
| --- | --- | --- |
| Screens and calculations | `src/app`, `src/hooks/use-database.tsx` | Unchanged from the Firebase version |
| Records | one `documents` table | Each record keeps its original path (`transactions/abc`) and exact JSON |
| Offline copy | `src/data/store.ts` | The browser keeps a copy and an outbox; it syncs every few seconds |
| Sync | `src/app/api/sync`, `src/server/sync` | The server checks who is asking on every request |
| Sign-in | `src/app/api/auth`, `src/server/auth` | Password checked on the server; HTTP-only cookie |
| Who may do what | `src/server/access/policy.ts` | The one place access rules live |

`src/data/firestore.ts` and `src/data/auth.ts` offer the same function names
Firebase did, which is why the screens did not need rewriting.

## How a new person gets in

1. They sign up. An account exists, with no role and no access.
2. They open the emailed link **in the browser where they are signing in**.
   That confirms the address. Opened anywhere else (another person, a mail
   scanner) it does nothing.
3. Their role comes from `roleForNewAccount()` in
   `src/server/access/policy.ts`. By default it is "pending": an admin gives
   them a real role on the Role Management screen, and only then can they
   read or write anything.

On an empty database the first person to confirm their email becomes the
admin, so load the data before opening the site to anyone. To make an existing
account an admin by hand: `npm run account:make-admin -- --email <email>`.

## Employees and salaries

The rules are in `src/lib/employee-lifecycle.ts` and are used by every screen:

- An employee is **Active, Suspended, Dismissed or Terminated**. Changing the
  status adds a line to their history (dates, reason, remarks, who did it,
  previous status). Nobody is deleted; restoring someone reuses their record
  and records the rejoining date.
- A **salary revision** is added with the date it takes effect. Earlier
  salaries are never changed or removed.
- **Salary payment** offers Active employees only, counts no days while
  someone was away, and will not post the same month twice for one person.

Screens: Employee Management (`/employee-management`), Salary Payment
(`/employees`), Salary Report (`/salary-report`).

## Run it on this PC

Needs Node.js 20+ and Docker Desktop.

```bash
npm install
```

```bash
npm run db:up
```

```bash
npm run db:migrate
```

```bash
npm run dev
```

The app is at http://localhost:3000. `.env.local` must point `DATABASE_URL` at
the **local** database (see `.env.example`); never put the cloud address there.
With no `SMTP_URL`, sign-in approval and password-reset links are printed in
the terminal running `npm run dev`.

`npm run dev` / `npm run build` go through `scripts/run-next.cjs`, which makes
Next.js work on an exFAT drive on Windows. Vercel uses `vercel-build` instead.

## Checks

| Command | What it proves |
| --- | --- |
| `npm test` | Change rules, the offline copy, access rules (no database needed) |
| `npm run db:test:up` then `npm run test:integration` | Sign-in, sync, import against a throwaway local database |
| `npm run typecheck:new` | Strict type check of all new server and sync code |
| `npm run build` | A real production build |

`npm run typecheck` (everything) still reports errors in the older screens;
`next.config.js` keeps `ignoreBuildErrors` on until those are fixed.

## Moving the data from Firebase

Every writing script refuses a database that is not this PC unless the command
names it with `--allow-remote <host>`.

1. `npm run data:export` takes a read-only copy of the Firebase project into
   `exports/mps-<date>/` (git-ignored). Needs `GOOGLE_APPLICATION_CREDENTIALS`.
2. `npm run data:import -- --from exports/mps-<date>` shows what would be added.
3. Add `--apply` to load it. Existing records are never altered; every record
   is read back and compared with the backup, and field totals are compared.
4. People keep their email and role but not their password: they use
   "Forgot password", or run `npm run account:set-password -- --email <email>`.

## Deploying

Vercel project settings: add `DATABASE_URL` (or the TiDB integration),
`SMTP_URL`, `MAIL_FROM` and optionally `APP_URL`. The `vercel-build` script
brings the database schema up to date before each build. Only `main` deploys;
the `vercel-port` work branch does not (`vercel.json`).
