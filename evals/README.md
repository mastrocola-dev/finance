# Evaluations

Each folder under `cases/` holds one fictional source file and two JSON files:

- `expected.json`: `{ file, candidates }`, each candidate `{ kind, payload }` with only the fields the source supports; fields left out are not judged
- `recorded.json`: one `{ source, offset, output, usage }` per chunk, keyed like `src/import/recorded.ts`
- `consolidation.json` (optional): the recorded `{ output, usage }` of the consolidation call that merges the batch's new categories (`src/import/consolidate.ts`)
- `ledger.json` (optional): the `ledger` block sent with every chunk of the case, as `src/import/context.ts` builds it at batch start (open members with initials, categories by kind, accounts with masked last four, reserves, proposed categories). Cases without one use `evals/ledger.json`, the seeded household

`npm run eval` reads each file through ingest, plans chunks like a real import, answers them from the recordings and prints candidate and per-field precision and recall, totals reconciliation and cost. Pass case names to run only those (`npm run eval -- notes`). It exits 1 when a chunk has no recording or returns invalid output.

Live runs (author's machine only): `npm run eval -- --live [case ...]` asks service-agent for every chunk instead of the recordings. It needs `ANTHROPIC_API_KEY` and `SERVICE_AGENT_CLI` in `.env` and refuses to start without them. Before calling the model it prints the chunks per case and what the recordings cost; after the run it prints the live cost beside the recorded one. Each case stops at `IMPORT_TOKEN_CAP` tokens. Add `--record` to write the live answers over `recorded.json` (in chunk order, formatted with Biome); a chunk whose call failed keeps its old recording, and recordings of chunks no longer planned are dropped. Review the diff and update the counts in `test/eval/run.test.ts` before committing new recordings.

Live check of the one-click bar (author's machine, 14 model calls, US$ 0.1911 recorded): `npm run eval -- --live monthly-xlsx` prints the real model's score, reconciliation and rule violations for the workbook; add `--record` to replace `recorded.json`, then run `node --env-file=.env --test test/eval/one-click.test.ts` to see whether the real answers still commit with no answers. The consolidation call is not part of the live run yet (`consolidation.json` stays hand-written, L254).

Prompt rules: every case is also checked against the rules of `agents/import/system.md` that can be read from the output (`src/eval/rules.ts`): at most 2 questions per chunk, no "nova ou existente?" question, every category of an entry, income or recurring expense either listed in the ledger or proposed once as a `category` candidate of the same kind, no proposed category that already exists, every member `joint` or a ledger name. The report prints the violations and the estimated size of the ledger block (characters / 3, per chunk) for each case; they do not fail the run.

Matching: an expected item pairs with the predicted item of the same kind that agrees on the most fields, at least half of them and at least one field that identifies the item (`identities` in `src/eval/score.ts`: date, description or amount for entries, name for categories, reserves and goals). Text agrees when the normalized expected value (accents, case and punctuation removed) is contained in the predicted one; other values must be equal.

Cases:

- `bank-csv`: bank statement in Windows encoding with a preamble and Portuguese headers
- `notes`: free-text notes of the month
- `context-notes`: notes that only make sense with the ledger: a supermarket, a drugstore and a market stall that belong to existing categories, members by initials (`MM`, `GMA`), "casa", "nós" and "conjunto" as joint, a new category (Pets) proposed by the first chunk and reused by the second, an amount that needs a question, and a line that tries to give the agent instructions
- `card-ofx`: credit card OFX with a bill payment and a refund
- `household-xlsx`: household workbook, one tab per month with blocks for income, fixed and variable expenses, printed totals and the month balance; the recordings miss one bill and take a total row for an entry, so two of four totals fail to reconcile
- `app-json`: export of another finance app with accounts, categories, transactions, budgets and goals; a transfer between own accounts is not an entry
- `loan-xml`: car loan contract in XML with a namespace and attributes; the contract fields live outside any list and reach the agent through the `$` header segment, where the debt is recorded
- `monthly-xlsx`: the one-click bar on an empty ledger (only Marcio and Gabriela): two month sheets (`Set-26`, `Out-26`) with fixed expenses, a card block per person headed by initials (`Cartão MM`, `Cartão GMA`), incomes, subtotal rows, a 50/50 split block and the month balance, side by side. The recordings propose near-duplicate categories across chunks (Mercado beside Supermercado, Drogaria beside Farmácia) and `consolidation.json` merges them. `test/eval/one-click.test.ts` imports it into an empty database through ingest, verification and consolidation, and commits with no answers: at most 3 questions, every entry committed with a category, at most 15 categories created, all four totals reconciled
- `planning-xlsx`: month plan with income, fixed and variable blocks side by side (blank columns between them), so ingest cuts them by columns (`Nov-26!A3:C7`, `E3:G9`, `I3:K9`); the recordings take a fixed bill for a recurring expense, so the net does not reconcile
- `statement-pdf`: two-page checking account statement with the header repeated on each page; text is addressed by page (`p1:L1-L9`, `p2:L4`) and the totals on page 2 reconcile against entries of both pages; the recordings misread one amount, so the debit total does not reconcile

The three workbooks and the PDF are generated by `evals/tools/fixtures.py` (openpyxl, lxml and fpdf2 pinned in `ingest/uv.lock`, run through the ingest project, fixed dates, so the output is byte for byte stable): edit the data there and run `npm run eval:fixtures`; a test fails when a committed fixture no longer matches its generator. The CSV, OFX, JSON, XML and text files are edited by hand.

The current recordings are hand-written stand-ins with deliberate mistakes, not real model answers; the four rule violations left in `app-json` and `card-ofx` are among those mistakes (a transfer and a bill payment taken for entries, an income with an expense category).
