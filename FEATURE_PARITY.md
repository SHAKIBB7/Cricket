# Cric Scorer Pro — Feature Parity Matrix

This document tracks functional parity between the existing Flutter application (`cricket`) and the new modern web-native cross-platform implementation (`Cric Scorer Pro`).

---

## 1. Core Feature Parity Matrix

| Feature ID | Existing Feature | Existing File / Logic | New Implementation (Next.js / TS / Supabase / Dexie) | Status | Verification Plan |
|---|---|---|---|---|---|
| **SC-01** | Ball Scoring (0, 1, 2, 3, 4, 5, 6, Custom) | `lib/controllers/match_controller.dart:addRun` | `domain/cricket/match-engine/BallExecutionEngine.ts` | Planned | Unit test 0-6 runs, strike swap on odd runs |
| **SC-02** | Wide Ball & Re-ball Rule | `lib/controllers/match_controller.dart:addRun` | `domain/cricket/extras/WideBallHandler.ts` | Planned | Unit test wide penalty, reball on/off, runs credited |
| **SC-03** | No Ball & Free Hit Handling | `lib/controllers/match_controller.dart:addRun`, `lib/core/match_engine.dart` | `domain/cricket/extras/NoBallHandler.ts`, `FreeHitManager.ts` | Planned | Unit test no-ball penalty, next ball free-hit, free-hit dismissal restrictions |
| **SC-04** | Byes & Leg Byes | `lib/controllers/match_controller.dart:addRun` | `domain/cricket/extras/ByesHandler.ts` | Planned | Verify not charged to bowler, batter balls count, team runs increment |
| **SC-05** | Wicket Types (10 Dismissals) | `lib/controllers/match_controller.dart:addRun`, `lib/core/match_engine.dart:DismissalType` | `domain/cricket/dismissals/WicketHandler.ts` | Planned | Test all 10 dismissal types: Bowled, Caught, LBW, Run Out, Stumped, Hit Wicket, Retired Hurt, Retired Out, Obstructing, Timed Out |
| **SC-06** | Bowler Credited Wickets vs Non-credited | `lib/controllers/match_controller.dart:418-428` | `domain/cricket/dismissals/WicketHandler.ts` | Planned | Verify bowler credited ONLY for Bowled, Caught, LBW, Stumped, Hit Wicket |
| **SC-07** | Strike Rotation (Odd runs, Over end, Caught rule MCC 18.11) | `lib/controllers/match_controller.dart:450-453, 486` | `domain/cricket/batting/StrikeRotationEngine.ts` | Planned | Test MCC 18.11 (Caught: new batter is always striker), odd run swap, over-end swap |
| **SC-08** | Swap Batsman (Safe Slider / Action) | `lib/screens/match_screen.dart`, `lib/controllers/match_controller.dart:swapStrike` | `components/scoring/SwapBatsmanControl.tsx` | Planned | Drag threshold slider & instant button fallback with confirmation |
| **SC-09** | Batsman Retirement (Out vs Hurt) | `lib/controllers/match_controller.dart:retirePlayer` | `domain/cricket/batting/RetirementManager.ts` | Planned | Test Retire Out (increments wickets) vs Retire Hurt (does not increment wickets) |
| **SC-10** | Maiden Over Calculation | `lib/controllers/match_controller.dart:_runsChargedToBowlerForOver` | `domain/cricket/bowling/MaidenCalculator.ts` | Planned | Verify 0 bowler runs (wides/noballs count against maiden, byes/leg-byes do not) |
| **SC-11** | Over Completion & Bowler Change Restriction | `lib/controllers/match_controller.dart:canBowlerBowl, changeBowler` | `domain/cricket/overs/OverTransitionEngine.ts` | Planned | Verify previous over bowler cannot bowl consecutive over |
| **SC-12** | Bowler Max Over Limit Enforcement | `lib/controllers/match_controller.dart:getMaxBowlerLimit` | `domain/cricket/rules/BowlerLimitRules.ts` | Planned | Test ceil(overs/5) standard limit & manual override limit |
| **SC-13** | Penalty Runs (+5P / -5P to Batting / Bowling) | `lib/controllers/match_controller.dart:awardPenaltyRuns` | `domain/cricket/scoring/PenaltyRunsEngine.ts` | Planned | Verify batting penalty vs bowling penalty tracking |
| **SC-14** | Dot Ball Analytics (Batter vs Bowler definitions) | `lib/utils/dot_ball_analytics.dart` | `domain/cricket/analytics/DotBallAnalytics.ts` | Planned | Unit test Batter dot (0, W, Out, Retire) vs Bowler dot (0, W, Out; Retire is NOT bowler dot) |
| **SC-15** | Undo Action (State Snapshot + Event Sourcing) | `lib/controllers/match_controller.dart:undo`, `lib/core/match_engine.dart` | `domain/cricket/match-engine/EventSourcedMatchEngine.ts` | Planned | Test undo rewinds state deterministically without corrupting event sequence |
| **SC-16** | Ball Editing (Historical ball correction & state recalculation) | `lib/screens/edit_ball_sheet.dart`, `lib/core/match_engine.dart` | `domain/cricket/match-engine/BallEditEngine.ts` | Planned | Edit earlier ball runs/extras/wickets, verify all subsequent cumulative stats recalculate |
| **SC-17** | Target & Run Rate Calculation (CRR, RRR, Chase Setup) | `lib/screens/chase_setup_screen.dart`, `lib/utils/cricket_formatters.dart` | `domain/cricket/scoring/RunRateCalculator.ts` | Planned | Verify CRR = runs/(balls/6), RRR = neededRuns/(remainingBalls/6) |
| **SC-18** | Fall of Wickets Timeline | `lib/controllers/match_controller.dart:fallOfWickets` | `domain/cricket/innings/FallOfWicketsTracker.ts` | Planned | Score, over, batter, dismissal type, fielder |
| **SC-19** | Partnerships Tracking (Active + Past) | `lib/controllers/match_controller.dart:pastPartnerships` | `domain/cricket/partnerships/PartnershipTracker.ts` | Planned | Track runs, balls, boundaries per wicket partnership |
| **SC-20** | Batter vs Bowler Head-to-Head Analytics | `lib/models/player.dart:bowlersFaced, runsVsBowler` | `domain/cricket/analytics/BatterVsBowlerAnalytics.ts` | Planned | Track balls faced, runs scored, dismissals, strike rate between specific matchups |
| **SC-21** | Batting Style & Intent Classifier | `lib/utils/dot_ball_analytics.dart:classifyBattingStyle, classifyInternationalStyle` | `domain/cricket/analytics/BattingIntentClassifier.ts` | Planned | Finisher, Attacking, Anchor, Balanced, Defensive heuristic scoring |
| **SC-22** | Man of the Match (Impact Score Formula) | `lib/screens/full_scoreboard_screen.dart`, `REUSABLE_LOGIC_GUIDE_BN.md:§6` | `domain/cricket/analytics/ManOfTheMatchEngine.ts` | Planned | Pure function test: batting pts (runs + 4s + 2*6s + bonuses) + bowling pts (25*w + 15*m + bonuses) |
| **SC-23** | Match Result Engine (Win by runs, win by wickets, tie, super over) | `lib/controllers/match_controller.dart`, `lib/screens/match_summary_screen.dart` | `domain/cricket/match-engine/MatchResultEngine.ts` | Planned | Verify 1st vs 2nd innings winner, margin calculation, tie detection |
| **SC-24** | Knockout Tournament Engine (Brackets, Byes, Progression) | `lib/services/feature_hub_service.dart:TournamentEngine` | `domain/tournament/KnockoutEngine.ts` | Planned | Verify odd team bye, round advance, champion crowning |
| **SC-25** | League Tournament Engine (Round Robin, Meetings, Standings) | `lib/services/feature_hub_service.dart:TournamentEngine` | `domain/tournament/LeagueEngine.ts` | Planned | Win 2 pts, Tie 1 pt, Loss 0 pt, standings sorting (pts -> wins -> name) |
| **SC-26** | IPL-Style Playoffs (Qualifier 1, Eliminator, Qualifier 2, Final) | `lib/services/feature_hub_service.dart:_advanceLeagueTournament` | `domain/tournament/PlayoffEngine.ts` | Planned | Top 4 progression: Q1 (1v2), Elim (3v4), Q2 (Q1 loser vs Elim winner), Final |
| **SC-27** | Net Run Rate (NRR with ICC All-Out Full Quota Rule) | `lib/services/tournament_leaderboard_service.dart:_nrrBallsFromInnings` | `domain/tournament/NetRunRateEngine.ts` | Planned | If team is all-out, divider is full allotted quota (ICC standard rule) |
| **SC-28** | Tournament Leaderboards (Batting, Bowling, Teams) | `lib/services/tournament_leaderboard_service.dart` | `domain/tournament/TournamentLeaderboardEngine.ts` | Planned | Orange cap (runs, avg, sr, 50s, 100s), Purple cap (wickets, economy, maidens, best) |
| **SC-29** | Team Management (15 Squad Slots, Captain, Manager) | `lib/screens/my_teams_screen.dart`, `CricketTeamProfile` | `features/teams/TeamManager.ts` | Planned | Create, edit, delete, squad roles: Opener 1/2, One Down, Middle Order, All-rounder, etc. |
| **SC-30** | Player Profile & Career Analytics | `lib/models/player.dart`, `lib/widgets/batsman_detail_modal.dart` | `features/players/PlayerProfileEngine.ts` | Planned | Career stats aggregation across matches and tournaments |
| **SC-31** | Offline-First Storage & Local Persistence | `lib/services/isar_service.dart`, `SharedPreferences` | `infrastructure/database/dexie-db.ts` (IndexedDB) | Planned | Complete match playable offline, auto-saved, resume on reload |
| **SC-32** | Cloud Sync & Conflict Resolution | `lib/services/firebase_account_service.dart` | `infrastructure/sync/SyncEngine.ts` (Supabase) | Planned | Debounced sync, retry with exponential backoff, conflict copy preservation |
| **SC-33** | Realtime Live Scoreboard | `lib/services/firebase_account_service.dart` | `infrastructure/realtime/SupabaseRealtime.ts` | Planned | Public Match Center live subscription without page reload |
| **SC-34** | Professional PDF Scorecard Generation | `lib/screens/full_scoreboard_screen.dart` (pdf/printing) | `features/scoring/pdf/ScorecardPdfGenerator.ts` | Planned | Print-ready A4 multi-page document matching official match report spec |
| **SC-35** | Scoreboard Themes (6 Themes) | `lib/screens/match_screen.dart:_scoreboardThemeOptions` | `lib/theme/scoreboard-themes.ts` | Planned | Sunrise, Ocean, Midnight, Stadium Green, Sunlight Contrast, Royal Violet |
| **SC-36** | Responsive Scorer & Viewer UX | Flutter Mobile screens | `app/(routes)/**` (Tailwind + CSS grid) | Planned | Mobile touch keypad, tablet dual-column, desktop multi-panel workspace |
| **SC-37** | Keyboard Shortcuts for Live Scorer | Feature expansion | `features/scoring/hooks/useScorerKeybindings.ts` | Planned | 0-6 runs, W (wicket), U (undo), S (swap), space (dot) |
| **SC-38** | PWA Installation & Service Worker | Native Flutter App | `public/manifest.json`, Service Worker | Planned | Installable PWA with offline shell caching |

---

## 2. Formula Parity Table

| Metric | Official Flutter Formula | TypeScript Implementation Target |
|---|---|---|
| **Strike Rate** | `balls == 0 ? 0.0 : (runs / balls) * 100` | `strikeRate(runs, balls): number` |
| **Economy Rate** | `balls == 0 ? 0.0 : runs / (balls / 6.0)` | `economyRate(runs, balls): number` |
| **Overs String** | `"${balls ~/ 6}.${balls % 6}"` | `oversString(balls): string` |
| **Balls From Overs** | `overs * 6 + remainder` | `ballsFromOvers(str): number` |
| **Current Run Rate** | `balls == 0 ? 0.0 : (runs / (balls / 6.0))` | `currentRunRate(runs, balls): number` |
| **Required Run Rate** | `remBalls <= 0 ? 0.0 : (remRuns / (remBalls / 6.0))` | `requiredRunRate(remRuns, remBalls): number` |
| **Dot Ball Pct** | `total <= 0 ? 0 : (dots / total) * 100` | `dotBallPercentage(dots, total): number` |
| **Boundary Pct** | `balls == 0 ? 0 : ((fours + sixes) / balls) * 100` | `boundaryPercentage(fours, sixes, balls): number` |
| **Boundary Runs Pct** | `runs == 0 ? 0 : ((fours * 4 + sixes * 6) / runs) * 100` | `boundaryRunsPercentage(fours, sixes, runs): number` |
| **Batting Intent Score** | `sr * 0.45 + boundaryRunsPct * 0.35 + shotControl * 0.20` | `classifyBattingIntent(...)` |
| **MoM Batting Points** | `runs + 4s*1 + 6s*2 (+10 if r>=30&sr>=150) (+20 if r>=50)` | `calculateBattingImpact(player)` |
| **MoM Bowling Points** | `25*w + 15*m (+20 if w>=3) (+15 if b>=12 & er<=6)` | `calculateBowlingImpact(bowler)` |
| **Net Run Rate (NRR)** | `(runsFor / oversFor) - (runsAgainst / oversAgainst)` (ICC rule) | `calculateNetRunRate(team)` |

---

## 3. Dismissal Behavior Matrix

| Dismissal Type | Batter Out | Ball Legal? | Bowler Credited? | Can occur on Free Hit? | Strike Change |
|---|---|---|---|---|---|
| **Bowled** | Striker | Yes | **Yes** | No | New batter takes striker |
| **Caught** | Striker | Yes | **Yes** | No | **MCC 18.11: New batter ALWAYS takes striker** |
| **LBW** | Striker | Yes | **Yes** | No | New batter takes striker |
| **Run Out** | Striker or Non-Striker (selected) | Yes | **No** | **Yes** | If completed runs odd, swap; new batter replaces out batter |
| **Stumped** | Striker | Yes (Wide if down leg) | **Yes** | No | New batter takes striker |
| **Hit Wicket** | Striker | Yes | **Yes** | No | New batter takes striker |
| **Retired Out** | Striker or Non-Striker (selected) | Counts as wicket | **No** | N/A | Next batter in squad takes crease |
| **Retired Hurt** | Striker or Non-Striker (selected) | Does NOT count as wicket | **No** | N/A | Next batter in squad takes crease |
| **Obstructing Field** | Striker or Non-Striker (selected) | Yes | **No** | No | Out batter replaced |
| **Timed Out** | Incoming Batter | N/A | **No** | N/A | Next batter in squad takes crease |

