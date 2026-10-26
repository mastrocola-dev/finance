# Design

Visual identity approved by the author on 2026-10-20. The mockups in `docs/mockups/` are the reference: read the markup for layout, spacing and copy; the `renderVals()` block of each holds the sample data and the light and dark palettes. Values in mockups are fictional and only partly consistent with each other; the app shows what the API returns.

## Principles

- Sober financial product: neutral ground, one blue accent, numbers first
- Income is blue, expenses are orange; status never relies on hue alone (label plus color, and lightness differs)
- Every number in a monospaced tabular face, right-aligned in tables
- Light and dark themes; system preference by default, switch persisted per browser
- Mobile-first: bottom tab bar under 768 px, sidebar from 768 px
- Interface copy in Brazilian Portuguese; `R$ 1.234,56`, dates `20/10`, months `outubro de 2026`, time zone America/Sao_Paulo
- Claude's actions are always visible: "via Claude" and "Claude, a pedido de <member>" badges

## Tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `bg` | `#F6F6F3` | `#0E1014` | Page ground |
| `surface` | `#FFFFFF` | `#161920` | Cards, sidebar, tab bar |
| `sunken` | `#F0F0EC` | `#1E222A` | Tracks, segmented control, table header |
| `border` | `#E3E3DD` | `#2A2E37` | Hairlines |
| `text` | `#15171C` | `#ECEDEF` | Primary text |
| `muted` | `#5B606B` | `#A0A6B1` | Secondary text (4.5:1 on surface) |
| `accent` | `#2B54D9` | `#8BA6FF` | Primary action, active nav, links |
| `accent-text` | `#FFFFFF` | `#0E1014` | Text on accent |
| `accent-soft` | `#E8EDFC` | `#1E2A4D` | Active nav ground, selected filter |
| `income` | `#2B54D9` | `#8BA6FF` | Income figures and bars |
| `expense` | `#B4440E` | `#F08A4B` | Expense bars |
| `late` / `late-soft` | `#9A3A0B` / `#FBE9DF` | `#F5A574` / `#3A2216` | Overdue |
| `ok` / `ok-soft` | `#1F6F4A` / `#E3F1E9` | `#73D3A2` / `#16302A` | Paid, confirmed |
| `pending` / `pending-soft` | `#3D4250` / `#ECECE7` | `#D2D5DB` / `#262A33` | Pending, proposed |
| `claude` / `claude-soft` | `#5B3FC4` / `#EEEAFB` | `#BDAEFF` / `#2A2448` | Claude badges |

## Type and shape

- Geist (400, 500, 600, 700) for text, Geist Mono (400, 500) for amounts; both self-hosted from npm packages, no request to Google at runtime
- Sizes: page title 26/22 px (desktop/mobile) weight 600 tracking -0.02em; section title 15 px 600; body 14 px; meta 12–13 px; KPI 26 px mono 500 (32 px for the mobile balance)
- Radii: cards 14 px (16 on mobile hero), controls 8–10 px, chips 999 px; borders 1 px `border`; no shadows
- Spacing: 4 px base; card padding 20×24 desktop, 14–18 mobile; grid gaps 16 px
- Touch targets at least 44 px; visible focus ring in `accent`

## Screens

| Route | Mockup | Content |
|---|---|---|
| `/` | `Main.dc.html`, `MobileOverview.dc.html` | Month switcher, member filter (Casa, each member), KPIs (projected balance, received, paid, open with overdue), income × expense for 6 months, bills due, spend by category vs previous month, couple settlement, pending decisions, recent activity |
| `/contas` | `MobileBills.dc.html` | Month checklist of planned and paid expenses; tapping marks paid (optimistic, undo toast); progress and amount still open |
| `/lancamentos` | `Entries.dc.html` | Quick add form (Enter submits), search (`/` focuses), filters, table with origin and status chips, totals |
| `/patrimonio` | `MobileDebts.dc.html` | Debts with installment strip, reserves and goals with progress ring, net worth |
| `/decisoes` | `MobileDecisions.dc.html` | Proposed decisions with who confirmed and who is awaited, confirm and reject, history |
| `/atividade` | `Audit.dc.html` | Audit timeline by day, author filters with counts, before and after table for updates |

Every screen has loading (skeletons in the final layout), empty and error states, and works from 360 px to 1440 px.
