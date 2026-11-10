# Feature Report — Batsman Profile Header V3c + Close-Control Cleanup

**Date:** 2026-11-10 · **Requested by:** TAIMUR (screenshot brief +
three mockup rounds; picked variant 3 "Avatar badge", then directed:
NON-STRIKER onto the meta line, X button removed, Done button
removed, no gap band)
**Status:** Implemented locally; gates green (see §3); push pending
approval. Verified by real-modal screenshots at 430×932 for both a
striker (Sanaj) and a non-striker (Roman).

## 1. What changed (BatsmanProfileModal only; bowler modal untouched)

- **Top bar**: the green **Done** button is removed. The back chevron
  is the top bar's single explicit close control (a width spacer keeps
  the drag handle centred). Backdrop tap and Escape close unchanged.
- **Header X button removed.** The header is now a single slim block.
- **Status pills leave the name row.** The STRIKER / NON-STRIKER pills
  that used to wrap onto their own line (the over-tall header in
  TAIMUR's screenshot) are gone; the crease status is the final
  segment of the single meta line:
  `Right-hand Batsman • Not Out* • ★ STRIKER` (emerald) /
  `… • NON-STRIKER` (blue). The literal texts `★ STRIKER` /
  `NON-STRIKER` are preserved, so existing pins and the archived
  scoreboard flow still read them.
- **At-crease dot badge**: a small emerald dot with a dark ring sits
  on the avatar tile's bottom-right corner while the player is at the
  crease; it pulses for the striker, steady for the non-striker. The
  badge lives on a wrapper outside the tile's `overflow-hidden`, so
  it is not clipped.
- **Footer "Close Profile" bar removed** (TAIMUR's earlier
  instruction in the same session). The `pb-safe` safe-area padding
  moved onto the scroll container so the last section still clears
  the home indicator.
- The name row keeps: click-to-edit name + pencil + Save/Cancel,
  the `#position` chip. The Batting Intent banner and everything
  below are untouched (compact redesign of earlier today stands).

Close paths remaining, by design: back chevron, backdrop tap,
Escape, swipe-down (sheet drag). Focus trap unchanged.

## 2. Test updates (documented expectations)

TAIMUR's approved design supersedes the old close-control pins:

- `batsman-profile-modal-ui.test.ts` — the "compact close area" test
  now asserts the footer/Done/X are ABSENT and `pb-safe` lives on the
  scroller; the compact-structure test pins the dot badge and
  `★ STRIKER` on the meta line instead of the ghost-circle X.
- `full-scoreboard-player-profile-navigation.test.tsx` — the batsman
  render asserts `Close Profile` absent (the bowler render in the
  same file keeps its pin; the bowler modal is unchanged).
- `wicket-scrolling-and-profile-swipe-fix.test.tsx` — the batsman
  block's "preserves all explicit close buttons" becomes the new
  close model (back-chevron title `Close Player Profile` present;
  footer/Done/X absent). The identical bowler block is untouched.
- `dls-activation-and-scoreboard-navigation-bugfix.test.tsx` — the
  two batsman `Done` pins (tests 2 and 4) inverted; the two bowler
  `Done` pins remain.
- `ios-back-navigation-system.test.tsx` — the batsman source check
  drops `'Done'` and the test is retitled to Back-only navigation.

## 3. Gates

Unit 1552/1552 (142 files) · typecheck 0 · lint clean · build PASS ·
visual 38/38 · offline 10/10 · overlay 4/4 · stageb 4/4.

## 4. Follow-up (same day): clean app bar — drag handle removed

TAIMUR spotted the grey drag-handle pill in the top bar ("এটা কিসের
দাগ? এটা তো থাকার কথা না") and asked for a professional redesign of
that strip. He was right: the pill was a leftover visual from the
bottom-sheet era — swipe-drag props were removed in an earlier fix,
so it did nothing. Three mockups were shown; he picked **V1 Clean
app bar**:

- The drag-handle pill and the balancing spacer are removed; the
  bar holds a single left group.
- The back chevron now sits in a subtle circular button
  (`rounded-full bg-slate-800/70 border border-slate-700/60`, 36px)
  beside the "Player Profile" title — the bar's only control.
- `cursor-grab` pins in `batsman-profile-modal-ui.test.ts` and the
  batsman block of `wicket-scrolling-and-profile-swipe-fix.test.tsx`
  flipped to absence (documented expectations; the bowler modal
  keeps its handle and its pins).

Verified by a real-modal screenshot at 430×932 (striker profile):
circular back button, title, no handle, no Done. Gates re-run all
green (unit 1552/1552 · typecheck 0 · lint clean · build PASS ·
visual 38/38 · offline 10/10 · overlay 4/4 · stageb 4/4).
