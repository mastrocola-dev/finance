# Evaluations

Each folder under `cases/` holds one fictional source file and two JSON files:

- `expected.json`: `{ file, candidates }`, each candidate `{ kind, payload }` with only the fields the source supports; fields left out are not judged
- `recorded.json`: one `{ source, offset, output, usage }` per chunk, keyed like `src/import/recorded.ts`

`npm run eval` reads each file through ingest, plans chunks like a real import, answers them from the recordings and prints candidate and per-field precision and recall, totals reconciliation and cost. Pass case names to run only those (`npm run eval -- notes`). It exits 1 when a chunk has no recording or returns invalid output.

Live runs (author's machine only): `npm run eval -- --live [case ...]` asks service-agent for every chunk instead of the recordings. It needs `ANTHROPIC_API_KEY` and `SERVICE_AGENT_CLI` in `.env` and refuses to start without them. Before calling the model it prints the chunks per case and what the recordings cost; after the run it prints the live cost beside the recorded one. Each case stops at `IMPORT_TOKEN_CAP` tokens. Add `--record` to write the live answers over `recorded.json` (in chunk order, formatted with Biome); a chunk whose call failed keeps its old recording, and recordings of chunks no longer planned are dropped. Review the diff and update the counts in `test/eval/run.test.ts` before committing new recordings.

Matching: an expected item pairs with the predicted item of the same kind that agrees on the most fields, at least half of them and at least one field that identifies the item (`identities` in `src/eval/score.ts`: date, description or amount for entries, name for categories, reserves and goals). Text agrees when the normalized expected value (accents, case and punctuation removed) is contained in the predicted one; other values must be equal.

Cases:

- `bank-csv`: bank statement in Windows encoding with a preamble and Portuguese headers
- `notes`: free-text notes of the month
- `card-ofx`: credit card OFX with a bill payment and a refund
- `household-xlsx`: household workbook, one tab per month with blocks for income, fixed and variable expenses, printed totals and the month balance; the recordings miss one bill and take a total row for an entry, so two of four totals fail to reconcile
- `app-json`: export of another finance app with accounts, categories, transactions, budgets and goals; a transfer between own accounts is not an entry
- `loan-xml`: car loan contract in XML with a namespace and attributes; the contract fields live outside any list and reach the agent through the `$` header segment, where the debt is recorded

The current recordings are hand-written stand-ins with deliberate mistakes, not real model answers.
