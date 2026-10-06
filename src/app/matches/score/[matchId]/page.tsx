'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Play,
  RotateCcw,
  ArrowRightLeft,
  UserX,
  Plus,
  Edit3,
  Award,
  AlertTriangle,
  ChevronDown,
  Palette,
  Flag,
  Share2,
  FileText,
  CheckCircle2,
  X,
  Info,
  History,
  BarChart2,
} from 'lucide-react';
import { EventSourcedMatchEngine } from '@/domain/cricket/match-engine/EventSourcedMatchEngine';
import { MatchRepository } from '@/infrastructure/storage/MatchRepository';
import { MatchScorecard, DismissalType, Player, Bowler } from '@/domain/cricket/types';
import { BatsmanProfileModal } from '@/components/modals/BatsmanProfileModal';
import { BowlerProfileModal } from '@/components/modals/BowlerProfileModal';
import { TeamBadgeIcon } from '@/components/common/TeamBadgeIcon';
import { SCOREBOARD_THEMES, ScoreboardTheme } from '@/lib/theme/scoreboard-themes';
import {
  strikeRate,
  economyRate,
  currentRunRate,
  requiredRunRate,
  cleanPlayerName,
} from '@/domain/cricket/formatters';
import { DotBallAnalytics } from '@/domain/cricket/analytics/DotBallAnalytics';
import { ScorecardPdfGenerator } from '@/features/scoring/pdf/ScorecardPdfGenerator';
import { useScoringView } from '@/context/ScoringViewContext';
import { MatchesPanel } from '@/components/scoring/MatchesPanel';
import { AdvancedAnalyticsPanel } from '@/components/scoring/AdvancedAnalyticsPanel';

export default function LiveScoringPage() {
  const params = useParams();
  const router = useRouter();
  const matchId = params.matchId as string;

  const [engine, setEngine] = useState<EventSourcedMatchEngine | null>(null);
  const { activeView, toggleView, closeView } = useScoringView();
  const [selectedTheme, setSelectedTheme] = useState<ScoreboardTheme>(SCOREBOARD_THEMES[0]);
  const [loading, setLoading] = useState(true);

  // Selected modifier flag: Wide, No Ball, Byes, Leg Byes, Wicket
  const [extraFlag, setExtraFlag] = useState<
    'none' | 'wide' | 'no_ball' | 'bye' | 'leg_bye' | 'wicket'
  >('none');

  // Modals
  const [showWicketModal, setShowWicketModal] = useState(false);
  const [showBowlerModal, setShowBowlerModal] = useState(false);
  const [showRetireModal, setShowRetireModal] = useState(false);
  const [showPenaltyModal, setShowPenaltyModal] = useState(false);
  const [showEditBallModal, setShowEditBallModal] = useState(false);
  const [showInningsTransitionModal, setShowInningsTransitionModal] = useState(false);
  const [showFullScoreboardModal, setShowFullScoreboardModal] = useState(false);
  const [showMatchInfoModal, setShowMatchInfoModal] = useState(false);
  const [selectedScoreboardInnings, setSelectedScoreboardInnings] = useState<1 | 2>(1);
  const [pendingRunForWicket, setPendingRunForWicket] = useState(0);

  // Detail Profile Modals
  const [selectedBatsman, setSelectedBatsman] = useState<{
    player: Player;
    isStriker?: boolean;
    isNonStriker?: boolean;
    battingPosition?: number;
  } | null>(null);
  const [selectedBowler, setSelectedBowler] = useState<Bowler | null>(null);

  // Wicket Form State
  const [dismissalType, setDismissalType] = useState<DismissalType>('Bowled');
  const [isStrikerOut, setIsStrikerOut] = useState(true);
  const [fielderName, setFielderName] = useState('');
  const [newBatsmanName, setNewBatsmanName] = useState('');

  // Bowler Form State
  const [newBowlerName, setNewBowlerName] = useState('');

  // Penalty Form State
  const [penaltyRuns, setPenaltyRuns] = useState(5);
  const [awardedToBatting, setAwardedToBatting] = useState(true);
  const [penaltyReason, setPenaltyReason] = useState('Ball tampering / fielding violation');

  // 2nd Innings Transition Form State
  const [inn2Striker, setInn2Striker] = useState('');
  const [inn2NonStriker, setInn2NonStriker] = useState('');
  const [inn2Bowler, setInn2Bowler] = useState('');

  // Persist State to Dexie IndexedDB with Serialized Queue & Delta Event Appends
  const lastSavedEventIndexRef = useRef(0);
  const isPersistingRef = useRef(false);
  const pendingPersistEngineRef = useRef<EventSourcedMatchEngine | null>(null);

  const persistState = useCallback(async (eng: EventSourcedMatchEngine): Promise<void> => {
    pendingPersistEngineRef.current = eng;
    if (isPersistingRef.current) return;
    isPersistingRef.current = true;
    try {
      while (pendingPersistEngineRef.current) {
        const target = pendingPersistEngineRef.current;
        pendingPersistEngineRef.current = null;
        const sc = target.toScorecard();
        await MatchRepository.saveMatch(sc);
        const fromIdx = lastSavedEventIndexRef.current;
        if (target.events.length > fromIdx) {
          await MatchRepository.saveEventsDelta(target.events, fromIdx);
          lastSavedEventIndexRef.current = target.events.length;
        }
      }
    } catch (err) {
      console.error('Failed to persist match state to IndexedDB:', err);
    } finally {
      isPersistingRef.current = false;
    }
  }, []);

  // Load Match
  useEffect(() => {
    async function loadMatch() {
      if (!matchId) return;
      const scorecard = await MatchRepository.getMatch(matchId);
      if (!scorecard) {
        router.push('/matches/history');
        return;
      }

      // Reconstruct Engine from Scorecard
      const eng = new EventSourcedMatchEngine({
        id: scorecard.id,
        teamA: scorecard.teamA,
        teamB: scorecard.teamB,
        tossWinner: scorecard.tossWinner,
        tossDecision: scorecard.tossDecision,
        totalOvers: scorecard.totalOvers,
        advancedSettings: scorecard.advancedSettings,
        venue: scorecard.venue,
      });

      // Restore innings
      if (scorecard.firstInnings) eng.firstInnings = scorecard.firstInnings;
      if (scorecard.secondInnings) eng.secondInnings = scorecard.secondInnings;
      eng.currentInningsNumber = scorecard.currentInnings;
      eng.targetScore = scorecard.targetScore;
      eng.status = scorecard.status;

      // Load existing events count to avoid rewriting
      const existingEvents = await MatchRepository.getEventsForMatch(matchId);
      if (existingEvents && existingEvents.length > 0) {
        eng.events = existingEvents;
      }
      lastSavedEventIndexRef.current = eng.events.length;

      setEngine(eng);
      setLoading(false);
    }

    loadMatch();
  }, [matchId, router]);

  // Stable refs for keyboard listener
  const engineRef = useRef(engine);
  engineRef.current = engine;
  const handlersRef = useRef<{
    handleScoreRun?: (runs: number) => void;
    handleUndo?: () => void;
    handleSwapStrike?: () => void;
  }>({});

  // Keyboard Shortcuts Hook — Attached once on mount, cleaned up once on unmount
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        return;
      }

      const currentEng = engineRef.current;
      if (!currentEng || currentEng.isInningsOver || currentEng.currentInnings.isOverComplete) return;

      const key = e.key.toLowerCase();
      if (['0', '1', '2', '3', '4', '6'].includes(key)) {
        e.preventDefault();
        handlersRef.current.handleScoreRun?.(parseInt(key, 10));
      } else if (key === 'w') {
        e.preventDefault();
        setExtraFlag('wicket');
      } else if (key === 'u') {
        e.preventDefault();
        handlersRef.current.handleUndo?.();
      } else if (key === 's') {
        e.preventDefault();
        handlersRef.current.handleSwapStrike?.();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (loading || !engine) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-semibold text-[var(--muted-foreground)]">Loading Match Scorer...</p>
        </div>
      </div>
    );
  }

  const inn = engine.currentInnings;
  const striker = inn.players[inn.strikerIdx];
  const nonStriker = inn.players[inn.nonStrikerIdx];
  const currentBowler = inn.bowlers[inn.currentBowlerIdx];

  const crr = currentRunRate(inn.totalRuns, inn.totalBalls);
  const remainingBalls = engine.totalOvers * 6 - inn.totalBalls;
  const neededRuns = engine.targetScore > 0 ? Math.max(0, engine.targetScore - inn.totalRuns) : 0;
  const rrr = requiredRunRate(neededRuns, remainingBalls);

  // Scoring Handler
  const handleScoreRun = (runs: number) => {
    if (extraFlag === 'wicket') {
      setPendingRunForWicket(runs);
      setShowWicketModal(true);
      return;
    }

    const isWide = extraFlag === 'wide';
    const isNoBall = extraFlag === 'no_ball';
    const isByes = extraFlag === 'bye';
    const isLegByes = extraFlag === 'leg_bye';

    engine.scoreBall({
      runsScored: runs,
      isWide,
      isNoBall,
      isByes,
      isLegByes,
      isWicket: false,
    });

    setExtraFlag('none');
    persistState(engine);
    setEngine(Object.assign(Object.create(Object.getPrototypeOf(engine)), engine));

    // Check if innings concluded
    checkInningsCompletion();
  };

  const handleConfirmWicket = () => {
    engine.scoreBall({
      runsScored: pendingRunForWicket,
      isWicket: true,
      dismissalType,
      fielderName: fielderName.trim() || undefined,
      newBatsmanName: newBatsmanName.trim() || undefined,
      isStrikerOut,
    });

    setShowWicketModal(false);
    setExtraFlag('none');
    setFielderName('');
    setNewBatsmanName('');
    persistState(engine);
    setEngine(Object.assign(Object.create(Object.getPrototypeOf(engine)), engine));

    checkInningsCompletion();
  };

  const handleUndo = () => {
    const success = engine.undo();
    if (success) {
      persistState(engine);
      setEngine(Object.assign(Object.create(Object.getPrototypeOf(engine)), engine));
    }
  };

  const handleSwapStrike = () => {
    engine.swapStrike();
    persistState(engine);
    setEngine(Object.assign(Object.create(Object.getPrototypeOf(engine)), engine));
  };

  // Synchronize keyboard handlers ref on every render without reattaching listeners
  handlersRef.current = {
    handleScoreRun,
    handleUndo,
    handleSwapStrike,
  };

  const handleChangeBowler = (bowlerName: string) => {
    if (!bowlerName.trim()) return;
    engine.changeBowler(bowlerName.trim());
    setShowBowlerModal(false);
    setNewBowlerName('');
    persistState(engine);
    setEngine(Object.assign(Object.create(Object.getPrototypeOf(engine)), engine));
  };

  const handleRetirePlayer = (isStrikerOut: boolean, type: 'Retire Out' | 'Retire Hurt') => {
    engine.retirePlayer(isStrikerOut, type);
    setShowRetireModal(false);
    persistState(engine);
    setEngine(Object.assign(Object.create(Object.getPrototypeOf(engine)), engine));
    checkInningsCompletion();
  };

  const handleAwardPenalty = () => {
    engine.awardPenaltyRuns(penaltyRuns, awardedToBatting, penaltyReason);
    setShowPenaltyModal(false);
    persistState(engine);
    setEngine(Object.assign(Object.create(Object.getPrototypeOf(engine)), engine));
    checkInningsCompletion();
  };

  const checkInningsCompletion = async () => {
    if (engine.isMatchCompleted) {
      engine.completeMatch();
      await persistState(engine);
      router.push(`/matches/summary/${engine.id}`);
    } else if (engine.currentInningsNumber === 1 && engine.isInningsOver) {
      setShowInningsTransitionModal(true);
    }
  };

  const handleStartSecondInnings = () => {
    engine.startSecondInnings(
      inn2Striker.trim() || 'Striker',
      inn2NonStriker.trim() || 'Non-Striker',
      inn2Bowler.trim() || 'Bowler 1'
    );
    setShowInningsTransitionModal(false);
    persistState(engine);
    setEngine(Object.assign(Object.create(Object.getPrototypeOf(engine)), engine));
  };

  // Batting Intent for Striker
  const strikerBoundaryRunsPct =
    striker && striker.runs > 0
      ? ((striker.fours * 4 + striker.sixes * 6) / striker.runs) * 100
      : 0;
  const strikerControl =
    striker && striker.balls > 0
      ? Math.max(0, 100 - (striker.dotBalls / striker.balls) * 100)
      : 100;
  const strikerIntent = striker
    ? DotBallAnalytics.classifyBattingIntent(
        strikerBoundaryRunsPct,
        strikerControl,
        strikeRate(striker.runs, striker.balls),
        striker.balls
      )
    : 'Balanced';

  if (activeView === 'matches') {
    return <MatchesPanel currentMatchId={matchId} onClose={closeView} />;
  }

  if (activeView === 'advancedAnalytics') {
    return <AdvancedAnalyticsPanel engine={engine} onClose={closeView} />;
  }

  return (
    <>
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ── MOBILE SCORER COCKPIT (< md: STRICT SINGLE VIEWPORT, ZERO SCROLL) ── */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <div className="md:hidden flex flex-col min-h-[calc(100dvh-3.25rem)] justify-between gap-1 select-none overflow-y-auto pb-safe">
        {/* 1. TOP COMPACT SCOREBOARD BANNER (MOBILE-ONLY TWO-SECTION REDESIGN) */}
        <div
          className="rounded-xl px-2 py-1.5 text-white shadow-md relative overflow-hidden shrink-0 transition-all duration-300"
          style={{
            background: `linear-gradient(135deg, ${selectedTheme.deep} 0%, ${selectedTheme.primary} 60%, ${selectedTheme.secondary} 100%)`,
          }}
        >
          {/* Cycle Theme Button */}
          <button
            type="button"
            onClick={() => {
              const currIdx = SCOREBOARD_THEMES.findIndex((t) => t.id === selectedTheme.id);
              const nextTheme = SCOREBOARD_THEMES[(currIdx + 1) % SCOREBOARD_THEMES.length];
              setSelectedTheme(nextTheme);
            }}
            className="absolute top-1 right-1 p-1 text-white/50 hover:text-white active:scale-90 transition-transform"
            title="Cycle Scoreboard Theme"
          >
            <Palette className="w-4 h-4" />
          </button>

          <div className="grid grid-cols-2 gap-1 items-center">
            {/* ── LEFT SECTION: TEAM / INFO ── */}
            <div className="flex flex-col justify-between min-w-0 pr-1 border-r border-white/15">
              {/* Team Name */}
              <div className="flex items-center gap-1 mb-0.5 min-w-0">
                <span className="flex h-1.5 w-1.5 relative shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
                </span>
                <span className="text-sm font-black uppercase tracking-wider text-white truncate leading-tight">
                  {inn.team}
                </span>
              </div>

              {/* Chase or 1st Innings Info */}
              {engine.currentInningsNumber === 2 && engine.targetScore > 0 ? (
                <div className="space-y-0.5 min-w-0">
                  <div className="text-xs font-black text-amber-300 leading-tight num-font truncate">
                    Need {neededRuns} in {remainingBalls}b
                  </div>
                  <div className="text-xs font-bold text-white/80 num-font leading-tight truncate">
                    Tgt {engine.targetScore} • RRR {rrr.toFixed(1)}
                  </div>
                  <div className="text-xs font-bold text-white/80 num-font leading-tight truncate">
                    CRR {crr.toFixed(2)}
                  </div>
                </div>
              ) : (
                <div className="space-y-0.5 min-w-0">
                  <div className="text-xs font-extrabold text-white/90 leading-tight truncate">
                    Inn {engine.currentInningsNumber} • {engine.totalOvers} Ov
                  </div>
                  <div className="text-xs font-bold text-white/80 num-font leading-tight truncate">
                    CRR {crr.toFixed(2)}
                  </div>
                  <div className="text-xs font-bold text-white/80 num-font leading-tight truncate">
                    Proj: {Math.round(crr * engine.totalOvers)}
                  </div>
                </div>
              )}

              {/* Free Hit Pill if active */}
              {inn.isFreeHit && (
                <div className="mt-0.5">
                  <span className="px-1 py-0.5 rounded bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-wider animate-bounce inline-block">
                    FREE HIT
                  </span>
                </div>
              )}
            </div>

            {/* ── RIGHT SECTION: RUNS, WICKETS & OVERS ── */}
            <div className="flex flex-col justify-center items-center pl-1">
              {/* Runs and Wickets Columns */}
              <div className="grid grid-cols-2 w-full text-center">
                <div className="flex flex-col items-center">
                  <span className="text-3xl font-black num-font text-white leading-none">
                    {inn.totalRuns}
                  </span>
                  <span className="text-xs font-extrabold uppercase tracking-widest text-white/70 mt-0.5">
                    RUNS
                  </span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-3xl font-black num-font text-white leading-none">
                    {inn.totalWickets}
                  </span>
                  <span className="text-xs font-extrabold uppercase tracking-widest text-white/70 mt-0.5">
                    WKTS
                  </span>
                </div>
              </div>

              {/* Horizontal Divider */}
              <div className="w-full border-t border-white/20 my-1" />

              {/* Overs Count */}
              <div className="text-center">
                <span className="text-sm font-black num-font text-white tracking-wider">
                  {inn.oversString} OVERS
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 2. CREASE BATTERS & BOWLER SPLIT PANEL */}
        <div className="p-1 rounded-xl bg-[var(--card)] border border-[var(--border)] shadow-sm shrink-0">
          <div className="grid grid-cols-2 gap-1">
            {/* Left Column: Crease Batters */}
            <div className="space-y-1 min-w-0">
              {/* Striker */}
              <div
                onClick={() => {
                  if (striker) {
                    setSelectedBatsman({
                      player: striker,
                      isStriker: true,
                      battingPosition: inn.strikerIdx + 1,
                    });
                  }
                }}
                className="p-1 rounded-md bg-emerald-500/10 border border-emerald-500/30 cursor-pointer active:scale-[0.98] transition-transform min-w-0"
                title="Tap for Striker Profile"
              >
                <div className="flex items-center justify-between text-xs gap-1 min-w-0">
                  <span className="font-extrabold truncate text-emerald-700 dark:text-emerald-300 min-w-0">
                    {cleanPlayerName(striker?.name)} *
                  </span>
                  <span className="text-[10px] font-black px-1 rounded bg-emerald-600 text-white uppercase shrink-0">
                    {strikerIntent}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs num-font gap-1">
                  <span className="font-black text-sm text-[var(--foreground)] truncate">
                    {striker?.runs} <span className="font-normal text-xs text-[var(--muted-foreground)]">({striker?.balls}b)</span>
                  </span>
                  <span className="text-[10px] text-[var(--muted-foreground)] shrink-0">
                    4s:{striker?.fours} 6s:{striker?.sixes}
                  </span>
                </div>
              </div>

              {/* Non-Striker */}
              <div
                onClick={() => {
                  if (nonStriker) {
                    setSelectedBatsman({
                      player: nonStriker,
                      isNonStriker: true,
                      battingPosition: inn.nonStrikerIdx + 1,
                    });
                  }
                }}
                className="px-1 py-0.5 rounded-md bg-[var(--muted)]/70 flex items-center justify-between text-xs cursor-pointer active:scale-[0.98] transition-transform gap-1 min-w-0"
                title="Tap for Non-Striker Profile"
              >
                <span className="font-semibold truncate min-w-0 text-[var(--muted-foreground)]">
                  {cleanPlayerName(nonStriker?.name)}
                </span>
                <span className="num-font font-bold shrink-0 text-[var(--foreground)]">
                  {nonStriker?.runs} <span className="font-normal text-xs text-[var(--muted-foreground)]">({nonStriker?.balls}b)</span>
                </span>
              </div>
            </div>

            {/* Right Column: Current Bowler */}
            <div
              onClick={() => {
                if (currentBowler) {
                  setSelectedBowler(currentBowler);
                }
              }}
              className="p-1 rounded-md bg-blue-500/10 border border-blue-500/30 flex flex-col justify-between cursor-pointer active:scale-[0.98] transition-transform min-w-0"
              title="Tap for Bowler Profile"
            >
              <div className="flex items-center justify-between text-xs gap-1 min-w-0">
                <span className="font-extrabold truncate text-blue-700 dark:text-blue-300 min-w-0">
                  {cleanPlayerName(currentBowler?.name)}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowBowlerModal(true);
                  }}
                  className="text-[10px] font-bold px-1 py-0.5 rounded bg-blue-600 text-white active:scale-95 transition-transform shrink-0"
                >
                  Change
                </button>
              </div>

              <div className="flex items-center justify-between text-xs num-font gap-1">
                <span className="font-black text-sm text-[var(--foreground)] truncate">
                  {currentBowler?.wickets}-{currentBowler?.runs}
                </span>
                <span className="font-bold text-blue-600 dark:text-blue-400 shrink-0 text-xs">
                  {Math.floor(currentBowler?.ballsBowled / 6)}.{currentBowler?.ballsBowled % 6} ov
                </span>
              </div>

              <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)] num-font gap-1">
                <span className="truncate">M: {currentBowler?.maidens}</span>
                <span className="shrink-0">Econ: {economyRate(currentBowler?.runs || 0, currentBowler?.ballsBowled || 0).toFixed(1)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* 3. THIS OVER STRIP + QUICK ACTIONS (NO EMPTY SPACE!) */}
        <div className="px-1.5 py-1 rounded-lg bg-[var(--card)] border border-[var(--border)] flex items-center justify-between gap-1 shrink-0 min-w-0">
          <div className="flex items-center gap-1 text-xs font-bold text-[var(--muted-foreground)] shrink-0">
            <span>Over:</span>
          </div>

          <div className="flex items-center gap-1 min-w-0 overflow-x-auto no-scrollbar">
            {inn.thisOverLog.length === 0 ? (
              <span className="text-xs text-[var(--muted-foreground)] italic truncate">
                Awaiting first ball...
              </span>
            ) : (
              inn.thisOverLog.map((ball, idx) => {
                const isWkt = ball === 'W' || ball.includes('Out');
                const isFour = ball === '4';
                const isSix = ball === '6';
                const isExtra = ball.startsWith('Wd') || ball.startsWith('Nb');

                return (
                  <span
                    key={idx}
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                      isWkt
                        ? 'bg-red-600 text-white'
                        : isSix
                        ? 'bg-purple-600 text-white'
                        : isFour
                        ? 'bg-blue-600 text-white'
                        : isExtra
                        ? 'bg-amber-500 text-slate-950'
                        : ball === '0'
                        ? 'bg-[var(--muted)] text-[var(--muted-foreground)] border border-[var(--border)]'
                        : 'bg-emerald-600 text-white'
                    }`}
                  >
                    {ball === '0' ? '•' : ball}
                  </span>
                );
              })
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={handleUndo}
              className="flex items-center gap-0.5 px-1 py-1 rounded bg-[var(--muted)] text-xs font-bold text-amber-500 hover:text-amber-600 active:scale-95 transition-transform"
              title="Undo last delivery"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Undo</span>
            </button>
            <button
              type="button"
              onClick={handleSwapStrike}
              className="flex items-center gap-0.5 px-1 py-1 rounded bg-[var(--muted)] text-xs font-bold text-emerald-600 dark:text-emerald-400 active:scale-95 transition-transform"
              title="Swap Strike"
            >
              <ArrowRightLeft className="w-3 h-3" />
              <span>Swap</span>
            </button>
          </div>
        </div>

        {/* Over Complete Alert (Inline) */}
        {inn.isOverComplete && (
          <div className="px-2 py-1 rounded-lg bg-amber-500/15 border border-amber-500/40 flex items-center justify-between gap-1 shrink-0 animate-pulse">
            <span className="text-xs font-extrabold text-amber-600 dark:text-amber-400 truncate">
              Over complete! Select new bowler.
            </span>
            <button
              type="button"
              onClick={() => setShowBowlerModal(true)}
              className="px-2 py-1 rounded bg-amber-500 text-slate-950 font-black text-xs active:scale-95 shrink-0"
            >
              Select Bowler
            </button>
          </div>
        )}

        {/* 4. DELIVERY MODIFIERS STRIP (Directly above Run Buttons, NO EMPTY SPACE) */}
        <div className="grid grid-cols-5 gap-1 shrink-0">
          {[
            { id: 'wide', label: 'Wide' },
            { id: 'no_ball', label: 'No Ball' },
            { id: 'bye', label: 'Byes' },
            { id: 'leg_bye', label: 'Leg Bye' },
            { id: 'wicket', label: 'Wicket' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() =>
                setExtraFlag(extraFlag === item.id ? 'none' : (item.id as any))
              }
              className={`py-1.5 px-0.5 rounded-lg text-xs font-extrabold min-h-[36px] transition-all border text-center active:scale-95 leading-tight flex items-center justify-center break-words ${
                extraFlag === item.id
                  ? item.id === 'wicket'
                    ? 'bg-red-600 text-white border-red-600 shadow-sm'
                    : 'bg-amber-500 text-slate-950 border-amber-500 shadow-sm'
                  : 'bg-[var(--muted)] text-[var(--foreground)] border-[var(--border)]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* 5. RUN BUTTONS KEYPAD (3x2 Grid: 0, 1, 2 / 3, 4, 6) */}
        <div className="grid grid-cols-3 gap-1 shrink-0">
          {[
            { run: 0, label: '0 Dot', color: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200' },
            { run: 1, label: '1 Single', color: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300' },
            { run: 2, label: '2 Double', color: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200' },
            { run: 3, label: '3 Three', color: 'bg-emerald-200 dark:bg-emerald-800/40 text-emerald-900 dark:text-emerald-100' },
            { run: 4, label: '4 FOUR', color: 'bg-blue-600 text-white shadow-sm' },
            { run: 6, label: '6 SIX', color: 'bg-purple-600 text-white shadow-sm' },
          ].map((item) => (
            <button
              key={item.run}
              type="button"
              disabled={inn.isOverComplete || engine.isInningsOver}
              onClick={() => handleScoreRun(item.run)}
              className={`py-2 rounded-xl text-sm font-black min-h-[44px] transition-transform active:scale-95 border border-black/5 disabled:opacity-40 disabled:scale-100 flex items-center justify-center ${item.color}`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* 6. BOTTOM UTILITY & ACTION CARDS SECTION */}
        <div className="space-y-1 shrink-0">
          {/* Quick Utility Row */}
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={() => setShowRetireModal(true)}
              className="py-1 px-1 rounded-lg bg-[var(--muted)] text-xs font-bold text-red-500 flex items-center justify-center gap-1 active:scale-95 transition-transform min-h-[32px]"
              title="Retire Player"
            >
              <UserX className="w-3.5 h-3.5" />
              <span>Retire Batter</span>
            </button>

            <button
              type="button"
              onClick={() => setShowPenaltyModal(true)}
              className="py-1 px-1 rounded-lg bg-[var(--muted)] text-xs font-bold text-purple-500 flex items-center justify-center gap-1 active:scale-95 transition-transform min-h-[32px]"
              title="Award Penalty"
            >
              <Flag className="w-3.5 h-3.5" />
              <span>Award Penalty</span>
            </button>
          </div>

          {/* Equal Width Bottom Action Cards */}
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={() => {
                setSelectedScoreboardInnings(engine.currentInningsNumber as 1 | 2);
                setShowFullScoreboardModal(true);
              }}
              className="py-1.5 px-2 rounded-xl bg-[var(--card)] hover:bg-[var(--muted)] border border-[var(--border)] text-xs font-extrabold flex items-center justify-center gap-1 shadow-sm active:scale-[0.98] transition-all min-h-[36px]"
            >
              <FileText className="w-4 h-4 text-emerald-500" />
              <span>Full Scoreboard</span>
            </button>

            {engine.isMatchCompleted ? (
              <button
                type="button"
                onClick={() => ScorecardPdfGenerator.downloadPdf(engine.toScorecard())}
                className="py-1.5 px-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold flex items-center justify-center gap-1 shadow-sm active:scale-[0.98] transition-all min-h-[36px]"
              >
                <FileText className="w-4 h-4" />
                <span>Generate PDF</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowMatchInfoModal(true)}
                className="py-1.5 px-2 rounded-xl bg-[var(--card)] hover:bg-[var(--muted)] border border-[var(--border)] text-xs font-extrabold flex items-center justify-center gap-1 shadow-sm active:scale-[0.98] transition-all min-h-[36px]"
              >
                <Info className="w-4 h-4 text-blue-500" />
                <span>Match Info</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ── DESKTOP SCORER WORKSPACE (>= md: EXPANDED 3-PANEL LAYOUT) ── */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <div className="hidden md:block space-y-4 max-w-7xl mx-auto">
        {/* ── TOP SCOREBOARD BANNER (THEME-POWERED) ── */}
      <div
        className="rounded-2xl p-3.5 sm:p-5 md:p-6 text-white shadow-xl transition-all duration-300 relative overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${selectedTheme.deep} 0%, ${selectedTheme.primary} 60%, ${selectedTheme.secondary} 100%)`,
        }}
      >
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 sm:gap-4">
          <div className="w-full md:w-auto">
            <div className="flex items-center gap-2 mb-1">
              <span className="flex h-2.5 w-2.5 relative shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
              </span>
              <span className="text-[11px] sm:text-xs uppercase tracking-widest font-extrabold text-white/90 flex items-center gap-1.5 truncate">
                {engine.currentInningsNumber === 2 && engine.targetScore > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 font-black text-[10px] tracking-wide shadow-xs shrink-0">
                    CHASE
                  </span>
                )}
                <span>Innings {engine.currentInningsNumber} • {engine.totalOvers} Overs</span>
              </span>
              {inn.isFreeHit && (
                <span className="px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 font-black text-[10px] uppercase tracking-wider animate-bounce shadow-md shrink-0">
                  FREE HIT
                </span>
              )}
            </div>

            {/* Team Label (Secondary Header) */}
            <div className="flex items-center gap-2 mb-1.5">
              <TeamBadgeIcon
                type={inn.team === engine.teamA ? 'home' : 'away'}
                size="xs"
              />
              <span className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-white/90">
                {inn.team}
              </span>
            </div>

            {/* Primary Score & Overs */}
            <div className="flex items-baseline gap-3 sm:gap-4">
              <span className="text-4xl sm:text-5xl md:text-6xl font-black num-font tracking-tight text-white">
                {inn.totalRuns}/{inn.totalWickets}
              </span>
              <span className="text-lg sm:text-2xl font-bold text-white/80 num-font">
                {inn.oversString} Overs
              </span>
            </div>
          </div>

          {/* Rates & Targets Top Controls */}
          <div className="flex items-center justify-between md:justify-end w-full md:w-auto gap-2 text-xs font-semibold">
            <div className="px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-black/20 backdrop-blur-xs flex items-center gap-1.5">
              <span className="text-white/70 text-[11px]">CRR:</span>
              <span className="font-extrabold text-white num-font">{crr.toFixed(2)}</span>
            </div>

            {/* Theme Picker */}
            <div className="flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5 text-white/70" />
              <select
                value={selectedTheme.id}
                onChange={(e) => {
                  const t = SCOREBOARD_THEMES.find((th) => th.id === e.target.value);
                  if (t) setSelectedTheme(t);
                }}
                className="bg-black/30 text-white rounded-md px-2 py-1 text-[11px] font-semibold border-none focus:outline-none"
              >
                {SCOREBOARD_THEMES.map((t) => (
                  <option key={t.id} value={t.id} className="bg-slate-900 text-white">
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Flutter-style Dedicated Chase Hero HUD */}
        {engine.currentInningsNumber === 2 && engine.targetScore > 0 && (
          <div className="mt-3 sm:mt-4 pt-3 border-t border-white/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 sm:gap-3 bg-black/25 -mx-3.5 sm:-mx-5 md:-mx-6 -mb-3.5 sm:-mb-5 md:-mb-6 p-3 sm:p-4 rounded-b-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <div className="px-2.5 py-1 rounded-md bg-amber-400 text-slate-950 font-black text-[11px] sm:text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-sm shrink-0">
                <img
                  src="/assets/illustrations/chase_batsman.png"
                  alt="Chase"
                  className="w-3.5 h-3.5 sm:w-4 sm:h-4 object-contain"
                />
                <span>TARGET {engine.targetScore}</span>
              </div>
              <p className="font-extrabold text-xs sm:text-sm md:text-base text-white tracking-tight">
                Need <span className="text-amber-300 font-black text-base sm:text-lg num-font">{neededRuns}</span> runs in <span className="text-white font-black text-base sm:text-lg num-font">{remainingBalls}</span> balls
              </p>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
              <div className="px-2.5 py-1 rounded-md bg-white/10 text-xs font-semibold flex items-center gap-1">
                <span className="text-white/70 text-[10px] sm:text-[11px]">CRR</span>
                <span className="font-extrabold text-white num-font">{crr.toFixed(2)}</span>
              </div>
              <div className={`px-2.5 py-1 rounded-md text-xs font-bold flex items-center gap-1 ${
                rrr > 12
                  ? 'bg-red-500/30 text-red-200 border border-red-500/40'
                  : rrr > 8
                  ? 'bg-amber-500/30 text-amber-200 border border-amber-500/40'
                  : 'bg-emerald-500/30 text-emerald-200 border border-emerald-500/40'
              }`}>
                <span className="opacity-80 text-[10px] sm:text-[11px]">RRR</span>
                <span className="font-black num-font">{rrr.toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── OVER BALLS TIMELINE STRIP ── */}
      <div className="p-2.5 sm:p-3 rounded-xl bg-[var(--card)] border border-[var(--border)] flex items-center justify-between gap-2 overflow-x-auto no-scrollbar shadow-xs">
        <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--muted-foreground)] shrink-0">
          <span>This Over:</span>
        </div>

        <div className="flex items-center gap-1.5 min-w-0">
          {inn.thisOverLog.length === 0 ? (
            <span className="text-xs text-[var(--muted-foreground)] italic">
              New over ready. Awaiting first ball...
            </span>
          ) : (
            inn.thisOverLog.map((ball, idx) => {
              const isWkt = ball === 'W' || ball.includes('Out');
              const isFour = ball === '4';
              const isSix = ball === '6';
              const isExtra = ball.startsWith('Wd') || ball.startsWith('Nb');

              return (
                <span
                  key={idx}
                  className={`w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center text-xs font-black shrink-0 transition-transform ${
                    isWkt
                      ? 'bg-red-600 text-white shadow-sm shadow-red-600/30'
                      : isSix
                      ? 'bg-purple-600 text-white'
                      : isFour
                      ? 'bg-blue-600 text-white'
                      : isExtra
                      ? 'bg-amber-500 text-slate-950'
                      : ball === '0'
                      ? 'bg-[var(--muted)] text-[var(--muted-foreground)] border border-[var(--border)]'
                      : 'bg-emerald-600 text-white'
                  }`}
                >
                  {ball === '0' ? '•' : ball}
                </span>
              );
            })
          )}
        </div>

        {/* Swap Strike Action */}
        <button
          type="button"
          onClick={handleSwapStrike}
          className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--muted)] hover:bg-[var(--border)] text-xs font-bold text-[var(--foreground)] transition-colors"
          title="Swap Striker and Non-Striker"
        >
          <ArrowRightLeft className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Swap Strike</span>
        </button>
      </div>

      {/* ── RESPONSIVE SCORER WORKSPACE (DESKTOP 3-PANEL / MOBILE STACK) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* LEFT / TOP: ACTIVE BATTERS & CURRENT BOWLER CARD */}
        <div className="lg:col-span-4 space-y-3 sm:space-y-4">
          {/* Batters */}
          <div className="p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-xs space-y-2.5 sm:space-y-3">
            <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Crease Batters
            </span>

            {/* Striker */}
            <div
              onClick={() => {
                if (striker) {
                  setSelectedBatsman({
                    player: striker,
                    isStriker: true,
                    battingPosition: inn.strikerIdx + 1,
                  });
                }
              }}
              className="p-2.5 sm:p-3 rounded-lg sm:rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-1.5 cursor-pointer hover:border-emerald-500 hover:bg-emerald-500/15 active:scale-[0.99] transition-all group"
              title="Click to view full batsman profile & analytics"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 p-0.5 shrink-0 overflow-hidden flex items-center justify-center">
                    <img src="/assets/illustrations/strike_batsman.png" alt="Striker" className="w-full h-full object-contain" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1">
                      <span className="font-extrabold text-xs sm:text-sm tracking-tight text-[var(--foreground)] group-hover:text-emerald-400 transition-colors">
                        {cleanPlayerName(striker?.name)} *
                      </span>
                      <span className="text-[9px] sm:text-[10px] text-[var(--muted-foreground)] opacity-70 group-hover:opacity-100 transition-opacity">
                        (Profile ↗)
                      </span>
                    </div>
                  </div>
                </div>
                <span className="px-1.5 sm:px-2 py-0.5 rounded-md bg-emerald-600 text-white text-[9px] sm:text-[10px] font-bold uppercase">
                  {strikerIntent}
                </span>
              </div>

              <div className="flex items-center justify-between text-[11px] sm:text-xs num-font">
                <span className="font-black text-sm sm:text-base">
                  {striker?.runs} <span className="text-[11px] sm:text-xs font-normal text-[var(--muted-foreground)]">({striker?.balls}b)</span>
                </span>
                <span className="text-[var(--muted-foreground)] text-[10px] sm:text-xs">
                  4s: <b>{striker?.fours}</b> | 6s: <b>{striker?.sixes}</b> | SR: <b>{strikeRate(striker?.runs || 0, striker?.balls || 0).toFixed(1)}</b>
                </span>
              </div>
            </div>

            {/* Non-Striker */}
            <div
              onClick={() => {
                if (nonStriker) {
                  setSelectedBatsman({
                    player: nonStriker,
                    isNonStriker: true,
                    battingPosition: inn.nonStrikerIdx + 1,
                  });
                }
              }}
              className="p-2.5 sm:p-3 rounded-lg sm:rounded-xl bg-[var(--muted)] border border-[var(--border)] space-y-1.5 cursor-pointer hover:border-slate-500 hover:bg-[var(--muted)]/80 active:scale-[0.99] transition-all group"
              title="Click to view full batsman profile & analytics"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-slate-800 border border-slate-700 p-0.5 shrink-0 overflow-hidden flex items-center justify-center">
                    <img src="/assets/illustrations/non_strike_batsman.png" alt="Non-Striker" className="w-full h-full object-contain" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1">
                      <span className="font-bold text-xs sm:text-sm tracking-tight text-[var(--foreground)] group-hover:text-blue-400 transition-colors">
                        {cleanPlayerName(nonStriker?.name)}
                      </span>
                      <span className="text-[9px] sm:text-[10px] text-[var(--muted-foreground)] opacity-70 group-hover:opacity-100 transition-opacity">
                        (Profile ↗)
                      </span>
                    </div>
                  </div>
                </div>
                <span className="text-[9px] sm:text-[10px] text-[var(--muted-foreground)] uppercase font-semibold">Non-Striker</span>
              </div>

              <div className="flex items-center justify-between text-[11px] sm:text-xs num-font">
                <span className="font-bold text-xs sm:text-sm">
                  {nonStriker?.runs} <span className="text-[11px] sm:text-xs font-normal text-[var(--muted-foreground)]">({nonStriker?.balls}b)</span>
                </span>
                <span className="text-[var(--muted-foreground)] text-[10px] sm:text-xs">
                  4s: <b>{nonStriker?.fours}</b> | 6s: <b>{nonStriker?.sixes}</b> | SR: <b>{strikeRate(nonStriker?.runs || 0, nonStriker?.balls || 0).toFixed(1)}</b>
                </span>
              </div>
            </div>

            {/* Active Partnership */}
            <div className="pt-2 border-t border-[var(--border)] flex items-center justify-between text-[11px] sm:text-xs text-[var(--muted-foreground)]">
              <span>Partnership:</span>
              <span className="font-bold text-[var(--foreground)] num-font">
                {inn.currentPartnership.runs} runs ({inn.currentPartnership.balls} balls)
              </span>
            </div>
          </div>

          {/* Bowler */}
          <div className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-xs space-y-2.5 sm:space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                Current Bowler
              </span>
              <button
                type="button"
                onClick={() => setShowBowlerModal(true)}
                className="text-[11px] sm:text-xs text-blue-600 font-bold hover:underline min-h-[32px] flex items-center"
              >
                Change Bowler
              </button>
            </div>

            <div
              onClick={() => {
                if (currentBowler) {
                  setSelectedBowler(currentBowler);
                }
              }}
              className="p-2.5 sm:p-3 rounded-lg sm:rounded-xl bg-blue-500/10 border border-blue-500/20 space-y-1.5 cursor-pointer hover:border-blue-500 hover:bg-blue-500/15 active:scale-[0.99] transition-all group"
              title="Click to view full bowler profile & spell stats"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-blue-500/20 border border-blue-500/30 p-0.5 shrink-0 overflow-hidden flex items-center justify-center">
                    <img src="/assets/illustrations/opening_bowler.png" alt="Bowler" className="w-full h-full object-contain" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1">
                      <span className="font-extrabold text-xs sm:text-sm tracking-tight text-[var(--foreground)] group-hover:text-blue-400 transition-colors">
                        {cleanPlayerName(currentBowler?.name)}
                      </span>
                      <span className="text-[9px] sm:text-[10px] text-[var(--muted-foreground)] opacity-70 group-hover:opacity-100 transition-opacity">
                        (Profile ↗)
                      </span>
                    </div>
                  </div>
                </div>
                <span className="text-xs sm:text-sm font-bold text-blue-600 dark:text-blue-400 num-font">
                  {Math.floor(currentBowler?.ballsBowled / 6)}.{currentBowler?.ballsBowled % 6} ov
                </span>
              </div>

              <div className="flex items-center justify-between text-[11px] sm:text-xs num-font">
                <span className="font-black text-xs sm:text-sm">
                  {currentBowler?.wickets}-{currentBowler?.runs}
                </span>
                <span className="text-[var(--muted-foreground)] text-[10px] sm:text-xs">
                  M: <b>{currentBowler?.maidens}</b> | Econ: <b>{economyRate(currentBowler?.runs || 0, currentBowler?.ballsBowled || 0).toFixed(2)}</b>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* CENTER: PRIMARY SCORING PAD KEYPAD */}
        <div className="lg:col-span-5 space-y-3.5 sm:space-y-4">
          <div className="p-3.5 sm:p-5 rounded-xl sm:rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-xs space-y-3 sm:space-y-4">
            {/* Over Complete Alert */}
            {inn.isOverComplete && (
              <div className="p-2.5 sm:p-3 rounded-lg sm:rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                  <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500 shrink-0" />
                  <span className="text-[11px] sm:text-xs font-bold text-amber-600 dark:text-amber-400 leading-tight">
                    Over complete. Select new bowler.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowBowlerModal(true)}
                  className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-extrabold text-[11px] sm:text-xs shrink-0 active:scale-95 transition-transform"
                >
                  Select Bowler
                </button>
              </div>
            )}

            {/* Extra Modifiers Strip */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] sm:text-xs font-bold text-[var(--muted-foreground)]">
                <span>Modifiers</span>
                {extraFlag !== 'none' && (
                  <button
                    onClick={() => setExtraFlag('none')}
                    className="text-[10px] text-red-500 font-bold hover:underline"
                  >
                    Clear Flag
                  </button>
                )}
              </div>

              <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
                {[
                  { id: 'wide', label: 'Wide' },
                  { id: 'no_ball', label: 'No Ball' },
                  { id: 'bye', label: 'Byes' },
                  { id: 'leg_bye', label: 'Leg Byes' },
                  { id: 'wicket', label: 'Wicket' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() =>
                      setExtraFlag(extraFlag === item.id ? 'none' : (item.id as any))
                    }
                    className={`py-2 sm:py-2.5 px-0.5 sm:px-1 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold sm:font-extrabold min-h-[42px] sm:min-h-[44px] transition-all border text-center ${
                      extraFlag === item.id
                        ? item.id === 'wicket'
                          ? 'bg-red-600 text-white border-red-600 shadow-md shadow-red-600/30'
                          : 'bg-amber-500 text-slate-950 border-amber-500 shadow-md shadow-amber-500/30'
                        : 'bg-[var(--muted)] text-[var(--foreground)] border-[var(--border)] hover:border-emerald-500/50'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Run Buttons (0 - 6) */}
            <div className="space-y-1.5">
              <span className="text-[11px] sm:text-xs font-bold text-[var(--muted-foreground)]">Run Scoring</span>
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {[
                  { run: 0, label: '0 Dot', color: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200' },
                  { run: 1, label: '1 Single', color: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300' },
                  { run: 2, label: '2 Double', color: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200' },
                  { run: 3, label: '3 Three', color: 'bg-emerald-200 dark:bg-emerald-800/40 text-emerald-900 dark:text-emerald-100' },
                  { run: 4, label: '4 FOUR', color: 'bg-blue-600 text-white shadow-md shadow-blue-600/20' },
                  { run: 6, label: '6 SIX', color: 'bg-purple-600 text-white shadow-md shadow-purple-600/20' },
                ].map((item) => (
                  <button
                    key={item.run}
                    type="button"
                    disabled={inn.isOverComplete || engine.isInningsOver}
                    onClick={() => handleScoreRun(item.run)}
                    className={`py-3 sm:py-4 md:py-6 rounded-xl sm:rounded-2xl text-base sm:text-lg md:text-xl font-black min-h-[52px] sm:min-h-[58px] transition-all hover:scale-[1.02] active:scale-[0.97] border border-black/5 disabled:opacity-40 disabled:scale-100 flex items-center justify-center ${item.color}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Actions Row */}
            <div className="grid grid-cols-4 gap-2 pt-2 border-t border-[var(--border)]">
              <button
                type="button"
                onClick={handleUndo}
                className="py-2.5 rounded-xl bg-[var(--muted)] hover:bg-[var(--border)] text-xs font-bold flex flex-col items-center justify-center gap-1 transition-colors min-h-[44px] active:scale-95"
              >
                <RotateCcw className="w-4 h-4 text-amber-500" />
                <span>Undo</span>
              </button>

              <button
                type="button"
                onClick={handleSwapStrike}
                className="py-2.5 rounded-xl bg-[var(--muted)] hover:bg-[var(--border)] text-xs font-bold flex flex-col items-center justify-center gap-1 transition-colors min-h-[44px] active:scale-95"
              >
                <ArrowRightLeft className="w-4 h-4 text-emerald-500" />
                <span>Swap Strike</span>
              </button>

              <button
                type="button"
                onClick={() => setShowRetireModal(true)}
                className="py-2.5 rounded-xl bg-[var(--muted)] hover:bg-[var(--border)] text-xs font-bold flex flex-col items-center justify-center gap-1 transition-colors min-h-[44px] active:scale-95"
              >
                <UserX className="w-4 h-4 text-red-500" />
                <span>Retire</span>
              </button>

              <button
                type="button"
                onClick={() => setShowPenaltyModal(true)}
                className="py-2.5 rounded-xl bg-[var(--muted)] hover:bg-[var(--border)] text-xs font-bold flex flex-col items-center justify-center gap-1 transition-colors min-h-[44px] active:scale-95"
              >
                <Flag className="w-4 h-4 text-purple-500" />
                <span>Penalty</span>
              </button>
            </div>

            {/* Bottom Action Cards (Equal Width, Balanced) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 pt-2.5 border-t border-[var(--border)]">
              <button
                type="button"
                onClick={() => {
                  setSelectedScoreboardInnings(engine.currentInningsNumber as 1 | 2);
                  setShowFullScoreboardModal(true);
                }}
                className="py-2.5 px-3 rounded-xl bg-[var(--card)] hover:bg-[var(--muted)] border border-[var(--border)] text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1.5 shadow-xs hover:border-emerald-500/40 active:scale-[0.98] transition-all min-h-[44px]"
              >
                <FileText className="w-4 h-4 text-emerald-500" />
                <span>Full Scoreboard</span>
              </button>

              <button
                type="button"
                onClick={() => toggleView('matches')}
                className={`py-2.5 px-3 rounded-xl border text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1.5 shadow-xs active:scale-[0.98] transition-all min-h-[44px] ${
                  activeView === 'matches'
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                    : 'bg-[var(--card)] hover:bg-[var(--muted)] border-[var(--border)] text-[var(--foreground)]'
                }`}
              >
                <History className="w-4 h-4 text-blue-500" />
                <span>Matches</span>
              </button>

              <button
                type="button"
                onClick={() => toggleView('advancedAnalytics')}
                className={`py-2.5 px-3 rounded-xl border text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1.5 shadow-xs active:scale-[0.98] transition-all min-h-[44px] ${
                  activeView === 'advancedAnalytics'
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                    : 'bg-[var(--card)] hover:bg-[var(--muted)] border-[var(--border)] text-[var(--foreground)]'
                }`}
              >
                <BarChart2 className="w-4 h-4 text-purple-500" />
                <span>Analytics</span>
              </button>

              {engine.isMatchCompleted ? (
                <button
                  type="button"
                  onClick={() => ScorecardPdfGenerator.downloadPdf(engine.toScorecard())}
                  className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1.5 shadow-md active:scale-[0.98] transition-all min-h-[44px]"
                >
                  <FileText className="w-4 h-4" />
                  <span>Generate PDF</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowMatchInfoModal(true)}
                  className="py-2.5 px-3 rounded-xl bg-[var(--card)] hover:bg-[var(--muted)] border border-[var(--border)] text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1.5 shadow-xs hover:border-blue-500/40 active:scale-[0.98] transition-all min-h-[44px]"
                >
                  <Info className="w-4 h-4 text-blue-500" />
                  <span>Match Info</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT / BOTTOM: SCORECARD SUMMARY & FALL OF WICKETS */}
        <div className="lg:col-span-3 space-y-3.5 sm:space-y-4">
          {/* Batting Card */}
          <div className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-xs space-y-2.5 sm:space-y-3">
            <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
              Scorecard Overview
            </span>

            <div className="space-y-1.5 max-h-48 overflow-y-auto text-[11px] sm:text-xs">
              {inn.players
                .filter((p) => p.runs > 0 || p.balls > 0 || p.isDismissed)
                .map((p, i) => (
                  <div key={i} className="flex items-center justify-between py-1 border-b border-[var(--border)] last:border-none">
                    <span className="font-semibold truncate max-w-[120px] sm:max-w-[140px]">{cleanPlayerName(p.name)}</span>
                    <span className="num-font font-bold">
                      {p.runs} ({p.balls}b) {p.isDismissed ? '' : '*'}
                    </span>
                  </div>
                ))}
            </div>

            {/* Extras breakdown */}
            <div className="pt-2 border-t border-[var(--border)] text-[11px] sm:text-xs text-[var(--muted-foreground)] flex justify-between">
              <span>Extras:</span>
              <span className="font-bold text-[var(--foreground)] num-font">
                {inn.wideRuns + inn.nbRuns + inn.byeRuns + inn.lbRuns + inn.penaltyRuns} (w {inn.wideRuns}, nb {inn.nbRuns}, b {inn.byeRuns}, lb {inn.lbRuns})
              </span>
            </div>
          </div>

          {/* Fall of Wickets */}
          <div className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-xs space-y-2.5 sm:space-y-3">
            <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
              Fall of Wickets
            </span>

            <div className="space-y-1.5 max-h-40 overflow-y-auto text-[11px] sm:text-xs">
              {inn.fallOfWickets.length === 0 ? (
                <p className="text-[var(--muted-foreground)] italic">No wickets fallen</p>
              ) : (
                inn.fallOfWickets.map((f, i) => (
                  <div key={i} className="flex items-center justify-between py-1 border-b border-[var(--border)] last:border-none">
                    <span className="text-[var(--muted-foreground)]">{f.wicket}-{f.score}</span>
                    <span className="font-medium truncate max-w-[140px] sm:max-w-[160px]">{cleanPlayerName(f.player)} ({f.over} ov)</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>

      {/* ── FULL MATCH SCOREBOARD MODAL (LIVE OR POST-MATCH) ── */}
      {showFullScoreboardModal && (() => {
        const targetInn =
          selectedScoreboardInnings === 2 && engine.secondInnings
            ? engine.secondInnings
            : engine.firstInnings;
        const targetCrr = currentRunRate(targetInn.totalRuns, targetInn.totalBalls);

        return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-[var(--card)] p-4 sm:p-5 border border-[var(--border)] shadow-2xl space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
                <div>
                  <h3 className="font-extrabold text-base sm:text-lg text-[var(--foreground)]">
                    Full Match Scoreboard
                  </h3>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {engine.teamA} vs {engine.teamB} • {engine.totalOvers} Overs Match
                  </p>
                </div>
                <button
                  onClick={() => setShowFullScoreboardModal(false)}
                  className="p-1.5 rounded-lg bg-[var(--muted)] hover:bg-[var(--border)] text-[var(--foreground)]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Innings Switcher Tabs */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedScoreboardInnings(1)}
                  className={`flex-1 min-w-[130px] px-3 py-2 rounded-lg text-xs font-bold transition-all truncate text-center ${
                    selectedScoreboardInnings === 1
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  }`}
                >
                  1st Inn: {engine.firstInnings.team} ({engine.firstInnings.totalRuns}/{engine.firstInnings.totalWickets})
                </button>

                {engine.secondInnings && (
                  <button
                    type="button"
                    onClick={() => setSelectedScoreboardInnings(2)}
                    className={`flex-1 min-w-[130px] px-3 py-2 rounded-lg text-xs font-bold transition-all truncate text-center ${
                      selectedScoreboardInnings === 2
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                    }`}
                  >
                    2nd Inn: {engine.secondInnings.team} ({engine.secondInnings.totalRuns}/{engine.secondInnings.totalWickets})
                  </button>
                )}
              </div>

              {/* Innings Summary Banner */}
              <div className="p-3 rounded-xl bg-gradient-to-r from-emerald-600/15 to-blue-600/15 border border-emerald-500/20 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-[var(--foreground)] block truncate">
                    {targetInn.team}
                  </span>
                  <div className="text-lg sm:text-xl font-black num-font">
                    {targetInn.totalRuns}/{targetInn.totalWickets}{' '}
                    <span className="text-xs font-normal text-[var(--muted-foreground)]">
                      ({targetInn.oversString} ov)
                    </span>
                  </div>
                </div>
                <div className="text-right text-xs font-semibold shrink-0">
                  <span className="text-[var(--muted-foreground)]">Run Rate: </span>
                  <span className="font-extrabold num-font">{targetCrr.toFixed(2)}</span>
                </div>
              </div>

              {/* Batting Card */}
              <div className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  Batting Scorecard
                </span>
                <div className="overflow-x-auto table-scroll-container">
                  <div className="min-w-[420px] space-y-1 text-xs">
                    <div className="grid grid-cols-12 text-[10px] uppercase font-bold text-[var(--muted-foreground)] border-b pb-1">
                      <span className="col-span-5">Batter</span>
                      <span className="col-span-2 text-right">R (B)</span>
                      <span className="col-span-2 text-right">4s / 6s</span>
                      <span className="col-span-3 text-right">SR</span>
                    </div>
                    {targetInn.players
                      .filter((p) => p.runs > 0 || p.balls > 0 || p.isDismissed)
                      .map((p, i) => (
                        <div
                          key={i}
                          className="grid grid-cols-12 py-1.5 border-b border-[var(--border)] last:border-none items-center"
                        >
                          <div className="col-span-5 truncate pr-1">
                            <span className="font-bold">{cleanPlayerName(p.name)}</span>
                            {p.isDismissed ? (
                              <span className="text-[10px] text-red-500 ml-1">
                                ({p.dismissalType || 'out'})
                              </span>
                            ) : (
                              <span className="text-[10px] text-emerald-500 font-bold ml-1">
                                * not out
                              </span>
                            )}
                          </div>
                          <div className="col-span-2 text-right num-font font-black">
                            {p.runs}{' '}
                            <span className="font-normal text-[10px] text-[var(--muted-foreground)]">
                              ({p.balls})
                            </span>
                          </div>
                          <div className="col-span-2 text-right num-font text-[11px] text-[var(--muted-foreground)]">
                            {p.fours} / {p.sixes}
                          </div>
                          <div className="col-span-3 text-right num-font font-bold">
                            {strikeRate(p.runs, p.balls).toFixed(1)}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>

              {/* Extras & Totals */}
              <div className="p-2.5 rounded-lg bg-[var(--muted)] text-xs flex justify-between">
                <span>Extras:</span>
                <span className="font-bold num-font">
                  {targetInn.wideRuns +
                    targetInn.nbRuns +
                    targetInn.byeRuns +
                    targetInn.lbRuns +
                    targetInn.penaltyRuns}{' '}
                  (w {targetInn.wideRuns}, nb {targetInn.nbRuns}, b {targetInn.byeRuns}, lb{' '}
                  {targetInn.lbRuns})
                </span>
              </div>

              {/* Bowling Card */}
              <div className="space-y-2 pt-2 border-t border-[var(--border)]">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                  Bowling Figures
                </span>
                <div className="overflow-x-auto table-scroll-container">
                  <div className="min-w-[420px] space-y-1 text-xs">
                    <div className="grid grid-cols-12 text-[10px] uppercase font-bold text-[var(--muted-foreground)] border-b pb-1">
                      <span className="col-span-5">Bowler</span>
                      <span className="col-span-2 text-right">O (M)</span>
                      <span className="col-span-2 text-right">R</span>
                      <span className="col-span-1 text-right font-black">W</span>
                      <span className="col-span-2 text-right">Econ</span>
                    </div>
                    {targetInn.bowlers
                      .filter((b) => b.ballsBowled > 0)
                      .map((b, i) => (
                        <div
                          key={i}
                          className="grid grid-cols-12 py-1.5 border-b border-[var(--border)] last:border-none items-center"
                        >
                          <span className="col-span-5 font-bold truncate pr-1">
                            {cleanPlayerName(b.name)}
                          </span>
                          <span className="col-span-2 text-right num-font">
                            {Math.floor(b.ballsBowled / 6)}.{b.ballsBowled % 6} ({b.maidens})
                          </span>
                          <span className="col-span-2 text-right num-font">{b.runs}</span>
                          <span className="col-span-1 text-right num-font font-black text-blue-600">
                            {b.wickets}
                          </span>
                          <span className="col-span-2 text-right num-font font-bold">
                            {economyRate(b.runs, b.ballsBowled).toFixed(1)}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              </div>

              {/* Fall of Wickets */}
              <div className="space-y-1 pt-2 border-t border-[var(--border)]">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                  Fall of Wickets
                </span>
                <div className="space-y-1 text-xs max-h-32 overflow-y-auto">
                  {targetInn.fallOfWickets.length === 0 ? (
                    <p className="text-[var(--muted-foreground)] italic">No wickets fallen</p>
                  ) : (
                    targetInn.fallOfWickets.map((f, i) => (
                      <div key={i} className="flex items-center justify-between py-0.5 gap-2">
                        <span className="font-bold text-red-500 shrink-0">
                          {f.wicket}-{f.score}
                        </span>
                        <span className="text-[var(--muted-foreground)] truncate max-w-[200px]">
                          {cleanPlayerName(f.player)} ({f.over} ov)
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Modal Actions */}
              <div className="pt-2 border-t border-[var(--border)] flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={() => ScorecardPdfGenerator.downloadPdf(engine.toScorecard())}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.98] min-h-[44px]"
                >
                  <FileText className="w-4 h-4 shrink-0" />
                  <span>Download PDF Scorecard</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowFullScoreboardModal(false)}
                  className="py-2.5 px-4 rounded-xl bg-[var(--muted)] hover:bg-[var(--border)] text-xs font-bold min-h-[44px]"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── MATCH INFO & RULES MODAL ── */}
      {showMatchInfoModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl bg-[var(--card)] p-4 sm:p-5 border border-[var(--border)] shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border)]">
              <div>
                <h3 className="font-extrabold text-base text-[var(--foreground)]">Match Information</h3>
                <p className="text-xs text-[var(--muted-foreground)]">Rules & Setup Specifications</p>
              </div>
              <button
                onClick={() => setShowMatchInfoModal(false)}
                className="p-1.5 rounded-lg bg-[var(--muted)] hover:bg-[var(--border)] text-[var(--foreground)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {/* Teams & Format */}
              <div className="p-3 rounded-xl bg-[var(--muted)]/60 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[var(--muted-foreground)] shrink-0">Host / Home Team:</span>
                  <span className="font-extrabold truncate text-right">{engine.teamA}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[var(--muted-foreground)] shrink-0">Visitor / Away Team:</span>
                  <span className="font-extrabold truncate text-right">{engine.teamB}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[var(--muted-foreground)] shrink-0">Match Format:</span>
                  <span className="font-bold text-right">{engine.totalOvers} Overs per side</span>
                </div>
                {engine.venue && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[var(--muted-foreground)] shrink-0">Venue:</span>
                    <span className="font-bold truncate text-right">{engine.venue}</span>
                  </div>
                )}
              </div>

              {/* Toss Details */}
              <div className="p-3 rounded-xl bg-[var(--muted)]/60 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[var(--muted-foreground)] shrink-0">Toss Winner:</span>
                  <span className="font-extrabold text-emerald-600 dark:text-emerald-400 truncate text-right">{engine.tossWinner}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[var(--muted-foreground)] shrink-0">Toss Decision:</span>
                  <span className="font-bold uppercase text-right">Elected to {engine.tossDecision}</span>
                </div>
              </div>

              {/* Advanced Rules */}
              <div className="p-3 rounded-xl bg-[var(--muted)]/60 space-y-1.5">
                <span className="font-bold text-[var(--foreground)] block mb-1">Match Rules:</span>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[var(--muted-foreground)] shrink-0">Players per team:</span>
                  <span className="font-bold">{engine.advancedSettings?.players || 11}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[var(--muted-foreground)] shrink-0">Wide ball penalty:</span>
                  <span className="font-bold">{engine.advancedSettings?.wideRun ?? 1} run</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[var(--muted-foreground)] shrink-0">No-ball penalty:</span>
                  <span className="font-bold">{engine.advancedSettings?.noBallRun ?? 1} run</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[var(--muted-foreground)] shrink-0">Max overs per bowler:</span>
                  <span className="font-bold">{engine.advancedSettings?.manualOverLimit || Math.ceil(engine.totalOvers / 5)}</span>
                </div>
              </div>

              {/* Status */}
              <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-between gap-2">
                <span className="font-semibold text-blue-700 dark:text-blue-300 shrink-0">Current Status:</span>
                <span className="font-black uppercase text-blue-700 dark:text-blue-300 text-right truncate">
                  {engine.isMatchCompleted ? 'Match Concluded' : `Innings ${engine.currentInningsNumber} Live`}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowMatchInfoModal(false)}
              className="w-full py-2.5 rounded-xl bg-[var(--muted)] hover:bg-[var(--border)] text-xs font-bold min-h-[44px]"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* ── WICKET MODAL ── */}
      {showWicketModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-[var(--card)] p-4 sm:p-5 border border-[var(--border)] shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-lg text-red-600">Record Wicket</h3>
              <button onClick={() => setShowWicketModal(false)} className="p-1 rounded-lg hover:bg-[var(--muted)]">
                <X className="w-5 h-5 text-[var(--muted-foreground)]" />
              </button>
            </div>

            <div className="space-y-3 text-sm">
              {/* Dismissal Type */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--muted-foreground)]">Dismissal Type</label>
                <select
                  value={dismissalType}
                  onChange={(e) => setDismissalType(e.target.value as any)}
                  className="w-full p-2.5 rounded-xl bg-[var(--muted)] border border-[var(--border)] font-bold text-sm"
                >
                  {[
                    'Bowled',
                    'Caught',
                    'LBW',
                    'Run Out',
                    'Stumped',
                    'Hit Wicket',
                    'Retired Out',
                    'Retired Hurt',
                    'Obstructing the Field',
                    'Timed Out',
                  ].map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              {/* Striker vs Non-Striker Out */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--muted-foreground)]">Batter Out</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setIsStrikerOut(true)}
                    className={`p-2.5 rounded-xl border text-xs font-bold truncate text-left sm:text-center min-h-[44px] ${
                      isStrikerOut
                        ? 'bg-red-600 text-white border-red-600'
                        : 'bg-[var(--muted)] text-[var(--muted-foreground)] border-[var(--border)]'
                    }`}
                  >
                    Striker: <span className="font-extrabold">{cleanPlayerName(striker?.name)}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsStrikerOut(false)}
                    className={`p-2.5 rounded-xl border text-xs font-bold truncate text-left sm:text-center min-h-[44px] ${
                      !isStrikerOut
                        ? 'bg-red-600 text-white border-red-600'
                        : 'bg-[var(--muted)] text-[var(--muted-foreground)] border-[var(--border)]'
                    }`}
                  >
                    Non-Striker: <span className="font-extrabold">{cleanPlayerName(nonStriker?.name)}</span>
                  </button>
                </div>
              </div>

              {/* Fielder Name */}
              {['Caught', 'Run Out', 'Stumped'].includes(dismissalType) && (
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[var(--muted-foreground)]">Fielder Name</label>
                  <input
                    type="text"
                    value={fielderName}
                    onChange={(e) => setFielderName(e.target.value)}
                    placeholder="e.g. Fielder Name"
                    className="w-full p-2.5 rounded-xl bg-[var(--muted)] border border-[var(--border)] font-medium text-sm"
                  />
                </div>
              )}

              {/* Next Batsman Name */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--muted-foreground)]">Incoming Batsman</label>
                <input
                  type="text"
                  value={newBatsmanName}
                  onChange={(e) => setNewBatsmanName(e.target.value)}
                  placeholder={inn.players[inn.nextPlayerIdx]?.name || 'Next Batsman'}
                  className="w-full p-2.5 rounded-xl bg-[var(--muted)] border border-[var(--border)] font-medium text-sm"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleConfirmWicket}
              className="w-full py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-extrabold text-sm shadow-lg shadow-red-600/30 min-h-[44px]"
            >
              Confirm Wicket
            </button>
          </div>
        </div>
      )}

      {/* ── CHANGE BOWLER MODAL ── */}
      {showBowlerModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-[var(--card)] p-4 sm:p-5 border border-[var(--border)] shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-lg text-blue-600">Select Bowler</h3>
              <button onClick={() => setShowBowlerModal(false)} className="p-1 rounded-lg hover:bg-[var(--muted)]">
                <X className="w-5 h-5 text-[var(--muted-foreground)]" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--muted-foreground)]">Existing Bowlers</label>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {inn.bowlers.map((b) => {
                    const canBowl = engine.canBowlerBowl(b.name);
                    return (
                      <button
                        key={b.id}
                        type="button"
                        disabled={!canBowl}
                        onClick={() => handleChangeBowler(b.name)}
                        className={`w-full text-left p-2.5 sm:p-3 rounded-xl border flex items-center justify-between gap-2 text-xs font-bold min-h-[44px] ${
                          canBowl
                            ? 'bg-[var(--muted)] hover:bg-blue-500/10 hover:border-blue-500/50 text-[var(--foreground)] border-[var(--border)]'
                            : 'opacity-40 bg-[var(--muted)] border-transparent cursor-not-allowed'
                        }`}
                      >
                        <span className="truncate">{cleanPlayerName(b.name)}</span>
                        <span className="shrink-0 num-font text-right">
                          {Math.floor(b.ballsBowled / 6)}.{b.ballsBowled % 6} ov ({b.wickets}-{b.runs})
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-2 border-t border-[var(--border)] space-y-1">
                <label className="text-xs font-semibold text-[var(--muted-foreground)]">Or Enter New Bowler</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newBowlerName}
                    onChange={(e) => setNewBowlerName(e.target.value)}
                    placeholder="New Bowler Name"
                    className="flex-1 min-w-0 p-2.5 rounded-xl bg-[var(--muted)] border border-[var(--border)] font-bold text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => handleChangeBowler(newBowlerName)}
                    className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm shrink-0 min-h-[44px]"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── RETIRE BATTER MODAL ── */}
      {showRetireModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-[var(--card)] p-4 sm:p-5 border border-[var(--border)] shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-lg text-red-600">Retire Batter</h3>
              <button onClick={() => setShowRetireModal(false)} className="p-1 rounded-lg hover:bg-[var(--muted)]">
                <X className="w-5 h-5 text-[var(--muted-foreground)]" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleRetirePlayer(true, 'Retire Out')}
                  className="p-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs min-h-[44px] flex items-center justify-center text-center"
                >
                  Striker: Retire Out (Wicket)
                </button>
                <button
                  type="button"
                  onClick={() => handleRetirePlayer(true, 'Retire Hurt')}
                  className="p-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs min-h-[44px] flex items-center justify-center text-center"
                >
                  Striker: Retire Hurt
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleRetirePlayer(false, 'Retire Out')}
                  className="p-3 rounded-xl bg-red-600/80 hover:bg-red-600 text-white font-bold text-xs min-h-[44px] flex items-center justify-center text-center"
                >
                  Non-Striker: Retire Out
                </button>
                <button
                  type="button"
                  onClick={() => handleRetirePlayer(false, 'Retire Hurt')}
                  className="p-3 rounded-xl bg-amber-500/80 hover:bg-amber-500 text-slate-950 font-bold text-xs min-h-[44px] flex items-center justify-center text-center"
                >
                  Non-Striker: Retire Hurt
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── PENALTY RUNS MODAL ── */}
      {showPenaltyModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-[var(--card)] p-4 sm:p-5 border border-[var(--border)] shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-lg text-purple-600">Award Penalty Runs</h3>
              <button onClick={() => setShowPenaltyModal(false)} className="p-1 rounded-lg hover:bg-[var(--muted)]">
                <X className="w-5 h-5 text-[var(--muted-foreground)]" />
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--muted-foreground)]">Penalty Runs</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={penaltyRuns}
                  onChange={(e) => setPenaltyRuns(Number(e.target.value))}
                  className="w-full p-2.5 rounded-xl bg-[var(--muted)] border border-[var(--border)] font-bold text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--muted-foreground)]">Award To</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAwardedToBatting(true)}
                    className={`p-2.5 rounded-xl border text-xs font-bold min-h-[44px] flex items-center justify-center text-center ${
                      awardedToBatting ? 'bg-purple-600 text-white' : 'bg-[var(--muted)]'
                    }`}
                  >
                    Batting Team (+{penaltyRuns}P)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAwardedToBatting(false)}
                    className={`p-2.5 rounded-xl border text-xs font-bold min-h-[44px] flex items-center justify-center text-center ${
                      !awardedToBatting ? 'bg-purple-600 text-white' : 'bg-[var(--muted)]'
                    }`}
                  >
                    Bowling Team (-{penaltyRuns}P)
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--muted-foreground)]">Reason Note</label>
                <input
                  type="text"
                  value={penaltyReason}
                  onChange={(e) => setPenaltyReason(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-[var(--muted)] border border-[var(--border)] text-sm"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleAwardPenalty}
              className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-sm shadow-md shadow-purple-600/30"
            >
              Confirm Penalty
            </button>
          </div>
        </div>
      )}

      {/* ── INNINGS 1 COMPLETION / CHASE SETUP MODAL ── */}
      {showInningsTransitionModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-[var(--card)] p-4 sm:p-6 border border-[var(--border)] shadow-2xl space-y-4 text-center">
            <div className="flex items-center justify-center">
              <div className="w-20 h-20 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 p-2 flex items-center justify-center shadow-lg">
                <img
                  src="/assets/illustrations/chase_batsman.png"
                  alt="Chase Target"
                  className="w-full h-full object-contain drop-shadow"
                />
              </div>
            </div>

            <div>
              <h3 className="text-2xl font-black tracking-tight">1st Innings Completed!</h3>
              <p className="text-sm text-[var(--muted-foreground)] mt-1">
                {engine.firstInnings.team} scored <b>{engine.firstInnings.totalRuns}/{engine.firstInnings.totalWickets}</b> in {engine.firstInnings.oversString} overs.
              </p>
              <div className="mt-3 p-3 rounded-xl bg-[var(--muted)] border border-[var(--border)]">
                <span className="text-xs font-bold text-[var(--muted-foreground)] uppercase">Target for {engine.firstInnings.bowlingTeam}</span>
                <div className="text-3xl font-black text-emerald-600 num-font mt-0.5">
                  {engine.firstInnings.totalRuns + 1} runs
                </div>
              </div>
            </div>

            <div className="space-y-3 text-left">
              <span className="text-xs font-bold uppercase text-[var(--muted-foreground)]">2nd Innings Opening Players</span>
              <input
                type="text"
                placeholder="2nd Innings Striker"
                value={inn2Striker}
                onChange={(e) => setInn2Striker(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-[var(--muted)] border font-bold text-sm"
              />
              <input
                type="text"
                placeholder="2nd Innings Non-Striker"
                value={inn2NonStriker}
                onChange={(e) => setInn2NonStriker(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-[var(--muted)] border font-bold text-sm"
              />
              <input
                type="text"
                placeholder="Opening Bowler"
                value={inn2Bowler}
                onChange={(e) => setInn2Bowler(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-[var(--muted)] border font-bold text-sm"
              />
            </div>

            <button
              type="button"
              onClick={handleStartSecondInnings}
              className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-base shadow-lg shadow-emerald-600/30"
            >
              Start 2nd Innings Chase
            </button>
          </div>
        </div>
      )}

      {/* ── BATSMAN & BOWLER FULL PROFILE MODALS ── */}
      <BatsmanProfileModal
        player={selectedBatsman?.player || null}
        isOpen={!!selectedBatsman}
        onClose={() => setSelectedBatsman(null)}
        isStriker={selectedBatsman?.isStriker}
        isNonStriker={selectedBatsman?.isNonStriker}
        battingPosition={selectedBatsman?.battingPosition}
        partnerships={inn.pastPartnerships}
        fallOfWickets={inn.fallOfWickets}
      />

      <BowlerProfileModal
        bowler={selectedBowler}
        isOpen={!!selectedBowler}
        onClose={() => setSelectedBowler(null)}
        isCurrentlyBowling={currentBowler?.name === selectedBowler?.name && !inn.isOverComplete}
        ongoingOverLog={inn.thisOverLog}
        ongoingMatchOver={Math.floor(inn.totalBalls / 6) + 1}
        fallOfWickets={inn.fallOfWickets}
        advancedSettings={engine.advancedSettings}
      />
    </>
  );
}
