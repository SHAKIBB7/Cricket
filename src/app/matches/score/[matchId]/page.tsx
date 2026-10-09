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
  Shield,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { EventSourcedMatchEngine } from '@/domain/cricket/match-engine/EventSourcedMatchEngine';
import { MatchRepository } from '@/infrastructure/storage/MatchRepository';
import { MatchScorecard, DismissalType, Player, Bowler } from '@/domain/cricket/types';
import { OutModal, OutConfirmPayload } from '@/components/modals/OutModal';
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
import { useScoringView } from '@/context/ScoringViewContext';
import { ActiveBatsmenTable } from '@/components/scoring/ActiveBatsmenTable';
import { ActiveBowlerTable } from '@/components/scoring/ActiveBowlerTable';
import { motion, AnimatePresence } from 'framer-motion';
import { MotionNumber } from '@/components/common/MotionNumber';
import { MODAL_VARIANTS, BACKDROP_VARIANTS, TRANSITIONS } from '@/lib/animations';

const BatsmanProfileModal = dynamic(
  () => import('@/components/modals/BatsmanProfileModal').then((mod) => mod.BatsmanProfileModal),
  { ssr: false }
);
const BowlerProfileModal = dynamic(
  () => import('@/components/modals/BowlerProfileModal').then((mod) => mod.BowlerProfileModal),
  { ssr: false }
);
const MatchesPanel = dynamic(
  () => import('@/components/scoring/MatchesPanel').then((mod) => mod.MatchesPanel),
  { ssr: false }
);
const AdvancedAnalyticsPanel = dynamic(
  () => import('@/components/scoring/AdvancedAnalyticsPanel').then((mod) => mod.AdvancedAnalyticsPanel),
  { ssr: false }
);
const IntegratedScoreboard = dynamic(
  () => import('@/components/scoring/IntegratedScoreboard').then((mod) => mod.IntegratedScoreboard),
  { ssr: false }
);

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
  const [showMatchInfoModal, setShowMatchInfoModal] = useState(false);
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

  // Bowler Form State
  const [newBowlerName, setNewBowlerName] = useState('');
  const [bowlerError, setBowlerError] = useState<string | null>(null);

  const openBowlerModal = () => {
    setBowlerError(null);
    setNewBowlerName('');
    setShowBowlerModal(true);
  };

  // Penalty Form State
  const [penaltyRuns, setPenaltyRuns] = useState(5);
  const [awardedToBatting, setAwardedToBatting] = useState(true);
  const [penaltyReason, setPenaltyReason] = useState('Ball tampering / fielding violation');

  // 2nd Innings Transition Form State
  const [inn2Striker, setInn2Striker] = useState('');
  const [inn2NonStriker, setInn2NonStriker] = useState('');
  const [inn2Bowler, setInn2Bowler] = useState('');

  const handleDownloadPdf = async () => {
    if (!engine) return;
    const { ScorecardPdfGenerator } = await import('@/features/scoring/pdf/ScorecardPdfGenerator');
    ScorecardPdfGenerator.downloadPdf(engine.toScorecard());
  };

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
        const fromIdx = lastSavedEventIndexRef.current;
        await MatchRepository.saveMatchWithEvents(sc, target.events, fromIdx);
        lastSavedEventIndexRef.current = target.events.length;
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

  // Keyboard Shortcuts Hook  Attached once on mount, cleaned up once on unmount
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

  const handleConfirmOut = (payload: OutConfirmPayload) => {
    engine.scoreBall({
      runsScored: payload.runsScored,
      isWicket: true,
      dismissalType: payload.dismissalType,
      fielderName: payload.fielderName,
      newBatsmanName: payload.newBatsmanName,
      isStrikerOut: payload.isStrikerOut,
    });

    setShowWicketModal(false);
    setExtraFlag('none');
    setDismissalType('Bowled');
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
    const formatted = bowlerName.trim();
    if (!formatted) return;

    const validation = engine.validateBowlerSelection(formatted);
    if (!validation.allowed) {
      setBowlerError(validation.reason || 'This bowler is not permitted to bowl.');
      return;
    }

    const res = engine.changeBowler(formatted);
    if (!res.success) {
      setBowlerError(res.reason || 'Unable to assign bowler.');
      return;
    }

    setBowlerError(null);
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
      inn2Striker.trim() || '',
      inn2NonStriker.trim() || '',
      inn2Bowler.trim() || ''
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
    return (
      <MatchesPanel
        currentMatchId={matchId}
        onClose={closeView}
        onViewScoreboard={() => toggleView('scoreboard')}
      />
    );
  }

  if (activeView === 'advancedAnalytics') {
    return <AdvancedAnalyticsPanel engine={engine} onClose={closeView} />;
  }

  if (activeView === 'scoreboard') {
    return (
      <IntegratedScoreboard
        engine={engine}
        selectedTheme={selectedTheme}
        onClose={closeView}
        onSelectBatsman={setSelectedBatsman}
        onSelectBowler={setSelectedBowler}
        initialInnings={engine.currentInningsNumber as 1 | 2}
      />
    );
  }

  return (
    <>
      {/*  */}
      {/*  MOBILE SCORER COCKPIT (< md: STRICT SINGLE VIEWPORT, ZERO SCROLL)  */}
      {/*  */}
      <div className="md:hidden flex flex-col select-none overflow-y-auto min-h-[calc(100dvh-3.25rem)] gap-card-gap pb-safe pt-4 px-screen-x w-full max-w-full overflow-x-hidden">
        {/* 1. TOP COMPACT SCOREBOARD BANNER (MOBILE-ONLY TWO-SECTION REDESIGN) */}
        <div
          className="shadow-lg relative overflow-hidden shrink-0 transition-all duration-300 rounded-card px-3.5 text-white pt-3 pb-3"
          style={{
            background: `linear-gradient(135deg, ${selectedTheme.deep} 0%, ${selectedTheme.primary} 60%, ${selectedTheme.secondary} 100%)`,
          }}
        >
          {/* Top Actions: Cycle Theme Button */}
          <div className="absolute top-2 right-2 flex items-center gap-1.5 z-10">
            <button
              type="button"
              onClick={() => {
                const currIdx = SCOREBOARD_THEMES.findIndex((t) => t.id === selectedTheme.id);
                const nextTheme = SCOREBOARD_THEMES[(currIdx + 1) % SCOREBOARD_THEMES.length];
                setSelectedTheme(nextTheme);
              }}
              className="hover:text-white active:scale-90 transition-transform text-white/60 p-1 rounded-lg bg-white/10 hover:bg-white/20"
              title="Cycle Scoreboard Theme"
            >
              <Palette className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid items-start grid-cols-[1.25fr_1fr] sm:grid-cols-2 gap-2 sm:gap-3">
            {/*  LEFT SECTION: TEAM / INFO (STRICT MASTER LEFT ALIGNMENT)  */}
            <div className="flex flex-col items-start justify-center border-r border-white/15 min-w-0 pr-2 space-y-1 text-left">
              {/* Team Name: Master Left Edge Starting Position */}
              <div className="flex items-center gap-1.5 min-w-0 text-left w-full">
                <TeamBadgeIcon
                  type={inn.team === engine.teamA ? 'home' : 'away'}
                  size="xs"
                />
                <span className="text-team-name font-black tracking-wide text-white uppercase leading-tight truncate">
                  {inn.team}
                </span>
                <span className="flex relative shrink-0 h-2 w-2">
                  <span className="animate-ping absolute inline-flex bg-[#34C759] opacity-75 rounded-full h-full w-full" />
                  <span className="relative inline-flex bg-[#34C759] rounded-full h-2 w-2" />
                </span>
              </div>

              {/* Chase or 1st Innings Info: Strictly Aligned to Master Left Edge */}
              {engine.currentInningsNumber === 2 && engine.targetScore > 0 ? (
                <div className="flex flex-col items-start text-left min-w-0 w-full space-y-1 pt-0.5">
                  {/* 1. Target & RR: TARGET 137 | RR 26.20 */}
                  <div className="flex items-center flex-wrap gap-x-1.5 gap-y-0.5 text-xs sm:text-sm font-semibold text-white/90 select-none leading-tight text-left">
                    <span className="text-white/70 font-bold tracking-wider">TARGET</span>
                    <span className="font-bold num-font text-[#34C759] tracking-normal">{engine.targetScore}</span>
                    <span className="text-white/40 font-bold px-1 select-none">|</span>
                    <span className="text-white/70 font-bold tracking-wider">RR</span>
                    <span className="font-bold num-font text-white tracking-normal">{rrr.toFixed(2)}</span>
                  </div>

                  {/* 2. CRR: CRR 6.00 */}
                  <div className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-white/90 select-none leading-tight text-left">
                    <span className="text-white/70 font-bold tracking-wider">CRR</span>
                    <span className="font-bold num-font text-white tracking-normal">{crr.toFixed(2)}</span>
                  </div>

                  {/* 3. NEED 131 RUNS FROM 30 BALLS */}
                  <div className="flex items-center flex-wrap gap-x-1.5 gap-y-0.5 text-xs sm:text-sm font-bold tracking-normal text-white/90 select-none leading-tight text-left pt-0.5">
                    <span className="text-white/70 font-bold tracking-wider">NEED</span>
                    <span className="font-bold num-font text-[#34C759] tracking-normal">{neededRuns}</span>
                    <span className="text-white/70 font-bold tracking-wider">RUNS FROM</span>
                    <span className="font-bold num-font text-white tracking-normal">{remainingBalls}</span>
                    <span className="text-white/70 font-bold tracking-wider">BALLS</span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-start text-left min-w-0 w-full space-y-1 pt-0.5">
                  <div className="font-bold text-xs sm:text-sm text-white/90 tracking-normal leading-tight text-left">
                    1st Innings
                  </div>
                  <div className="flex items-center gap-1.5 text-xs sm:text-sm tracking-normal leading-tight text-left">
                    <span className="text-white/70 font-bold tracking-wider">CRR:</span>
                    <span className="font-bold num-font text-white tracking-normal">{crr.toFixed(2)}</span>
                    <span className="text-white/40 font-bold px-0.5"></span>
                    <span className="text-white/70 font-bold tracking-wider">Proj:</span>
                    <span className="font-bold num-font text-[#34C759] tracking-normal">{Math.round(crr * engine.totalOvers)}</span>
                  </div>
                </div>
              )}

              {/* Free Hit Pill if active */}
              {inn.isFreeHit && (
                <div className="pt-0.5 text-left">
                  <span className="rounded bg-[#FF3B30] font-bold text-xs uppercase tracking-wider animate-bounce inline-block px-2 py-0.5 text-white shadow-xs">
                    FREE HIT
                  </span>
                </div>
              )}
            </div>

            {/*  RIGHT SECTION: LIVE SCORE (50/2) & BALLS | OVERS (46 B | 7.4 O)  */}
            <div className="flex flex-col justify-center items-center pl-2 min-w-0">
              <div className="flex flex-col items-center justify-center w-full">
                {/* 50/2 Primary Score */}
                <div className="inline-flex items-baseline justify-center num-font leading-none select-none">
                  {/* Runs: Large, Bold, Primary Emphasis */}
                  <span className="font-black text-4xl xs:text-5xl sm:text-5xl tracking-normal text-white drop-shadow-xs">
                    <MotionNumber value={inn.totalRuns} />
                  </span>
                  {/* Slash: Subtle, Smaller */}
                  <span className="text-xl xs:text-2xl sm:text-2xl font-light text-white/50 px-1">
                    /
                  </span>
                  {/* Wickets: Secondary, Smaller than Runs */}
                  <span className="font-bold text-2xl xs:text-3xl sm:text-3xl tracking-normal text-white/90">
                    <MotionNumber value={inn.totalWickets} />
                  </span>
                </div>
              </div>

              {/* Horizontal Divider */}
              <div className="border-t border-white/20 w-full my-1.5" />

              {/* Overs Block: OVER 32.4 | 50 */}
              <div className="flex items-center justify-center gap-2 select-none">
                <span className="text-[11px] xs:text-xs font-semibold tracking-wider text-white/70 uppercase">
                  OVER
                </span>
                <div className="flex items-center gap-2 num-font text-xs xs:text-sm">
                  <span className="font-bold tracking-normal text-white">
                    {inn.oversString}
                  </span>
                  <span className="text-white/35 font-light">
                    |
                  </span>
                  <span className="font-semibold tracking-normal text-white/75">
                    {engine.totalOvers}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 2. CREASE BATTERS & BOWLER PANEL */}
        <div className="bg-[var(--card)] border border-[var(--border)] shadow-sm shrink-0 p-2 sm:p-2.5 rounded-card space-y-1.5">
          {/* Active Batsmen Table */}
          <ActiveBatsmenTable
            striker={striker}
            nonStriker={nonStriker}
            strikerIdx={inn.strikerIdx}
            nonStrikerIdx={inn.nonStrikerIdx}
            onSelectBatsman={setSelectedBatsman}
            accentColor={selectedTheme.primary}
          />

          {/* Horizontal Divider */}
          <div className="border-t border-[var(--border)] w-full" />

          {/* Current Bowler Section */}
          <ActiveBowlerTable
            bowler={currentBowler}
            onSelectBowler={setSelectedBowler}
          />
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
                    {ball === '0' ? '' : ball}
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
              onClick={openBowlerModal}
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
              className={`py-2 px-1 xs:px-1.5 rounded-xl text-xs font-extrabold min-h-btn transition-all border text-center active:scale-95 leading-tight flex items-center justify-center break-words select-none ${
                extraFlag === item.id
                  ? item.id === 'wicket'
                    ? 'bg-red-600 text-white border-red-600 shadow-sm'
                    : 'bg-amber-500 text-slate-950 border-amber-500 shadow-sm'
                  : 'bg-[var(--muted)] text-[var(--foreground)] border-[var(--border)] hover:bg-[var(--muted)]/80'
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

        {/* 6. BOTTOM UTILITY & ACTION SECTION (COMPACT & CLEAN, NO REDUNDANT SCOREBOARD BUTTON) */}
        <div className="shrink-0 mt-auto space-y-2 pb-2">
          <div className="grid gap-2 grid-cols-3">
            <button
              type="button"
              onClick={() => setShowRetireModal(true)}
              className="bg-[var(--card)] hover:bg-[var(--muted)] border border-[var(--border)] text-xs font-bold flex items-center justify-center active:scale-95 transition-transform py-2.5 rounded-xl text-red-500 min-h-btn px-2 gap-1.5"
              title="Retire Player"
            >
              <UserX className="w-3.5 h-3.5" />
              <span className="truncate">Retire</span>
            </button>

            <button
              type="button"
              onClick={() => setShowPenaltyModal(true)}
              className="bg-[var(--card)] hover:bg-[var(--muted)] border border-[var(--border)] text-xs font-bold flex items-center justify-center active:scale-95 transition-transform py-2.5 rounded-xl text-purple-500 min-h-btn px-2 gap-1.5"
              title="Award Penalty"
            >
              <Flag className="w-3.5 h-3.5" />
              <span className="truncate">Penalty</span>
            </button>

            {engine.isMatchCompleted ? (
              <button
                type="button"
                onClick={handleDownloadPdf}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold flex items-center justify-center shadow-xs active:scale-95 transition-all py-2.5 rounded-xl text-xs gap-1.5 min-h-btn px-2"
                title="Download PDF Scorecard"
              >
                <FileText className="w-3.5 h-3.5" />
                <span className="truncate">PDF</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowMatchInfoModal(true)}
                className="bg-[var(--card)] hover:bg-[var(--muted)] border border-[var(--border)] font-bold flex items-center justify-center shadow-xs active:scale-95 transition-all py-2.5 rounded-xl text-xs gap-1.5 min-h-btn px-2 text-blue-500"
                title="Match Info"
              >
                <Info className="w-3.5 h-3.5" />
                <span className="truncate">Info</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/*  */}
      {/*  DESKTOP SCORER WORKSPACE (>= md: EXPANDED 3-PANEL LAYOUT)  */}
      {/*  */}
      <div className="hidden md:block max-w-7xl mx-auto space-y-4">
        {/*  TOP SCOREBOARD BANNER (THEME-POWERED)  */}
      <div
        className="shadow-xl transition-all duration-300 relative overflow-hidden rounded-2xl p-6 text-white"
        style={{
          background: `linear-gradient(135deg, ${selectedTheme.deep} 0%, ${selectedTheme.primary} 60%, ${selectedTheme.secondary} 100%)`,
        }}
      >
        <div className="flex justify-between items-start gap-6">
          {/*  LEFT SECTION: TEAM & MATCH INFO (STRICT MASTER LEFT ALIGNMENT)  */}
          <div className="flex flex-col items-start text-left min-w-0 space-y-1.5">
            {/* Top Match Context Row: Left-aligned status */}
            <div className="flex items-center gap-2 text-left">
              {engine.currentInningsNumber === 2 && engine.targetScore > 0 && (
                <span className="bg-[#34C759] font-bold tracking-wide shadow-xs shrink-0 py-0.5 rounded-full text-xs px-2.5 text-white">
                  CHASE
                </span>
              )}
              <span className="uppercase tracking-wide font-bold text-xs text-white/80">
                Innings {engine.currentInningsNumber}  {engine.totalOvers} Overs
              </span>
              {inn.isFreeHit && (
                <span className="bg-[#FF3B30] font-bold uppercase tracking-wider animate-bounce shadow-md shrink-0 py-0.5 rounded-full text-xs px-2.5 text-white">
                  FREE HIT
                </span>
              )}
            </div>

            {/* Team Name: Master Left Edge Starting Position */}
            <div className="flex items-center gap-2 text-left">
              <TeamBadgeIcon
                type={inn.team === engine.teamA ? 'home' : 'away'}
                size="sm"
              />
              <h2 className="text-2xl sm:text-3xl font-black text-white tracking-wide uppercase leading-tight truncate">
                {inn.team}
              </h2>
              <span className="flex relative shrink-0 h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex bg-[#34C759] opacity-75 rounded-full h-full w-full" />
                <span className="relative inline-flex bg-[#34C759] rounded-full h-2.5 w-2.5" />
              </span>
            </div>

            {/* Chase or 1st Innings Info: Strictly Left-Aligned with Team Name */}
            {engine.currentInningsNumber === 2 && engine.targetScore > 0 ? (
              <div className="flex flex-col items-start text-left min-w-0 space-y-1.5 pt-0.5">
                {/* 1. Target & RR: TARGET 137 | RR 26.20 */}
                <div className="flex items-center gap-2 text-sm font-semibold text-white/90 select-none leading-tight text-left">
                  <span className="text-white/70 font-bold tracking-wider">TARGET</span>
                  <span className="font-bold num-font text-[#34C759] tracking-normal">{engine.targetScore}</span>
                  <span className="text-white/40 font-bold px-1 select-none">|</span>
                  <span className="text-white/70 font-bold tracking-wider">RR</span>
                  <span className="font-bold num-font text-white tracking-normal">{rrr.toFixed(2)}</span>
                </div>

                {/* 2. CRR: CRR 6.00 */}
                <div className="flex items-center gap-2 text-sm font-semibold text-white/90 select-none leading-tight text-left">
                  <span className="text-white/70 font-bold tracking-wider">CRR</span>
                  <span className="font-bold num-font text-white tracking-normal">{crr.toFixed(2)}</span>
                </div>

                {/* 3. NEED 131 RUNS FROM 30 BALLS */}
                <div className="flex items-center gap-1.5 text-sm font-bold tracking-normal text-white/90 select-none leading-tight text-left pt-0.5">
                  <span className="text-white/70 font-bold tracking-wider">NEED</span>
                  <span className="font-bold num-font text-[#34C759] tracking-normal">{neededRuns}</span>
                  <span className="text-white/70 font-bold tracking-wider">RUNS FROM</span>
                  <span className="font-bold num-font text-white tracking-normal">{remainingBalls}</span>
                  <span className="text-white/70 font-bold tracking-wider">BALLS</span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-start text-left min-w-0 space-y-1.5 pt-0.5">
                <div className="font-bold text-sm text-white/90 tracking-normal leading-tight text-left">
                  1st Innings
                </div>
                <div className="flex items-center gap-2 text-sm tracking-normal leading-tight text-left">
                  <span className="text-white/70 font-bold tracking-wider">CRR:</span>
                  <span className="font-bold num-font text-white tracking-normal">{crr.toFixed(2)}</span>
                  <span className="text-white/40 font-bold px-1 select-none"></span>
                  <span className="text-white/70 font-bold tracking-wider">Proj:</span>
                  <span className="font-bold num-font text-[#34C759] tracking-normal">{Math.round(crr * engine.totalOvers)}</span>
                </div>
              </div>
            )}
          </div>

          {/*  RIGHT SECTION: LIVE SCORE (50/2) & OVER (OVER 32.4 | 50) + CONTROLS  */}
          <div className="flex flex-col items-end gap-3 shrink-0">
            {/* Top Controls: Theme Picker */}
            <div className="flex items-center gap-2 self-end">
              <div className="flex items-center gap-1.5 bg-black/30 rounded-xl px-2 py-1">
                <Palette className="w-3.5 h-3.5 text-white/70" />
                <select
                  value={selectedTheme.id}
                  onChange={(e) => {
                    const t = SCOREBOARD_THEMES.find((th) => th.id === e.target.value);
                    if (t) setSelectedTheme(t);
                  }}
                  className="bg-transparent font-semibold border-none focus:outline-none text-xs sm:text-sm text-white cursor-pointer pr-1"
                >
                  {SCOREBOARD_THEMES.map((t) => (
                    <option key={t.id} value={t.id} className="bg-slate-900 text-white">
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Primary Score & Overs Block */}
            <div className="flex flex-col items-end min-w-0">
              <div className="inline-flex items-baseline num-font select-none leading-none">
                <span className="font-black text-4xl sm:text-5xl lg:text-6xl tracking-normal text-white drop-shadow-xs">
                  <MotionNumber value={inn.totalRuns} />
                </span>
                <span className="text-2xl sm:text-3xl lg:text-4xl font-light text-white/50 px-1">
                  /
                </span>
                <span className="font-bold text-2xl sm:text-3xl lg:text-4xl tracking-normal text-white/90">
                  <MotionNumber value={inn.totalWickets} />
                </span>
              </div>

              {/* Horizontal Divider & Overs block: OVER 32.4 | 50 */}
              <div className="border-t border-white/20 pt-1 mt-1.5 flex items-center gap-2 select-none">
                <span className="text-[11px] sm:text-xs font-semibold tracking-wider text-white/70 uppercase">
                  OVER
                </span>
                <div className="flex items-center gap-2 num-font text-xs sm:text-sm">
                  <span className="font-bold tracking-normal text-white">
                    {inn.oversString}
                  </span>
                  <span className="text-white/35 font-light">
                    |
                  </span>
                  <span className="font-semibold tracking-normal text-white/75">
                    {engine.totalOvers}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/*  OVER BALLS TIMELINE STRIP  */}
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
                  {ball === '0' ? '' : ball}
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

      {/*  RESPONSIVE SCORER WORKSPACE (DESKTOP 3-PANEL / MOBILE STACK)  */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] gap-5 md:gap-6">
        {/* LEFT / TOP: ACTIVE BATTERS & CURRENT BOWLER CARD */}
        <div className="space-y-2.5">
          {/* Batters */}
          <div className="bg-[var(--card)] border border-[var(--border)] shadow-sm rounded-xl p-2.5 sm:p-3 space-y-2">
            <ActiveBatsmenTable
              striker={striker}
              nonStriker={nonStriker}
              strikerIdx={inn.strikerIdx}
              nonStrikerIdx={inn.nonStrikerIdx}
              onSelectBatsman={setSelectedBatsman}
              accentColor={selectedTheme.primary}
            />

            {/* Active Partnership */}
            <div className="border-t border-[var(--border)] flex items-center justify-between text-caption pt-1.5 px-1 text-[var(--muted-foreground)]">
              <span>Partnership:</span>
              <span className="font-bold num-font text-[var(--foreground)]">
                {inn.currentPartnership.runs} runs ({inn.currentPartnership.balls} balls)
              </span>
            </div>
          </div>

          {/* Bowler */}
          <div className="bg-[var(--card)] border border-[var(--border)] shadow-sm rounded-xl p-2 sm:p-2.5">
            <ActiveBowlerTable
              bowler={currentBowler}
              onSelectBowler={setSelectedBowler}
            />
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
                  onClick={openBowlerModal}
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
                    className={`py-2.5 sm:py-3 px-2 sm:px-3 rounded-xl text-xs sm:text-sm font-bold sm:font-extrabold min-h-[48px] sm:min-h-[52px] transition-all border text-center select-none active:scale-[0.98] ${
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
                  onClick={handleDownloadPdf}
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



      {/* "?"? MATCH INFO & RULES MODAL "?"? */}
      <AnimatePresence>
      {showMatchInfoModal && (
        <motion.div variants={BACKDROP_VARIANTS} initial="hidden" animate="visible" exit="exit" className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <motion.div variants={MODAL_VARIANTS} className="overflow-y-auto bg-[var(--card)] border border-[var(--border)] shadow-2xl max-w-md max-h-[85vh] rounded-2xl w-full p-5 space-y-4">
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
                  <span className="shrink-0 text-[var(--muted-foreground)] flex items-center gap-1.5">
                    <TeamBadgeIcon type="home" size="xs" />
                    Host / Home Team:
                  </span>
                  <span className="font-extrabold truncate text-right">{engine.teamA}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="shrink-0 text-[var(--muted-foreground)] flex items-center gap-1.5">
                    <TeamBadgeIcon type="away" size="xs" />
                    Visitor / Away Team:
                  </span>
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
                  <span className="font-bold">
                    {engine.getMaxBowlerLimit()} ov ({engine.advancedSettings?.bowlingLimitMode === 'international' ? 'International Rule' : engine.advancedSettings?.bowlingLimitMode === 'custom' ? 'Custom Rule' : 'Default Rule'})
                  </span>
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
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* ── CENTRALIZED REUSABLE OUT MODAL ── */}
      <OutModal
        isOpen={showWicketModal}
        onClose={() => {
          setShowWicketModal(false);
          setExtraFlag('none');
        }}
        onConfirm={handleConfirmOut}
        strikerName={striker?.name}
        nonStrikerName={nonStriker?.name}
        bowlerName={currentBowler?.name}
        defaultIncomingBatter={inn.players[inn.nextPlayerIdx]?.name}
        initialRuns={pendingRunForWicket}
        initialDismissalType={dismissalType}
        isLastWicket={inn.totalWickets >= engine.maxWickets - 1}
      />

        {/* ── CHANGE BOWLER MODAL ── */}
        <AnimatePresence>
        {showBowlerModal && (
          <motion.div variants={BACKDROP_VARIANTS} initial="hidden" animate="visible" exit="exit" className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <motion.div variants={MODAL_VARIANTS} className="overflow-y-auto bg-[var(--card)] border border-[var(--border)] shadow-2xl max-w-md max-h-[90vh] rounded-2xl w-full p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-extrabold text-lg">Select Bowler</h3>
                <button
                  onClick={() => {
                    setShowBowlerModal(false);
                    setBowlerError(null);
                  }}
                  className="hover:bg-[var(--muted)] rounded-lg p-1"
                >
                  <X className="text-[var(--muted-foreground)] w-5 h-5" />
                </button>
              </div>

              {/* Bowling Limiter Mode Badge */}
              <div className="bg-[var(--muted)] border border-[var(--border)] rounded-xl p-2.5 flex items-center justify-between text-caption">
                <div className="flex items-center gap-1.5 font-bold">
                  <Shield className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Limit: {engine.getMaxBowlerLimit()} ov max per bowler</span>
                </div>
                <span className="text-[11px] text-[var(--muted-foreground)] font-semibold">
                  {engine.advancedSettings?.bowlingLimitMode === 'international'
                    ? 'International Rule'
                    : engine.advancedSettings?.bowlingLimitMode === 'custom'
                    ? 'Custom Rule'
                    : 'Default Rule'}
                </span>
              </div>

              {/* Warning / Error Alert Banner */}
              {bowlerError && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 p-3 rounded-xl text-caption font-bold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{bowlerError}</span>
                </div>
              )}

              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="font-semibold text-xs">Existing Bowlers</label>
                  <div className="overflow-y-auto space-y-1.5 max-h-48">
                    {inn.bowlers.map((b) => {
                      const validation = engine.validateBowlerSelection(b.name);
                      const completedOvers = Math.floor(b.ballsBowled / 6);
                      const maxAllowed = engine.getMaxBowlerLimit();
                      const isLimitReached = completedOvers >= maxAllowed;

                      return (
                        <button
                          key={b.id}
                          type="button"
                          disabled={!validation.allowed}
                          onClick={() => handleChangeBowler(b.name)}
                          className={`w-full text-left p-card sm:p-3 rounded-xl border flex items-center justify-between gap-2 text-xs font-bold min-h-btn transition-colors ${
                            validation.allowed
                              ? 'bg-[var(--muted)] hover:bg-blue-500/10 hover:border-blue-500/50 text-[var(--foreground)] border-[var(--border)]'
                              : 'opacity-50 bg-[var(--muted)]/60 border-transparent cursor-not-allowed'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="truncate">{cleanPlayerName(b.name)}</span>
                            {!validation.allowed && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-extrabold shrink-0 ${
                                isLimitReached
                                  ? 'bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30'
                                  : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                              }`}>
                                {isLimitReached ? `🚫 Max Limit (${completedOvers}/${maxAllowed} ov)` : `⚠️ Prev Over`}
                              </span>
                            )}
                          </div>
                          <span className="shrink-0 num-font text-right">
                            {completedOvers}.{b.ballsBowled % 6} ov ({b.wickets}-{b.runs})
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
                      onChange={(e) => {
                        setNewBowlerName(e.target.value);
                        if (bowlerError) setBowlerError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleChangeBowler(newBowlerName);
                        }
                      }}
                      placeholder="New Bowler Name"
                      className="flex-1 bg-[var(--muted)] border border-[var(--border)] font-bold min-w-0 px-3.5 py-2.5 rounded-xl text-sm focus:outline-none focus:border-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleChangeBowler(newBowlerName)}
                      className="bg-blue-600 hover:bg-blue-500 font-bold shrink-0 py-2.5 rounded-xl text-sm min-h-btn px-4 transition-colors active:scale-95"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* "?"? RETIRE BATTER MODAL "?"? */}
      <AnimatePresence>
      {showRetireModal && (
        <motion.div variants={BACKDROP_VARIANTS} initial="hidden" animate="visible" exit="exit" className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <motion.div variants={MODAL_VARIANTS} className="overflow-y-auto bg-[var(--card)] border border-[var(--border)] shadow-2xl max-w-md max-h-[90vh] rounded-2xl w-full p-5 space-y-4">
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
                  onClick={() => {
                    setShowRetireModal(false);
                    setDismissalType('Retired Out');
                    setShowWicketModal(true);
                  }}
                  className="bg-red-600 hover:bg-red-500 font-bold flex items-center justify-center rounded-xl text-xs min-h-btn p-3"
                >
                  Record Retire Out (Wicket)
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleRetirePlayer(true, 'Retire Hurt')}
                    className="bg-amber-500 hover:bg-amber-400 font-bold flex-1 flex items-center justify-center rounded-xl text-xs min-h-btn p-3"
                  >
                    Striker: Retire Hurt
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRetirePlayer(false, 'Retire Hurt')}
                    className="bg-amber-500/80 hover:bg-amber-500 font-bold flex-1 flex items-center justify-center rounded-xl text-xs min-h-btn p-3"
                  >
                    Non-Striker: Retire Hurt
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* "?"? PENALTY RUNS MODAL "?"? */}
      <AnimatePresence>
      {showPenaltyModal && (
        <motion.div variants={BACKDROP_VARIANTS} initial="hidden" animate="visible" exit="exit" className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <motion.div variants={MODAL_VARIANTS} className="overflow-y-auto bg-[var(--card)] border border-[var(--border)] shadow-2xl max-w-md max-h-[90vh] rounded-2xl w-full p-5 space-y-4">
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
                  className="bg-[var(--muted)] border border-[var(--border)] font-bold px-3.5 py-2.5 rounded-xl w-full text-sm focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-xs">Award To</label>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-2">
                  <button
                    type="button"
                    onClick={() => setAwardedToBatting(true)}
                    className={`px-3 py-2.5 rounded-xl border text-xs font-bold min-h-btn flex items-center justify-center text-center transition-colors ${
                      awardedToBatting
                        ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                        : 'bg-[var(--muted)] border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                    }`}
                  >
                    Batting Team (+{penaltyRuns}P)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAwardedToBatting(false)}
                    className={`px-3 py-2.5 rounded-xl border text-xs font-bold min-h-btn flex items-center justify-center text-center transition-colors ${
                      !awardedToBatting
                        ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                        : 'bg-[var(--muted)] border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
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
                  className="bg-[var(--muted)] border border-[var(--border)] px-3.5 py-2.5 rounded-xl w-full text-sm focus:outline-none focus:border-purple-500"
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
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* "?"? INNINGS 1 COMPLETION / CHASE SETUP MODAL "?"? */}
      <AnimatePresence>
      {showInningsTransitionModal && (
        <motion.div variants={BACKDROP_VARIANTS} initial="hidden" animate="visible" exit="exit" className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <motion.div variants={MODAL_VARIANTS} className="overflow-y-auto bg-[var(--card)] border border-[var(--border)] shadow-2xl max-w-md max-h-[90vh] rounded-2xl text-center w-full p-6 space-y-4">
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
                {engine.firstInnings.team} scored <b>{engine.firstInnings.totalRuns} - {engine.firstInnings.totalWickets}</b> in {engine.firstInnings.oversString} overs.
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
                className="bg-[var(--muted)] border border-[var(--border)] font-bold px-3.5 py-2.5 rounded-xl w-full text-sm focus:outline-none focus:border-emerald-500"
              />
              <input
                type="text"
                placeholder="2nd Innings Non-Striker"
                value={inn2NonStriker}
                onChange={(e) => setInn2NonStriker(e.target.value)}
                className="bg-[var(--muted)] border border-[var(--border)] font-bold px-3.5 py-2.5 rounded-xl w-full text-sm focus:outline-none focus:border-emerald-500"
              />
              <input
                type="text"
                placeholder="Opening Bowler"
                value={inn2Bowler}
                onChange={(e) => setInn2Bowler(e.target.value)}
                className="bg-[var(--muted)] border border-[var(--border)] font-bold px-3.5 py-2.5 rounded-xl w-full text-sm focus:outline-none focus:border-emerald-500"
              />
            </div>

            <button
              type="button"
              onClick={handleStartSecondInnings}
              className="bg-emerald-600 hover:bg-emerald-500 font-extrabold shadow-lg shadow-emerald-600/30 py-3.5 rounded-xl text-base w-full"
            >
              Start 2nd Innings Chase
            </button>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      {/*  BATSMAN & BOWLER FULL PROFILE MODALS  */}
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


