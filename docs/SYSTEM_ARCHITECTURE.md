# Cric Scorer Pro — Comprehensive System Architecture & Engineering Plan

## 1. Repository Audit

The source Flutter application (`D:\cricket`) was audited line-by-line across all directories:
- **`lib/`**: 36 Dart files comprising core scoring, models, services, screens, widgets, and themes.
- **`lib/controllers/match_controller.dart`** (995 lines, 31,297 bytes): The heart of live match state, tracking runs, extras, wickets, bowlers, ball logs, partnerships, snapshots for undo, and debounced auto-saving.
- **`lib/controllers/event_sourced_match_controller.dart`** & **`lib/core/match_engine.dart`**: The prototype event-sourced engine supporting `MatchEvent` with `undoAction` and `editBall`.
- **`lib/core/analytics.dart`** & **`lib/utils/dot_ball_analytics.dart`**: Pure mathematical modules for strike rate, economy rate, bowler/batter dot balls, boundary rates, and batting style classification.
- **`lib/services/feature_hub_service.dart`** (925 lines, 27,551 bytes): Tournament engine (knockout with byes, league round-robin, IPL playoffs Q1/Elim/Q2/Final), team profiles (15-player squad slots), user profiles.
- **`lib/services/tournament_leaderboard_service.dart`** (617 lines, 17,758 bytes): Tournament leaderboard with official ICC Net Run Rate (all-out full quota rule) and batting/bowling leader rankings.
- **`lib/services/firebase_account_service.dart`** (609 lines): Google Auth, Firestore sync with exponential backoff (5s, 15s, 30s, 1m, 2m), debounced sync (2s), periodic sync (5m), remote-wins resolution with local conflict copy preservation.
- **`lib/services/isar_service.dart`** & **`lib/services/match_storage_service.dart`**: Multi-tiered local persistence (Isar, SharedPreferences legacy migration, Hive).
- **`lib/screens/match_screen.dart`** (4,401 lines, 153,719 bytes): Full live scoring interface featuring 6 scoreboard themes (`Sunrise`, `Ocean`, `Midnight`, `Stadium Green`, `Sunlight Contrast`, `Royal Violet`), runs 0-6, extras, wicket modal, bowler change modal, swap batsman gesture, live wagon wheel & wagon painters.
- **`lib/screens/full_scoreboard_screen.dart`**: Full match report and print-ready A4 PDF export using `printing` and `pdf`.
- **`lib/widgets/batsman_detail_modal.dart`** (2,600+ lines): Deep analytical modals for batsman intent, dominance over bowlers, dot streak, and last 10-ball timeline.
- **`test/`**: 6 test suites covering MatchController, DotBallAnalytics, TournamentEngine, and Widget tests.

---

## 2. Feature Inventory

1. **Match Setup & Configuration**:
   - Team A & Team B names (with saved team selector).
   - Match Overs (1 to 90 overs, default 6).
   - Toss Winner selection & Toss Decision (Bat/Bowl) automatically assigning innings roles.
   - Advanced Match Settings:
     * Squad size: 2 to 20 players (default 11).
     * Wide ball enabled/disabled, penalty runs (default 1), re-ball required (yes/no).
     * No ball enabled/disabled, penalty runs (default 1), re-ball required (yes/no).
     * Bowler over limit: automatic `ceil(overs / 5)` or custom manual over limit.
   - Opening Players Setup:
     * Striker Batsman name & batting hand.
     * Non-Striker Batsman name & batting hand.
     * Opening Bowler name.
     * Player name suggestions from previously saved/typed players.
2. **Live Scoring Pad**:
   - Runs off bat: 0 (dot), 1, 2, 3, 4 (boundary), 5, 6 (six), custom runs.
   - Extras: Wide, No Ball, Byes, Leg Byes, Penalty Runs.
   - Automatic Strike Rotation on odd runs and over completions.
   - Free Hit logic: triggered by No Ball, valid until next legal delivery; on Free Hit, dismissals other than Run Out are nullified.
   - Wicket modal supporting 10 distinct dismissal types.
   - Bowler wicket credit distinction (Bowler gets credit for Bowled, Caught, LBW, Stumped, Hit Wicket only).
   - Batter Retirement: "Retire Out" (recorded as wicket) vs "Retire Hurt" (not a wicket).
   - MCC Law 18.11 implementation: on Caught dismissals, incoming batter faces next ball (striker).
   - Swap Batsman control with accidental-touch protection.
   - Award Penalty Runs (+5P / -5P) to Batting or Bowling team with audit reason.
   - Bowler consecutive-over restriction (bowler cannot bowl back-to-back overs).
   - Maiden over auto-detection: 0 bowler-charged runs in a 6-legal-ball over (wides and no-balls void maidens, byes/leg-byes do not).
3. **Event-Sourced Scoring & Correction**:
   - Granular domain events for every single ball, penalty, wicket, undo, edit.
   - Linear event playback for 100% deterministic state reconstruction.
   - Undo last scoring action up to 60 steps with zero state corruption.
   - Historical Ball Editing: change runs, extras, or dismissals on any past delivery, recalculating all downstream batter/bowler figures and match state.
4. **Innings & Match Transition**:
   - First innings completion auto-trigger (all out or overs completed).
   - Chase setup dialog with target score and Required Run Rate calculation.
   - Automatic team role reversal for 2nd innings.
   - Second innings win conditions (target chased, all out, or overs completed).
   - Match Summary Screen with winner announcement, margin, top scorer, top bowler, Man of the Match.
   - Man of the Match calculation based on the official weighted points formula.
5. **Scoreboards & Reports**:
   - Live Scoreboard: Team score, run rate, target, RRR, current batter stats, bowler stats, over log.
   - Current Scoreboard modal / drawer with live batting and bowling tables.
   - Full Scoreboard: Multi-tab scorecard, fall of wickets, partnerships, extras breakdown.
   - Print-ready A4 multi-page PDF generation matching the exact Flutter design layout and styling.
6. **Tournaments**:
   - Knockout Tournament: bracket generation, automatic byes for odd team counts, round progression, champion declaration.
   - League Tournament: round-robin fixtures, configurable meeting rounds (single, double, triple), manual pairing overrides.
   - Points Table: Played, Won, Tied, Lost, Points (2 for win, 1 for tie, 0 for loss), sorted by points -> wins -> team name.
   - IPL-style Playoffs for leagues with 4+ teams: Qualifier 1 (1v2), Eliminator (3v4), Qualifier 2 (Q1 Loser v Eliminator Winner), Final.
   - Official ICC Net Run Rate (NRR) computation honoring the All-Out full overs quota rule.
   - Tournament Leaderboards: Orange Cap (Batting leaders: runs, average, strike rate, 50s, 100s) and Purple Cap (Bowling leaders: wickets, economy, maidens, best bowling).
7. **Teams & Player Management**:
   - Saved Team Profiles with Name, Captain, Manager, and 15 structured squad roles.
   - Player Profile with batting hand, style, career stats, and match logs.
   - Batter vs Bowler head-to-head analytics.
8. **Offline-First & Cloud Synchronization**:
   - 100% operational offline scoring via IndexedDB (Dexie).
   - Debounced automatic save (450ms) and background sync.
   - Exponential backoff retry queue on network reconnect.
   - Bidirectional sync with conflict copy branching to avoid data loss.
   - Real-time live scoreboard broadcasting via Supabase Realtime.

---

## 3. Business Logic & Formulas Inventory

All formulas from `REUSABLE_LOGIC_GUIDE_BN.md` and `lib/controllers/match_controller.dart`:

1. **Strike Rate**:
   $$\text{SR} = \text{balls} == 0 ? 0.0 : \left(\frac{\text{runs}}{\text{balls}}\right) \times 100$$
   *(1 decimal precision for analytics, truncated integer for PDF scorecard).*
2. **Economy Rate**:
   $$\text{ER} = \text{ballsBowled} == 0 ? 0.0 : \frac{\text{runs}}{\text{ballsBowled} / 6.0}$$
3. **Overs String Representation**:
   $$\text{Overs} = \lfloor \text{balls} / 6 \rfloor + . + (\text{balls} \pmod 6)$$
4. **Current Run Rate (CRR)**:
   $$\text{CRR} = \text{balls} == 0 ? 0.0 : \frac{\text{totalRuns}}{\text{balls} / 6.0}$$
5. **Required Run Rate (RRR)**:
   $$\text{RRR} = \text{remainingBalls} \le 0 ? 0.0 : \frac{\text{targetScore} - \text{currentRuns}}{\text{remainingBalls} / 6.0}$$
6. **Bowler Charged Runs per Ball**:
   - Dot, 1, 2, 3, 4, 6: $+ \text{runs}$
   - Wide: $+ \text{penalty} + \text{extraRuns}$
   - No Ball: $+ \text{penalty} + \text{batRuns}$
   - Byes / Leg Byes: $+ 0$ (charged to team extras, not to bowler)
   - Wicket: $+ 0$
7. **Dot Ball Classifications**:
   - **Batsman Dot**: Legal delivery with 0 bat runs, W, Out, or Retire. (Byes, Leg Byes, Wides, No-Balls are NOT batter dots).
   - **Bowler Dot**: Ball with 0 charged runs (0, W, Out, W-). (Retire is NOT a bowler dot).
8. **Batting Intent Classifier**:
   $$\text{Score} = \text{SR} \times 0.45 + \text{BoundaryRunsPct} \times 0.35 + \text{ShotControl} \times 0.20$$
   - `Finisher`: $\text{balls} \ge 12 \land \text{SR} \ge 150 \land \text{BoundaryRunsPct} \ge 55\%$
   - `Attacking`: $\text{SR} \ge 125 \lor \text{Score} \ge 95$
   - `Anchor`: $\text{balls} \ge 10 \land \text{SR} \le 85 \land \text{ShotControl} \ge 55\%$
   - `Balanced`: $\text{Score} \ge 60$
   - `Defensive`: Otherwise
9. **Man of the Match Impact Formula**:
   - **Batting Points**:
     $$\text{pts}_{\text{bat}} = \text{runs} + 1 \times \text{4s} + 2 \times \text{6s}$$
     - If $\text{runs} \ge 30 \land \text{SR} \ge 150 \implies +10$ pts
     - If $\text{runs} \ge 50 \implies +20$ pts
   - **Bowling Points**:
     $$\text{pts}_{\text{bowl}} = 25 \times \text{wickets} + 15 \times \text{maidens}$$
     - If $\text{wickets} \ge 3 \implies +20$ pts
     - If $\text{ballsBowled} \ge 12 \land \text{ER} \le 6.0 \implies +15$ pts
   - Player Impact Score = $\text{pts}_{\text{bat}} + \text{pts}_{\text{bowl}}$
10. **Official ICC Net Run Rate (NRR)**:
    $$\text{NRR} = \left(\frac{\text{Runs For}}{\text{Overs For}}\right) - \left(\frac{\text{Runs Against}}{\text{Overs Against}}\right)$$
    *ICC Exception*: If a batting team is all out before their allotted overs, their overs divider is the **full allotted match overs** (e.g. 20.0 overs), not the actual overs faced.

---

## 4. Data Model Inventory & TypeScript Domain Entities

```typescript
// Core domain interfaces
export type BattingHand = 'Right-hand Batsman' | 'Left-hand Batsman';
export type MatchStatus = 'PENDING' | 'ONGOING' | 'COMPLETED' | 'ABANDONED';
export type ExtraType = 'wide' | 'no_ball' | 'bye' | 'leg_bye' | 'penalty';
export type DismissalType = 
  | 'Bowled' 
  | 'Caught' 
  | 'LBW' 
  | 'Run Out' 
  | 'Stumped' 
  | 'Hit Wicket' 
  | 'Retired Out' 
  | 'Retired Hurt' 
  | 'Obstructing the Field' 
  | 'Timed Out';

export interface PlayerDomain {
  id: string;
  name: string;
  battingHand: BattingHand;
  battingPosition: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  dotBalls: number;
  ballLog: string[];
  bowlersFaced: Record<string, number>;
  runsVsBowler: Record<string, number>;
  isDismissed: boolean;
  dismissalText?: string;
  dismissalType?: DismissalType;
  fielderName?: string;
}

export interface BowlerDomain {
  id: string;
  name: string;
  ballsBowled: number;
  maidens: number;
  runs: number;
  wickets: number;
  overHistory: {
    overNumber: number;
    log: string[];
    isOngoing?: boolean;
  }[];
}

export interface AdvancedSettingsDomain {
  players: number; // 2 - 20 (default 11)
  noBall: boolean;
  noBallReball: boolean;
  noBallRun: number;
  wideBall: boolean;
  wideReball: boolean;
  wideRun: number;
  isManualLimitEnabled: boolean;
  manualOverLimit: number;
  tournamentId?: string;
  venue?: string;
}
```

---

## 5. UI Inventory & Cross-Platform Adaptive Design

1. **Scorer Workspace (3 adaptive tiers)**:
   - **Mobile Viewport (< 768px)**:
     - Sticky Top Scorecard header (Team, Total/Wkts, Overs, CRR/RRR, Striker & Non-Striker chips).
     - Over ball strip with colored pill indicators.
     - Ergonomic thumb pad: High-contrast buttons for 0, 1, 2, 3, 4, 6.
     - Modifier buttons: Wide, No Ball, Bye, Leg Bye, Wicket.
     - Safe sliding gesture for Swap Batsman to prevent accidental activation.
     - Quick Action bottom bar: Undo, Edit Ball, Retire, Bowler Change, Penalty Runs.
   - **Tablet Viewport (768px - 1199px)**:
     - 2-Column Split: Left column live scorecard, partnerships, fall of wickets; Right column scoring controls and current over log.
   - **Desktop / Laptop Viewport ($\ge$ 1200px)**:
     - 3-Panel Pro Sports Broadcast Scorer Cockpit:
       * Left: In-depth Batting & Bowling scorecards with real-time stats and strike rate graphs.
       * Center: Scoreboard display, current over timeline, and hotkey-enabled scoring pad.
       * Right: Ball-by-ball commentary feed, match progression graph, partnership wagon wheel, and live bowler economy chart.
2. **6 Scoreboard Themes**:
   - `Sunrise` (Benchmark coral & warm charcoal)
   - `Ocean` (Deep sapphire navy & cyan)
   - `Midnight` (Obsidian navy & emerald mint)
   - `Stadium Green` (Traditional cricket pitch emerald)
   - `Sunlight Contrast` (Roasted espresso & golden amber)
   - `Royal Violet` (Amethyst plum & electric violet)
3. **Public Match Center**:
   - Read-only real-time broadcast view for public viewers, tournament followers, and fans.
   - Live scorecard, commentary tab, graphs, and print-ready PDF export button.

---

## 6. Database Design (PostgreSQL / Supabase Schema)

```sql
-- Normalized PostgreSQL DDL for Cric Scorer Pro

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'SCORER',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  captain TEXT,
  manager TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE team_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role_slot TEXT NOT NULL,
  batting_hand TEXT DEFAULT 'Right-hand Batsman',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('knockout', 'league')),
  league_meetings INT NOT NULL DEFAULT 1,
  match_overs INT NOT NULL DEFAULT 16,
  champion TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE tournament_fixtures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
  round INT NOT NULL DEFAULT 1,
  home_team TEXT NOT NULL,
  away_team TEXT,
  winner TEXT,
  is_tie BOOLEAN NOT NULL DEFAULT FALSE,
  stage TEXT NOT NULL DEFAULT 'league',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  tournament_id UUID REFERENCES tournaments(id) ON DELETE SET NULL,
  team_a TEXT NOT NULL,
  team_b TEXT NOT NULL,
  toss_winner TEXT NOT NULL,
  toss_decision TEXT NOT NULL CHECK (toss_decision IN ('Batting', 'Bowling')),
  total_overs INT NOT NULL DEFAULT 6,
  advanced_settings JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'ONGOING' CHECK (status IN ('PENDING', 'ONGOING', 'COMPLETED', 'ABANDONED')),
  current_innings INT NOT NULL DEFAULT 1,
  target_score INT NOT NULL DEFAULT 0,
  winner TEXT,
  result_text TEXT,
  mom_player TEXT,
  mom_stats JSONB,
  first_innings JSONB,
  second_innings JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE match_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID REFERENCES matches(id) ON DELETE CASCADE,
  version INT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  actor_id UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_match_event_version UNIQUE (match_id, version)
);

CREATE TABLE sync_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_op_id TEXT NOT NULL UNIQUE,
  user_id UUID REFERENCES profiles(id),
  operation_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSED', 'FAILED')),
  retry_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Row Level Security (RLS)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_fixtures ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_queue ENABLE ROW LEVEL SECURITY;

-- Public can read matches and tournaments for live viewing
CREATE POLICY "Public matches are viewable by everyone" ON matches FOR SELECT USING (true);
CREATE POLICY "Public tournaments viewable by everyone" ON tournaments FOR SELECT USING (true);
CREATE POLICY "Public fixtures viewable by everyone" ON tournament_fixtures FOR SELECT USING (true);
CREATE POLICY "Public events viewable by everyone" ON match_events FOR SELECT USING (true);

-- Owners can edit their resources
CREATE POLICY "Users can manage their own matches" ON matches FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own tournaments" ON tournaments FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own teams" ON teams FOR ALL USING (auth.uid() = user_id);
```

---

## 7. Offline & Sync Engine Design (Dexie / IndexedDB)

1. **Local Tables in Dexie**:
   - `matches`: active and completed match records.
   - `match_events`: append-only event log for every ball, undo, and edit.
   - `teams`: saved team squads.
   - `tournaments`: tournament configs, fixtures, and standings.
   - `sync_queue`: queued mutations when offline with unique `clientOpId`.
2. **Sync Loop**:
   - Mutations are applied immediately to local IndexedDB for zero latency.
   - Queue worker checks network connectivity (`navigator.onLine`).
   - Sync is triggered on debounced local changes (2s), periodic intervals (5m), and manual triggers.
   - Exponential retry on failure (5s, 15s, 30s, 60s, 120s).
   - Remote-wins conflict strategy with automatic local conflict-copy creation to prevent data loss.

---

## 8. Web Route Map

```text
/ (App Entry / Dashboard)
├── /matches
│   ├── /new (Match Setup, Toss, Advanced Settings)
│   ├── /opening-players (Striker, Non-Striker, Bowler selection)
│   ├── /score/:matchId (Live Scorer Workspace — Mobile/Tablet/Desktop Cockpit)
│   ├── /center/:matchId (Public Match Center & Live Scorecard)
│   ├── /summary/:matchId (Post-Match Celebration, MOM, Summary)
│   ├── /history (Completed & Unfinished Match Archive)
│   └── /resume/:matchId (Resume Unfinished Match)
├── /tournaments
│   ├── / (List & Create Tournaments)
│   └── /:tournamentId (Fixtures, Standings, IPL Playoffs, Leaderboards)
├── /teams
│   ├── / (Team Roster & 15-player squad management)
│   └── /:teamId (Team Profile, Stats, Match Record)
├── /analytics
│   ├── /batsman/:playerId (Intent, Dominance, Dot Streak, Wagon Wheel)
│   ├── /bowler/:bowlerId (Over history, Economy, Discipline)
│   └── /head-to-head (Batter vs Bowler matchup)
├── /settings (Theme selection, Scoring rules defaults)
└── /profile (Authentication, Sync status, Cloud Backup & Restore)
```

---

## 9. Reusable Component Map

1. **Scoring Core Components**:
   - `LiveScoreboardHeader`: Large score, wickets, overs, CRR, RRR, target, theme selector.
   - `ActiveBattersCard`: Striker & Non-Striker status, runs, balls, 4s, 6s, SR, intent badge.
   - `ActiveBowlerCard`: Current bowler overs, maidens, runs conceded, wickets, economy.
   - `OverTimelineStrip`: Over deliveries with colored badges (0, 1, 2, 3, 4, 6, W, Wd, Nb, B, LB).
   - `ScoringPadKeypad`: Touch & hotkey enabled scoring pad (0-6 runs).
   - `ExtrasControlBar`: Wide, No Ball, Bye, Leg Bye, Wicket, Penalty runs.
   - `SwapBatsmanControl`: Swipe-to-swap slider with haptic & accidental drag threshold.
   - `WicketDialog`: Modal for selecting 10 dismissal types, out batter, fielder, and new batter.
   - `ChangeBowlerDialog`: Modal with eligible bowlers and limit validations.
   - `EditBallModal`: Historical delivery inspector with runs/extras editing.
   - `PenaltyRunsDialog`: Batting/bowling penalty run allocator with reason tracking.
2. **Analysis Components**:
   - `ScorecardTable`: Innings batting and bowling tabular displays.
   - `FallOfWicketsTimeline`: Graphical fall of wicket steps.
   - `PartnershipCard`: Active and past wicket partnership breakdown.
   - `BatsmanAnalyticsModal`: Intent classification, dot ball streaks, bowler dominance.
   - `BowlerAnalyticsModal`: Economy rates, dot ball percentages, maiden over analysis.
   - `ScorecardPdfViewer`: Embedded print preview and one-click PDF download.
3. **Tournament Components**:
   - `TournamentBracket`: Visual knockout tree with automatic byes.
   - `PointsTable`: Sortable league table with NRR, points, form.
   - `PlayoffTree`: Qualifier 1, Eliminator, Qualifier 2, Final bracket.
   - `TournamentLeaderboards`: Batting Orange Cap and Bowling Purple Cap tabs.

---

## 10. Implementation Plan & Execution Phases

- **Phase 1: Project Scaffolding & Setup**:
  Initialize modern Next.js 14/15 application in `d:\WEB3D` with TypeScript, Tailwind CSS, Lucide icons, Framer Motion, and Dexie IndexedDB.
- **Phase 2: TypeScript Cricket Domain Engine**:
  Implement pure domain classes: `BallExecutionEngine`, `StrikeRotationEngine`, `WicketHandler`, `ExtrasHandler`, `EventSourcedMatchEngine`, `BallEditEngine`, `DotBallAnalytics`, `ManOfTheMatchEngine`.
- **Phase 3: Automated Unit Test Suite**:
  Run Vitest covering all core cricket rules, edge cases, undo, historical edits, and tournament standings.
- **Phase 4: Local Storage & Offline Database**:
  Implement Dexie.js database schemas, migrations, repository layer, and offline persistence.
- **Phase 5: Responsive Scorer Workspace**:
  Build the mobile, tablet, and desktop multi-panel scoring cockpit with theme support, keyboard shortcuts, and swipe gestures.
- **Phase 6: Match Setup, History & Management**:
  Match setup wizard, opening players selection, unfinished match resumption, and history manager.
- **Phase 7: Match Center, Scorecards & PDF Generator**:
  Full scoreboard screens, commentary timeline, and print-ready multi-page A4 PDF generator.
- **Phase 8: Tournament Engine & IPL Playoffs**:
  Knockout brackets, league round-robin, IPL playoff progression, and ICC NRR calculations.
- **Phase 9: Teams & Player Profiles**:
  Team management with 15 squad roles, player profiles, and career statistics.
- **Phase 10: Supabase Backend & Sync Engine**:
  Supabase Auth, PostgreSQL schema, RLS policies, background sync queue, and Realtime pub/sub.
- **Phase 11: Production Build Verification & Verification Testing**:
  Run full build (`next build`), test suite, and verify feature parity.
