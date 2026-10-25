# Evaluations

Each folder under `cases/` holds one fictional source file and two JSON files:

- `expected.json`: `{ file, candidates }`, each candidate `{ kind, payload }` with only the fields the source supports; fields left out are not judged
- `recorded.json`: one `{ source, offset, output, usage }` per chunk, keyed like `src/import/recorded.ts`

`npm run eval` reads each file through ingest, plans chunks like a real import, answers them from the recordings and prints candidate and per-field precision and recall, totals reconciliation and cost. Pass case names to run only those (`npm run eval -- notes`). It exits 1 when a chunk has no recording or returns invalid output.

Matching: an expected item pairs with the predicted item of the same kind that agrees on the most fields, at least half of them. Text agrees when the normalized expected value (accents, case and punctuation removed) is contained in the predicted one; other values must be equal.

The current recordings are hand-written stand-ins with deliberate mistakes, not real model answers.
