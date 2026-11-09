# ELEVATION — 3-Level Depth System, New Match Screen Proof

Date: 2026-11-09/10 · Scope approved by TAIMUR: the 3-level elevation
proposal applied to the New Match screen FIRST, as a proof before any
project-wide rollout. No other screen's defaults changed.

## The system

Four tokens in `src/app/globals.css`, defined for **all three themes**
(light `:root`, `.dark`, `.sunlight`):

| Token | Level | Meaning |
|---|---|---|
| `--shadow-elev-1` | 1 — resting | every card/input: 1–2px offset, large blur, ~5% black |
| `--shadow-elev-2` | 2 — raised | selected/filled states + primary actions; the cast is **coloured** — it reads `var(--primary-rgb)`, so it follows each theme's emerald at ~20–35% alpha |
| `--shadow-elev-3` | 3 — floating | modals/menus only |
| `--shadow-inset` | — | inner depth on inputs ("type here" affordance); focus raises the main inputs to elev-1 |

Per-theme tuning: dark leans on stronger black (shadows are near-invisible
on dark surfaces; the border keeps carrying separation); sunlight is
somewhat stronger than light for contrast on bright backgrounds.

Tailwind mapping in `tailwind.config.js` (extending its existing literal
`boxShadow` map): `shadow-elev1 / shadow-elev2 / shadow-elev3 / shadow-inset`.

**Implementation catch:** `.floating-card` is *unlayered* CSS carrying its
own `box-shadow`, which outranks Tailwind's layered utilities — a plain
`shadow-elev1` class on the section cards would silently have done
nothing. Bridge rules were added next to it:
`.floating-card.shadow-elev1 { box-shadow: var(--shadow-elev-1) }`, with
hover rising to Level 2 (mirroring the existing emerald hover border tint).

## Where each level landed (New Match screen)

- **L1** — all four section cards, the bowling-limiter drawer, the
  chase-mode pill, the chase target bar, unselected overs chips, toss
  option buttons, dropdown triggers.
- **L2 (coloured)** — primary submit button, selected overs chip,
  selected toss winner/decision buttons, the filled selected-ground card.
- **L3** — the page-owned saved-team picker panel, elevated dropdown menus.
- **Inset** — overs big-number input, ground-name input, chase
  target-runs input, advanced-rules numeric inputs.

## Shared components — opt-in only

- `CompactDropdown.elevated?: boolean` (default `false`): trigger
  `shadow-2xs → shadow-elev1`, menu `shadow-xl → shadow-elev3`.
- `BowlingLimiterDrawer.elevated?: boolean` (default `false`): appends
  `shadow-elev1` to its card root.
- `NumericInput` and `TargetChessModeButton` needed no new prop.

The global overlay/modal system was NOT restyled.

## Caveat (TAIMUR's call, not fought)

Sunlight's pre-existing `!important` hairline-shadow rule still flattens
buttons/cards in that theme — its 1.5px borders carry the depth there.
The elevation tokens do apply to inputs, menus and the modal in sunlight.

## Deferred

GroundSelectorModal panel (shared), GPS/Map global button classes,
dense list rows (no shadows there by principle), and any rollout beyond
this screen.

## Tests & gates

- New suite `feature-elevation.test.ts`: 22 tests (tokens present per
  theme, config mapping, page usage, prop declarations).
- **Unit 1518/1518** (138 files) · typecheck 0 · lint clean · build PASS ·
  Playwright visual 38/38 · offline 10/10 · overlay 4/4 · stageb 4/4.
- No existing guard pins needed updating.
