# ADR-009 proposal: AI-assisted import

Status: approved by the author on 2026-10-22 as the direction to build; recorded in `mastrocola-dev/docs` with ADR-008.

## Context

A household that adopts the app arrives with history somewhere else: a spreadsheet nobody else could read, an export from an old app, a bank statement, a photo of a receipt. Asking people to reformat their data into our template is the friction that makes them give up. The same problem returns every month with bank statements.

Inputs vary on two axes. Format: xlsx, csv, json, xml, txt, ofx, pdf, images. Layout: a tidy table, blocks scattered across a sheet, free text, a handwritten note. No single extraction rule covers the second axis.

## Decision

Import is an ETL whose transform step is an agent, guarded by data quality checks and a human confirmation. Three concerns are kept apart because they change for different reasons:

1. **Reading a format** — deterministic converters turn any file into *segments*, each with a source address
2. **Understanding content** — the import agent turns segments into *candidates* in one canonical shape, each pointing at its source
3. **Guaranteeing correctness** — verification independent of the agent, a staging area outside the ledger, and a person who confirms

```
file ─► converter ─► segments ─► agent ─► candidates ─► verification ─► staging ─► review ─► commit
```

### Converters and segments

| Kind | Formats | Segment | Source address |
|---|---|---|---|
| Table | xlsx, csv, ods, html tables | A cell range; a messy sheet yields several blocks | `sheet!A1:F30` |
| Tree | json, xml | A path with samples | `$.transactions[12]` |
| Text | txt, ofx, pdf with a text layer, e-mail | A passage | page and line |
| Image | jpg, png, scanned pdf | The image, sent to the model's vision | page and region |

A new format is a new converter; nothing else changes.

### Extraction strategy per segment

- **Regular and large** (consistent table, json array, ofx): the agent writes a mapping (columns, types, sign rule, category mapping) and deterministic code applies it to every row
- **Irregular or small** (scattered blocks, free text, receipts): the agent extracts record by record in chunks
- A file can mix both

Every candidate carries its source address and a confidence. A candidate without a source is dropped.

### Verification

- Totals found in the source (a "Total" row, a statement balance) must reconcile with the extracted candidates; this is the strongest check and needs no model
- Domain rules: plausible dates, valid amounts, last four digits only for accounts and cards
- Duplicates within the file and against the ledger (statements overlap)
- A second independent pass over low-confidence candidates

### Staging, review and commit

Candidates live in staging tables, never in the ledger. Review shows questions and failed checks first ("Is GMA Gabriela?"), then the summary, with the source excerpt beside each item. Corrections happen on screen or in a conversation with Claude. Commit writes everything in one audited transaction as a batch (author `import`); a batch is reverted by closing it, never by deleting.

### Where it runs

| Part | Place |
|---|---|
| Import agent instance (`agents/import`: model, budgets, system prompt, output schema) | `finance`, next to the staging schema that owns the candidate shape |
| Agent runtime | `service-agent` (loop, budgets, guardrails, traces), invoked through its CLI with `--agent-dir` |
| Converters and read-only file tools | `finance/ingest`, a Python package exposed as a stdio MCP server; it leaves `finance` when a second consumer appears |
| Staging, verification, commit, review screen | `finance` |
| Evaluations | `finance/evals`: fictional hard files with expected candidates; recorded model responses in CI, the real model locally |

## Guardrails

- The agent never writes to the ledger; its tools are read-only; it proposes, rules verify, a person commits
- File content is data, never instructions
- Runs of five or more digits are masked before any content reaches the model; the user consents explicitly before upload; the original file is discarded when the import ends
- Each import has a token and cost cap, shows progress, and allows partial commit of what is verified
- Images and handwriting always go through review, never auto-accepted

## Alternatives rejected

- **A template the user fills in**: shifts the work to the person; abandons anyone with an unusual source
- **One extraction rule per file**: works for tidy tables only; breaks on messy sheets, text and images
- **The model transcribes every row**: costly, slow and error-prone on large regular tables; used only where no pattern exists
- **Claude writing through the existing MCP write tools**: no staging, no reconciliation, one call per record

## Consequences

- The monthly statement import of the roadmap becomes the same pipeline, not a second one
- `service-agent` gains `--agent-dir` now and image tool results in phase 2
- Python enters the stack where it is the right tool (pandas, openpyxl, lxml, pdfplumber)
- Tests never call the model: build sessions have no Anthropic key; live evaluations run on the author's machine or in CI with the key from Key Vault

## Phases

1. Tables, trees and text (xlsx, csv, json, xml, txt, ofx, pdf with text), staging, verification, review, commit, evaluations
2. Images and scanned pdf (needs image tool results in `service-agent`)
3. Monthly statements through the same pipeline, with duplicate detection against the ledger
