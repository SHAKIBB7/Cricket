# Cric Scorer Pro — Feature Parity Matrix

This document tracks functional parity between the existing Flutter application (`cricket`) and the new modern web-native cross-platform implementation (`Cric Scorer Pro`).

---

## 1. Core Feature Parity Matrix

| Feature ID | Existing Feature | Existing File / Logic | New Implementation (Next.js / TS / Supabase / Dexie) | Status | Verification Suite / Test File |
|---|---|---|---|---|---|
| **SC-01** | Ball Scoring (0, 1, 2, 3, 4, 5, 6, Custom) | `lib/controllers/match_controller.dart:addRun` | `domain/cricket/match-engine/BallExecutionEngine.ts` | **Implemented & Verified** | `cricket-engine.test.ts`, `comprehensive-edge-cases.test.ts` |
| **SC-02** | Wide Ball & Re-ball Rule | `lib/controllers/match_controller.dart:addRun` | `domain/cricket/extras/WideBallHandler.ts` | **Implemented & Verified** | `cricket-engine.test.ts` |
| **SC-03** | No Ball & Free Hit Handling | `lib/controllers/match_controller.dart:addRun`, `lib/core/match_engine.dart` | `domain/cricket/extras/NoBallHandler.ts`, `FreeHitManager.ts` | **Implemented & Verified** | `comprehensive-edge-cases.test.ts` |
| **SC-04** | Byes & Leg Byes | `lib/controllers/match_controller.dart:addRun` | `domain/cricket/extras/ByesHandler.ts` | **Implemented & Verified** | `cricket-engine.test.ts` |
| **SC-05** | Wicket Types (10 Dismissals) | `lib/controllers/match_controller.dart:addRun`, `lib/core/match_engine.dart:DismissalType` | `domain/cricket/dismissals/WicketHandler.ts` | **Implemented & Verified** | `cricket-engine.test.ts`, `record-wicket-modal-scrolling-fix.test.tsx` |
| **SC-06** | Bowler Credited Wickets vs Non-credited | `lib/controllers/match_controller.dart:418-428` | `domain/cricket/dismissals/WicketHandler.ts` | **Implemented & Verified** | `cricket-engine.test.ts` |
| **SC-07** | Strike Rotation (Odd runs, Over end, Caught rule MCC 18.11) | `lib/controllers/match_controller.dart:450-453, 486` | `domain/cricket/batting/StrikeRotationEngine.ts` | **Implemented & Verified** | `cricket-engine.test.ts` |
| **SC-08** | Swap Batsman (Safe Slider / Action) | `lib/screens/match_screen.dart`, `lib/controllers/match_controller.dart:swapStrike` | `components/scoring/SwapBatsmanControl.tsx` | **Implemented & Verified** | `cricket-engine.test.ts` |
| **SC-09** | Batsman Retirement (Out vs Hurt) | `lib/controllers/match_controller.dart:retirePlayer` | `domain/cricket/batting/RetirementManager.ts` | **Implemented & Verified** | `comprehensive-edge-cases.test.ts` |
| **SC-10** | Maiden Over Calculation | `lib/controllers/match_controller.dart:_runsChargedToBowlerForOver` | `domain/cricket/bowling/MaidenCalculator.ts` | **Implemented & Verified** | `cricket-engine.test.ts` |
| **SC-11** | Over Completion & Bowler Change Restriction | `lib/controllers/match_controller.dart:canBowlerBowl, changeBowler` | `domain/cricket/overs/OverTransitionEngine.ts` | **Implemented & Verified** | `cricket-engine.test.ts` |
| **SC-12** | Bowler Max Over Limit Enforcement | `lib/controllers/match_controller.dart:getMaxBowlerLimit` | `domain/cricket/rules/BowlerLimitRules.ts` | **Implemented & Verified** | `bowling-limiter-ui.test.ts` |
| **SC-13** | Penalty Runs (+5P / -5P to Batting / Bowling) | `lib/controllers/match_controller.dart:awardPenaltyRuns` | `domain/cricket/scoring/PenaltyRunsEngine.ts` | **Implemented & Verified** | `cricket-engine.test.ts` |
| **SC-14** | Dot Ball Analytics (Batter vs Bowler definitions) | `lib/utils/dot_ball_analytics.dart` | `domain/cricket/analytics/DotBallAnalytics.ts` | **Implemented & Verified** | `dot-ball-analytics.test.ts` |
| **SC-15** | Undo Action (State Snapshot + Event Sourcing) | `lib/controllers/match_controller.dart:undo`, `lib/core/match_engine.dart` | `domain/cricket/match-engine/EventSourcedMatchEngine.ts` | **Implemented & Verified** | `historical-ball-edit-and-backup.test.ts` |
| **SC-16** | Ball Editing (Historical ball correction & state recalculation) | `lib/screens/edit_ball_sheet.dart`, `lib/core/match_engine.dart` | `domain/cricket/match-engine/BallEditEngine.ts` | **Implemented & Verified** | `historical-ball-edit-and-backup.test.ts` |
| **SC-17** | Target & Run Rate Calculation (CRR, RRR, Chase Setup) | `lib/screens/chase_setup_screen.dart`, `lib/utils/cricket_formatters.dart` | `domain/cricket/scoring/RunRateCalculator.ts` | **Implemented & Verified** | `chase-mode.test.ts`, `target-chess-mode-ui.test.ts` |
| **SC-18** | Fall of Wickets Timeline | `lib/controllers/match_controller.dart:fallOfWickets` | `domain/cricket/innings/FallOfWicketsTracker.ts` | **Implemented & Verified** | `cricket-engine.test.ts` |
| **SC-19** | Partnerships Tracking (Active + Past) | `lib/controllers/match_controller.dart:pastPartnerships` | `domain/cricket/partnerships/PartnershipTracker.ts` | **Implemented & Verified** | `cricket-engine.test.ts` |
| **SC-20** | Batter vs Bowler Head-to-Head Analytics | `lib/models/player.dart:bowlersFaced, runsVsBowler` | `domain/cricket/analytics/BatterVsBowlerAnalytics.ts` | **Implemented & Verified** | `motm-consistency-audit.test.ts` |
| **SC-21** | Batting Style & Intent Classifier | `lib/utils/dot_ball_analytics.dart:classifyBattingStyle, classifyInternationalStyle` | `domain/cricket/analytics/BattingIntentClassifier.ts` | **Implemented & Verified** | `hungry-xl-regression.test.ts` |
| **SC-22** | Man of the Match (Impact Score Formula) | `lib/screens/full_scoreboard_screen.dart`, `REUSABLE_LOGIC_GUIDE_BN.md:§6` | `domain/cricket/analytics/ManOfTheMatchEngine.ts` | **Implemented & Verified** | `motm-specification-matrix.test.ts` |
| **SC-23** | Match Result Engine (Win by runs, win by wickets, tie, super over) | `lib/controllers/match_controller.dart`, `lib/screens/match_summary_screen.dart` | `domain/cricket/match-engine/MatchResultEngine.ts` | **Implemented & Verified** | `chase-mode.test.ts` |
| **SC-24** | Knockout Tournament Engine (Brackets, Byes, Progression) | `lib/services/feature_hub_service.dart:TournamentEngine` | `domain/tournament/KnockoutEngine.ts` | **Implemented & Verified** | `tournament-engine.test.ts` |
| **SC-25** | League Tournament Engine (Round Robin, Meetings, Standings) | `lib/services/feature_hub_service.dart:TournamentEngine` | `domain/tournament/LeagueEngine.ts` | **Implemented & Verified** | `tournament-engine.test.ts` |
| **SC-26** | IPL-Style Playoffs (Qualifier 1, Eliminator, Qualifier 2, Final) | `lib/services/feature_hub_service.dart:_advanceLeagueTournament` | `domain/tournament/PlayoffEngine.ts` | **Implemented & Verified** | `tournament-engine.test.ts` |
| **SC-27** | Net Run Rate (NRR with ICC All-Out Full Quota Rule) | `lib/services/tournament_leaderboard_service.dart:_nrrBallsFromInnings` | `domain/tournament/NetRunRateEngine.ts` | **Implemented & Verified** | `tournament-engine.test.ts` |
| **SC-28** | Tournament Leaderboards (Batting, Bowling, Teams) | `lib/services/tournament_leaderboard_service.dart` | `domain/tournament/TournamentLeaderboardEngine.ts` | **Implemented & Verified** | `tournament-engine.test.ts` |
| **SC-29** | Team Management (15 Squad Slots, Captain, Manager) | `lib/screens/my_teams_screen.dart`, `CricketTeamProfile` | `features/teams/TeamManager.ts` | **Implemented & Verified** | `create-team-layout-and-saving.test.ts` |
| **SC-30** | Player Profile & Career Analytics | `lib/models/player.dart`, `lib/widgets/batsman_detail_modal.dart` | `features/players/PlayerProfileEngine.ts` | **Implemented & Verified** | `bowler-profile-modal-ui.test.ts`, `player-name-editing.test.ts` |
| **SC-31** | Offline-First Storage & Local Persistence | `lib/services/isar_service.dart`, `SharedPreferences` | `infrastructure/database/dexie-db.ts` (IndexedDB) | **Implemented & Verified** | `offline-setup-manager.test.ts`, `offline-first-persistence.test.ts` |
| **SC-32** | Cloud Sync & Conflict Resolution | `lib/services/firebase_account_service.dart` | `infrastructure/sync/SyncEngine.ts` (Supabase) | **Implemented & Verified** | `sync-engine-outbox.test.ts`, `security-auth-sync.test.ts` |
| **SC-33** | Realtime Live Scoreboard | `lib/services/firebase_account_service.dart` | `infrastructure/realtime/SupabaseRealtime.ts` | **Implemented & Verified** | `view-full-score-alignment.test.ts` |
| **SC-34** | Professional PDF Scorecard Generation | `lib/screens/full_scoreboard_screen.dart` (pdf/printing) | `features/scoring/pdf/ScorecardPdfGenerator.ts` | **Implemented & Verified** | `dynamic-pdf-match-report.test.ts` |
| **SC-35** | Scoreboard Themes (6 Themes) | `lib/screens/match_screen.dart:_scoreboardThemeOptions` | `lib/theme/scoreboard-themes.ts` | **Implemented & Verified** | `navbar-light-signal-toggle.test.ts` |
| **SC-36** | Responsive Scorer & Viewer UX | Flutter Mobile screens | `app/(routes)/**` (Tailwind + CSS grid) | **Implemented & Verified** | `mobile-scrolling-layout-audit.test.ts` |
| **SC-37** | Keyboard Shortcuts for Live Scorer | Feature expansion | `features/scoring/hooks/useScorerKeybindings.ts` | **Implemented & Verified** | `numeric-input.test.ts` |
| **SC-38** | PWA Installation & Service Worker | Native Flutter App | `public/manifest.json`, Service Worker | **Implemented & Verified** | `pwa-lifecycle.test.ts` |
| **SC-39** | Centralized Multi-Action PDF Engine & Bengali Typography | New in v2.1.0 | `features/scoring/pdf/ScorecardPdfGenerator.ts`, `app/api/pdf/export/route.ts` | **Implemented & Verified** | `bengali-pdf-scorecard.test.ts`, `pdf-loading-ux.test.ts` |
| **SC-40** | Duckworth-Lewis-Stern (DLS) Weather Engine | New in v2.1.0 | `domain/cricket/dls/DLSEngine.ts` | **Implemented & Verified** | `dls-comprehensive-audit.test.ts`, `phase4-narrative-and-dls.test.ts` |
| **SC-41** | Smart Cricket Grounds & GPS Haversine Geolocation | New in v2.1.0 | `domain/cricket/grounds/SmartGroundDetector.ts`, `infrastructure/storage/GroundRepository.ts` | **Implemented & Verified** | `smart-ground-detection.test.ts`, `auto-gps-detection.test.ts` |
| **SC-42** | Google Drive Cloud Backup & Ephemeral 5-min TTL Security | New in v2.1.0 | `infrastructure/backup/GoogleDriveService.ts` | **Implemented & Verified** | `google-drive-backup.test.ts`, `google-drive-backup-ui.test.tsx` |
| **SC-43** | React Portal Modal Architecture & iOS Gesture Navigation | New in v2.1.0 | `components/modals/*`, `hooks/useIosSwipeBack.ts` | **Implemented & Verified** | `ios-back-navigation-system.test.tsx`, `out-modal-ui.test.ts` |
| **SC-44** | Context7 MCP Live Documentation Architecture | New in v2.1.0 | `context7-mcp` skill (`resolve-library-id`, `query-docs`) | **Implemented & Verified** | Continuous Developer Guidance & Schema Sync |

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

