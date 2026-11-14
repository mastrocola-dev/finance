# Brand brief

Study for S15 C1. Nothing here is applied to the app, `docs/design.md` or the mockups until the author picks a direction (S15 C2). The board is `docs/brand/index.html`; `npm run brand -w web` regenerates every file in this folder from `web/scripts/brand-directions.ts`.

## Why

"Caixa", the short name in the app today, collides with Caixa Econômica Federal in the same market; "Finanças" is generic. Neither can be registered as a mark.

## Who it is for

Couples and families in Brazil who share a budget: two adults, one household, joint and personal money side by side, with Claude as an assistant that reads, proposes and imports, and never moves money.

## What the brand must say

- Calm: the month is under control; no alarm colors outside overdue bills
- Shared: both people see and decide together; joint decisions wait for both
- Trustworthy: exact numbers, visible authorship (who did what, and when Claude did it)
- Not a bank: no vault, coin stack, shield or arrow-up imagery; no "conta" or "banco" in the name

## Constraints every direction keeps

- Neutral ground, one accent, numbers in Geist Mono
- Income and expense distinct in hue and lightness; status never by hue alone
- Text, muted, accent, income, expense and late at 4.5:1 or more on the surface, light and dark (tested in `web/scripts/brand.test.ts`)
- Fonts already allowed (Geist, Geist Mono) or one named candidate per direction
- Name: short, pronounceable in Portuguese and English, no collision the agent knows of with a Brazilian bank or fintech; the agent cannot search INPI or registro.br, so each name lists those checks for the author

## Directions

| Direction | Idea | Names | Accent |
|---|---|---|---|
| Abrigo | A roof over a coin: the house keeps its money together | Teto, Varanda, Alpendre | Deep teal |
| A dois | Two circles and their overlap: personal and joint money | Ambos, Comum, Dueto | Plum |
| Prumo | The plumb line: "estar no prumo", on track | Prumo, Remanso, Sereno | Ink blue |

## What the author decides

One direction (or a mix: name from one, palette from another), and one name to take to INPI and registro.br. C2 then updates tokens, manifest, icons, Entra branding, mockups and screenshots.
