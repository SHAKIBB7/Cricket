'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  RotateCcw,
  ArrowRightLeft,
  UserX,
  Award,
  AlertTriangle,
  Palette,
  Flag,
  FileText,
  X,
  Info,
  History,
  BarChart2,
  Shield,
  CloudRain,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { EventSourcedMatchEngine } from '@/domain/cricket/match-engine/EventSourcedMatchEngine';
import { DlsEngine } from '@/domain/cricket/dls/DlsEngine';
import { MatchRepository } from '@/infrastructure/storage/MatchRepository';
import { MatchScorecard, DismissalType, Player, Bowler, BallInput, Partnership, FallOfWicket } from '@/domain/cricket/types';
import { OutModal, OutConfirmPayload } from '@/components/modals/OutModal';
import { PlayerSelectionModal, IneligiblePlayerInfo, BowlerFigureInfo } from '@/components/modals/PlayerSelectionModal';
import { SavedTeam } from '@/infrastructure/database/dexie-db';
import { FeatureHubRepository } from '@/infrastructure/storage/FeatureHubRepository';
import { TeamBadgeIcon } from '@/components/common/TeamBadgeIcon';
import { SCOREBOARD_THEMES, ScoreboardTheme } from '@/lib/theme/scoreboard-themes';
import {
  strikeRate,
  currentRunRate,
  requiredRunRate,
  cleanPlayerName,
} from '@/domain/cricket/formatters';
import { DotBallAnalytics } from '@/domain/cricket/analytics/DotBallAnalytics';
import { HapticFeedbackService } from '@/infrastructure/haptics/HapticFeedbackService';
import { NumericInput } from '@/components/common/NumericInput';
import { useScoringView } from '@/context/ScoringViewContext';
import { ActiveBatsmenTable } from '@/components/scoring/ActiveBatsmenTable';
import { ActiveBowlerTable } from '@/components/scoring/ActiveBowlerTable';
import { useLongPress } from '@/hooks/useLongPress';
import { useRecentBallsAutoSlide } from '@/hooks/useRecentBallsAutoSlide';
import { motion, AnimatePresence } from 'framer-motion';
import { MotionNumber } from '@/components/common/MotionNumber';
import { ScoreboardSkeleton } from '@/components/common/Skeleton';
import { ToastNotification } from '@/components/common/ToastNotification';
import { PdfLoadingOverlay } from '@/components/common/PdfLoadingOverlay';
import { usePdfDownload } from '@/features/scoring/pdf/usePdfDownload';
import { MODAL_VARIANTS, BACKDROP_VARIANTS } from '@/lib/animations';

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
const HistoricalBallEditModal = dynamic(
  () => import('@/components/modals/HistoricalBallEditModal').then((mod) => mod.HistoricalBallEditModal),
  { ssr: false }
);
const DlsModal = dynamic(
  () => import('@/components/modals/DlsModal').then((mod) => mod.DlsModal),
  { ssr: false }
);

interface OverBallButtonProps {
  ball: string;
  idx: number;
  onEdit: (idx: number) => void;
  isDesktop?: boolean;
}

function OverBallButton({
  ball,
  idx,
  onEdit,
  isDesktop = false,
}: OverBallButtonProps) {
  const { handlers, isPressing } = useLongPress(() => onEdit(idx), {
    threshold: 1000,
    moveThreshold: 10,
    hapticFeedback: true,
    hapticPattern: 50,
  });

  const isWkt = ball === 'W' || ball.includes('Out') || ball.includes('+W');
  const isSix = ball === '6' || ball.endsWith('6');
  const isFour = ball === '4' || ball.endsWith('4');
  const isExtra = ball.startsWith('Wd') || ball.startsWith('Nb');
  const isDot = ball === '0';
  const isMultiChar = ball.length > 1;

  const colorClasses = isWkt
    ? 'bg-red-600 text-white border-red-500 shadow-red-600/20'
    : isSix
    ? 'bg-purple-600 text-white border-purple-500 shadow-purple-600/20'
    : isFour
    ? 'bg-blue-600 text-white border-blue-500 shadow-blue-600/20'
    : isExtra
    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-amber-500/20'
    : isDot
    ? 'bg-[var(--muted)] text-[var(--foreground)] border-[var(--border)]'
    : 'bg-emerald-600 text-white border-emerald-500 shadow-emerald-600/20';

  const sizeClasses = isDesktop
    ? `h-9 ${
        isMultiChar
          ? 'min-w-[36px] px-2.5 text-xs'
          : 'w-9 aspect-square text-sm'
      }`
    : `h-8 sm:h-9 ${
        isMultiChar
          ? 'min-w-[32px] sm:min-w-[36px] px-2 text-[11px] sm:text-xs'
          : 'w-8 sm:w-9 aspect-square text-xs sm:text-sm'
      }`;

  const titleText = isDesktop
    ? `Delivery ${idx + 1}: ${ball} (Long press to edit)`
    : `Ball ${idx + 1}: ${ball} (Long press to edit)`;

  const ariaLabel = `${isDesktop ? 'Delivery' : 'Ball'} ${idx + 1}: ${ball}. Long press for 1 second to edit.`;

  return (
    <motion.button
      layout="position"
      data-testid={isDesktop ? `desktop-over-ball-${idx}` : `over-ball-${idx}`}
      initial={{ opacity: 0, scale: 0.7, x: isDesktop ? 15 : 12 }}
      animate={{
        opacity: 1,
        scale: isPressing ? 0.92 : 1,
        x: 0,
      }}
      exit={{ opacity: 0, scale: 0.7, x: isDesktop ? -15 : -12 }}
      transition={{ duration: isPressing ? 0.15 : 0.18, ease: 'easeOut' }}
      type="button"
      {...handlers}
      title={titleText}
      aria-label={ariaLabel}
      style={{
        WebkitTouchCallout: 'none',
        userSelect: 'none',
        touchAction: 'pan-x',
      }}
      className={`${sizeClasses} rounded-full flex items-center justify-center font-black shrink-0 leading-none text-center hover:scale-105 active:scale-95 transition-transform cursor-pointer shadow-xs select-none border relative ${colorClasses} ${
        isPressing ? 'scale-95 brightness-110 shadow-md' : ''
      }`}
    >
      {ball === '0' ? '0' : ball}
    </motion.button>
  );
}

export default function LiveScoringPage() {
  const params = useParams();
  const router = useRouter();
  const matchId = params.matchId as string;

  const [engine, setEngine] = useState<EventSourcedMatchEngine | null>(null);
  const { activeView, toggleView, closeView } = useScoringView();
  const [selectedTheme, setSelectedTheme] = useState<ScoreboardTheme>(SCOREBOARD_THEMES[0]);
  const [loading, setLoading] = useState(true);

  // Auto-slide scroll containers for Recent Balls Row
  const currentOverLog = engine?.currentInnings?.thisOverLog ?? [];
  const { containerRef: mobileOverScrollRef } = useRecentBallsAutoSlide(currentOverLog);
  const { containerRef: desktopOverScrollRef } = useRecentBallsAutoSlide(currentOverLog);

  // Selected modifier flag: Wide, No Ball, Byes, Leg Byes, Wicket
  const [extraFlag, setExtraFlag] = useState<
    'none' | 'wide' | 'no_ball' | 'bye' | 'leg_bye' | 'wicket'
  >('none');

  // Modals
  const [showWicketModal, setShowWicketModal] = useState(false);
  const [showRetireModal, setShowRetireModal] = useState(false);
  const [showPenaltyModal, setShowPenaltyModal] = useState(false);
  const [showInningsTransitionModal, setShowInningsTransitionModal] = useState(false);
  const [showMatchInfoModal, setShowMatchInfoModal] = useState(false);
  const [showDlsModal, setShowDlsModal] = useState(false);
  const [pendingRunForWicket, setPendingRunForWicket] = useState(0);

  // Detail Profile Modals
  const [selectedBatsman, setSelectedBatsman] = useState<{
    player: Player;
    isStriker?: boolean;
    isNonStriker?: boolean;
    battingPosition?: number;
    partnerships?: Partnership[];
    fallOfWickets?: FallOfWicket[];
  } | null>(null);
  const [selectedBowler, setSelectedBowler] = useState<{
    bowler: Bowler;
    isCurrentlyBowling?: boolean;
    ongoingOverLog?: string[];
    ongoingMatchOver?: number;
    fallOfWickets?: FallOfWicket[];
  } | Bowler | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Wicket Form State
  const [dismissalType, setDismissalType] = useState<DismissalType>('Bowled');

  // Saved Teams & Squad Management State
  const [savedTeams, setSavedTeams] = useState<SavedTeam[]>([]);

  // Squad Player Selection Modal State
  const [showPlayerSelectModal, setShowPlayerSelectModal] = useState(false);
  const [playerSelectType, setPlayerSelectType] = useState<'batter' | 'bowler'>('batter');
  const [playerSelectTitle, setPlayerSelectTitle] = useState('Select Player');
  const [batterSlotTarget, setBatterSlotTarget] = useState<'striker' | 'nonStriker' | 'incoming'>('striker');

  const openBatterSelector = (slot: 'striker' | 'nonStriker' | 'incoming') => {
    setBatterSlotTarget(slot);
    setPlayerSelectType('batter');
    setPlayerSelectTitle(
      slot === 'striker'
        ? 'Select Striker'
        : slot === 'nonStriker'
        ? 'Select Non-Striker'
        : 'Select Next Batter'
    );
    setShowPlayerSelectModal(true);
  };

  const openBowlerSelector = () => {
    setPlayerSelectType('bowler');
    setPlayerSelectTitle('Select Bowler');
    setShowPlayerSelectModal(true);
  };

  const [bowlerError, setBowlerError] = useState<string | null>(null);

  const openBowlerModal = () => {
    setBowlerError(null);
    openBowlerSelector();
  };

  // Penalty Form State
  const [penaltyRuns, setPenaltyRuns] = useState<number | string>(5);
  const [awardedToBatting, setAwardedToBatting] = useState(true);
  const [penaltyReason, setPenaltyReason] = useState('Ball tampering / fielding violation');

  // 2nd Innings Transition Form State
  const [inn2Striker, setInn2Striker] = useState('');
  const [inn2NonStriker, setInn2NonStriker] = useState('');
  const [inn2Bowler, setInn2Bowler] = useState('');

  // Historical Ball Edit State
  const [editingBallInfo, setEditingBallInfo] = useState<{
    ballEvent: any;
    ballIndex: number;
    inningsNumber: number;
  } | null>(null);

  const {
    isOpen: isPdfModalOpen,
    isGenerating: isExportingPdf,
    stage: pdfStage,
    status: pdfStatus,
    error: pdfError,
    downloadPdf,
    retry: retryPdf,
    close: closePdfModal,
  } = usePdfDownload();

  const handleDownloadPdf = async () => {
    if (!engine) return;
    await downloadPdf(engine.toScorecard());
  };

  // Persist State to Dexie IndexedDB with Serialized Queue & Delta Event Appends
  const lastSavedEventIndexRef = useRef(0);
  const isPersistingRef = useRef(false);
  const pendingPersistEngineRef = useRef<EventSourcedMatchEngine | null>(null);
  const lastScoreActionTimeRef = useRef<number>(0);

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
        groundId: scorecard.groundId,
        location: scorecard.location,
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

      // Load saved squads for dynamic player selection
      try {
        const teams = await FeatureHubRepository.loadTeams();
        setSavedTeams(teams);
      } catch (e) {
        console.error('Failed to load saved teams for squad selection:', e);
      }

      setEngine(eng.clone());
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

  const battingSquad = useMemo(() => {
    if (!engine) return [];
    const currentInn = engine.currentInnings;
    const found = savedTeams.find(
      (t) => t.name.trim().toLowerCase() === currentInn.team.trim().toLowerCase()
    );
    if (found && Array.isArray(found.players) && found.players.length > 0) {
      return found.players;
    }
    if (currentInn.team === engine.teamA && engine.advancedSettings?.teamASquad) {
      return engine.advancedSettings.teamASquad;
    }
    if (currentInn.team === engine.teamB && engine.advancedSettings?.teamBSquad) {
      return engine.advancedSettings.teamBSquad;
    }
    return [];
  }, [engine, savedTeams]);

  const bowlingSquad = useMemo(() => {
    if (!engine) return [];
    const currentInn = engine.currentInnings;
    const found = savedTeams.find(
      (t) => t.name.trim().toLowerCase() === currentInn.bowlingTeam.trim().toLowerCase()
    );
    if (found && Array.isArray(found.players) && found.players.length > 0) {
      return found.players;
    }
    if (currentInn.bowlingTeam === engine.teamA && engine.advancedSettings?.teamASquad) {
      return engine.advancedSettings.teamASquad;
    }
    if (currentInn.bowlingTeam === engine.teamB && engine.advancedSettings?.teamBSquad) {
      return engine.advancedSettings.teamBSquad;
    }
    return [];
  }, [engine, savedTeams]);

  const availableSquadMembers = useMemo(() => {
    if (!engine) return [];
    const currentInn = engine.currentInnings;

    const unavailableNames = new Set<string>();

    currentInn.players.forEach((p) => {
      if (p.isDismissed || p.isOut) {
        const clean = cleanPlayerName(p.name).toLowerCase();
        if (clean && clean !== 'select player') {
          unavailableNames.add(clean);
        }
      }
    });

    if (currentInn.players[currentInn.strikerIdx]) {
      const clean = cleanPlayerName(currentInn.players[currentInn.strikerIdx].name).toLowerCase();
      if (clean && clean !== 'select player') unavailableNames.add(clean);
    }
    if (currentInn.players[currentInn.nonStrikerIdx]) {
      const clean = cleanPlayerName(currentInn.players[currentInn.nonStrikerIdx].name).toLowerCase();
      if (clean && clean !== 'select player') unavailableNames.add(clean);
    }

    const candidatePool = Array.from(
      new Set([
        ...battingSquad,
        ...currentInn.players.map((p) => cleanPlayerName(p.name)),
      ])
    ).filter((n) => n && n !== 'Select Player' && !n.startsWith('Batter '));

    return candidatePool.filter((n) => !unavailableNames.has(n.toLowerCase()));
  }, [engine, battingSquad]);

  const ineligibleBatters = useMemo(() => {
    if (!engine) return [];
    const currentInn = engine.currentInnings;
    const list: IneligiblePlayerInfo[] = [];

    // Dismissed players
    currentInn.players.forEach((p) => {
      if (p.isDismissed || p.isOut) {
        const clean = cleanPlayerName(p.name);
        if (clean && clean !== 'Select Player' && !clean.startsWith('Batter ')) {
          list.push({ name: clean, reason: 'Dismissed' });
        }
      }
    });

    // Batters currently at crease
    if (batterSlotTarget === 'striker' && currentInn.players[currentInn.nonStrikerIdx]) {
      const clean = cleanPlayerName(currentInn.players[currentInn.nonStrikerIdx].name);
      if (clean && clean !== 'Select Player') {
        list.push({ name: clean, reason: 'At Crease' });
      }
    } else if (batterSlotTarget === 'nonStriker' && currentInn.players[currentInn.strikerIdx]) {
      const clean = cleanPlayerName(currentInn.players[currentInn.strikerIdx].name);
      if (clean && clean !== 'Select Player') {
        list.push({ name: clean, reason: 'At Crease' });
      }
    } else if (batterSlotTarget === 'incoming') {
      const nonStrikerClean = cleanPlayerName(currentInn.players[currentInn.nonStrikerIdx]?.name);
      if (nonStrikerClean && nonStrikerClean !== 'Select Player') {
        list.push({ name: nonStrikerClean, reason: 'At Crease' });
      }
    }

    return list;
  }, [engine, batterSlotTarget]);

  const ineligibleBowlers = useMemo(() => {
    if (!engine) return [];
    const currentInn = engine.currentInnings;
    const list: IneligiblePlayerInfo[] = [];

    const allBowlers = Array.from(
      new Set([
        ...bowlingSquad,
        ...currentInn.bowlers.map((b) => cleanPlayerName(b.name)),
      ])
    ).filter(Boolean);

    allBowlers.forEach((name) => {
      const validation = engine.validateBowlerSelection(name);
      if (!validation.allowed) {
        const existing = currentInn.bowlers.find(
          (b) => cleanPlayerName(b.name).toLowerCase() === cleanPlayerName(name).toLowerCase()
        );
        const completedOvers = existing ? Math.floor(existing.ballsBowled / 6) : 0;
        const maxAllowed = engine.getMaxBowlerLimit();
        const isLimitReached = completedOvers >= maxAllowed;
        list.push({
          name,
          reason: isLimitReached ? `Max Limit (${completedOvers}/${maxAllowed} ov)` : 'Prev Over',
        });
      }
    });

    return list;
  }, [engine, bowlingSquad]);

  const bowlerFiguresMap = useMemo(() => {
    if (!engine) return {};
    const map: Record<string, BowlerFigureInfo> = {};
    engine.currentInnings.bowlers.forEach((b) => {
      const clean = cleanPlayerName(b.name).toLowerCase();
      map[clean] = {
        overs: `${Math.floor(b.ballsBowled / 6)}.${b.ballsBowled % 6}`,
        maidens: b.maidens,
        runs: b.runs,
        wickets: b.wickets,
      };
    });
    return map;
  }, [engine]);

  // Automated live DLS par score calculation for 2nd innings (placed before early returns)
  const isDlsApplied = Boolean(engine?.advancedSettings?.dlsApplied);

  const liveDls = useMemo(() => {
    if (!isDlsApplied || !engine || engine.currentInningsNumber !== 2 || !engine.firstInnings) return null;
    const currentInn = engine.currentInnings;
    const originalOvers = engine.advancedSettings?.originalTotalOvers || engine.totalOvers;
    const team1TotalRuns = engine.firstInnings.totalRuns;
    const team2OversAvailable = engine.totalOvers;
    const team2WicketsLost = currentInn.totalWickets;
    const team2CurrentRuns = currentInn.totalRuns;
    const team2CurrentOversBowled = currentInn.totalBalls / 6;
    const matchType = (originalOvers <= 20 ? 'T20' : 'ODI') as 'T20' | 'ODI';

    return DlsEngine.calculate({
      originalOvers,
      team1TotalRuns,
      team2OversAvailable,
      team2WicketsLost,
      team2CurrentOversBowled,
      team2CurrentRuns,
      matchType,
    });
  }, [isDlsApplied, engine]);

  if (loading || !engine) {
    return (
      <div className="py-2 sm:py-4">
        <ScoreboardSkeleton />
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
    const now = performance.now();
    if (now - lastScoreActionTimeRef.current < 200) {
      return;
    }
    lastScoreActionTimeRef.current = now;

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

    if (runs === 4) {
      HapticFeedbackService.boundaryFour();
    } else if (runs === 6) {
      HapticFeedbackService.boundarySix();
    } else {
      HapticFeedbackService.light();
    }

    setExtraFlag('none');
    const cloned = engine.clone();
    setEngine(cloned);
    persistState(cloned);

    // Check if innings concluded
    checkInningsCompletion(cloned);
  };

  const handleConfirmOut = (payload: OutConfirmPayload) => {
    const now = performance.now();
    if (now - lastScoreActionTimeRef.current < 200) {
      return;
    }
    lastScoreActionTimeRef.current = now;
    HapticFeedbackService.wicket();

    engine.scoreBall({
      runsScored: payload.runsScored,
      isWicket: true,
      dismissalType: payload.dismissalType,
      fielderName: payload.fielderName,
      newBatsmanName: payload.newBatsmanName,
      isStrikerOut: payload.isStrikerOut,
      isWide: payload.isWide,
      isNoBall: payload.isNoBall,
      isByes: payload.isByes,
      isLegByes: payload.isLegByes,
    });

    setShowWicketModal(false);
    setExtraFlag('none');
    setDismissalType('Bowled');
    const cloned = engine.clone();
    setEngine(cloned);
    persistState(cloned);

    // If incoming batter was not selected in OutModal, automatically open squad batter selector
    const isLastWkt = cloned.currentInnings.totalWickets >= cloned.maxWickets;
    if (!payload.newBatsmanName && !isLastWkt) {
      openBatterSelector(payload.isStrikerOut ? 'striker' : 'nonStriker');
    }

    checkInningsCompletion(cloned);
  };

  const handleUndo = () => {
    const now = performance.now();
    if (now - lastScoreActionTimeRef.current < 200) {
      return;
    }
    lastScoreActionTimeRef.current = now;

    const success = engine.undo();
    if (success) {
      lastSavedEventIndexRef.current = 0;
      const cloned = engine.clone();
      setEngine(cloned);
      persistState(cloned);
    }
  };

  const handleSwapStrike = () => {
    engine.swapStrike();
    const cloned = engine.clone();
    setEngine(cloned);
    persistState(cloned);
  };

  // Synchronize keyboard handlers ref on every render without reattaching listeners
  handlersRef.current = {
    handleScoreRun,
    handleUndo,
    handleSwapStrike,
  };

  const handleChangeBowler = (bowlerName: string) => {
    const formatted = cleanPlayerName(bowlerName).trim();
    if (!formatted) return;

    const validation = engine.validateBowlerSelection(formatted);
    if (!validation.allowed) {
      setBowlerError(validation.reason || 'This bowler is not permitted to bowl.');
      setToastMessage(validation.reason || 'This bowler is not permitted to bowl.');
      return;
    }

    const res = engine.changeBowler(formatted);
    if (!res.success) {
      setBowlerError(res.reason || 'Unable to assign bowler.');
      setToastMessage(res.reason || 'Unable to assign bowler.');
      return;
    }

    setBowlerError(null);
    setShowPlayerSelectModal(false);
    const cloned = engine.clone();
    setEngine(cloned);
    persistState(cloned);
  };

  const handleSelectSquadPlayer = (playerName: string) => {
    if (!engine) return;
    const formatted = cleanPlayerName(playerName).trim();
    if (!formatted) return;

    if (playerSelectType === 'batter') {
      const currentInn = engine.currentInnings;
      let targetPlayerId: string | undefined;

      if (batterSlotTarget === 'striker') {
        targetPlayerId = currentInn.players[currentInn.strikerIdx]?.id;
      } else if (batterSlotTarget === 'nonStriker') {
        targetPlayerId = currentInn.players[currentInn.nonStrikerIdx]?.id;
      } else if (batterSlotTarget === 'incoming') {
        targetPlayerId = currentInn.players[currentInn.strikerIdx]?.id;
      }

      if (targetPlayerId) {
        const res = engine.renamePlayer(targetPlayerId, formatted);
        if (res.success) {
          const cloned = engine.clone();
          setEngine(cloned);
          persistState(cloned);
          setToastMessage(`Batter updated: ${formatted}`);
        } else {
          setToastMessage(res.error || 'Failed to update batter.');
        }
      }
    } else {
      // Bowler selection
      const currentInn = engine.currentInnings;
      if (currentInn.isOverComplete || currentInn.thisOverLog.length === 0) {
        handleChangeBowler(formatted);
      } else {
        const activeBowler = currentInn.bowlers[currentInn.currentBowlerIdx];
        if (activeBowler) {
          const res = engine.renamePlayer(activeBowler.id, formatted);
          if (res.success) {
            const cloned = engine.clone();
            setEngine(cloned);
            persistState(cloned);
            setToastMessage(`Bowler updated: ${formatted}`);
          } else {
            setToastMessage(res.error || 'Failed to update bowler.');
          }
        }
      }
    }
  };

  const handleRetirePlayer = (isStrikerOut: boolean, type: 'Retire Out' | 'Retire Hurt') => {
    engine.retirePlayer(isStrikerOut, type);
    setShowRetireModal(false);
    const cloned = engine.clone();
    setEngine(cloned);
    persistState(cloned);
    checkInningsCompletion(cloned);
  };

  const handleAwardPenalty = () => {
    engine.awardPenaltyRuns(Number(penaltyRuns) || 5, awardedToBatting, penaltyReason);
    setShowPenaltyModal(false);
    const cloned = engine.clone();
    setEngine(cloned);
    persistState(cloned);
    checkInningsCompletion(cloned);
  };

  const handleApplyDlsTarget = async (revisedTarget: number, revisedTotalOvers: number) => {
    if (!engine) return;
    if (isNaN(revisedTarget) || revisedTarget <= 0 || isNaN(revisedTotalOvers) || revisedTotalOvers <= 0) {
      setToastMessage('Invalid DLS target calculation');
      return;
    }
    try {
      engine.applyDlsTarget(revisedTarget, revisedTotalOvers);
      setShowDlsModal(false);
      const cloned = engine.clone();
      setEngine(cloned);
      await persistState(cloned);
      await checkInningsCompletion(cloned);
      setToastMessage('DLS Target applied successfully');
    } catch (err: any) {
      console.error('Failed to apply DLS target', err);
      setToastMessage(err?.message || 'Failed to apply DLS target');
    }
  };

  const handleResetDls = async () => {
    if (!engine) return;
    try {
      engine.resetDls();
      setShowDlsModal(false);
      const cloned = engine.clone();
      setEngine(cloned);
      await persistState(cloned);
      setToastMessage('DLS disabled and standard match restored');
    } catch (err: any) {
      console.error('Failed to reset DLS', err);
      setToastMessage(err?.message || 'Failed to reset DLS');
    }
  };

  const handleConcludeDlsMatch = async () => {
    if (!engine) return;
    try {
      engine.concludeMatchWithDls();
      setShowDlsModal(false);
      const cloned = engine.clone();
      setEngine(cloned);
      await persistState(cloned);
      await checkInningsCompletion(cloned);
    } catch (err: any) {
      console.error('Failed to conclude match with DLS', err);
    }
  };

  const checkInningsCompletion = async (eng: EventSourcedMatchEngine = engine) => {
    if (eng.isMatchCompleted) {
      eng.completeMatch();
      await persistState(eng);

      // Super Over Parent Linkage: Update parent match result & tournament if applicable
      if (eng.advancedSettings?.isSuperOver && eng.advancedSettings?.parentMatchId) {
        try {
          const outcome = eng.calculateResult();
          const parent = await MatchRepository.getMatch(eng.advancedSettings.parentMatchId);
          if (parent) {
            const updatedParent: MatchScorecard = {
              ...parent,
              winner: outcome.winner,
              loser: outcome.loser,
              result: outcome.winner
                ? `${outcome.winner} won via Super Over`
                : 'Super Over Tied',
              superOverMatchId: eng.id,
              superOverResult: {
                winner: outcome.winner || 'Tied',
                resultText: outcome.resultText,
                teamAScore: `${eng.firstInnings?.totalRuns}/${eng.firstInnings?.totalWickets}`,
                teamBScore: `${eng.secondInnings?.totalRuns}/${eng.secondInnings?.totalWickets}`,
              },
            };
            await MatchRepository.updateMatch(updatedParent);

            if (parent.advancedSettings?.tournamentId && parent.advancedSettings?.fixtureId && outcome.winner) {
              const { FeatureHubRepository } = await import('@/infrastructure/storage/FeatureHubRepository');
              const { TournamentEngine } = await import('@/domain/tournament/TournamentEngine');
              const tourney = await FeatureHubRepository.getTournament(parent.advancedSettings.tournamentId);
              if (tourney) {
                const updated = TournamentEngine.recordWinner({
                  tournament: tourney,
                  fixtureId: parent.advancedSettings.fixtureId,
                  winner: outcome.winner,
                });
                await FeatureHubRepository.saveTournament(updated);
              }
            }
          }
        } catch (superErr) {
          console.warn('Super Over parent update error:', superErr);
        }
      }

      router.push(`/matches/summary/${eng.id}`);
    } else if (eng.currentInningsNumber === 1 && eng.isInningsOver) {
      setShowInningsTransitionModal(true);
    }
  };

  const handleStartSecondInnings = () => {
    engine.startSecondInnings(
      inn2Striker.trim() || 'Batter 1',
      inn2NonStriker.trim() || 'Batter 2',
      inn2Bowler.trim() || 'Bowler 1'
    );
    setShowInningsTransitionModal(false);
    const cloned = engine.clone();
    setEngine(cloned);
    persistState(cloned);
  };

  const handleOpenEditBall = (overBallIdx: number) => {
    if (!engine) return;
    const currentInningsEvents = engine.events.filter(
      (e) => e.type === 'BALL_SCORED' && ((e.payload.inningsNumber ?? 1) === engine.currentInningsNumber)
    );
    const currentOverCount = engine.currentInnings.thisOverLog.length;
    const targetIdx = currentInningsEvents.length - currentOverCount + overBallIdx;
    if (targetIdx >= 0 && targetIdx < currentInningsEvents.length) {
      setEditingBallInfo({
        ballEvent: currentInningsEvents[targetIdx],
        ballIndex: targetIdx,
        inningsNumber: engine.currentInningsNumber,
      });
    }
  };

  const handleSaveBallEdit = (ballIndex: number, inningsNumber: number, updatedInput: BallInput) => {
    if (!engine) return;
    const success = engine.editHistoricalBall(ballIndex, inningsNumber, updatedInput);
    if (success) {
      const cloned = engine.clone();
      setEngine(cloned);
      persistState(cloned);
      checkInningsCompletion(cloned);
    }
  };

  const handleRenamePlayer = async (playerId: string, newName: string) => {
    if (!engine) return;
    const res = engine.renamePlayer(playerId, newName);
    if (!res.success) {
      alert(res.error || 'Failed to rename player.');
      return;
    }
    const cloned = engine.clone();
    setEngine(cloned);
    await persistState(cloned);
    setToastMessage(`Player name updated to ${res.newName || newName}`);
    setTimeout(() => setToastMessage(null), 3000);

    if (selectedBatsman && (selectedBatsman.player.id === playerId || cleanPlayerName(selectedBatsman.player.name).toLowerCase() === cleanPlayerName(res.oldName || '').toLowerCase())) {
      setSelectedBatsman({
        ...selectedBatsman,
        player: { ...selectedBatsman.player, name: res.newName || newName },
      });
    }
    if (selectedBowler) {
      const currentB = 'bowler' in selectedBowler ? selectedBowler.bowler : selectedBowler;
      if (
        currentB.id === playerId ||
        cleanPlayerName(currentB.name).toLowerCase() === cleanPlayerName(res.oldName || '').toLowerCase()
      ) {
        if ('bowler' in selectedBowler) {
          setSelectedBowler({
            ...selectedBowler,
            bowler: {
              ...selectedBowler.bowler,
              name: res.newName || newName,
            },
          });
        } else {
          setSelectedBowler({
            ...selectedBowler,
            name: res.newName || newName,
          });
        }
      }
    }
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

  // Active Bowler derivations for detail profile modal
  const activeBowler: Bowler | null = selectedBowler
    ? 'bowler' in selectedBowler
      ? selectedBowler.bowler
      : selectedBowler
    : null;

  const bowlerIsCurrentlyBowling: boolean = selectedBowler
    ? 'isCurrentlyBowling' in selectedBowler && selectedBowler.isCurrentlyBowling !== undefined
      ? Boolean(selectedBowler.isCurrentlyBowling)
      : currentBowler?.name === activeBowler?.name && !inn.isOverComplete
    : false;

  const bowlerOngoingOverLog: string[] =
    selectedBowler && 'ongoingOverLog' in selectedBowler && selectedBowler.ongoingOverLog !== undefined
      ? selectedBowler.ongoingOverLog
      : bowlerIsCurrentlyBowling
      ? inn.thisOverLog
      : [];

  const bowlerOngoingMatchOver: number =
    selectedBowler && 'ongoingMatchOver' in selectedBowler && selectedBowler.ongoingMatchOver !== undefined
      ? selectedBowler.ongoingMatchOver
      : Math.floor(inn.totalBalls / 6) + 1;

  const bowlerFallOfWickets: FallOfWicket[] =
    selectedBowler && 'fallOfWickets' in selectedBowler && selectedBowler.fallOfWickets !== undefined
      ? selectedBowler.fallOfWickets
      : inn.fallOfWickets;

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
      <>
        <IntegratedScoreboard
          engine={engine}
          selectedTheme={selectedTheme}
          onClose={() => {
            setSelectedBatsman(null);
            setSelectedBowler(null);
            closeView();
          }}
          onSelectBatsman={setSelectedBatsman}
          onSelectBowler={setSelectedBowler}
          initialInnings={engine.currentInningsNumber as 1 | 2}
        />

        {/* ── BATSMAN & BOWLER FULL PROFILE MODALS ── */}
        <BatsmanProfileModal
          player={selectedBatsman?.player || null}
          isOpen={!!selectedBatsman}
          onClose={() => setSelectedBatsman(null)}
          isStriker={selectedBatsman?.isStriker}
          isNonStriker={selectedBatsman?.isNonStriker}
          battingPosition={selectedBatsman?.battingPosition}
          partnerships={selectedBatsman?.partnerships ?? inn.pastPartnerships}
          fallOfWickets={selectedBatsman?.fallOfWickets ?? inn.fallOfWickets}
          onRenamePlayer={handleRenamePlayer}
        />

        <BowlerProfileModal
          bowler={activeBowler}
          isOpen={!!selectedBowler}
          onClose={() => setSelectedBowler(null)}
          isCurrentlyBowling={bowlerIsCurrentlyBowling}
          ongoingOverLog={bowlerOngoingOverLog}
          ongoingMatchOver={bowlerOngoingMatchOver}
          fallOfWickets={bowlerFallOfWickets}
          advancedSettings={engine.advancedSettings}
          onRenamePlayer={handleRenamePlayer}
        />

        {toastMessage && (
          <div className="fixed bottom-6 right-6 z-50 bg-emerald-600 text-white font-bold text-xs py-2.5 px-4 rounded-xl shadow-2xl animate-fade-in flex items-center gap-2">
            <span>{toastMessage}</span>
          </div>
        )}
      </>
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
                {engine.advancedSettings?.isSuperOver && (
                  <span className="bg-purple-600 text-white font-black text-[9px] px-1.5 py-0.5 rounded-full uppercase tracking-wider shrink-0 animate-pulse">
                    ⚡ Super Over
                  </span>
                )}
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
                    <span className="text-white/70 font-bold tracking-wider">{isDlsApplied ? 'DLS TARGET' : 'TARGET'}</span>
                    <span className="font-bold num-font text-[#34C759] tracking-normal"><MotionNumber value={engine.targetScore} /></span>
                    <span className="text-white/40 font-bold px-1 select-none">|</span>
                    <span className="text-white/70 font-bold tracking-wider">RR</span>
                    <span className="font-bold num-font text-white tracking-normal"><MotionNumber value={rrr.toFixed(2)} mode="decimal" /></span>
                  </div>

                  {/* 2. CRR: CRR 6.00 */}
                  <div className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-white/90 select-none leading-tight text-left">
                    <span className="text-white/70 font-bold tracking-wider">CRR</span>
                    <span className="font-bold num-font text-white tracking-normal"><MotionNumber value={crr.toFixed(2)} mode="decimal" /></span>
                  </div>

                  {/* 3. NEED 131 RUNS FROM 30 BALLS */}
                  <div className="flex items-center flex-wrap gap-x-1.5 gap-y-0.5 text-xs sm:text-sm font-bold tracking-normal text-white/90 select-none leading-tight text-left pt-0.5">
                    <span className="text-white/70 font-bold tracking-wider">NEED</span>
                    <span className="font-bold num-font text-[#34C759] tracking-normal"><MotionNumber value={neededRuns} /></span>
                    <span className="text-white/70 font-bold tracking-wider">RUNS FROM</span>
                    <span className="font-bold num-font text-white tracking-normal"><MotionNumber value={remainingBalls} /></span>
                    <span className="text-white/70 font-bold tracking-wider">BALLS</span>
                  </div>

                  {/* 4. Automated Live DLS Par Pill */}
                  {isDlsApplied && liveDls && (
                    <div className="flex items-center flex-wrap gap-1 text-[11px] sm:text-xs font-semibold select-none leading-tight text-left pt-0.5" title="Live DLS Par Score & Rain Stoppage Target">
                      <span className="text-cyan-300 font-bold tracking-wider">DLS PAR</span>
                      <span className="font-bold num-font text-white tracking-normal"><MotionNumber value={liveDls.parScore} /></span>
                      <span className="text-white/40 font-bold px-0.5">•</span>
                      {inn.totalRuns > liveDls.parScore ? (
                        <span className="font-bold text-emerald-400">+{inn.totalRuns - liveDls.parScore} Ahead</span>
                      ) : inn.totalRuns < liveDls.parScore ? (
                        <span className="font-bold text-rose-400">{inn.totalRuns - liveDls.parScore} Behind</span>
                      ) : (
                        <span className="font-bold text-amber-300">Level</span>
                      )}
                      {!liveDls.isMinimumOversMet && (
                        <span className="text-[10px] text-amber-300/80 font-normal">({liveDls.minimumOversRequired} ov min)</span>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-start text-left min-w-0 w-full space-y-1 pt-0.5">
                  <div className="font-bold text-xs sm:text-sm text-white/90 tracking-normal leading-tight text-left">
                    1st Innings
                  </div>
                  <div className="flex items-center gap-1.5 text-xs sm:text-sm tracking-normal leading-tight text-left">
                    <span className="text-white/70 font-bold tracking-wider">CRR:</span>
                    <span className="font-bold num-font text-white tracking-normal"><MotionNumber value={crr.toFixed(2)} mode="decimal" /></span>
                    <span className="text-white/40 font-bold px-0.5"></span>
                    <span className="text-white/70 font-bold tracking-wider">Proj:</span>
                    <span className="font-bold num-font text-[#34C759] tracking-normal"><MotionNumber value={Math.round(crr * engine.totalOvers)} /></span>
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
                    <MotionNumber value={inn.oversString} />
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
            maxOversLimit={engine.advancedSettings?.maxOversPerBowler}
          />
        </div>

        {/* 3. OVER DELIVERIES TIMELINE STRIP + QUICK ACTIONS */}
        <div className="bg-[var(--card)] border border-[var(--border)] flex items-center justify-between shrink-0 rounded-xl gap-2 sm:gap-3 min-w-0 px-3 py-2 sm:px-3.5 sm:py-2.5 shadow-xs">
          <div className="flex items-center shrink-0 text-[var(--foreground)]">
            <span className="text-[15px] sm:text-base font-extrabold tracking-tight select-none">Over</span>
          </div>

          <div
            ref={mobileOverScrollRef}
            data-testid="mobile-over-scroll-container"
            className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1 overflow-x-auto no-scrollbar scroll-smooth py-0.5 justify-start sm:justify-center"
          >
            {inn.thisOverLog.length === 0 ? (
              <span className="italic truncate text-[var(--muted-foreground)] text-xs sm:text-[13px] px-1 select-none">
                Awaiting first ball...
              </span>
            ) : (
              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 pr-1">
                <AnimatePresence mode="popLayout" initial={false}>
                  {inn.thisOverLog.map((ball, idx) => (
                    <OverBallButton
                      key={`over_ball_${idx}_${ball}`}
                      ball={ball}
                      idx={idx}
                      onEdit={handleOpenEditBall}
                    />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>

          <div className="flex items-center shrink-0 gap-1.5">
            <button
              type="button"
              onClick={handleUndo}
              className="btn-secondary !py-1.5 sm:!py-2 !px-2.5 sm:!px-3 text-xs sm:text-sm font-bold gap-1 sm:gap-1.5 hover:!border-amber-500/40 text-amber-500 active:scale-95 transition-all"
              title="Undo last delivery"
            >
              <RotateCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-500" />
              <span>Undo</span>
            </button>
            <button
              type="button"
              onClick={handleSwapStrike}
              className="btn-secondary !py-1.5 sm:!py-2 !px-2.5 sm:!px-3 text-xs sm:text-sm font-bold gap-1 sm:gap-1.5 hover:!border-emerald-500/40 text-emerald-600 dark:text-emerald-400 active:scale-95 transition-all"
              title="Swap Strike"
            >
              <ArrowRightLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Swap</span>
            </button>
          </div>
        </div>

        {/* Over Complete Alert (Inline) */}
        <ToastNotification show={inn.isOverComplete}>
          {inn.isOverComplete && (
            <div className="bg-amber-500/15 border border-amber-500/40 flex items-center justify-between shrink-0 px-3 rounded-xl py-2 gap-2 mt-1">
              <span className="font-extrabold dark:text-amber-400 truncate text-amber-600 text-sm">
                Over complete! Select new bowler.
              </span>
              <button
                type="button"
                onClick={openBowlerModal}
                className="btn-primary !bg-amber-500 hover:!bg-amber-400 !text-slate-950 !py-1.5 !px-3 text-xs font-black shrink-0 shadow-none"
              >
                Select Bowler
              </button>
            </div>
          )}
        </ToastNotification>

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
              className={`py-2 px-1 xs:px-1.5 rounded-xl text-xs font-extrabold min-h-btn transition-all duration-150 border text-center active:scale-[0.97] leading-tight flex items-center justify-center break-words select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 ${
                extraFlag === item.id
                  ? item.id === 'wicket'
                    ? 'bg-red-600 text-white border-red-500 shadow-sm font-black'
                    : 'bg-amber-500 text-slate-950 border-amber-400 shadow-sm font-black'
                  : 'bg-[var(--muted)] text-[var(--foreground)] border-[var(--border)] hover:bg-[var(--muted)]/80 hover:border-slate-500/40'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* 5. RUN BUTTONS KEYPAD (3x2 Grid: 0, 1, 2 / 3, 4, 6) */}
        <div className="grid shrink-0 gap-card grid-cols-3 mt-1">
          {[
            { run: 0, label: '0 Dot', color: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700/60 hover:border-slate-400 dark:hover:border-slate-500' },
            { run: 1, label: '1 Single', color: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/40 hover:border-emerald-400 dark:hover:border-emerald-600' },
            { run: 2, label: '2 Double', color: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 border-emerald-300 dark:border-emerald-700/40 hover:border-emerald-500' },
            { run: 3, label: '3 Three', color: 'bg-emerald-200 dark:bg-emerald-800/40 text-emerald-900 dark:text-emerald-100 border-emerald-400 dark:border-emerald-600/40 hover:border-emerald-600' },
            { run: 4, label: '4 FOUR', color: 'bg-blue-600 hover:bg-blue-500 text-white border-blue-500 shadow-sm' },
            { run: 6, label: '6 SIX', color: 'bg-purple-600 hover:bg-purple-500 text-white border-purple-500 shadow-sm' },
          ].map((item) => (
            <button
              key={item.run}
              type="button"
              disabled={inn.isOverComplete || engine.isInningsOver}
              onClick={() => handleScoreRun(item.run)}
              className={`py-4 sm:py-5 rounded-2xl text-lg xs:text-xl font-black min-h-[64px] sm:min-h-[72px] transition-all duration-150 active:scale-[0.96] border disabled:opacity-40 disabled:scale-100 disabled:pointer-events-none flex items-center justify-center select-none shadow-xs ${item.color}`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* 6. BOTTOM UTILITY & ACTION SECTION (COMPACT & CLEAN, NO REDUNDANT SCOREBOARD BUTTON) */}
        <div className="shrink-0 mt-auto space-y-2 pb-2">
          <div className="grid gap-2 grid-cols-4">
            <button
              type="button"
              onClick={() => setShowRetireModal(true)}
              className="btn-secondary !text-red-500 hover:!border-red-500/40 !py-2.5 !rounded-xl text-xs gap-1.5"
              title="Retire Player"
            >
              <UserX className="w-3.5 h-3.5 text-red-500" />
              <span className="truncate">Retire</span>
            </button>

            <button
              type="button"
              onClick={() => setShowPenaltyModal(true)}
              className="btn-secondary !text-purple-500 hover:!border-purple-500/40 !py-2.5 !rounded-xl text-xs gap-1.5"
              title="Award Penalty"
            >
              <Flag className="w-3.5 h-3.5 text-purple-500" />
              <span className="truncate">Penalty</span>
            </button>

            <button
              type="button"
              onClick={() => setShowDlsModal(true)}
              className="btn-secondary !text-cyan-500 hover:!border-cyan-500/40 !py-2.5 !rounded-xl text-xs gap-1.5"
              title="DLS / Rain Target Calculator"
            >
              <CloudRain className="w-3.5 h-3.5 text-cyan-500" />
              <span className="truncate">DLS</span>
            </button>

            {engine.isMatchCompleted ? (
              <button
                type="button"
                onClick={handleDownloadPdf}
                className="btn-primary !py-2.5 !rounded-xl text-xs gap-1.5"
                title="Download PDF Scorecard"
              >
                <FileText className="w-3.5 h-3.5" />
                <span className="truncate">PDF</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowMatchInfoModal(true)}
                className="btn-secondary !text-blue-500 hover:!border-blue-500/40 !py-2.5 !rounded-xl text-xs gap-1.5"
                title="Match Info"
              >
                <Info className="w-3.5 h-3.5 text-blue-500" />
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
              {engine.advancedSettings?.isSuperOver && (
                <span className="bg-purple-600 font-extrabold tracking-wider shadow-xs shrink-0 py-0.5 rounded-full text-xs px-2.5 text-white animate-pulse">
                  ⚡ SUPER OVER (MAX 2 WKTS)
                </span>
              )}
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
                  <span className="text-white/70 font-bold tracking-wider">{isDlsApplied ? 'DLS TARGET' : 'TARGET'}</span>
                  <span className="font-bold num-font text-[#34C759] tracking-normal"><MotionNumber value={engine.targetScore} /></span>
                  <span className="text-white/40 font-bold px-1 select-none">|</span>
                  <span className="text-white/70 font-bold tracking-wider">RR</span>
                  <span className="font-bold num-font text-white tracking-normal"><MotionNumber value={rrr.toFixed(2)} mode="decimal" /></span>
                </div>

                {/* 2. CRR: CRR 6.00 */}
                <div className="flex items-center gap-2 text-sm font-semibold text-white/90 select-none leading-tight text-left">
                  <span className="text-white/70 font-bold tracking-wider">CRR</span>
                  <span className="font-bold num-font text-white tracking-normal"><MotionNumber value={crr.toFixed(2)} mode="decimal" /></span>
                </div>

                {/* 3. NEED 131 RUNS FROM 30 BALLS */}
                <div className="flex items-center gap-1.5 text-sm font-bold tracking-normal text-white/90 select-none leading-tight text-left pt-0.5">
                  <span className="text-white/70 font-bold tracking-wider">NEED</span>
                  <span className="font-bold num-font text-[#34C759] tracking-normal"><MotionNumber value={neededRuns} /></span>
                  <span className="text-white/70 font-bold tracking-wider">RUNS FROM</span>
                  <span className="font-bold num-font text-white tracking-normal"><MotionNumber value={remainingBalls} /></span>
                  <span className="text-white/70 font-bold tracking-wider">BALLS</span>
                </div>

                {/* 4. Automated Live DLS Par Pill */}
                {isDlsApplied && liveDls && (
                  <div className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold select-none leading-tight text-left pt-0.5" title="Live DLS Par Score & Rain Stoppage Target">
                    <span className="text-cyan-300 font-bold tracking-wider">DLS PAR</span>
                    <span className="font-bold num-font text-white tracking-normal"><MotionNumber value={liveDls.parScore} /></span>
                    <span className="text-white/40 font-bold px-0.5">•</span>
                    {inn.totalRuns > liveDls.parScore ? (
                      <span className="font-bold text-emerald-400">+{inn.totalRuns - liveDls.parScore} Ahead</span>
                    ) : inn.totalRuns < liveDls.parScore ? (
                      <span className="font-bold text-rose-400">{inn.totalRuns - liveDls.parScore} Behind</span>
                    ) : (
                      <span className="font-bold text-amber-300">Level</span>
                    )}
                    {!liveDls.isMinimumOversMet && (
                      <span className="text-[10px] text-amber-300/80 font-normal">({liveDls.minimumOversRequired} ov min)</span>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-start text-left min-w-0 space-y-1.5 pt-0.5">
                <div className="font-bold text-sm text-white/90 tracking-normal leading-tight text-left">
                  1st Innings
                </div>
                <div className="flex items-center gap-2 text-sm tracking-normal leading-tight text-left">
                  <span className="text-white/70 font-bold tracking-wider">CRR:</span>
                  <span className="font-bold num-font text-white tracking-normal"><MotionNumber value={crr.toFixed(2)} mode="decimal" /></span>
                  <span className="text-white/40 font-bold px-1 select-none"></span>
                  <span className="text-white/70 font-bold tracking-wider">Proj:</span>
                  <span className="font-bold num-font text-[#34C759] tracking-normal"><MotionNumber value={Math.round(crr * engine.totalOvers)} /></span>
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
                    <MotionNumber value={inn.oversString} />
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

      {/* OVER DELIVERIES TIMELINE STRIP */}
      <div className="bg-[var(--card)] border border-[var(--border)] flex items-center justify-between shadow-xs p-3 rounded-xl gap-3">
        <div className="flex items-center font-bold shrink-0 text-sm text-[var(--foreground)]">
          <span className="text-base font-extrabold tracking-tight select-none">Over</span>
        </div>

        <div
          ref={desktopOverScrollRef}
          data-testid="desktop-over-scroll-container"
          className="flex items-center justify-start sm:justify-center gap-2 min-w-0 flex-1 overflow-x-auto no-scrollbar scroll-smooth py-0.5"
        >
          {inn.thisOverLog.length === 0 ? (
            <span className="italic text-xs sm:text-sm text-[var(--muted-foreground)] select-none">
              Awaiting first delivery of this over...
            </span>
          ) : (
            <div className="flex items-center gap-2 justify-center shrink-0 pr-1">
              <AnimatePresence mode="popLayout" initial={false}>
                {inn.thisOverLog.map((ball, idx) => (
                  <OverBallButton
                    key={`desktop_over_${idx}_${ball}`}
                    ball={ball}
                    idx={idx}
                    isDesktop
                    onEdit={handleOpenEditBall}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Swap Strike Action */}
        <button
          type="button"
          onClick={handleSwapStrike}
          className="shrink-0 btn-secondary !py-1.5 sm:!py-2 !px-3 sm:!px-3.5 text-xs sm:text-sm font-bold gap-1.5 hover:!border-emerald-500/40 text-emerald-600 dark:text-emerald-400 active:scale-95 transition-all"
          title="Swap Striker and Non-Striker"
        >
          <ArrowRightLeft className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          <span className="hidden sm:inline font-bold">Swap Strike</span>
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
              onOpenBatterSelector={(isStriker) =>
                openBatterSelector(isStriker ? 'striker' : 'nonStriker')
              }
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
              onOpenBowlerSelector={openBowlerSelector}
              maxOversLimit={engine.advancedSettings?.maxOversPerBowler}
            />
          </div>
        </div>

        {/* CENTER: PRIMARY SCORING PAD KEYPAD */}
        <div className="space-y-5">
          <div className="bg-[var(--card)] border border-[var(--border)] shadow-sm p-6 md:p-8 rounded-2xl space-y-5">
            {/* Over Complete Alert */}
            <ToastNotification show={inn.isOverComplete}>
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
                    className="btn-primary !bg-amber-500 hover:!bg-amber-400 !text-slate-950 !py-2 !px-4 text-sm font-black shrink-0 shadow-none"
                  >
                    Select Bowler
                  </button>
                </div>
              )}
            </ToastNotification>

            {/* Bowler Error Notification */}
            <ToastNotification show={!!bowlerError}>
              {bowlerError && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 p-3 rounded-xl text-caption font-bold flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
                    <span>{bowlerError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setBowlerError(null)}
                    className="p-1 rounded-md text-[var(--muted-foreground)] hover:text-red-500 shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </ToastNotification>

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
                    className={`py-2.5 sm:py-3 px-2 sm:px-3 rounded-xl text-xs sm:text-sm font-bold sm:font-extrabold min-h-[48px] sm:min-h-[52px] transition-all duration-150 border text-center select-none active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 ${
                      extraFlag === item.id
                        ? item.id === 'wicket'
                          ? 'bg-red-600 text-white border-red-500 shadow-md shadow-red-600/30 font-black'
                          : 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/30 font-black'
                        : 'bg-[var(--muted)] text-[var(--foreground)] border-[var(--border)] hover:border-emerald-500/50 hover:bg-[var(--muted)]/80'
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
                  { run: 0, label: '0 Dot', color: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700/60 hover:border-slate-400 dark:hover:border-slate-500' },
                  { run: 1, label: '1 Single', color: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/40 hover:border-emerald-400 dark:hover:border-emerald-600' },
                  { run: 2, label: '2 Double', color: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 border-emerald-300 dark:border-emerald-700/40 hover:border-emerald-500' },
                  { run: 3, label: '3 Three', color: 'bg-emerald-200 dark:bg-emerald-800/40 text-emerald-900 dark:text-emerald-100 border-emerald-400 dark:border-emerald-600/40 hover:border-emerald-600' },
                  { run: 4, label: '4 FOUR', color: 'bg-blue-600 hover:bg-blue-500 text-white border-blue-500 shadow-md shadow-blue-600/20' },
                  { run: 6, label: '6 SIX', color: 'bg-purple-600 hover:bg-purple-500 text-white border-purple-500 shadow-md shadow-purple-600/20' },
                ].map((item) => (
                  <button
                    key={item.run}
                    type="button"
                    disabled={inn.isOverComplete || engine.isInningsOver}
                    onClick={() => handleScoreRun(item.run)}
                    className={`py-4 sm:py-5 md:py-8 rounded-xl sm:rounded-2xl text-lg sm:text-xl md:text-2xl font-black min-h-[64px] sm:min-h-[72px] transition-all duration-150 hover:scale-[1.02] active:scale-[0.97] border disabled:opacity-40 disabled:scale-100 disabled:pointer-events-none flex items-center justify-center select-none shadow-xs ${item.color}`}
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
                className="btn-secondary !flex-col !py-3 !rounded-xl min-h-[56px] text-sm gap-1 hover:!border-amber-500/40 text-amber-500"
              >
                <RotateCcw className="text-amber-500 w-5 h-5" />
                <span className="font-bold">Undo</span>
              </button>

              <button
                type="button"
                onClick={handleSwapStrike}
                className="btn-secondary !flex-col !py-3 !rounded-xl min-h-[56px] text-sm gap-1 hover:!border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
              >
                <ArrowRightLeft className="text-emerald-600 dark:text-emerald-400 w-5 h-5" />
                <span className="font-bold">Swap Strike</span>
              </button>

              <button
                type="button"
                onClick={() => setShowRetireModal(true)}
                className="btn-secondary !flex-col !py-3 !rounded-xl min-h-[56px] text-sm gap-1 hover:!border-red-500/40 text-red-500"
              >
                <UserX className="text-red-500 w-5 h-5" />
                <span className="font-bold">Retire</span>
              </button>

              <button
                type="button"
                onClick={() => setShowPenaltyModal(true)}
                className="btn-secondary !flex-col !py-3 !rounded-xl min-h-[56px] text-sm gap-1 hover:!border-purple-500/40 text-purple-500"
              >
                <Flag className="text-purple-500 w-5 h-5" />
                <span className="font-bold">Penalty</span>
              </button>
            </div>

            {/* Bottom Action Cards (Equal Width, Balanced) */}
            <div className="grid border-t border-[var(--border)] gap-3 pt-4 grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))]">

              <button
                type="button"
                onClick={() => toggleView('matches')}
                className={`btn-secondary !py-3 !px-4 !rounded-xl text-sm md:text-base font-extrabold flex items-center justify-center gap-2 min-h-[52px] ${
                  activeView === 'matches'
                    ? '!bg-emerald-600 !text-white !border-emerald-500 shadow-sm'
                    : 'hover:!border-blue-500/40'
                }`}
              >
                <History className="text-blue-500 w-5 h-5" />
                <span>Matches</span>
              </button>

              <button
                type="button"
                onClick={() => toggleView('advancedAnalytics')}
                className={`btn-secondary !py-3 !px-4 !rounded-xl text-sm md:text-base font-extrabold flex items-center justify-center gap-2 min-h-[52px] ${
                  activeView === 'advancedAnalytics'
                    ? '!bg-emerald-600 !text-white !border-emerald-500 shadow-sm'
                    : 'hover:!border-purple-500/40'
                }`}
              >
                <BarChart2 className="text-purple-500 w-5 h-5" />
                <span>Analytics</span>
              </button>

              {engine.isMatchCompleted ? (
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  className="btn-primary !py-3 !rounded-xl text-base gap-2 min-h-[52px] px-4"
                >
                  <FileText className="w-5 h-5" />
                  <span>Generate PDF</span>
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setShowDlsModal(true)}
                    className="btn-secondary !py-3 !rounded-xl gap-2 min-h-[52px] px-4 text-sm md:text-base hover:!border-cyan-500/40 font-extrabold text-cyan-600 dark:text-cyan-400"
                  >
                    <CloudRain className="text-cyan-500 w-5 h-5" />
                    <span>DLS Target</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowMatchInfoModal(true)}
                    className="btn-secondary !py-3 !rounded-xl gap-2 min-h-[52px] px-4 text-sm md:text-base hover:!border-blue-500/40 font-extrabold text-blue-500"
                  >
                    <Info className="text-blue-500 w-5 h-5" />
                    <span>Match Info</span>
                  </button>
                </>
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
                <p className="text-xs text-[var(--muted-foreground)]">Rules &amp; Setup Specifications</p>
              </div>
              <button
                onClick={() => setShowMatchInfoModal(false)}
                className="btn-icon"
                aria-label="Close"
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

              {/* DLS Trigger from Match Info */}
              <button
                type="button"
                onClick={() => {
                  setShowMatchInfoModal(false);
                  setShowDlsModal(true);
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-cyan-600/15 border border-cyan-500/30 text-cyan-600 dark:text-cyan-400 font-bold text-xs hover:bg-cyan-600/25 transition-all cursor-pointer"
              >
                <CloudRain className="w-4 h-4" />
                <span>DLS / Rain Target Calculator (বৃষ্টি বিঘ্ন নিয়ম)</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowMatchInfoModal(false)}
              className="btn-secondary w-full text-xs"
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
        availableSquadMembers={availableSquadMembers}
        initialRuns={pendingRunForWicket}
        initialDismissalType={dismissalType}
        isLastWicket={inn.totalWickets >= engine.maxWickets - 1}
        isFreeHit={Boolean(inn?.isFreeHit)}
        isNoBall={extraFlag === 'no_ball'}
        isWide={extraFlag === 'wide'}
      />

      {/* ── UNIFIED SQUAD PLAYER SELECTION MODAL (BATTER & BOWLER) ── */}
      <PlayerSelectionModal
        isOpen={showPlayerSelectModal}
        onClose={() => setShowPlayerSelectModal(false)}
        type={playerSelectType}
        title={playerSelectTitle}
        teamName={playerSelectType === 'batter' ? inn.team : inn.bowlingTeam}
        squadMembers={
          playerSelectType === 'batter'
            ? Array.from(
                new Set([
                  ...battingSquad,
                  ...inn.players
                    .map((p) => cleanPlayerName(p.name))
                    .filter((n) => n && n !== 'Select Player' && !n.startsWith('Batter ')),
                ])
              )
            : Array.from(
                new Set([
                  ...bowlingSquad,
                  ...inn.bowlers.map((b) => cleanPlayerName(b.name)).filter(Boolean),
                ])
              )
        }
        currentSelectedName={
          playerSelectType === 'batter'
            ? batterSlotTarget === 'striker'
              ? striker?.name
              : nonStriker?.name
            : currentBowler?.name
        }
        ineligiblePlayers={playerSelectType === 'batter' ? ineligibleBatters : ineligibleBowlers}
        bowlerFiguresMap={bowlerFiguresMap}
        onSelectPlayer={handleSelectSquadPlayer}
        maxOversLimit={engine.getMaxBowlerLimit()}
      />

      {/* ── RETIRE BATTER MODAL ── */}
      <AnimatePresence>
      {showRetireModal && (
        <motion.div variants={BACKDROP_VARIANTS} initial="hidden" animate="visible" exit="exit" className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <motion.div variants={MODAL_VARIANTS} className="overflow-y-auto bg-[var(--card)] border border-[var(--border)] shadow-2xl max-w-md max-h-[90vh] rounded-2xl w-full p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-lg">Retire Batter</h3>
                <p className="text-xs text-[var(--muted-foreground)]">Record player retirement status</p>
              </div>
              <button
                onClick={() => setShowRetireModal(false)}
                className="btn-icon"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
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
                  className="btn-danger w-full text-xs py-3 justify-center"
                >
                  Record Retire Out (Wicket)
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleRetirePlayer(true, 'Retire Hurt')}
                    className="btn-secondary !text-amber-500 hover:!border-amber-500/40 flex-1 flex items-center justify-center rounded-xl text-xs min-h-btn p-3 font-bold"
                  >
                    Striker: Retire Hurt
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRetirePlayer(false, 'Retire Hurt')}
                    className="btn-secondary !text-amber-500 hover:!border-amber-500/40 flex-1 flex items-center justify-center rounded-xl text-xs min-h-btn p-3 font-bold"
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

      {/* ── PENALTY RUNS MODAL ── */}
      <AnimatePresence>
      {showPenaltyModal && (
        <motion.div variants={BACKDROP_VARIANTS} initial="hidden" animate="visible" exit="exit" className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <motion.div variants={MODAL_VARIANTS} className="overflow-y-auto bg-[var(--card)] border border-[var(--border)] shadow-2xl max-w-md max-h-[90vh] rounded-2xl w-full p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-lg">Award Penalty Runs</h3>
                <p className="text-xs text-[var(--muted-foreground)]">Apply disciplinary run adjustments</p>
              </div>
              <button
                onClick={() => setShowPenaltyModal(false)}
                className="btn-icon"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div className="space-y-1">
                <label className="font-semibold text-xs text-[var(--foreground)]">Penalty Runs</label>
                <NumericInput
                  min={1}
                  max={20}
                  fallback={5}
                  value={penaltyRuns}
                  onChange={(val) => setPenaltyRuns(val)}
                  className="input-field w-full text-center font-black text-lg py-2.5"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-xs text-[var(--foreground)]">Award To</label>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-2">
                  <button
                    type="button"
                    onClick={() => setAwardedToBatting(true)}
                    className={`px-3 py-2.5 rounded-xl border text-xs font-bold min-h-btn flex items-center justify-center text-center transition-all ${
                      awardedToBatting
                        ? 'bg-purple-600 text-white border-purple-500 shadow-sm font-black'
                        : 'bg-[var(--muted)] border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:border-purple-500/30'
                    }`}
                  >
                    Batting Team (+{penaltyRuns}P)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAwardedToBatting(false)}
                    className={`px-3 py-2.5 rounded-xl border text-xs font-bold min-h-btn flex items-center justify-center text-center transition-all ${
                      !awardedToBatting
                        ? 'bg-purple-600 text-white border-purple-500 shadow-sm font-black'
                        : 'bg-[var(--muted)] border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:border-purple-500/30'
                    }`}
                  >
                    Bowling Team (-{penaltyRuns}P)
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-xs text-[var(--foreground)]">Reason Note</label>
                <input
                  type="text"
                  value={penaltyReason}
                  onChange={(e) => setPenaltyReason(e.target.value)}
                  className="input-field w-full text-sm"
                  placeholder="Reason for penalty"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleAwardPenalty}
              className="btn-primary !bg-purple-600 hover:!bg-purple-500 font-bold shadow-md shadow-purple-600/30 rounded-xl text-sm w-full py-3"
            >
              Confirm Penalty
            </button>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* ── INNINGS 1 COMPLETION / CHASE SETUP MODAL ── */}
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
                <div className="font-black num-font text-3xl mt-0.5 text-emerald-600 dark:text-emerald-400">
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
                className="input-field w-full font-bold"
              />
              <input
                type="text"
                placeholder="2nd Innings Non-Striker"
                value={inn2NonStriker}
                onChange={(e) => setInn2NonStriker(e.target.value)}
                className="input-field w-full font-bold"
              />
              <input
                type="text"
                placeholder="Opening Bowler"
                value={inn2Bowler}
                onChange={(e) => setInn2Bowler(e.target.value)}
                className="input-field w-full font-bold"
              />
            </div>

            <button
              type="button"
              onClick={handleStartSecondInnings}
              className="btn-primary font-extrabold shadow-lg shadow-emerald-600/30 py-3.5 rounded-xl text-base w-full"
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
        partnerships={selectedBatsman?.partnerships ?? inn.pastPartnerships}
        fallOfWickets={selectedBatsman?.fallOfWickets ?? inn.fallOfWickets}
        onRenamePlayer={handleRenamePlayer}
      />

      <BowlerProfileModal
        bowler={activeBowler}
        isOpen={!!selectedBowler}
        onClose={() => setSelectedBowler(null)}
        isCurrentlyBowling={bowlerIsCurrentlyBowling}
        ongoingOverLog={bowlerOngoingOverLog}
        ongoingMatchOver={bowlerOngoingMatchOver}
        fallOfWickets={bowlerFallOfWickets}
        advancedSettings={engine.advancedSettings}
        onRenamePlayer={handleRenamePlayer}
      />

      <HistoricalBallEditModal
        isOpen={!!editingBallInfo}
        onClose={() => setEditingBallInfo(null)}
        ballEvent={editingBallInfo?.ballEvent ?? null}
        ballIndex={editingBallInfo?.ballIndex ?? 0}
        inningsNumber={editingBallInfo?.inningsNumber ?? 1}
        onSave={handleSaveBallEdit}
      />

      {showDlsModal && engine && (
        <DlsModal
          isOpen={showDlsModal}
          onClose={() => setShowDlsModal(false)}
          originalOvers={engine.advancedSettings?.originalTotalOvers || engine.totalOvers}
          team1Score={engine.firstInnings?.totalRuns ?? engine.currentInnings?.totalRuns ?? 0}
          currentOversBowled={engine.currentInnings ? Number((engine.currentInnings.totalBalls / 6).toFixed(1)) : 0}
          currentWicketsLost={engine.currentInnings?.totalWickets ?? 0}
          currentRuns={engine.currentInnings?.totalRuns ?? 0}
          isDlsApplied={isDlsApplied}
          currentTotalOvers={engine.totalOvers}
          onApplyTarget={handleApplyDlsTarget}
          onResetDls={handleResetDls}
          onConcludeDls={handleConcludeDlsMatch}
        />
      )}

      {/* Full Viewport PDF Generation Loading Overlay */}
      <PdfLoadingOverlay
        isOpen={isPdfModalOpen}
        stage={pdfStage}
        status={pdfStatus}
        errorMessage={pdfError}
        onRetry={retryPdf}
        onClose={closePdfModal}
      />

      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-600 text-white font-bold text-xs py-2.5 px-4 rounded-xl shadow-2xl animate-fade-in flex items-center gap-2">
          <span>{toastMessage}</span>
        </div>
      )}
    </>
  );
}


