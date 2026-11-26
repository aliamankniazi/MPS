# MPS — Mianwali Petroleum Service

Petrol pump books: sales, purchases, customers, suppliers, stock, staff and partners. Next.js on Firebase.

```
npm install
npm run dev        # the app
npm test           # the balance, audit and backup-format tests
```

## Customer balances: one calculation

Every screen that shows what a customer owes asks `src/lib/customer-ledger.ts`:

    closing balance = opening balance + total debit - total credit

| Record | Effect |
| --- | --- |
| Credit sale | debit |
| Cash advance | debit |
| Payment received (and a salary posted to an employee's account) | credit |
| Sale return | credit |
| Sale paid at the pump under an account | debit and credit: on the statement, not on the balance |

A balance is never stored. It is always the opening balance and the rows added up, each record once, in
whole paisa. Do not add a second way of working a balance out on a screen: read `customerLedgerBook` from
`useDatabase()` (or `useCustomerBalance`) and use `statementFor`, `balanceAsOf`, `balanceBeforeRow`.

**Reports → Customer Balance Audit** (`/balance-audit`) lists every customer's balance with its proof,
what three screens used to show before they shared one calculation, and everything in the records that needs
a person's decision (an entry made twice, a payment for a deleted customer). It only reads. The same page
downloads a complete backup of the database with a SHA-256 fingerprint.

## Supplier balances: one calculation too

`src/lib/supplier-ledger.ts`: owed = opening balance + purchases - payments - purchase returns. Read
`supplierLedgerBook` from `useDatabase()` or `useSupplierBalance`.

## Records are read once

`src/lib/normalise-record.ts` turns a figure stored as text into its number as each record comes in, in memory
only. Screens can do arithmetic on what they are given. Nothing is written back.

## Type checking is on

`npm run typecheck` passes and the build now fails on a type error (`next.config.js`). `useDatabase()` is
fully typed; do not put an index signature back on its state.

## Testing the balances

`npm test` runs the pure rules. `e2e/README.md` describes the browser test against the Firebase emulators.
