'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Shield,
  Sliders,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  MapPin,
  Users,
  PlusCircle,
  Crosshair,
  AlertTriangle,
  CheckCircle2,
  RotateCw,
  Building2,
  X,
} from 'lucide-react';
import { FeatureHubRepository } from '@/infrastructure/storage/FeatureHubRepository';
import { SavedTeam } from '@/infrastructure/database/dexie-db';
import { TeamBadgeIcon } from '@/components/common/TeamBadgeIcon';
import { TargetChessModeButton } from '@/components/common/TargetChessModeButton';
import { BowlingLimiter, BowlingLimitMode } from '@/domain/cricket/bowling-limiter/BowlingLimiter';
import dynamic from 'next/dynamic';
import { CompactDropdown } from '@/components/common/CompactDropdown';
import { BowlingLimiterDrawer } from '@/components/common/BowlingLimiterDrawer';
import { NumericInput } from '@/components/common/NumericInput';
import { CricketGround, MatchLocationMetadata } from '@/domain/cricket/types';
import { GroundRepository } from '@/infrastructure/storage/GroundRepository';
import { AutoGpsLocationService, GpsLocationResult } from '@/infrastructure/gps/AutoGpsLocationService';
import { useLanguage } from '@/context/LanguageContext';

const GroundSelectorModal = dynamic(
  () => import('@/components/modals/GroundSelectorModal').then((mod) => mod.GroundSelectorModal),
  { ssr: false }
);
import type { DetectedGroundCandidate } from '@/infrastructure/maps/NearbyGroundDetectionService';
import {
  SmartGroundDetectionService,
  SmartDetectionResult,
} from '@/infrastructure/maps/SmartGroundDetectionService';

export default function NewMatchPage() {
 const { t: tr } = useLanguage();
  const router = useRouter();

  // Basic Match Setup
  const [homeTeam, setHomeTeam] = useState('');
  const [awayTeam, setAwayTeam] = useState('');
  const [overs, setOvers] = useState<number>(6);
  const [tossWinner, setTossWinner] = useState<'home' | 'away'>('home');
  const [tossDecision, setTossDecision] = useState<'Batting' | 'Bowling'>('Batting');
  const [venue, setVenue] = useState('');
  const [selectedGround, setSelectedGround] = useState<CricketGround | null>(null);
  const [showGroundModal, setShowGroundModal] = useState(false);

  // Automatic GPS & Smart Ground Detection State
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'detecting' | 'acquired' | 'error'>('idle');
  const [gpsResult, setGpsResult] = useState<GpsLocationResult | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [nearbyCandidates, setNearbyCandidates] = useState<DetectedGroundCandidate[]>([]);
  const [isDetectingGrounds, setIsDetectingGrounds] = useState(false);
  const [isSavingCurrentLocation, setIsSavingCurrentLocation] = useState(false);

  // Smart Progressive Detection & Authorization State
  const [smartDetectionResult, setSmartDetectionResult] = useState<SmartDetectionResult | null>(null);
  const [isEditingGroundName, setIsEditingGroundName] = useState(false);
  const [editedGroundName, setEditedGroundName] = useState('');
  const [unappliedDetectedGround, setUnappliedDetectedGround] = useState<CricketGround | null>(null);
  const [showAlternatives, setShowAlternatives] = useState(false);

  // Advanced Match Settings
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [players, setPlayers] = useState<number | string>(11);
  const [wideBall, setWideBall] = useState(true);
  const [wideReball, setWideReball] = useState(true);
  const [wideRun, setWideRun] = useState<number | string>(1);
  const [noBall, setNoBall] = useState(true);
  const [noBallReball, setNoBallReball] = useState(true);
  const [noBallRun, setNoBallRun] = useState<number | string>(1);
  const [isManualLimitEnabled, setIsManualLimitEnabled] = useState(false);
  const [manualOverLimit, setManualOverLimit] = useState(4);
  const [bowlingLimitMode, setBowlingLimitMode] = useState<BowlingLimitMode>('international');
  const [customOverLimit, setCustomOverLimit] = useState(4);

  // Saved Teams
  const [savedTeams, setSavedTeams] = useState<SavedTeam[]>([]);
  const [showTeamModal, setShowTeamModal] = useState<'home' | 'away' | null>(null);

  // F4-08: Escape closes the saved-team picker. The picker holds no
  // editable state of its own (a tap commits the selection and
  // closes), so there is nothing for a dismiss guard to protect —
  // plain Escape-to-close is the whole fix here.
  useEffect(() => {
    if (!showTeamModal) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowTeamModal(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showTeamModal]);

  // Chase Mode State (from Flutter ChaseSetupScreen)
  const [isChaseMode, setIsChaseMode] = useState(false);
  const [isPrivateMatch, setIsPrivateMatch] = useState(false);
  const [targetRuns, setTargetRuns] = useState<number | string>(120);

  const isUnder10Overs = Number(overs) < 10;
  const effectiveBowlingMode: BowlingLimitMode = isUnder10Overs ? 'default' : bowlingLimitMode;
  const effectiveMaxOvers = BowlingLimiter.calculateMaxOvers(Number(overs) || 6, {
    mode: effectiveBowlingMode,
    customMaxOvers: Number(customOverLimit) || 4,
  });

  const homeTeamOptions = useMemo(
    () =>
      savedTeams.map((t) => ({
        value: t.name,
        label: t.name,
        sublabel: `${t.players.length} players squad`,
        badge: t.name === awayTeam ? 'Opponent' : undefined,
        disabled: t.name === awayTeam,
      })),
    [savedTeams, awayTeam]
  );

  const awayTeamOptions = useMemo(
    () =>
      savedTeams.map((t) => ({
        value: t.name,
        label: t.name,
        sublabel: `${t.players.length} players squad`,
        badge: t.name === homeTeam ? 'Home Team' : undefined,
        disabled: t.name === homeTeam,
      })),
    [savedTeams, homeTeam]
  );

  const venueOptions = useMemo(() => {
    const list: Array<{ value: string; label: string; sublabel?: string; badge?: string }> = [];
    if (smartDetectionResult?.ground) {
      list.push({
        value: smartDetectionResult.ground.name,
        label: smartDetectionResult.ground.name,
        sublabel: smartDetectionResult.ground.address || 'Auto-detected ground',
        badge: 'Recommended',
      });
    }
    nearbyCandidates.forEach((c) => {
      if (!list.some((item) => item.value === c.name)) {
        list.push({
          value: c.name,
          label: c.name,
          sublabel: c.address || 'Nearby candidate',
          badge: `~${AutoGpsLocationService.formatDistance(c.distanceMeters)}`,
        });
      }
    });
    smartDetectionResult?.alternativeCandidates.forEach((a) => {
      if (!list.some((item) => item.value === a.suggestedGroundName)) {
        list.push({
          value: a.suggestedGroundName,
          label: a.suggestedGroundName,
          sublabel: a.address || 'Nearby venue',
          badge: `~${a.distanceMeters}m`,
        });
      }
    });
    return list;
  }, [nearbyCandidates, smartDetectionResult]);

  const handleDetectGps = useCallback(async () => {
    setGpsStatus('detecting');
    setGpsError(null);
    setUnappliedDetectedGround(null);

    try {
      const result = await AutoGpsLocationService.getCurrentPosition();
      setGpsResult(result);
      setGpsStatus('acquired');

      // Smart Progressive 100m to 1500m Ground Detection & Ranking
      setIsDetectingGrounds(true);
      try {
        const smartRes = await SmartGroundDetectionService.detectGround(
          result.latitude,
          result.longitude,
          result.accuracy
        );
        setSmartDetectionResult(smartRes);

        setNearbyCandidates(
          smartRes.candidates.map((c) => ({
            id: c.savedGroundId,
            name: c.suggestedGroundName,
            suggestedGroundName: c.suggestedGroundName,
            category: c.category,
            latitude: c.latitude,
            longitude: c.longitude,
            address: c.address,
            googlePlaceId: c.googlePlaceId,
            distanceMeters: c.distanceMeters,
            confidenceScore: c.confidenceScore,
            detectionRadiusMeters: smartRes.detectionRadiusMeters,
            isSaved: c.isSaved,
            source: c.isSaved ? 'LOCAL_SAVED' : 'GOOGLE_PLACES',
          }))
        );

        // Guard against silently replacing an explicitly entered or confirmed venue
        const hasExplicitVenue = Boolean(
          selectedGround?.isUserConfirmed ||
          selectedGround?.isUserDefined ||
          selectedGround?.namingSource === 'MANUAL' ||
          (venue.trim() &&
            venue.trim().toLowerCase() !== 'unnamed ground' &&
            venue.trim().toLowerCase() !== smartRes.ground.name.trim().toLowerCase())
        );

        if (!hasExplicitVenue) {
          setSelectedGround(smartRes.ground);
          setVenue(smartRes.ground.name);
          setEditedGroundName(smartRes.ground.name);
        } else if (smartRes.ground.name.trim().toLowerCase() !== venue.trim().toLowerCase()) {
          setUnappliedDetectedGround(smartRes.ground);
        }
      } catch (err) {
        console.warn('Smart ground detection note:', err);
      } finally {
        setIsDetectingGrounds(false);
      }
    } catch (err: any) {
      setGpsStatus('error');
      setGpsError(err.message || 'Unable to retrieve your current location.');
    }
  }, [selectedGround, venue]);

  const handleDetectGpsRef = useRef(handleDetectGps);
  handleDetectGpsRef.current = handleDetectGps;

  const handleConfirmGround = async () => {
    if (!selectedGround) return;
    try {
      const finalName = (editedGroundName || selectedGround.name).trim();
      const confirmed = await GroundRepository.saveGround({
        ...selectedGround,
        name: finalName,
        isUserConfirmed: true,
        isUserDefined: true,
        namingSource: 'MANUAL',
      });
      setSelectedGround(confirmed);
      setVenue(confirmed.name);
      setIsEditingGroundName(false);
    } catch (err) {
      console.error('Failed to confirm ground:', err);
    }
  };

  const handleApplyDetectedGround = () => {
    if (!unappliedDetectedGround) return;
    setSelectedGround(unappliedDetectedGround);
    setVenue(unappliedDetectedGround.name);
    setEditedGroundName(unappliedDetectedGround.name);
    setUnappliedDetectedGround(null);
  };

  const handleSelectCandidate = async (candidate: DetectedGroundCandidate) => {
    if (candidate.isSaved && candidate.savedGround) {
      setSelectedGround(candidate.savedGround);
      setVenue(candidate.savedGround.name);
      setEditedGroundName(candidate.savedGround.name);
    } else {
      try {
        const saved = await GroundRepository.findOrCreateFromPlace({
          name: candidate.suggestedGroundName || candidate.name,
          latitude: gpsResult?.latitude || candidate.latitude, // actual playing location
          longitude: gpsResult?.longitude || candidate.longitude,
          googlePlaceId: candidate.googlePlaceId,
          address: candidate.address,
          accuracy: gpsResult?.accuracy,
          locationSource: 'AUTO_DETECTED',
        });
        setSelectedGround(saved);
        setVenue(saved.name);
        setEditedGroundName(saved.name);
      } catch (err) {
        console.error('Failed to save ground candidate:', err);
      }
    }
  };

  const handleSaveCurrentGpsAsGround = async () => {
    if (!gpsResult) return;
    setIsSavingCurrentLocation(true);
    try {
      const trimmedVenue = venue.trim();
      const validName =
        trimmedVenue &&
        !SmartGroundDetectionService.isCoordinateBasedName(trimmedVenue) &&
        SmartGroundDetectionService.isReadableAlphabeticName(trimmedVenue)
          ? trimmedVenue
          : 'Unnamed Ground';

      const saved = await GroundRepository.saveGround({
        name: validName,
        latitude: gpsResult.latitude,
        longitude: gpsResult.longitude,
        accuracy: gpsResult.accuracy,
        locationSource: 'GPS',
      });
      setSelectedGround(saved);
      setVenue(saved.name);
    } catch (err) {
      console.error('Failed to save current location as ground:', err);
    } finally {
      setIsSavingCurrentLocation(false);
    }
  };

  useEffect(() => {
    FeatureHubRepository.loadTeams().then((teams) => setSavedTeams(teams));
    GroundRepository.healAllExistingGrounds().catch(() => {});
    sessionStorage.removeItem('pending_match_setup');
    sessionStorage.removeItem('pending_opening_players');

    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search);
      const queryGroundId = searchParams.get('groundId');
      if (queryGroundId) {
        GroundRepository.getGround(queryGroundId).then((g) => {
          if (g) {
            setSelectedGround(g);
            setVenue(g.name);
          }
        });
      }

      // Proactively check location permissions and auto-detect if already granted
      AutoGpsLocationService.checkPermission().then((perm) => {
        if (perm === 'granted') {
          handleDetectGpsRef.current();
        }
      });
    }
  }, []);

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();

    const actualTossWinner = isChaseMode ? homeTeam.trim() || '' : (tossWinner === 'home' ? homeTeam.trim() : awayTeam.trim());
    const actualTossDecision = isChaseMode ? 'Batting' : tossDecision;
    // Resolve user's intended ground name with strict precedence:
    // 1. If user edited ground name in editor, use editedGroundName
    // 2. If venue input was filled by user and is non-provisional, use venue
    // 3. If selectedGround is non-provisional, use selectedGround.name
    // 4. Any remaining non-empty string or fallback
    const cleanEdited = (isEditingGroundName ? editedGroundName : '').trim();
    const cleanVenue = venue.trim();
    const groundName = (selectedGround?.name || '').trim();

    let effectiveVenue = '';
    if (cleanEdited && cleanEdited.toLowerCase() !== 'unnamed ground') {
      effectiveVenue = cleanEdited;
    } else if (cleanVenue && cleanVenue.toLowerCase() !== 'unnamed ground') {
      effectiveVenue = cleanVenue;
    } else if (groundName && groundName.toLowerCase() !== 'unnamed ground') {
      effectiveVenue = groundName;
    } else if (cleanVenue) {
      effectiveVenue = cleanVenue;
    } else if (groundName) {
      effectiveVenue = groundName;
    }

    if (
      selectedGround &&
      effectiveVenue &&
      effectiveVenue.toLowerCase() !== 'unnamed ground' &&
      selectedGround.name !== effectiveVenue
    ) {
      GroundRepository.saveGround({
        ...selectedGround,
        name: effectiveVenue,
        isUserConfirmed: true,
        isUserDefined: true,
        namingSource: 'MANUAL',
      }).catch(() => {});
    }

    const effectiveLocation: MatchLocationMetadata | undefined = selectedGround
      ? {
          latitude: selectedGround.latitude,
          longitude: selectedGround.longitude,
          accuracy: selectedGround.accuracy || gpsResult?.accuracy,
          timestamp: gpsResult?.timestamp || new Date().toISOString(),
          source: selectedGround.locationSource || (gpsResult ? 'GPS' : 'MAP_SELECTED'),
        }
      : gpsResult
      ? {
          latitude: gpsResult.latitude,
          longitude: gpsResult.longitude,
          accuracy: gpsResult.accuracy,
          timestamp: gpsResult.timestamp,
          source: 'GPS',
        }
      : undefined;

    const foundTeamA = savedTeams.find(
      (t) => t.name.trim().toLowerCase() === homeTeam.trim().toLowerCase()
    );
    const foundTeamB = savedTeams.find(
      (t) => t.name.trim().toLowerCase() === awayTeam.trim().toLowerCase()
    );
    // F9-β3: setup carries the saved squads as TeamPlayer[] so the
    // engine can stamp stable playerIds from the first ball.
    const teamASquad = foundTeamA?.players ?? [];
    const teamBSquad = foundTeamB?.players ?? [];

    const setupData = {
      teamA: homeTeam.trim() || '',
      teamB: awayTeam.trim() || '',
      teamASquad,
      teamBSquad,
      overs: Number(overs) || 6,
      tossWinner: actualTossWinner,
      tossDecision: actualTossDecision,
      venue: effectiveVenue,
      groundId: selectedGround?.id,
      location: effectiveLocation,
      isChaseMode,
      isPublic: !isPrivateMatch,
      targetScore: isChaseMode ? Number(targetRuns) || 100 : undefined,
      advancedSettings: {
        players: Number(players) || 11,
        teamASquad,
        teamBSquad,
        wideBall,
        wideReball,
        wideRun: Number(wideRun) || 1,
        noBall,
        noBallReball,
        noBallRun: Number(noBallRun) || 1,
        isManualLimitEnabled: effectiveBowlingMode === 'custom',
        manualOverLimit: effectiveMaxOvers,
        bowlingLimitMode: effectiveBowlingMode,
        maxOversPerBowler: effectiveMaxOvers,
        venue: effectiveVenue,
        groundId: selectedGround?.id,
        location: effectiveLocation,
        matchType: isChaseMode ? 'CHASE' : 'LIMITED_OVERS',
        originalTotalOvers: Number(overs) || 6,
      },
    };

    sessionStorage.setItem('pending_match_setup', JSON.stringify(setupData));
    router.push('/matches/opening-players');
  };

  return (
    <div className="w-full max-w-6xl 2xl:max-w-7xl mx-auto flex flex-col gap-4 short:gap-3 pb-safe pb-8">
      {/* ── RESPONSIVE FLOATING WORKSPACE FORM ── */}
      <form onSubmit={handleNext} className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5 items-start">
        {/* LEFT COLUMN: TEAMS & OVERS (7 cols on Desktop) */}
        <div className="lg:col-span-7 flex flex-col gap-3.5">
          {/* Target Chess Mode: Compact Left-Aligned Utility Chip */}
          <div className="flex flex-col items-start gap-2">
            <TargetChessModeButton
              className="shadow-elev1"
              isActive={isChaseMode}
              onToggle={() => setIsChaseMode(!isChaseMode)}
            />

            {/* Compact Target Runs Bar (Visible only when Target Chess Mode is Active) */}
            {isChaseMode && (
              <div className="w-full flex flex-wrap items-center justify-between sm:justify-start gap-2 sm:gap-3 px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-50/90 via-teal-50/85 to-emerald-50/90 dark:from-[#0d221a]/90 dark:via-[#102d22]/85 dark:to-[#0d221a]/90 text-emerald-950 dark:text-emerald-100 border border-emerald-500/30 text-[11px] font-semibold animate-fadeIn shadow-elev1">
                <span>
                  {tr('newm_target', 'Target:')} <strong className="text-emerald-600 dark:text-emerald-400 font-extrabold">{Number(targetRuns) || 100}</strong> {tr('newm_runs_in', 'runs in')} <strong>{overs}</strong> {tr('newm_ov', 'ov')}
                </span>
                <span className="hidden sm:inline opacity-30">•</span>
                <span>
                  {tr('newm_req_rr', 'Req RR:')} <strong className="text-emerald-600 dark:text-emerald-400 font-extrabold">{((Number(targetRuns) || 0) / (Number(overs) || 1)).toFixed(2)}</strong>
                </span>
                <span className="opacity-30">•</span>
                <div className="flex items-center gap-1.5 ml-auto sm:ml-0">
                  <label htmlFor="target-runs-input" className="font-bold text-emerald-700 dark:text-emerald-300">
                    {tr('newm_runs', 'Runs:')}
                  </label>
                  <NumericInput
                    id="target-runs-input"
                    min={1}
                    max={999}
                    fallback={120}
                    value={targetRuns}
                    onChange={(val) => setTargetRuns(val)}
                    className="bg-[var(--card)] border border-emerald-500/40 text-[var(--foreground)] font-black focus:outline-none focus:ring-1 focus:ring-emerald-400 py-0.5 rounded-md text-caption w-16 px-1.5 text-center shadow-inset"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Teams Selection Card */}
          <div className="floating-card shadow-elev1 p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-2.5">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span className="font-bold uppercase tracking-wider text-caption text-emerald-600 dark:text-emerald-400">
                  {tr('newm_teams', 'Participating Teams')}
                </span>
              </div>
              {savedTeams.length > 0 ? (
                <span className="text-caption text-[var(--muted-foreground)] font-medium">
                  {savedTeams.length} {tr('newm_teams_available', 'teams available')}
                </span>
              ) : (
                <Link
                  href="/teams"
                  className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400 hover:underline"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>{tr('newm_create_team', 'Create Team')}</span>
                </Link>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Home / Chasing Team */}
              <div className="space-y-1.5">
                <label className="font-semibold flex items-center justify-between text-caption">
                  <span className="flex items-center gap-1.5 truncate">
                    <TeamBadgeIcon type="home" size="xs" showLabel />
                    {isChaseMode && (
                      <span className="truncate text-[var(--muted-foreground)] text-xs font-normal">
                        {tr('newm_chasing', '(Chasing)')}
                      </span>
                    )}
                  </span>
                  {savedTeams.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowTeamModal('home')}
                      className="hover:underline flex items-center font-bold text-emerald-600 text-[11px] gap-1 shrink-0 ml-1"
                    >
                      <Users className="w-3 h-3" /> {tr('newm_pick', 'Pick')}
                    </button>
                  )}
                </label>
                <CompactDropdown
                  value={homeTeam}
                  options={homeTeamOptions}
                  onChange={(val) => setHomeTeam(String(val))}
                  allowCustomInput
                  required
                  placeholder={isChaseMode ? tr('newm_chasing_team', 'Chasing Team (Batting)') : tr('newm_home_team', 'HOME TEAM')}
                  inputPlaceholder={isChaseMode ? tr('newm_chasing_team', 'Chasing Team (Batting)') : tr('newm_home_team', 'HOME TEAM')}
                  icon={<TeamBadgeIcon type="home" size="sm" />}
                  searchable={savedTeams.length > 5}
                  emptyMessage={tr('newm_no_saved_teams', 'No saved teams. Type any team name above.')}
                  elevated
                  testId="home-team-dropdown"
                />
              </div>

              {/* Away / Defending Team */}
              <div className="space-y-1.5">
                <label className="font-semibold flex items-center justify-between text-caption">
                  <span className="flex items-center gap-1.5 truncate">
                    <TeamBadgeIcon type="away" size="xs" showLabel />
                    {isChaseMode && (
                      <span className="truncate text-[var(--muted-foreground)] text-xs font-normal">
                        {tr('newm_defending', '(Defending)')}
                      </span>
                    )}
                  </span>
                  {savedTeams.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowTeamModal('away')}
                      className="hover:underline flex items-center font-bold text-blue-600 dark:text-blue-400 text-[11px] gap-1 shrink-0 ml-1"
                    >
                      <Users className="w-3 h-3" /> {tr('newm_pick', 'Pick')}
                    </button>
                  )}
                </label>
                <CompactDropdown
                  value={awayTeam}
                  options={awayTeamOptions}
                  onChange={(val) => setAwayTeam(String(val))}
                  allowCustomInput
                  required
                  placeholder={isChaseMode ? tr('newm_defending_team', 'Defending Team (Bowling)') : tr('newm_away_team', 'AWAY TEAM')}
                  inputPlaceholder={isChaseMode ? tr('newm_defending_team', 'Defending Team (Bowling)') : tr('newm_away_team', 'AWAY TEAM')}
                  icon={<TeamBadgeIcon type="away" size="sm" />}
                  searchable={savedTeams.length > 5}
                  emptyMessage={tr('newm_no_saved_teams', 'No saved teams. Type any team name above.')}
                  elevated
                  testId="away-team-dropdown"
                />
              </div>
            </div>

            {/* Quick Saved Team Pickers or Empty State */}
            {savedTeams.length > 0 ? (
              <div className="pt-1 border-t border-border/60">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] block mb-1.5">
                  {tr('newm_quick_pick', 'Quick Pick Saved Teams:')}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {savedTeams.slice(0, 5).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        if (homeTeam === t.name) setAwayTeam(t.name);
                        else setHomeTeam(t.name);
                      }}
                      className="text-caption font-semibold px-2.5 py-1 rounded-lg bg-[var(--muted)] hover:bg-emerald-500/10 hover:text-emerald-600 transition-colors border border-[var(--border)] active:scale-95"
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="pt-2 border-t border-border/60 flex items-center justify-between gap-2 text-caption bg-emerald-500/5 dark:bg-emerald-500/10 p-2.5 rounded-xl border border-emerald-500/20">
                <span className="text-[var(--muted-foreground)] text-xs">
                  {tr('newm_no_teams_hint', 'No saved teams yet. Enter team names manually, or create reusable squads in Squad Manager.')}
                </span>
                <Link
                  href="/teams"
                  className="shrink-0 flex items-center gap-1 font-bold text-emerald-700 dark:text-emerald-400 text-xs hover:underline"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>{tr('newm_squad_manager', 'Squad Manager')}</span>
                </Link>
              </div>
            )}
          </div>

          {/* Match Overs & Venue Card */}
          <div className="floating-card shadow-elev1 p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-2.5">
              <span className="font-bold uppercase tracking-wider text-caption text-emerald-700 dark:text-emerald-400">
                {tr('newm_overs_venue', 'Match Overs & Venue')}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {/* Overs Selection */}
              <div className="space-y-1.5">
                <label htmlFor="match-overs-input" className="font-semibold text-caption block">
                  {tr('newm_match_overs', 'Match Overs (1 - 90)')}
                </label>
                <div className="flex items-center gap-1.5">
                  {[5, 6, 10, 20].map((quickOver) => (
                    <button
                      key={quickOver}
                      type="button"
                      onClick={() => setOvers(quickOver)}
                      className={`flex-1 py-2 rounded-xl text-caption font-bold border transition-all active:scale-95 ${
                        overs === quickOver
                          ? 'bg-emerald-700 text-white border-emerald-700 shadow-elev2 font-black'
                          : 'bg-[var(--muted)] text-[var(--muted-foreground)] border-[var(--border)] hover:border-emerald-500/40 hover:text-[var(--foreground)] shadow-elev1'
                      }`}
                    >
                      {quickOver} {tr('newm_ov', 'Ov')}
                    </button>
                  ))}
                </div>
                <NumericInput
                  id="match-overs-input"
                  min={1}
                  max={90}
                  fallback={6}
                  required
                  value={overs}
                  onChange={(val) => setOvers(Number(val) || 6)}
                  className="input-field font-black text-center text-body-small mt-1 shadow-inset focus:shadow-elev1"
                  aria-label={tr('newm_match_overs', 'Match Overs (1 - 90)')}
                />
              </div>

              {/* Venue Selection & Automatic GPS Detection */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="font-semibold flex items-center text-caption gap-1 shrink-0">
                    <MapPin className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" /> {tr('newm_ground_venue', 'Ground / Venue')}
                  </label>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleDetectGps}
                      disabled={gpsStatus === 'detecting'}
                      className="text-caption font-bold text-emerald-700 dark:text-emerald-400 hover:underline flex items-center gap-1 disabled:opacity-50 whitespace-nowrap"
                      title={tr('newm_auto_gps_title', 'Auto-detect current ground using GPS')}
                    >
                      <Crosshair className={`w-3.5 h-3.5 ${gpsStatus === 'detecting' ? 'animate-spin' : ''}`} />
                      <span>{gpsStatus === 'detecting' ? tr('newm_locating', 'Locating...') : tr('newm_auto_gps', 'Auto-GPS')}</span>
                    </button>
                    <span className="opacity-30">•</span>
                    <button
                      type="button"
                      onClick={() => setShowGroundModal(true)}
                      className="text-caption font-bold text-emerald-700 dark:text-emerald-400 hover:underline flex items-center gap-1 whitespace-nowrap"
                    >
                      <span>{selectedGround ? tr('newm_change', 'Change') : tr('newm_pick_on_map', 'Pick on Map')}</span>
                    </button>
                  </div>
                </div>

                {/* Unapplied Detected Ground Prompt (Authorization Protection) */}
                {unappliedDetectedGround && (
                  <div className="p-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 flex items-center justify-between gap-2 text-caption animate-fadeIn">
                    <div className="min-w-0">
                      <span className="font-bold text-emerald-800 dark:text-emerald-300 block truncate">
                        📍 {tr('newm_nearby_detected', 'Nearby Ground Detected:')} {unappliedDetectedGround.name}
                      </span>
                      <span className="text-[11px] text-[var(--muted-foreground)] block">
                        Within {unappliedDetectedGround.detectionRadiusMeters || 100}m ring • {Math.round((unappliedDetectedGround.confidenceScore || 0.8) * 100)}% match
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={handleApplyDetectedGround}
                        className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg text-[11px] shadow-xs"
                      >
                        {tr('newm_use_detected', 'Use Detected')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setUnappliedDetectedGround(null)}
                        className="px-2 py-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)] text-[11px]"
                      >
                        {tr('newm_dismiss', 'Dismiss')}
                      </button>
                    </div>
                  </div>
                )}

                {/* Selected Ground Card */}
                {selectedGround ? (
                  <div className="p-3.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 dark:bg-emerald-500/15 flex flex-col gap-2 mt-1 shadow-elev2 transition-all">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        {isEditingGroundName ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={editedGroundName}
                              onChange={(e) => setEditedGroundName(e.target.value)}
                              className="input-field text-body-small py-1 px-2.5 font-bold shadow-inset focus:shadow-elev1"
                              placeholder={tr('newm_ground_name', 'Ground Name')}
                              aria-label={tr('newm_ground_name', 'Ground Name')}
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={handleConfirmGround}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[11px] font-bold shrink-0 shadow-2xs"
                            >
                              {tr('newm_save', 'Save')}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setIsEditingGroundName(false);
                                setEditedGroundName(selectedGround.name);
                              }}
                              className="px-2 py-1 text-[var(--muted-foreground)] text-[11px]"
                            >
                              {tr('newm_cancel', 'Cancel')}
                            </button>
                          </div>
                        ) : (
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-extrabold text-body leading-tight text-emerald-900 dark:text-emerald-100">
                                {selectedGround.name}
                              </span>
                              {selectedGround.isUserDefined || selectedGround.isUserConfirmed || selectedGround.namingSource === 'MANUAL' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[9px] font-extrabold tracking-wider uppercase">
                                  <CheckCircle2 className="w-2.5 h-2.5" /> {tr('newm_user_defined', 'User-Defined')}
                                </span>
                              ) : selectedGround.isProvisional ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-800 dark:text-amber-300 text-[9px] font-extrabold tracking-wider uppercase">
                                  {tr('newm_provisional', 'Provisional Fallback')}
                                </span>
                              ) : selectedGround.locationSource === 'AUTO_DETECTED' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-[9px] font-extrabold tracking-wider uppercase">
                                  {tr('newm_auto_detected', 'Auto-Detected')} ({selectedGround.detectionRadiusMeters || 100}m)
                                </span>
                              ) : null}
                            </div>

                            {selectedGround.referencePlaceName &&
                              selectedGround.referencePlaceName.toLowerCase() !== selectedGround.name.toLowerCase() && (
                                <p className="text-[11px] text-[var(--muted-foreground)] mt-0.5">
                                  {tr('newm_named_after', 'Named after nearby reference:')} <strong className="text-[var(--foreground)]">{selectedGround.referencePlaceName}</strong>
                                  {selectedGround.referenceDistanceMeters !== undefined && ` (~${selectedGround.referenceDistanceMeters}m away)`}
                                </p>
                              )}

                            {selectedGround.address && (
                              <span className="text-[11px] text-[var(--muted-foreground)] block truncate mt-0.5">
                                {selectedGround.address}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {!isEditingGroundName && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditedGroundName(selectedGround.name);
                              setIsEditingGroundName(true);
                            }}
                            className="text-caption text-emerald-600 dark:text-emerald-400 hover:underline px-1 py-0.5 font-bold"
                            title={tr('newm_edit_ground_name', 'Edit ground name')}
                          >
                            {tr('teams_edit', 'Edit')}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedGround(null);
                            setVenue('');
                            setSmartDetectionResult(null);
                          }}
                          className="text-caption text-red-500 hover:text-red-600 hover:underline px-1 py-0.5 font-bold"
                        >
                          {tr('history_clear_filter', 'Clear')}
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-[var(--muted-foreground)] pt-1.5 border-t border-emerald-500/20">
                      <div className="flex items-center gap-2">
                        <span className="font-mono">
                          {tr('newm_playing_spot', 'Playing Spot:')} {selectedGround.latitude.toFixed(4)}°, {selectedGround.longitude.toFixed(4)}°
                        </span>
                        {selectedGround.accuracy && <span>(±{selectedGround.accuracy}m)</span>}
                      </div>

                      {!selectedGround.isUserConfirmed && (
                        <button
                          type="button"
                          onClick={handleConfirmGround}
                          className="px-2.5 py-0.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-[10px] shadow-2xs transition-colors"
                        >
                          {tr('newm_confirm_ground', 'Confirm Ground')}
                        </button>
                      )}
                    </div>

                    {/* Ambiguity / Alternative candidates */}
                    {smartDetectionResult && smartDetectionResult.alternativeCandidates.length > 0 && (
                      <div className="pt-1 border-t border-emerald-500/15">
                        <button
                          type="button"
                          onClick={() => setShowAlternatives(!showAlternatives)}
                          className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 hover:underline flex items-center gap-1"
                        >
                          {showAlternatives ? tr('newm_hide_alternatives', 'Hide alternative nearby venues') : `${tr('newm_see_alternatives', 'See other nearby options')} (${smartDetectionResult.alternativeCandidates.length})`}
                        </button>

                        {showAlternatives && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1.5 animate-fadeIn">
                            {smartDetectionResult.alternativeCandidates.map((alt, idx) => (
                              <button
                                key={alt.googlePlaceId || idx}
                                type="button"
                                onClick={() => {
                                  handleSelectCandidate({
                                    name: alt.suggestedGroundName,
                                    suggestedGroundName: alt.suggestedGroundName,
                                    category: alt.category,
                                    latitude: alt.latitude,
                                    longitude: alt.longitude,
                                    address: alt.address,
                                    googlePlaceId: alt.googlePlaceId,
                                    distanceMeters: alt.distanceMeters,
                                    confidenceScore: alt.confidenceScore,
                                    isSaved: alt.isSaved,
                                    source: alt.isSaved ? 'LOCAL_SAVED' : 'GOOGLE_PLACES',
                                  });
                                  setShowAlternatives(false);
                                }}
                                className="text-left p-2 rounded-lg border border-[var(--border)] hover:border-emerald-500 hover:bg-emerald-500/10 transition-all flex items-center justify-between text-[11px]"
                              >
                                <div className="min-w-0 pr-1">
                                  <span className="font-bold block truncate">{alt.suggestedGroundName}</span>
                                  <span className="text-[10px] text-[var(--muted-foreground)]">~{alt.distanceMeters}m {tr('newm_away_suffix', 'away')}</span>
                                </div>
                                <span className="font-bold text-emerald-600 text-[10px] shrink-0">{tr('newm_switch', 'Switch')}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex gap-2 items-center mt-1 w-full min-w-0">
                    <CompactDropdown
                      value={venue}
                      options={venueOptions}
                      onChange={(val) => {
                        setVenue(String(val));
                        const match = nearbyCandidates.find((c) => c.name === val);
                        if (match) handleSelectCandidate(match);
                      }}
                      allowCustomInput
                      placeholder={tr('newm_venue_placeholder', 'e.g. Sher-e-Bangla Stadium')}
                      inputPlaceholder={tr('newm_venue_placeholder', 'e.g. Sher-e-Bangla Stadium')}
                      icon={<MapPin className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
                      emptyMessage={tr('newm_venue_empty', 'Type a ground name or click Auto-GPS / Map.')}
                      elevated
                      testId="venue-dropdown"
                      className="flex-1 min-w-0"
                    />
                    <button
                      type="button"
                      onClick={handleDetectGps}
                      disabled={gpsStatus === 'detecting'}
                      className="btn-primary py-2.5 px-3.5 shrink-0 text-caption min-h-[42px] flex items-center justify-center gap-1.5 whitespace-nowrap"
                      title={tr('newm_auto_gps_title', 'Auto-detect current ground via GPS')}
                    >
                      <Crosshair className={`w-4 h-4 ${gpsStatus === 'detecting' ? 'animate-spin' : ''}`} />
                      <span className="hidden sm:inline">{tr('newm_gps', 'GPS')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowGroundModal(true)}
                      className="btn-secondary py-2.5 px-3.5 shrink-0 text-caption min-h-[42px] flex items-center justify-center gap-1.5 whitespace-nowrap"
                      title={tr('newm_open_map_title', 'Open Grounds Map & Places Selector')}
                    >
                      <MapPin className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <span className="hidden sm:inline">{tr('newm_map', 'Map')}</span>
                    </button>
                  </div>
                )}

                {/* GPS Detecting Indicator */}
                {gpsStatus === 'detecting' && (
                  <div className="p-2.5 rounded-xl border border-blue-500/30 bg-blue-500/10 flex items-center gap-2 text-caption text-blue-700 dark:text-blue-300 animate-pulse">
                    <RotateCw className="w-4 h-4 animate-spin shrink-0" />
                    <span>{tr('newm_detecting_gps', 'Detecting GPS position and discovering nearby cricket grounds...')}</span>
                  </div>
                )}

                {/* GPS Error Fallback Message */}
                {gpsStatus === 'error' && gpsError && (
                  <div className="p-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 flex items-center justify-between gap-2 text-caption text-amber-800 dark:text-amber-200">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                      <span className="truncate">{gpsError}</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleDetectGps}
                      className="text-[11px] font-bold text-amber-700 dark:text-amber-300 underline shrink-0"
                    >
                      {tr('newm_retry', 'Retry')}
                    </button>
                  </div>
                )}

                {/* Low GPS Accuracy Warning */}
                {gpsStatus === 'acquired' && gpsResult?.isLowAccuracy && !selectedGround && (
                  <div className="p-2 rounded-xl border border-amber-500/40 bg-amber-500/10 flex items-center justify-between gap-2 text-[11px] text-amber-800 dark:text-amber-200">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                      <span>{tr('newm_low_accuracy_prefix', 'Low GPS accuracy')} (±{gpsResult.accuracy}m). {tr('newm_low_accuracy_suffix', 'We recommend picking on map.')}</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleDetectGps}
                      className="font-bold underline shrink-0"
                    >
                      {tr('newm_retry', 'Retry')}
                    </button>
                  </div>
                )}

                {/* Nearby Detected Ground Candidates List */}
                {gpsStatus === 'acquired' && !selectedGround && (
                  <div className="space-y-1.5 pt-1">
                    {nearbyCandidates.length > 0 ? (
                      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-2.5 space-y-2">
                        <div className="flex items-center justify-between text-[11px] text-[var(--muted-foreground)] font-semibold">
                          <span className="flex items-center gap-1">
                            <Building2 className="w-3.5 h-3.5 text-emerald-600" />
                            {tr('newm_detected_nearby', 'Detected Nearby Grounds')} ({nearbyCandidates.length}):
                          </span>
                        </div>
                        <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                          {nearbyCandidates.slice(0, 3).map((candidate, idx) => (
                            <button
                              key={candidate.googlePlaceId || candidate.id || idx}
                              type="button"
                              onClick={() => handleSelectCandidate(candidate)}
                              className="text-left p-2 rounded-lg border border-[var(--border)] hover:border-emerald-500 hover:bg-emerald-500/5 transition-all flex items-center justify-between gap-2 group"
                            >
                              <div className="min-w-0">
                                <span className="font-bold text-caption block truncate text-[var(--foreground)] group-hover:text-emerald-600 dark:group-hover:text-emerald-400">
                                  {candidate.name}
                                </span>
                                {candidate.address && (
                                  <span className="text-[10px] text-[var(--muted-foreground)] block truncate">
                                    {candidate.address}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                                  ~{AutoGpsLocationService.formatDistance(candidate.distanceMeters)}
                                </span>
                                <span className="text-caption font-bold text-emerald-600">{tr('newm_select', 'Select')}</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      !isDetectingGrounds && gpsResult && (
                        <div className="p-2.5 rounded-xl border border-[var(--border)] bg-muted/50 flex items-center justify-between gap-2 text-caption">
                          <span className="text-[11px] text-[var(--muted-foreground)]">
                            GPS: {gpsResult.latitude.toFixed(4)}°, {gpsResult.longitude.toFixed(4)}° (±{gpsResult.accuracy}m)
                          </span>
                          <button
                            type="button"
                            onClick={handleSaveCurrentGpsAsGround}
                            disabled={isSavingCurrentLocation}
                            className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
                          >
                            <PlusCircle className="w-3.5 h-3.5" />
                            <span>{isSavingCurrentLocation ? tr('newm_saving', 'Saving...') : tr('newm_save_as_ground', 'Save as Ground')}</span>
                          </button>
                        </div>
                      )
                    )}
                  </div>
                )}

                <span className="text-[11px] text-[var(--muted-foreground)] block">
                  {tr('newm_ground_linked_note', 'Ground details and GPS coordinates will be linked to the match scorecard')}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: TOSS, RULES & ACTION (5 cols on Desktop) */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          {/* Toss Results Card */}
          <div className="floating-card shadow-elev1 p-4 sm:p-5 space-y-3.5">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-2.5">
              <span className="font-bold uppercase tracking-wider text-caption text-emerald-700 dark:text-emerald-400">
                {tr('newm_toss_results', 'Toss Results')}
              </span>
              <span className="text-[11px] text-[var(--muted-foreground)] font-semibold">
                {isChaseMode ? tr('newm_preset', 'Pre-set') : tr('newm_coin_toss', 'Coin Toss')}
              </span>
            </div>

            {isChaseMode ? (
              <div className="bg-emerald-500/10 border border-emerald-500/20 flex items-center p-3 rounded-xl gap-3">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0 text-emerald-700 dark:text-emerald-400 font-bold text-xs select-none">
                  ✦
                </div>
                <div className="text-caption">
                  <p className="font-extrabold text-emerald-700 dark:text-emerald-400">{tr('newm_toss_bypassed', 'Toss Bypassed in Target Chess Mode')}</p>
                  <p className="text-[var(--muted-foreground)] text-[11px] leading-snug mt-0.5">
                    <strong>{homeTeam || 'HOME TEAM'}</strong> bats in 2nd Innings chasing {targetRuns} against <strong>{awayTeam || 'AWAY TEAM'}</strong>.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <p className="font-semibold text-caption mb-1.5 text-[var(--muted-foreground)]">{tr('newm_who_won_toss', 'Who won the toss?')}</p>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setTossWinner('home')}
                      className={`p-2.5 rounded-xl border text-left font-bold text-caption transition-all flex items-center gap-2 ${
                        tossWinner === 'home'
                          ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 shadow-elev2'
                          : 'border-[var(--border)] bg-[var(--muted)] text-[var(--muted-foreground)] shadow-elev1'
                      }`}
                    >
                      <div className="shrink-0">
                        <TeamBadgeIcon type="home" size="xs" />
                      </div>
                      <div className="overflow-hidden min-w-0">
                        <span className="block truncate font-extrabold text-body-small">
                          {homeTeam ? (
                            homeTeam
                          ) : (
                            <span className="text-[var(--muted-foreground)] uppercase tracking-wider font-bold">
                              {tr('newm_home_team', 'HOME TEAM')}
                            </span>
                          )}
                        </span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setTossWinner('away')}
                      className={`p-2.5 rounded-xl border text-left font-bold text-caption transition-all flex items-center gap-2 ${
                        tossWinner === 'away'
                          ? 'border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-400 shadow-elev2'
                          : 'border-[var(--border)] bg-[var(--muted)] text-[var(--muted-foreground)] shadow-elev1'
                      }`}
                    >
                      <div className="shrink-0">
                        <TeamBadgeIcon type="away" size="xs" />
                      </div>
                      <div className="overflow-hidden min-w-0">
                        <span className="block truncate font-extrabold text-body-small">
                          {awayTeam ? (
                            awayTeam
                          ) : (
                            <span className="text-[var(--muted-foreground)] uppercase tracking-wider font-bold">
                              {tr('newm_away_team', 'AWAY TEAM')}
                            </span>
                          )}
                        </span>
                      </div>
                    </button>
                  </div>
                </div>

                <div>
                  <p className="font-semibold text-caption mb-1.5 text-[var(--muted-foreground)]">{tr('newm_toss_decision', 'Toss decision')}</p>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setTossDecision('Batting')}
                      className={`p-2.5 rounded-xl border text-center font-bold text-caption transition-all flex items-center justify-center gap-2 min-h-btn-sm ${
                        tossDecision === 'Batting'
                          ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 shadow-elev2'
                          : 'border-[var(--border)] bg-[var(--muted)] text-[var(--muted-foreground)] shadow-elev1'
                      }`}
                    >
                      <img
                        src="/assets/illustrations/st_bat.png"
                        alt=""
                        aria-hidden="true"
                        className="object-contain shrink-0 w-4 h-4"
                      />
                      <span className="truncate">{tr('newm_elected_bat', 'Elected to Bat')}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setTossDecision('Bowling')}
                      className={`p-2.5 rounded-xl border text-center font-bold text-caption transition-all flex items-center justify-center gap-2 min-h-btn-sm ${
                        tossDecision === 'Bowling'
                          ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 shadow-elev2'
                          : 'border-[var(--border)] bg-[var(--muted)] text-[var(--muted-foreground)] shadow-elev1'
                      }`}
                    >
                      <img
                        src="/assets/illustrations/opening_bowler.png"
                        alt=""
                        aria-hidden="true"
                        className="object-contain shrink-0 w-4 h-4"
                      />
                      <span className="truncate">{tr('newm_elected_bowl', 'Elected to Bowl')}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── BOWLING LIMITER (COMPACT COLLAPSIBLE DRAWER) ── */}
          <BowlingLimiterDrawer
            overs={overs}
            bowlingLimitMode={bowlingLimitMode}
            onBowlingLimitModeChange={setBowlingLimitMode}
            customOverLimit={customOverLimit}
            onCustomOverLimitChange={setCustomOverLimit}
            effectiveMaxOvers={effectiveMaxOvers}
            isUnder10Overs={isUnder10Overs}
            elevated
          />

          {/* Advanced Rules Accordion Card */}
          <div className="floating-card shadow-elev1 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center justify-between font-bold hover:bg-muted/50 transition-colors p-3.5 text-body-small min-h-[44px] w-full"
            >
              <div className="flex items-center gap-2">
                <Sliders className="text-emerald-600 w-4 h-4" />
                <span>{tr('newm_advanced_rules', 'Advanced Cricket Rules')}</span>
              </div>
              {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showAdvanced && (
              <div className="border-t border-[var(--border)] space-y-3 p-4 text-body-small animate-fadeIn">
                {/* Players per team */}
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-body-small">{tr('newm_players_per_team', 'Players per team')}</div>
                    <div className="text-caption text-[var(--muted-foreground)]">{tr('newm_players_limit', 'Standard limit 2 to 20 players')}</div>
                  </div>
                  <NumericInput
                    id="players-per-team-input"
                    min={2}
                    max={20}
                    fallback={11}
                    value={players}
                    onChange={(val) => setPlayers(val)}
                    className="bg-[var(--muted)] border border-[var(--border)] font-bold shrink-0 py-1.5 rounded-lg text-center w-16 px-2 text-body-small shadow-inset"
                    aria-label={tr('newm_players_per_team', 'Players per team')}
                  />
                </div>

                {/* Match Visibility (F4-A) */}
                <div className="border-t border-border/60 pt-2.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-body-small">{tr('newm_private_match', 'Private Match')}</div>
                      <div className="text-caption text-[var(--muted-foreground)]">
                        {isPrivateMatch
                          ? tr('newm_private_desc', 'Only you can view this match — no public spectator link')
                          : tr('newm_public_desc', 'Public — anyone with the link can watch live in Match Center')}
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={isPrivateMatch}
                      onChange={(e) => setIsPrivateMatch(e.target.checked)}
                      className="accent-emerald-600 rounded shrink-0 w-4 h-4"
                      aria-label={tr('newm_private_match', 'Private Match')}
                    />
                  </div>
                </div>

                {/* Wide Ball Rules */}
                <div className="border-t border-border/60 pt-2.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-body-small">{tr('newm_wide_extra', 'Wide Ball Extra')}</div>
                      <div className="text-caption text-[var(--muted-foreground)]">{tr('newm_wide_desc', 'Awards extra run to batting team')}</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={wideBall}
                      onChange={(e) => setWideBall(e.target.checked)}
                      className="accent-emerald-600 rounded shrink-0 w-4 h-4"
                      aria-label={tr('newm_wide_extra', 'Wide Ball Extra')}
                    />
                  </div>

                  {wideBall && (
                    <div className="flex items-center justify-between pl-3 text-caption">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={wideReball}
                          onChange={(e) => setWideReball(e.target.checked)}
                          className="accent-emerald-600 w-3.5 h-3.5"
                        />
                        <span>{tr('newm_reball', 'Re-ball delivery')}</span>
                      </label>
                      <div className="flex items-center gap-1.5">
                        <span>{tr('newm_penalty', 'Penalty:')}</span>
                        <NumericInput
                          min={1}
                          max={20}
                          fallback={1}
                          value={wideRun}
                          onChange={(val) => setWideRun(val)}
                          className="rounded bg-[var(--muted)] border font-bold text-center w-12 px-1 py-0.5 text-caption shadow-inset"
                          aria-label={tr('newm_wide_penalty', 'Wide Penalty Runs')}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* No Ball Rules */}
                <div className="border-t border-border/60 pt-2.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-body-small">{tr('newm_noball_freehit', 'No Ball & Free Hit')}</div>
                      <div className="text-caption text-[var(--muted-foreground)]">{tr('newm_noball_desc', 'Awards extra and activates Free Hit')}</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={noBall}
                      onChange={(e) => setNoBall(e.target.checked)}
                      className="accent-emerald-600 rounded shrink-0 w-4 h-4"
                      aria-label={tr('newm_noball_extra', 'No Ball and Free Hit Extra')}
                    />
                  </div>

                  {noBall && (
                    <div className="flex items-center justify-between pl-3 text-caption">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={noBallReball}
                          onChange={(e) => setNoBallReball(e.target.checked)}
                          className="accent-emerald-600 w-3.5 h-3.5"
                        />
                        <span>{tr('newm_reball', 'Re-ball delivery')}</span>
                      </label>
                      <div className="flex items-center gap-1.5">
                        <span>{tr('newm_penalty', 'Penalty:')}</span>
                        <NumericInput
                          min={1}
                          max={20}
                          fallback={1}
                          value={noBallRun}
                          onChange={(val) => setNoBallRun(val)}
                          className="rounded bg-[var(--muted)] border font-bold text-center w-12 px-1 py-0.5 text-caption shadow-inset"
                          aria-label={tr('newm_noball_penalty', 'No Ball Penalty Runs')}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Primary Action Button */}
          <button
            type="submit"
            className="btn-primary py-3.5 px-6 rounded-xl text-body min-h-btn w-full font-black tracking-wide gap-2.5 shadow-elev2 active:scale-[0.99] transition-all"
          >
            <span>{tr('newm_next_opening', 'Next: Opening Players')}</span>
            <ArrowRight className="w-5 h-5 shrink-0" />
          </button>
        </div>
      </form>

      {/* ── SAVED TEAM PICKER MODAL ── */}
      {showTeamModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="select-team-modal-title"
          className="fixed inset-0 !m-0 bg-slate-950/70 backdrop-blur-sm z-[60] overflow-y-auto overscroll-contain flex justify-center items-start sm:items-center p-2.5 sm:p-4 pt-[max(1rem,calc(env(safe-area-inset-top,0px)+0.75rem))] pb-[max(5.5rem,calc(env(safe-area-inset-bottom,0px)+4.5rem))] sm:pb-6 min-h-full animate-fadeIn"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowTeamModal(null);
          }}
        >
          <div
            className="overflow-hidden bg-[var(--card)] border border-[var(--border)] shadow-elev3 max-w-md rounded-2xl w-full flex flex-col max-h-[calc(100dvh-2rem)] sm:max-h-[85vh] my-auto animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 sm:px-5 py-3 shrink-0 bg-[var(--card)]">
              <h3 id="select-team-modal-title" className="font-extrabold text-body tracking-tight">{tr('newm_select_saved_team', 'Select Saved Team')}</h3>
              <button
                type="button"
                onClick={() => setShowTeamModal(null)}
                aria-label={tr('newm_close_team_modal', 'Close Team Modal')}
                className="btn-icon rounded-xl"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto overscroll-contain flex-1 min-h-0 p-4 sm:p-5 space-y-3">
              {savedTeams.length === 0 ? (
                <div className="py-8 text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-[var(--muted)] flex items-center justify-center mx-auto text-[var(--muted-foreground)] opacity-60">
                    <Users className="w-6 h-6" />
                  </div>
                  <p className="text-body-small text-[var(--muted-foreground)]">
                    {tr('newm_no_saved_found', 'No saved teams found. Create your custom teams in the Squad Manager first.')}
                  </p>
                  <Link
                    href="/teams"
                    onClick={() => setShowTeamModal(null)}
                    className="btn-primary"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>{tr('newm_create_team', 'Create Team')}</span>
                  </Link>
                </div>
              ) : (
                <div className="space-y-2 pr-1">
                  {savedTeams.map((team) => (
                    <button
                      key={team.id}
                      type="button"
                      onClick={() => {
                        if (showTeamModal === 'home') setHomeTeam(team.name);
                        else setAwayTeam(team.name);
                        setShowTeamModal(null);
                      }}
                      className="border border-[var(--border)] hover:border-emerald-500/50 hover:bg-emerald-500/[0.03] active:scale-[0.99] flex items-center justify-between text-left rounded-xl w-full p-3.5 transition-all shadow-xs group cursor-pointer"
                    >
                      <span className="font-bold text-body-small text-[var(--foreground)] group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                        {team.name}
                      </span>
                      <span className="text-caption font-semibold px-2 py-0.5 rounded-full bg-[var(--muted)] text-[var(--muted-foreground)]">
                        {team.players.length} {tr('newm_players', 'players')}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {savedTeams.length > 0 && (
              <div className="px-4 sm:px-5 py-2.5 border-t border-[var(--border)] bg-[var(--card)] shrink-0 flex justify-end pb-safe">
                <Link
                  href="/teams"
                  onClick={() => setShowTeamModal(null)}
                  className="inline-flex items-center gap-1 text-caption font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>{tr('newm_add_team_squad_manager', 'Add New Team in Squad Manager')}</span>
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── GROUND / VENUE SELECTOR MODAL ── */}
      {showGroundModal && (
        <GroundSelectorModal
          isOpen={showGroundModal}
          onClose={() => setShowGroundModal(false)}
          selectedGroundId={selectedGround?.id}
          onSelectGround={(ground) => {
            setSelectedGround(ground);
            setVenue(ground.name);
          }}
        />
      )}
    </div>
  );
}
