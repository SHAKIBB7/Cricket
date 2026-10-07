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
          <div className="border-4 border-emerald-600 border-t-transparent animate-spin rounded-full mx-auto w-10 h-10" />
          <p className="font-semibold text-sm">Loading Match Scorer...</p>
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
      <div className="md:hidden flex flex-col select-none overflow-y-auto min-h-[calc(100dvh-3.25rem)] gap-card-gap pb-safe pt-4 px-screen-x w-full max-w-full overflow-x-hidden">
        {/* 1. TOP COMPACT SCOREBOARD BANNER (MOBILE-ONLY TWO-SECTION REDESIGN) */}
        <div
          className="shadow-lg relative overflow-hidden shrink-0 transition-all duration-300 rounded-card px-4 text-white py-4"
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
            className="absolute top-2 right-2 hover:text-white active:scale-90 transition-transform text-white/50 p-1.5"
            title="Cycle Scoreboard Theme"
          >
            <Palette className="w-4 h-4" />
          </button>

          <div className="grid items-center grid-cols-2 gap-3">
            {/* ── LEFT SECTION: TEAM / INFO ── */}
            <div className="flex flex-col justify-between border-r border-white/15 min-w-0 pr-2">
              {/* Team Name */}
              <div className="flex items-center gap-2 min-w-0 mb-1.5">
                <span className="flex relative shrink-0 h-2 w-2">
                  <span className="animate-ping absolute inline-flex bg-white opacity-75 rounded-full h-full w-full" />
                  <span className="relative inline-flex bg-white rounded-full h-2 w-2" />
                </span>
                <span className="font-black uppercase tracking-wider truncate leading-tight text-lg">
                  {inn.team}
                </span>
              </div>

              {/* Chase or 1st Innings Info */}
              {engine.currentInningsNumber === 2 && engine.targetScore > 0 ? (
                <div className="space-y-1 min-w-0">
                  <div className="font-black leading-tight num-font truncate text-amber-300 text-md">
                    Need {neededRuns} in {remainingBalls}b
                  </div>
                  <div className="font-bold num-font leading-tight truncate text-white/80 text-sm">
                    Tgt {engine.targetScore} • RRR {rrr.toFixed(1)}
                  </div>
                  <div className="font-bold num-font leading-tight truncate text-white/80 text-sm">
                    CRR {crr.toFixed(2)}
                  </div>
                </div>
              ) : (
                <div className="space-y-1 min-w-0">
                  <div className="font-extrabold leading-tight truncate text-white/90 text-md">
                    Inn {engine.currentInningsNumber} • {engine.totalOvers} Ov
                  </div>
                  <div className="font-bold num-font leading-tight truncate text-white/80 text-sm">
                    CRR {crr.toFixed(2)}
                  </div>
                  <div className="font-bold num-font leading-tight truncate text-white/80 text-sm">
                    Proj: {Math.round(crr * engine.totalOvers)}
                  </div>
                </div>
              )}

              {/* Free Hit Pill if active */}
              {inn.isFreeHit && (
                <div className="mt-1">
                  <span className="rounded bg-amber-400 font-black text-xs xs:text-xs sm:text-sm uppercase tracking-wider animate-bounce inline-block px-2 py-0.5 text-slate-900">
                    FREE HIT
                  </span>
                </div>
              )}
            </div>

            {/* ── RIGHT SECTION: RUNS, WICKETS & OVERS ── */}
            <div className="flex flex-col justify-center items-center pl-2">
              {/* Runs and Wickets Columns */}
              <div className="grid text-center grid-cols-2 w-full">
                <div className="flex flex-col items-center">
                  <span className="font-black num-font leading-none text-5xl">
                    {inn.totalRuns}
                  </span>
                  <span className="font-extrabold uppercase tracking-widest text-white/80 mt-1 text-xs sm:text-sm">
                    RUNS
                  </span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="font-black num-font leading-none text-5xl">
                    {inn.totalWickets}
                  </span>
                  <span className="font-extrabold uppercase tracking-widest text-white/80 mt-1 text-xs sm:text-sm">
                    WICKETS
                  </span>
                </div>
              </div>

              {/* Horizontal Divider */}
              <div className="border-t border-white/20 w-full my-2.5" />

              {/* Overs Count */}
              <div className="text-center">
                <span className="font-black num-font tracking-wider text-lg">
                  {inn.oversString} OVERS
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 2. CREASE BATTERS & BOWLER SPLIT PANEL */}
        <div className="bg-[var(--card)] border border-[var(--border)] shadow-sm shrink-0 p-card rounded-card">
          <div className="grid gap-card grid-cols-2">
            {/* Left Column: Crease Batters */}
            <div className="min-w-0 space-y-1.5">
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
                className="bg-emerald-500/10 border border-emerald-500/30 cursor-pointer active:scale-[0.98] transition-transform rounded-xl min-w-0 p-2"
                title="Tap for Striker Profile"
              >
                <div className="flex items-center justify-between text-sm sm:text-sm min-w-0 gap-1.5 mb-1">
                  <span className="font-extrabold truncate dark:text-emerald-300 text-emerald-700 min-w-0">
                    {cleanPlayerName(striker?.name)} *
                  </span>
                  <span className="text-[9px] xs:text-xs font-black rounded bg-emerald-600 uppercase shrink-0 text-white py-0.5 px-screen-x.5">
                    {strikerIntent}
                  </span>
                </div>
                <div className="flex items-center justify-between num-font text-xs gap-1">
                  <span className="font-black text-sm xs:text-md truncate text-[var(--foreground)]">
                    {striker?.runs} <span className="font-normal text-[var(--muted-foreground)]">({striker?.balls}b)</span>
                  </span>
                  <span className="text-xs xs:text-xs sm:text-sm shrink-0 text-[var(--muted-foreground)]">
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
                className="bg-[var(--muted)]/70 flex items-center justify-between cursor-pointer active:scale-[0.98] transition-transform px-4 py-2 rounded-lg text-xs min-w-0 gap-1.5"
                title="Tap for Non-Striker Profile"
              >
                <span className="font-semibold truncate min-w-0 text-[var(--muted-foreground)]">
                  {cleanPlayerName(nonStriker?.name)}
                </span>
                <span className="num-font font-bold shrink-0 text-[var(--foreground)]">
                  {nonStriker?.runs} <span className="font-normal text-[var(--muted-foreground)]">({nonStriker?.balls}b)</span>
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
              className="bg-blue-500/10 border border-blue-500/30 flex flex-col justify-between cursor-pointer active:scale-[0.98] transition-transform rounded-xl min-w-0 p-2"
              title="Tap for Bowler Profile"
            >
              <div className="flex items-center justify-between text-sm sm:text-sm min-w-0 gap-1.5">
                <span className="font-extrabold truncate dark:text-blue-300 text-blue-700 min-w-0">
                  {cleanPlayerName(currentBowler?.name)}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowBowlerModal(true);
                  }}
                  className="text-xs xs:text-xs sm:text-sm font-bold rounded bg-blue-600 active:scale-95 transition-transform shrink-0 text-white px-2 py-1"
                >
                  Change
                </button>
              </div>

              <div className="flex items-center justify-between num-font text-xs gap-1 mt-2">
                <span className="font-black text-sm xs:text-md truncate text-[var(--foreground)]">
                  {currentBowler?.wickets}-{currentBowler?.runs}
                </span>
                <span className="font-bold dark:text-blue-400 shrink-0 text-xs xs:text-sm">
                  {Math.floor(currentBowler?.ballsBowled / 6)}.{currentBowler?.ballsBowled % 6} ov
                </span>
              </div>

              <div className="flex items-center justify-between text-xs xs:text-xs sm:text-sm num-font text-[var(--muted-foreground)] gap-1 mt-1">
                <span className="truncate">M: {currentBowler?.maidens}</span>
                <span className="shrink-0">Econ: {economyRate(currentBowler?.runs || 0, currentBowler?.ballsBowled || 0).toFixed(1)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* 3. THIS OVER STRIP + QUICK ACTIONS (NO EMPTY SPACE!) */}
        <div className="bg-[var(--card)] border border-[var(--border)] flex items-center justify-between shrink-0 rounded-xl gap-2 min-w-0 px-3 py-2">
          <div className="flex items-center font-bold shrink-0 text-[var(--muted-foreground)] text-sm gap-1.5">
            <span>Over:</span>
          </div>

          <div className="flex items-center overflow-x-auto no-scrollbar min-w-0 gap-1.5">
            {inn.thisOverLog.length === 0 ? (
              <span className="italic truncate text-[var(--muted-foreground)] text-sm">
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
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs sm:text-sm xs:text-xs font-black shrink-0 ${
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

          <div className="flex items-center shrink-0 gap-1.5">
            <button
              type="button"
              onClick={handleUndo}
              className="flex items-center rounded-lg bg-[var(--muted)] font-bold hover:text-amber-600 active:scale-95 transition-transform gap-1 px-4 py-2 text-amber-500 text-xs"
              title="Undo last delivery"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Undo</span>
            </button>
            <button
              type="button"
              onClick={handleSwapStrike}
              className="flex items-center rounded-lg bg-[var(--muted)] font-bold dark:text-emerald-400 active:scale-95 transition-transform gap-1 px-4 py-2 text-emerald-600 text-xs"
              title="Swap Strike"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              <span>Swap</span>
            </button>
          </div>
        </div>

        {/* Over Complete Alert (Inline) */}
        {inn.isOverComplete && (
          <div className="bg-amber-500/15 border border-amber-500/40 flex items-center justify-between shrink-0 animate-pulse px-3 rounded-xl py-2 gap-2 mt-1">
            <span className="font-extrabold dark:text-amber-400 truncate text-amber-600 text-sm">
              Over complete! Select new bowler.
            </span>
            <button
              type="button"
              onClick={() => setShowBowlerModal(true)}
              className="rounded-lg bg-amber-500 font-black active:scale-95 shrink-0 py-2 text-xs px-3"
            >
              Select Bowler
            </button>
          </div>
        )}

        {/* 4. DELIVERY MODIFIERS STRIP (Directly above Run Buttons, NO EMPTY SPACE) */}
        <div className="grid shrink-0 grid-cols-5 gap-1.5 mt-1">
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
              className={`py-2.5 px-screen-x rounded-xl text-xs sm:text-sm xs:text-xs font-extrabold min-h-btn transition-all border text-center active:scale-95 leading-tight flex items-center justify-center break-words ${
                extraFlag === item.id
                  ? item.id === 'wicket'
                    ? 'bg-red-600 text-white border-red-600 shadow-md'
                    : 'bg-amber-500 text-slate-950 border-amber-500 shadow-md'
                  : 'bg-[var(--muted)] text-[var(--foreground)] border-[var(--border)]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* 5. RUN BUTTONS KEYPAD (3x2 Grid: 0, 1, 2 / 3, 4, 6) */}
        <div className="grid shrink-0 gap-card grid-cols-3 mt-1">
          {[
            { run: 0, label: '0 Dot', color: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200' },
            { run: 1, label: '1 Single', color: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300' },
            { run: 2, label: '2 Double', color: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200' },
            { run: 3, label: '3 Three', color: 'bg-emerald-200 dark:bg-emerald-800/40 text-emerald-900 dark:text-emerald-100' },
            { run: 4, label: '4 FOUR', color: 'bg-blue-600 text-white shadow-md' },
            { run: 6, label: '6 SIX', color: 'bg-purple-600 text-white shadow-md' },
          ].map((item) => (
            <button
              key={item.run}
              type="button"
              disabled={inn.isOverComplete || engine.isInningsOver}
              onClick={() => handleScoreRun(item.run)}
              className={`py-4 sm:py-5 rounded-2xl text-lg xs:text-xl font-black min-h-[64px] sm:min-h-[72px] transition-transform active:scale-95 border border-black/5 disabled:opacity-40 disabled:scale-100 flex items-center justify-center ${item.color}`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* 6. BOTTOM UTILITY & ACTION CARDS SECTION */}
        <div className="shrink-0 mt-auto space-y-2.5 pb-2">
          {/* Quick Utility Row */}
          <div className="grid gap-card grid-cols-2">
            <button
              type="button"
              onClick={() => setShowRetireModal(true)}
              className="bg-[var(--muted)] text-xs font-bold flex items-center justify-center active:scale-95 transition-transform py-2.5 rounded-xl text-red-500 min-h-btn px-3 gap-2"
              title="Retire Player"
            >
              <UserX className="w-4 h-4" />
              <span>Retire Batter</span>
            </button>

            <button
              type="button"
              onClick={() => setShowPenaltyModal(true)}
              className="bg-[var(--muted)] text-xs font-bold flex items-center justify-center active:scale-95 transition-transform py-2.5 rounded-xl text-purple-500 min-h-btn px-3 gap-2"
              title="Award Penalty"
            >
              <Flag className="w-4 h-4" />
              <span>Award Penalty</span>
            </button>
          </div>

          {/* Equal Width Bottom Action Cards */}
          <div className="grid gap-card grid-cols-2">
            <button
              type="button"
              onClick={() => {
                setSelectedScoreboardInnings(engine.currentInningsNumber as 1 | 2);
                setShowFullScoreboardModal(true);
              }}
              className="bg-[var(--card)] hover:bg-[var(--muted)] border border-[var(--border)] font-extrabold flex items-center justify-center shadow-sm active:scale-[0.98] transition-all px-3 rounded-2xl text-sm gap-2 min-h-btn py-3"
            >
              <FileText className="w-4 h-4 text-emerald-500" />
              <span>Full Scoreboard</span>
            </button>

            {engine.isMatchCompleted ? (
              <button
                type="button"
                onClick={() => ScorecardPdfGenerator.downloadPdf(engine.toScorecard())}
                className="bg-emerald-600 hover:bg-emerald-500 font-extrabold flex items-center justify-center shadow-md active:scale-[0.98] transition-all px-3 rounded-2xl text-sm gap-2 min-h-btn py-3"
              >
                <FileText className="w-4 h-4" />
                <span>Generate PDF</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowMatchInfoModal(true)}
                className="bg-[var(--card)] hover:bg-[var(--muted)] border border-[var(--border)] font-extrabold flex items-center justify-center shadow-sm active:scale-[0.98] transition-all px-3 rounded-2xl text-sm gap-2 min-h-btn py-3"
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
      <div className="hidden md:block max-w-7xl mx-auto space-y-4">
        {/* ── TOP SCOREBOARD BANNER (THEME-POWERED) ── */}
      <div
        className="shadow-xl transition-all duration-300 relative overflow-hidden rounded-2xl p-6 text-white"
        style={{
          background: `linear-gradient(135deg, ${selectedTheme.deep} 0%, ${selectedTheme.primary} 60%, ${selectedTheme.secondary} 100%)`,
        }}
      >
        <div className="flex justify-between flex-wrap items-center gap-4">
          <div className="">
            <div className="flex items-center gap-2 mb-1">
              <span className="flex relative shrink-0 h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex bg-white opacity-75 rounded-full h-full w-full" />
                <span className="relative inline-flex bg-white rounded-full h-2.5 w-2.5" />
              </span>
              <span className="uppercase tracking-widest font-extrabold flex items-center truncate text-xs gap-1.5">
                {engine.currentInningsNumber === 2 && engine.targetScore > 0 && (
                  <span className="bg-amber-400 font-black tracking-wide shadow-xs shrink-0 py-0.5 rounded-full text-xs px-2">
                    CHASE
                  </span>
                )}
                <span>Innings {engine.currentInningsNumber} • {engine.totalOvers} Overs</span>
              </span>
              {inn.isFreeHit && (
                <span className="bg-amber-400 font-black uppercase tracking-wider animate-bounce shadow-md shrink-0 py-0.5 rounded-full text-xs px-2">
                  FREE HIT
                </span>
              )}
            </div>

            {/* Team Label (Secondary Header) */}
            <div className="flex items-center mb-1.5 gap-2">
              <TeamBadgeIcon
                type={inn.team === engine.teamA ? 'home' : 'away'}
                size="xs"
              />
              <span className="font-extrabold uppercase tracking-wider text-sm">
                {inn.team}
              </span>
            </div>

            {/* Primary Score & Overs */}
            <div className="flex items-baseline gap-4">
              <span className="font-black num-font tracking-tight text-6xl">
                {inn.totalRuns}/{inn.totalWickets}
              </span>
              <span className="font-bold num-font text-2xl">
                {inn.oversString} Overs
              </span>
            </div>
          </div>

          {/* Rates & Targets Top Controls */}
          <div className="flex items-center justify-between md:justify-end font-semibold gap-2 text-xs">
            <div className="bg-black/20 backdrop-blur-xs flex items-center px-3 py-1 rounded-lg gap-1.5">
              <span className="text-xs sm:text-sm">CRR:</span>
              <span className="font-extrabold num-font text-white">{crr.toFixed(2)}</span>
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
                className="bg-black/30 font-semibold border-none focus:outline-none text-xs sm:text-sm rounded-md px-2 py-1"
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
          <div className="border-t border-white/20 flex justify-between bg-black/25 -mx-3.5 sm:-mx-5 md:-mx-6 -mb-3.5 sm:-mb-5 md:-mb-6 flex-wrap items-center gap-3 rounded-b-2xl mt-4 pt-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="bg-amber-400 font-black uppercase tracking-wider flex items-center shadow-sm shrink-0 px-4 rounded-md text-xs gap-1.5 py-1">
                <img
                  src="/assets/illustrations/chase_batsman.png"
                  alt="Chase"
                  className="object-contain w-4 h-4"
                />
                <span>TARGET {engine.targetScore}</span>
              </div>
              <p className="font-extrabold tracking-tight text-base">
                Need <span className="font-black num-font text-lg">{neededRuns}</span> runs in <span className="font-black num-font text-lg">{remainingBalls}</span> balls
              </p>
            </div>

            <div className="flex items-center self-start sm:self-center shrink-0 gap-2">
              <div className="bg-white/10 font-semibold flex items-center px-4 rounded-md py-1 text-xs gap-1">
                <span className="text-xs sm:text-sm">CRR</span>
                <span className="font-extrabold num-font text-white">{crr.toFixed(2)}</span>
              </div>
              <div className={`px-4 py-1 rounded-md text-xs font-bold flex items-center gap-1 ${
                rrr > 12
                  ? 'bg-red-500/30 text-red-200 border border-red-500/40'
                  : rrr > 8
                  ? 'bg-amber-500/30 text-amber-200 border border-amber-500/40'
                  : 'bg-emerald-500/30 text-emerald-200 border border-emerald-500/40'
              }`}>
                <span className="opacity-80 text-xs sm:text-sm">RRR</span>
                <span className="font-black num-font">{rrr.toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── OVER BALLS TIMELINE STRIP ── */}
      <div className="bg-[var(--card)] border border-[var(--border)] flex items-center justify-between overflow-x-auto no-scrollbar shadow-xs p-3 rounded-xl gap-2">
        <div className="flex items-center font-bold shrink-0 gap-1.5 text-xs">
          <span>This Over:</span>
        </div>

        <div className="flex items-center gap-1.5 min-w-0">
          {inn.thisOverLog.length === 0 ? (
            <span className="italic text-xs">
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
          className="shrink-0 flex items-center bg-[var(--muted)] hover:bg-[var(--border)] font-bold transition-colors px-4 py-2 rounded-lg text-xs gap-1"
          title="Swap Striker and Non-Striker"
        >
          <ArrowRightLeft className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Swap Strike</span>
        </button>
      </div>

      {/* ── RESPONSIVE SCORER WORKSPACE (DESKTOP 3-PANEL / MOBILE STACK) ── */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] gap-5 md:gap-6">
        {/* LEFT / TOP: ACTIVE BATTERS & CURRENT BOWLER CARD */}
        <div className="space-y-5">
          {/* Batters */}
          <div className="bg-[var(--card)] border border-[var(--border)] shadow-sm rounded-2xl space-y-4 p-5 md:p-6">
            <span className="font-bold uppercase tracking-wider dark:text-emerald-400 text-sm">
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
              className="bg-emerald-500/10 border border-emerald-500/30 cursor-pointer hover:border-emerald-500 hover:bg-emerald-500/15 active:scale-[0.99] transition-all group p-4 rounded-xl space-y-2"
              title="Click to view full batsman profile & analytics"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-emerald-500/20 border border-emerald-500/30 shrink-0 overflow-hidden flex items-center justify-center rounded-lg p-0.5 w-10 h-10">
                    <img src="/assets/illustrations/strike_batsman.png" alt="Striker" className="object-contain w-full h-full" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-extrabold tracking-tight group-hover:text-emerald-400 transition-colors text-base">
                        {cleanPlayerName(striker?.name)} *
                      </span>
                      <span className="opacity-70 group-hover:opacity-100 transition-opacity text-sm text-[var(--muted-foreground)]">
                        (Profile ↗)
                      </span>
                    </div>
                  </div>
                </div>
                <span className="bg-emerald-600 font-bold uppercase px-4 py-1 rounded-md text-xs">
                  {strikerIntent}
                </span>
              </div>

              <div className="flex items-center justify-between num-font text-sm">
                <span className="font-black text-xl">
                  {striker?.runs} <span className="font-normal text-sm">({striker?.balls}b)</span>
                </span>
                <span className="text-sm">
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
              className="bg-[var(--muted)] border border-[var(--border)] cursor-pointer hover:border-slate-500 hover:bg-[var(--muted)]/80 active:scale-[0.99] transition-all group p-4 rounded-xl space-y-2"
              title="Click to view full batsman profile & analytics"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-slate-800 border border-slate-700 shrink-0 overflow-hidden flex items-center justify-center rounded-lg p-0.5 w-10 h-10">
                    <img src="/assets/illustrations/non_strike_batsman.png" alt="Non-Striker" className="object-contain w-full h-full" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold tracking-tight group-hover:text-blue-400 transition-colors text-base">
                        {cleanPlayerName(nonStriker?.name)}
                      </span>
                      <span className="opacity-70 group-hover:opacity-100 transition-opacity text-sm text-[var(--muted-foreground)]">
                        (Profile ↗)
                      </span>
                    </div>
                  </div>
                </div>
                <span className="uppercase font-semibold text-xs text-[var(--muted-foreground)]">Non-Striker</span>
              </div>

              <div className="flex items-center justify-between num-font text-sm">
                <span className="font-bold text-lg">
                  {nonStriker?.runs} <span className="font-normal text-sm">({nonStriker?.balls}b)</span>
                </span>
                <span className="text-sm">
                  4s: <b>{nonStriker?.fours}</b> | 6s: <b>{nonStriker?.sixes}</b> | SR: <b>{strikeRate(nonStriker?.runs || 0, nonStriker?.balls || 0).toFixed(1)}</b>
                </span>
              </div>
            </div>

            {/* Active Partnership */}
            <div className="border-t border-[var(--border)] flex items-center justify-between text-sm pt-3">
              <span>Partnership:</span>
              <span className="font-bold num-font text-[var(--foreground)]">
                {inn.currentPartnership.runs} runs ({inn.currentPartnership.balls} balls)
              </span>
            </div>
          </div>

          {/* Bowler */}
          <div className="bg-[var(--card)] border border-[var(--border)] shadow-sm p-5 md:p-6 rounded-2xl space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-bold uppercase tracking-wider dark:text-blue-400 text-sm">
                Current Bowler
              </span>
              <button
                type="button"
                onClick={() => setShowBowlerModal(true)}
                className="font-bold hover:underline flex items-center text-sm min-h-[32px]"
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
              className="bg-blue-500/10 border border-blue-500/20 cursor-pointer hover:border-blue-500 hover:bg-blue-500/15 active:scale-[0.99] transition-all group p-4 rounded-xl space-y-2"
              title="Click to view full bowler profile & spell stats"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-500/20 border border-blue-500/30 shrink-0 overflow-hidden flex items-center justify-center rounded-lg p-0.5 w-10 h-10">
                    <img src="/assets/illustrations/opening_bowler.png" alt="Bowler" className="object-contain w-full h-full" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-extrabold tracking-tight group-hover:text-blue-400 transition-colors text-base">
                        {cleanPlayerName(currentBowler?.name)}
                      </span>
                      <span className="opacity-70 group-hover:opacity-100 transition-opacity text-sm text-[var(--muted-foreground)]">
                        (Profile ↗)
                      </span>
                    </div>
                  </div>
                </div>
                <span className="font-bold dark:text-blue-400 num-font text-base">
                  {Math.floor(currentBowler?.ballsBowled / 6)}.{currentBowler?.ballsBowled % 6} ov
                </span>
              </div>

              <div className="flex items-center justify-between num-font text-sm">
                <span className="font-black text-lg">
                  {currentBowler?.wickets}-{currentBowler?.runs}
                </span>
                <span className="text-sm">
                  M: <b>{currentBowler?.maidens}</b> | Econ: <b>{economyRate(currentBowler?.runs || 0, currentBowler?.ballsBowled || 0).toFixed(2)}</b>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* CENTER: PRIMARY SCORING PAD KEYPAD */}
        <div className="space-y-5">
          <div className="bg-[var(--card)] border border-[var(--border)] shadow-sm p-6 md:p-8 rounded-2xl space-y-5">
            {/* Over Complete Alert */}
            {inn.isOverComplete && (
              <div className="bg-amber-500/10 border border-amber-500/30 flex items-center justify-between p-4 rounded-xl gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <AlertTriangle className="shrink-0 text-amber-500 w-6 h-6" />
                  <span className="font-bold dark:text-amber-400 leading-tight text-sm">
                    Over complete. Select new bowler.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowBowlerModal(true)}
                  className="bg-amber-500 font-extrabold shrink-0 active:scale-95 transition-transform px-4 py-2 rounded-lg text-sm"
                >
                  Select Bowler
                </button>
              </div>
            )}

            {/* Extra Modifiers Strip */}
            <div className="space-y-2">
              <div className="flex items-center justify-between font-bold text-sm">
                <span>Modifiers</span>
                {extraFlag !== 'none' && (
                  <button
                    onClick={() => setExtraFlag('none')}
                    className="font-bold hover:underline text-red-500 text-sm"
                  >
                    Clear Flag
                  </button>
                )}
              </div>

              <div className="grid gap-3 grid-cols-5">
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
                    className={`py-2.5 sm:py-3 px-screen-x sm:px-screen-x.5 rounded-lg sm:rounded-xl text-xs sm:text-sm font-bold sm:font-extrabold min-h-[48px] sm:min-h-[54px] transition-all border text-center ${
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
            <div className="space-y-2">
              <span className="font-bold text-sm">Run Scoring</span>
              <div className="grid grid-cols-3 gap-4">
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
                    className={`py-4 sm:py-5 md:py-8 rounded-xl sm:rounded-2xl text-lg sm:text-xl md:text-2xl font-black min-h-[64px] sm:min-h-[72px] transition-all hover:scale-[1.02] active:scale-[0.97] border border-black/5 disabled:opacity-40 disabled:scale-100 flex items-center justify-center ${item.color}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Actions Row */}
            <div className="grid border-t border-[var(--border)] grid-cols-4 gap-3 pt-4">
              <button
                type="button"
                onClick={handleUndo}
                className="bg-[var(--muted)] hover:bg-[var(--border)] font-bold flex flex-col items-center justify-center transition-colors active:scale-95 py-3 rounded-xl min-h-[52px] text-sm gap-1.5"
              >
                <RotateCcw className="text-amber-500 w-5 h-5" />
                <span>Undo</span>
              </button>

              <button
                type="button"
                onClick={handleSwapStrike}
                className="bg-[var(--muted)] hover:bg-[var(--border)] font-bold flex flex-col items-center justify-center transition-colors active:scale-95 py-3 rounded-xl min-h-[52px] text-sm gap-1.5"
              >
                <ArrowRightLeft className="text-emerald-500 w-5 h-5" />
                <span>Swap Strike</span>
              </button>

              <button
                type="button"
                onClick={() => setShowRetireModal(true)}
                className="bg-[var(--muted)] hover:bg-[var(--border)] font-bold flex flex-col items-center justify-center transition-colors active:scale-95 py-3 rounded-xl min-h-[52px] text-sm gap-1.5"
              >
                <UserX className="text-red-500 w-5 h-5" />
                <span>Retire</span>
              </button>

              <button
                type="button"
                onClick={() => setShowPenaltyModal(true)}
                className="bg-[var(--muted)] hover:bg-[var(--border)] font-bold flex flex-col items-center justify-center transition-colors active:scale-95 py-3 rounded-xl min-h-[52px] text-sm gap-1.5"
              >
                <Flag className="text-purple-500 w-5 h-5" />
                <span>Penalty</span>
              </button>
            </div>

            {/* Bottom Action Cards (Equal Width, Balanced) */}
            <div className="grid border-t border-[var(--border)] gap-3 pt-4 grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))]">
              <button
                type="button"
                onClick={() => {
                  setSelectedScoreboardInnings(engine.currentInningsNumber as 1 | 2);
                  setShowFullScoreboardModal(true);
                }}
                className="bg-[var(--card)] hover:bg-[var(--muted)] border border-[var(--border)] font-extrabold flex items-center justify-center shadow-xs hover:border-emerald-500/40 active:scale-[0.98] transition-all py-3 rounded-xl gap-2 min-h-[52px] px-4 text-sm md:text-base"
              >
                <FileText className="text-emerald-500 w-5 h-5" />
                <span>Full Scoreboard</span>
              </button>

              <button
                type="button"
                onClick={() => toggleView('matches')}
                className={`py-3 px-4 rounded-xl border text-sm md:text-base font-extrabold flex items-center justify-center gap-2 shadow-xs active:scale-[0.98] transition-all min-h-[52px] ${
                  activeView === 'matches'
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                    : 'bg-[var(--card)] hover:bg-[var(--muted)] border-[var(--border)] text-[var(--foreground)]'
                }`}
              >
                <History className="text-blue-500 w-5 h-5" />
                <span>Matches</span>
              </button>

              <button
                type="button"
                onClick={() => toggleView('advancedAnalytics')}
                className={`py-3 px-4 rounded-xl border text-sm md:text-base font-extrabold flex items-center justify-center gap-2 shadow-xs active:scale-[0.98] transition-all min-h-[52px] ${
                  activeView === 'advancedAnalytics'
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                    : 'bg-[var(--card)] hover:bg-[var(--muted)] border-[var(--border)] text-[var(--foreground)]'
                }`}
              >
                <BarChart2 className="text-purple-500 w-5 h-5" />
                <span>Analytics</span>
              </button>

              {engine.isMatchCompleted ? (
                <button
                  type="button"
                  onClick={() => ScorecardPdfGenerator.downloadPdf(engine.toScorecard())}
                  className="bg-emerald-600 hover:bg-emerald-500 font-extrabold flex items-center justify-center shadow-md active:scale-[0.98] transition-all py-3 rounded-xl text-base gap-2 min-h-[52px] px-4"
                >
                  <FileText className="w-5 h-5" />
                  <span>Generate PDF</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowMatchInfoModal(true)}
                  className="bg-[var(--card)] hover:bg-[var(--muted)] border border-[var(--border)] font-extrabold flex items-center justify-center shadow-xs hover:border-blue-500/40 active:scale-[0.98] transition-all py-3 rounded-xl gap-2 min-h-[52px] px-4 text-sm md:text-base"
                >
                  <Info className="text-blue-500 w-5 h-5" />
                  <span>Match Info</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT / BOTTOM: SCORECARD SUMMARY & FALL OF WICKETS */}
        <div className="space-y-5">
          {/* Batting Card */}
          <div className="bg-[var(--card)] border border-[var(--border)] shadow-sm p-5 md:p-6 rounded-2xl space-y-4">
            <span className="font-bold uppercase tracking-wider text-sm">
              Scorecard Overview
            </span>

            <div className="overflow-y-auto space-y-2 max-h-56 text-sm">
              {inn.players
                .filter((p) => p.runs > 0 || p.balls > 0 || p.isDismissed)
                .map((p, i) => (
                  <div key={i} className="flex items-center justify-between border-b border-[var(--border)] last:border-none py-2">
                    <span className="font-semibold truncate max-w-[160px]">{cleanPlayerName(p.name)}</span>
                    <span className="num-font font-bold">
                      {p.runs} ({p.balls}b) {p.isDismissed ? '' : '*'}
                    </span>
                  </div>
                ))}
            </div>

            {/* Extras breakdown */}
            <div className="border-t border-[var(--border)] flex justify-between text-sm pt-3">
              <span>Extras:</span>
              <span className="font-bold num-font text-[var(--foreground)]">
                {inn.wideRuns + inn.nbRuns + inn.byeRuns + inn.lbRuns + inn.penaltyRuns} (w {inn.wideRuns}, nb {inn.nbRuns}, b {inn.byeRuns}, lb {inn.lbRuns})
              </span>
            </div>
          </div>

          {/* Fall of Wickets */}
          <div className="bg-[var(--card)] border border-[var(--border)] shadow-sm p-5 md:p-6 rounded-2xl space-y-4">
            <span className="font-bold uppercase tracking-wider text-sm">
              Fall of Wickets
            </span>

            <div className="overflow-y-auto space-y-2 max-h-48 text-sm">
              {inn.fallOfWickets.length === 0 ? (
                <p className="italic text-[var(--muted-foreground)]">No wickets fallen</p>
              ) : (
                inn.fallOfWickets.map((f, i) => (
                  <div key={i} className="flex items-center justify-between border-b border-[var(--border)] last:border-none py-2">
                    <span className="text-[var(--muted-foreground)]">{f.wicket}-{f.score}</span>
                    <span className="font-medium truncate max-w-[180px]">{cleanPlayerName(f.player)} ({f.over} ov)</span>
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
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-end sm:items-center justify-center p-4">
            <div className="overflow-y-auto bg-[var(--card)] border border-[var(--border)] shadow-2xl max-w-2xl max-h-[90vh] rounded-2xl w-full p-5 space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                <div>
                  <h3 className="font-extrabold text-lg">
                    Full Match Scoreboard
                  </h3>
                  <p className="text-xs">
                    {engine.teamA} vs {engine.teamB} • {engine.totalOvers} Overs Match
                  </p>
                </div>
                <button
                  onClick={() => setShowFullScoreboardModal(false)}
                  className="bg-[var(--muted)] hover:bg-[var(--border)] p-1.5 rounded-lg text-[var(--foreground)]"
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
              <div className="bg-gradient-to-r from-emerald-600/15 to-blue-600/15 border border-emerald-500/20 flex items-center justify-between rounded-xl p-3 gap-2">
                <div className="min-w-0">
                  <span className="font-extrabold uppercase tracking-wider block truncate text-xs">
                    {targetInn.team}
                  </span>
                  <div className="font-black num-font text-xl">
                    {targetInn.totalRuns}/{targetInn.totalWickets}{' '}
                    <span className="font-normal text-xs">
                      ({targetInn.oversString} ov)
                    </span>
                  </div>
                </div>
                <div className="font-semibold shrink-0 text-xs">
                  <span className="text-[var(--muted-foreground)]">Run Rate: </span>
                  <span className="font-extrabold num-font">{targetCrr.toFixed(2)}</span>
                </div>
              </div>

              {/* Batting Card */}
              <div className="space-y-2">
                <span className="font-bold uppercase tracking-wider dark:text-emerald-400 text-xs">
                  Batting Scorecard
                </span>
                <div className="overflow-x-auto table-scroll-container">
                  <div className="min-w-[420px] space-y-1 text-xs">
                    <div className="grid uppercase font-bold border-b text-[var(--muted-foreground)] grid-cols-12 pb-1">
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
                          className="grid border-b border-[var(--border)] last:border-none items-center py-2 grid-cols-12"
                        >
                          <div className="col-span-5 truncate pr-1">
                            <span className="font-bold">{cleanPlayerName(p.name)}</span>
                            {p.isDismissed ? (
                              <span className="text-red-500 ml-1">
                                ({p.dismissalType || 'out'})
                              </span>
                            ) : (
                              <span className="font-bold text-emerald-500 ml-1">
                                * not out
                              </span>
                            )}
                          </div>
                          <div className="col-span-2 num-font font-black text-right">
                            {p.runs}{' '}
                            <span className="font-normal text-[var(--muted-foreground)]">
                              ({p.balls})
                            </span>
                          </div>
                          <div className="col-span-2 num-font text-[var(--muted-foreground)]">
                            {p.fours} / {p.sixes}
                          </div>
                          <div className="col-span-3 num-font font-bold text-right">
                            {strikeRate(p.runs, p.balls).toFixed(1)}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>

              {/* Extras & Totals */}
              <div className="bg-[var(--muted)] flex justify-between p-card rounded-lg text-xs">
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
              <div className="border-t border-[var(--border)] space-y-2 pt-2">
                <span className="font-bold uppercase tracking-wider dark:text-blue-400 text-xs">
                  Bowling Figures
                </span>
                <div className="overflow-x-auto table-scroll-container">
                  <div className="min-w-[420px] space-y-1 text-xs">
                    <div className="grid uppercase font-bold border-b text-[var(--muted-foreground)] grid-cols-12 pb-1">
                      <span className="col-span-5">Bowler</span>
                      <span className="col-span-2 text-right">O (M)</span>
                      <span className="col-span-2 text-right">R</span>
                      <span className="col-span-1 font-black text-right">W</span>
                      <span className="col-span-2 text-right">Econ</span>
                    </div>
                    {targetInn.bowlers
                      .filter((b) => b.ballsBowled > 0)
                      .map((b, i) => (
                        <div
                          key={i}
                          className="grid border-b border-[var(--border)] last:border-none items-center py-2 grid-cols-12"
                        >
                          <span className="col-span-5 font-bold truncate pr-1">
                            {cleanPlayerName(b.name)}
                          </span>
                          <span className="col-span-2 num-font text-right">
                            {Math.floor(b.ballsBowled / 6)}.{b.ballsBowled % 6} ({b.maidens})
                          </span>
                          <span className="col-span-2 num-font text-right">{b.runs}</span>
                          <span className="col-span-1 num-font font-black text-blue-600">
                            {b.wickets}
                          </span>
                          <span className="col-span-2 num-font font-bold text-right">
                            {economyRate(b.runs, b.ballsBowled).toFixed(1)}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              </div>

              {/* Fall of Wickets */}
              <div className="border-t border-[var(--border)] space-y-1 pt-2">
                <span className="font-bold uppercase tracking-wider text-xs">
                  Fall of Wickets
                </span>
                <div className="overflow-y-auto max-h-32 space-y-1 text-xs">
                  {targetInn.fallOfWickets.length === 0 ? (
                    <p className="italic text-[var(--muted-foreground)]">No wickets fallen</p>
                  ) : (
                    targetInn.fallOfWickets.map((f, i) => (
                      <div key={i} className="flex items-center justify-between py-0.5 gap-2">
                        <span className="font-bold shrink-0 text-red-500">
                          {f.wicket}-{f.score}
                        </span>
                        <span className="truncate text-[var(--muted-foreground)] max-w-[200px]">
                          {cleanPlayerName(f.player)} ({f.over} ov)
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Modal Actions */}
              <div className="border-t border-[var(--border)] flex flex-wrap pt-2 gap-2">
                <button
                  type="button"
                  onClick={() => ScorecardPdfGenerator.downloadPdf(engine.toScorecard())}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 font-extrabold flex items-center justify-center shadow-sm transition-all active:scale-[0.98] py-2.5 rounded-xl text-xs min-h-btn px-3 gap-2"
                >
                  <FileText className="shrink-0 w-4 h-4" />
                  <span>Download PDF Scorecard</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowFullScoreboardModal(false)}
                  className="bg-[var(--muted)] hover:bg-[var(--border)] font-bold py-2.5 rounded-xl min-h-btn px-4 text-xs"
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="overflow-y-auto bg-[var(--card)] border border-[var(--border)] shadow-2xl max-w-md max-h-[85vh] rounded-2xl w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
              <div>
                <h3 className="font-extrabold text-base">Match Information</h3>
                <p className="text-xs">Rules & Setup Specifications</p>
              </div>
              <button
                onClick={() => setShowMatchInfoModal(false)}
                className="bg-[var(--muted)] hover:bg-[var(--border)] p-1.5 rounded-lg text-[var(--foreground)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {/* Teams & Format */}
              <div className="bg-[var(--muted)]/60 rounded-xl space-y-1.5 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="shrink-0 text-[var(--muted-foreground)]">Host / Home Team:</span>
                  <span className="font-extrabold truncate text-right">{engine.teamA}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="shrink-0 text-[var(--muted-foreground)]">Visitor / Away Team:</span>
                  <span className="font-extrabold truncate text-right">{engine.teamB}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="shrink-0 text-[var(--muted-foreground)]">Match Format:</span>
                  <span className="font-bold text-right">{engine.totalOvers} Overs per side</span>
                </div>
                {engine.venue && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="shrink-0 text-[var(--muted-foreground)]">Venue:</span>
                    <span className="font-bold truncate text-right">{engine.venue}</span>
                  </div>
                )}
              </div>

              {/* Toss Details */}
              <div className="bg-[var(--muted)]/60 rounded-xl space-y-1.5 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="shrink-0 text-[var(--muted-foreground)]">Toss Winner:</span>
                  <span className="font-extrabold dark:text-emerald-400 truncate text-right">{engine.tossWinner}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="shrink-0 text-[var(--muted-foreground)]">Toss Decision:</span>
                  <span className="font-bold uppercase text-right">Elected to {engine.tossDecision}</span>
                </div>
              </div>

              {/* Advanced Rules */}
              <div className="bg-[var(--muted)]/60 rounded-xl space-y-1.5 p-3">
                <span className="font-bold block text-[var(--foreground)] mb-1">Match Rules:</span>
                <div className="flex items-center justify-between gap-2">
                  <span className="shrink-0 text-[var(--muted-foreground)]">Players per team:</span>
                  <span className="font-bold">{engine.advancedSettings?.players || 11}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="shrink-0 text-[var(--muted-foreground)]">Wide ball penalty:</span>
                  <span className="font-bold">{engine.advancedSettings?.wideRun ?? 1} run</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="shrink-0 text-[var(--muted-foreground)]">No-ball penalty:</span>
                  <span className="font-bold">{engine.advancedSettings?.noBallRun ?? 1} run</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="shrink-0 text-[var(--muted-foreground)]">Max overs per bowler:</span>
                  <span className="font-bold">{engine.advancedSettings?.manualOverLimit || Math.ceil(engine.totalOvers / 5)}</span>
                </div>
              </div>

              {/* Status */}
              <div className="bg-blue-500/10 border border-blue-500/30 flex items-center justify-between rounded-xl p-3 gap-2">
                <span className="font-semibold dark:text-blue-300 shrink-0 text-blue-700">Current Status:</span>
                <span className="font-black uppercase dark:text-blue-300 truncate text-right">
                  {engine.isMatchCompleted ? 'Match Concluded' : `Innings ${engine.currentInningsNumber} Live`}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowMatchInfoModal(false)}
              className="bg-[var(--muted)] hover:bg-[var(--border)] font-bold py-2.5 rounded-xl min-h-btn w-full text-xs"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* ── WICKET MODAL ── */}
      {showWicketModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="overflow-y-auto bg-[var(--card)] border border-[var(--border)] shadow-2xl max-w-md max-h-[90vh] rounded-2xl w-full p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-lg">Record Wicket</h3>
              <button onClick={() => setShowWicketModal(false)} className="hover:bg-[var(--muted)] rounded-lg p-1">
                <X className="text-[var(--muted-foreground)] w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-sm">
              {/* Dismissal Type */}
              <div className="space-y-1">
                <label className="font-semibold text-xs">Dismissal Type</label>
                <select
                  value={dismissalType}
                  onChange={(e) => setDismissalType(e.target.value as any)}
                  className="bg-[var(--muted)] border border-[var(--border)] font-bold p-card rounded-xl w-full text-sm"
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
                <label className="font-semibold text-xs">Batter Out</label>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-2">
                  <button
                    type="button"
                    onClick={() => setIsStrikerOut(true)}
                    className={`p-card rounded-xl border text-xs font-bold truncate text-left sm:text-center min-h-btn ${
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
                    className={`p-card rounded-xl border text-xs font-bold truncate text-left sm:text-center min-h-btn ${
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
                  <label className="font-semibold text-xs">Fielder Name</label>
                  <input
                    type="text"
                    value={fielderName}
                    onChange={(e) => setFielderName(e.target.value)}
                    placeholder="e.g. Fielder Name"
                    className="bg-[var(--muted)] border border-[var(--border)] font-medium p-card rounded-xl w-full text-sm"
                  />
                </div>
              )}

              {/* Next Batsman Name */}
              <div className="space-y-1">
                <label className="font-semibold text-xs">Incoming Batsman</label>
                <input
                  type="text"
                  value={newBatsmanName}
                  onChange={(e) => setNewBatsmanName(e.target.value)}
                  placeholder={inn.players[inn.nextPlayerIdx]?.name || 'Next Batsman'}
                  className="bg-[var(--muted)] border border-[var(--border)] font-medium p-card rounded-xl w-full text-sm"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleConfirmWicket}
              className="bg-red-600 hover:bg-red-500 font-extrabold shadow-lg shadow-red-600/30 rounded-xl text-sm min-h-btn w-full py-3"
            >
              Confirm Wicket
            </button>
          </div>
        </div>
      )}

      {/* ── CHANGE BOWLER MODAL ── */}
      {showBowlerModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="overflow-y-auto bg-[var(--card)] border border-[var(--border)] shadow-2xl max-w-md max-h-[90vh] rounded-2xl w-full p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-lg">Select Bowler</h3>
              <button onClick={() => setShowBowlerModal(false)} className="hover:bg-[var(--muted)] rounded-lg p-1">
                <X className="text-[var(--muted-foreground)] w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="font-semibold text-xs">Existing Bowlers</label>
                <div className="overflow-y-auto space-y-1.5 max-h-48">
                  {inn.bowlers.map((b) => {
                    const canBowl = engine.canBowlerBowl(b.name);
                    return (
                      <button
                        key={b.id}
                        type="button"
                        disabled={!canBowl}
                        onClick={() => handleChangeBowler(b.name)}
                        className={`w-full text-left p-card sm:p-3 rounded-xl border flex items-center justify-between gap-2 text-xs font-bold min-h-btn ${
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

              <div className="border-t border-[var(--border)] pt-2 space-y-1">
                <label className="font-semibold text-xs">Or Enter New Bowler</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newBowlerName}
                    onChange={(e) => setNewBowlerName(e.target.value)}
                    placeholder="New Bowler Name"
                    className="flex-1 bg-[var(--muted)] border border-[var(--border)] font-bold min-w-0 p-card rounded-xl text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => handleChangeBowler(newBowlerName)}
                    className="bg-blue-600 hover:bg-blue-500 font-bold shrink-0 py-2.5 rounded-xl text-sm min-h-btn px-4"
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="overflow-y-auto bg-[var(--card)] border border-[var(--border)] shadow-2xl max-w-md max-h-[90vh] rounded-2xl w-full p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-lg">Retire Batter</h3>
              <button onClick={() => setShowRetireModal(false)} className="hover:bg-[var(--muted)] rounded-lg p-1">
                <X className="text-[var(--muted-foreground)] w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-2">
                <button
                  type="button"
                  onClick={() => handleRetirePlayer(true, 'Retire Out')}
                  className="bg-red-600 hover:bg-red-500 font-bold flex items-center justify-center rounded-xl text-xs min-h-btn p-3"
                >
                  Striker: Retire Out (Wicket)
                </button>
                <button
                  type="button"
                  onClick={() => handleRetirePlayer(true, 'Retire Hurt')}
                  className="bg-amber-500 hover:bg-amber-400 font-bold flex items-center justify-center rounded-xl text-xs min-h-btn p-3"
                >
                  Striker: Retire Hurt
                </button>
              </div>

              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-2">
                <button
                  type="button"
                  onClick={() => handleRetirePlayer(false, 'Retire Out')}
                  className="bg-red-600/80 hover:bg-red-600 font-bold flex items-center justify-center rounded-xl text-xs min-h-btn p-3"
                >
                  Non-Striker: Retire Out
                </button>
                <button
                  type="button"
                  onClick={() => handleRetirePlayer(false, 'Retire Hurt')}
                  className="bg-amber-500/80 hover:bg-amber-500 font-bold flex items-center justify-center rounded-xl text-xs min-h-btn p-3"
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="overflow-y-auto bg-[var(--card)] border border-[var(--border)] shadow-2xl max-w-md max-h-[90vh] rounded-2xl w-full p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-lg">Award Penalty Runs</h3>
              <button onClick={() => setShowPenaltyModal(false)} className="hover:bg-[var(--muted)] rounded-lg p-1">
                <X className="text-[var(--muted-foreground)] w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div className="space-y-1">
                <label className="font-semibold text-xs">Penalty Runs</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={penaltyRuns}
                  onChange={(e) => setPenaltyRuns(Number(e.target.value))}
                  className="bg-[var(--muted)] border border-[var(--border)] font-bold p-card rounded-xl w-full text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-xs">Award To</label>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-2">
                  <button
                    type="button"
                    onClick={() => setAwardedToBatting(true)}
                    className={`p-card rounded-xl border text-xs font-bold min-h-btn flex items-center justify-center text-center ${
                      awardedToBatting ? 'bg-purple-600 text-white' : 'bg-[var(--muted)]'
                    }`}
                  >
                    Batting Team (+{penaltyRuns}P)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAwardedToBatting(false)}
                    className={`p-card rounded-xl border text-xs font-bold min-h-btn flex items-center justify-center text-center ${
                      !awardedToBatting ? 'bg-purple-600 text-white' : 'bg-[var(--muted)]'
                    }`}
                  >
                    Bowling Team (-{penaltyRuns}P)
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-xs">Reason Note</label>
                <input
                  type="text"
                  value={penaltyReason}
                  onChange={(e) => setPenaltyReason(e.target.value)}
                  className="bg-[var(--muted)] border border-[var(--border)] p-card rounded-xl w-full text-sm"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleAwardPenalty}
              className="bg-purple-600 hover:bg-purple-500 font-bold shadow-md shadow-purple-600/30 rounded-xl text-sm w-full py-3"
            >
              Confirm Penalty
            </button>
          </div>
        </div>
      )}

      {/* ── INNINGS 1 COMPLETION / CHASE SETUP MODAL ── */}
      {showInningsTransitionModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="overflow-y-auto bg-[var(--card)] border border-[var(--border)] shadow-2xl max-w-md max-h-[90vh] rounded-2xl text-center w-full p-6 space-y-4">
            <div className="flex items-center justify-center">
              <div className="bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shadow-lg rounded-2xl w-20 h-20 p-2">
                <img
                  src="/assets/illustrations/chase_batsman.png"
                  alt="Chase Target"
                  className="object-contain drop-shadow w-full h-full"
                />
              </div>
            </div>

            <div>
              <h3 className="font-black tracking-tight text-2xl">1st Innings Completed!</h3>
              <p className="text-sm mt-1">
                {engine.firstInnings.team} scored <b>{engine.firstInnings.totalRuns}/{engine.firstInnings.totalWickets}</b> in {engine.firstInnings.oversString} overs.
              </p>
              <div className="bg-[var(--muted)] border border-[var(--border)] rounded-xl mt-3 p-3">
                <span className="font-bold uppercase text-xs">Target for {engine.firstInnings.bowlingTeam}</span>
                <div className="font-black num-font text-3xl mt-0.5">
                  {engine.firstInnings.totalRuns + 1} runs
                </div>
              </div>
            </div>

            <div className="text-left space-y-3">
              <span className="font-bold uppercase text-xs">2nd Innings Opening Players</span>
              <input
                type="text"
                placeholder="2nd Innings Striker"
                value={inn2Striker}
                onChange={(e) => setInn2Striker(e.target.value)}
                className="bg-[var(--muted)] border font-bold p-card rounded-xl w-full text-sm"
              />
              <input
                type="text"
                placeholder="2nd Innings Non-Striker"
                value={inn2NonStriker}
                onChange={(e) => setInn2NonStriker(e.target.value)}
                className="bg-[var(--muted)] border font-bold p-card rounded-xl w-full text-sm"
              />
              <input
                type="text"
                placeholder="Opening Bowler"
                value={inn2Bowler}
                onChange={(e) => setInn2Bowler(e.target.value)}
                className="bg-[var(--muted)] border font-bold p-card rounded-xl w-full text-sm"
              />
            </div>

            <button
              type="button"
              onClick={handleStartSecondInnings}
              className="bg-emerald-600 hover:bg-emerald-500 font-extrabold shadow-lg shadow-emerald-600/30 py-3.5 rounded-xl text-base w-full"
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
