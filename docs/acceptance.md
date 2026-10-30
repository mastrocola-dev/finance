# Acceptance checklist

The author walks through this list on the author's machine before the POC is called done. Every item names what to do and what to expect. The data is the invented seed household; never type real financial data. Mark each box, and write anything that fails as a backlog item.

## 1. Start

- [ ] `npm ci`, `cp .env.example .env`, `npm run db:reset`, `npm run db:seed`: the seed prints 189 entries from 2025-11-01 to 2026-10-01 and 4 decisions
- [ ] `npm run check` and `npm test` pass; `cd web && npx playwright test` passes
- [ ] `npm run api:http` logs `ingest runtime ready` before `finance api on http://127.0.0.1:3200/api`
- [ ] `npm run web:dev` and open `http://localhost:5173/?month=2026-10`
- [ ] Without choosing a member, Atividade asks "Escolha quem você é" and no write is accepted

## 2. Both members

Do every screen below once as **Marcio** and the joint steps again as **Gabriela**, switching under "Você é". Check the desktop at 1440 px, the phone at 390 px (browser device mode) and both themes.

- [ ] The identity picker remembers the member after a reload
- [ ] Cookie sign-in (`entra` build against an API with `AUTH_MODE=entra`, `ENTRA_CLIENT_ID` and `SESSION_KEY`): opening `/decisoes` signed out shows only Entrar; Entrar com Google goes through `/auth/login` to the provider and back to `/decisoes`, the browser holds an `HttpOnly` `finance.session` cookie and no token in `localStorage`; Sair returns to Entrar; a forged `/auth/callback?code=x&state=y` shows "Não foi possível concluir a entrada. Tente de novo."
- [ ] The Casa / Marcio / Gabriela filter changes the totals on Visão do mês and Lançamentos

## 3. Every screen

Compare with the mockups in `docs/mockups/` (layout, spacing, copy, palette) and with `web/screenshots/`.

- [ ] **Visão do mês** (`/`), mockups `Main.dc.html` and `MobileOverview.dc.html`: income, expenses and balance of October 2026; month switcher goes back and forth; recent activity card
- [ ] **Contas do mês** (`/contas`), mockup `MobileBills.dc.html`: mark a bill as paid; the toast says "marcada como paga"
- [ ] **Reversal of a payment**: press Desfazer on that toast; the bill returns to em aberto, the progress bar and "falta R$ …" go back, and Atividade shows both changes with the member as author
- [ ] **Lançamentos** (`/lancamentos`), mockup `Entries.dc.html`: add an entry with the quick form; correct it with the pencil (Salvar correção) and see the old row replaced; cancel another one (Cancelar lançamento) and see it leave the month's totals; filter Despesas and Exportar CSV, then open `lancamentos-YYYY-MM.csv` in Excel and see accents, one column per field and decimal commas
- [ ] **Dívidas e reservas** (`/patrimonio`), mockup `MobileDebts.dc.html`: debts with remaining installments, reserves and goals with progress; + Nova meta creates a goal (optionally kept in a reserve) and a repeated name is refused in Portuguese
- [ ] **Decisões** (`/decisoes`), mockup `MobileDecisions.dc.html`: Marcio proposes a decision; it stays proposta; Gabriela confirms it and only then it is confirmed; another one is rejected or withdrawn
- [ ] **Atividade** (`/atividade`), mockup `Audit.dc.html`: every change above appears with author, before and after; the filter by author works
- [ ] **Cadastros** (`/cadastros`): register a category, edit it (Editar), close it (Encerrar) and register the same name again
- [ ] **Importar** (`/importar`): see section 4
- [ ] **Revisar importação** (`/importar/<id>`): see section 4
- [ ] An unknown address shows the not-found page with a way back
- [ ] On the phone, the tab bar reaches Início, Contas, the new entry button, Decisões and Reservas; Mais reaches Lançamentos, Atividade, Importar and Cadastros

## 4. Import with a fictional file

Use `evals/cases/bank-csv/extrato-conjunta.csv` (invented). With the real model: on Azure the API image carries service-agent and reads `ANTHROPIC_API_KEY` from Key Vault; locally, service-agent checked out next to this repository and `ANTHROPIC_API_KEY` set. Without the model: start the API with `SERVICE_AGENT_CLI=test/import/fake-agent.ts`, which answers with a fixed sample.

- [ ] Enviar is disabled until the consent box is checked; the history shows Extraindo, then Para revisar, with tokens and cost
- [ ] Revisar: answer a question, edit one item, reject one, accept the rest; Aceitar stays disabled while an item has a blocking check
- [ ] Gravar no livro lists what will be written and what stays out, asks for confirmation, and the entries appear in Lançamentos with the Importado chip
- [ ] Encerrar closes the batch; the uploaded file is gone from `.imports/`

## 5. Claude connector

- [ ] `npm run mcp:http`, then connect a client to `http://127.0.0.1:3100/mcp` with `x-member: Marcio`: `month_summary` for 2026-10 matches Visão do mês
- [ ] A write tool (`create_entry`) appears in Atividade with author `claude` on behalf of Marcio; no tool executes a payment

## 6. Images

The build agent's session cannot pull base images (Docker Hub and ghcr.io are blocked there), so the images were never built by the agent: only the layout they produce was run as a non-root user with production dependencies. CI builds and smoke-tests them in the `images` job.

- [ ] `docker build --target api -t finance-api .` and `docker build --target mcp -t finance-mcp .` succeed
- [ ] `docker run --rm finance-api id -u` prints a non-zero id
- [ ] With PostgreSQL on the host: `docker run --rm --network host --env-file .env finance-api` logs `ingest runtime ready` within seconds (no download at start), and `docker run --rm --network host --env-file .env finance-mcp` answers on port 3100

## 7. Decisions to take

- [ ] Read `docs/adr-010-azure-hosting.md` and answer the items under **Needs author** in `BACKLOG.md`
