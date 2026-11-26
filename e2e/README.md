# Browser test of the customer balances

Runs the real screens against the Firebase **emulators** on this machine. It never touches the live project:
the app only talks to the emulators when it is built with `NEXT_PUBLIC_FIREBASE_EMULATOR=1`, and then under
the project id `demo-mps`, which the Firebase SDK cannot route to a real project.

```
# 1. emulators (needs Java)            from this folder
npx firebase-tools@13 emulators:start --only auth,firestore --project demo-mps

# 2. the app, built for the emulators  from the repository root
NEXT_PUBLIC_FIREBASE_EMULATOR=1 npx next build && NEXT_PUBLIC_FIREBASE_EMULATOR=1 npx next start -p 3100

# 3. seed the books, then open every screen, then run the money flows (needs `playwright` installed)
node e2e/seed.mjs && node e2e/crawl.cjs
node e2e/seed.mjs && node e2e/balances.cjs
```

`crawl.cjs` opens **every** screen of the app (it reads the list from `src/app`), the id-based screens and each
edit form, and fails on any crash, console error, or `NaN` / `undefined` / `Invalid Date` on the page. The seed
carries the awkward records that used to bring screens down: an amount stored as text, a record with no date,
a sale with no quantity, an expense in a category the form does not offer.

`seed.mjs` writes six customers that between them exercise every rule: credit sales, a sale paid at the pump
under an account, a two-line sale on one instant, an advance, a payment, a return, a payment entered twice,
an amount stored as text, an employee's salary, and a payment for a customer that was deleted.

`balances.cjs` then saves a payment and a sale through the screens and checks that the sale screen, the
payment screen, the customers list, the ledger, the defaulter report, the credit recovery report, the unified
ledger, the receipt, the audit page, the Excel exports and the backup file all state the same figure, on a
desktop and on a phone, and that the "saved copy" notice appears when the connection drops.
