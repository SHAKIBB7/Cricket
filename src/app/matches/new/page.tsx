'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield,
  Sliders,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  MapPin,
  Sparkles,
  Users,
  PlusCircle,
  Navigation,
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
import { BowlingLimiterDrawer } from '@/components/common/BowlingLimiterDrawer';
import { NumericInput } from '@/components/common/NumericInput';
import { CricketGround, MatchLocationMetadata } from '@/domain/cricket/types';
import { GroundRepository } from '@/infrastructure/storage/GroundRepository';
import { AutoGpsLocationService, GpsLocationResult } from '@/infrastructure/gps/AutoGpsLocationService';

const GroundSelectorModal = dynamic(
  () => import('@/components/modals/GroundSelectorModal').then((mod) => mod.GroundSelectorModal),
  { ssr: false }
);
import { NearbyGroundDetectionService, DetectedGroundCandidate } from '@/infrastructure/maps/NearbyGroundDetectionService';
import {
  SmartGroundDetectionService,
  SmartDetectionResult,
} from '@/infrastructure/maps/SmartGroundDetectionService';

export default function NewMatchPage() {
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

  // Chase Mode State (from Flutter ChaseSetupScreen)
  const [isChaseMode, setIsChaseMode] = useState(false);
  const [targetRuns, setTargetRuns] = useState<number | string>(120);

  const isUnder10Overs = Number(overs) < 10;
  const effectiveBowlingMode: BowlingLimitMode = isUnder10Overs ? 'default' : bowlingLimitMode;
  const effectiveMaxOvers = BowlingLimiter.calculateMaxOvers(Number(overs) || 6, {
    mode: effectiveBowlingMode,
    customMaxOvers: Number(customOverLimit) || 4,
  });

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

    const setupData = {
      teamA: homeTeam.trim() || '',
      teamB: awayTeam.trim() || '',
      overs: Number(overs) || 6,
      tossWinner: actualTossWinner,
      tossDecision: actualTossDecision,
      venue: effectiveVenue,
      groundId: selectedGround?.id,
      location: effectiveLocation,
      isChaseMode,
      targetScore: isChaseMode ? Number(targetRuns) || 100 : undefined,
      advancedSettings: {
        players: Number(players) || 11,
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
              isActive={isChaseMode}
              onToggle={() => setIsChaseMode(!isChaseMode)}
            />

            {/* Compact Target Runs Bar (Visible only when Target Chess Mode is Active) */}
            {isChaseMode && (
              <div className="w-full flex flex-wrap items-center justify-between sm:justify-start gap-2 sm:gap-3 px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-50/90 via-teal-50/85 to-emerald-50/90 dark:from-[#0d221a]/90 dark:via-[#102d22]/85 dark:to-[#0d221a]/90 text-emerald-950 dark:text-emerald-100 border border-emerald-500/30 text-[11px] font-semibold animate-fadeIn shadow-xs">
                <span>
                  Target: <strong className="text-emerald-600 dark:text-emerald-400 font-extrabold">{targetRuns || 1}</strong> runs in <strong>{overs}</strong> ov
                </span>
                <span className="hidden sm:inline opacity-30">•</span>
                <span>
                  Req RR: <strong className="text-emerald-600 dark:text-emerald-400 font-extrabold">{((Number(targetRuns) || 0) / (Number(overs) || 1)).toFixed(2)}</strong>
                </span>
                <span className="opacity-30">•</span>
                <div className="flex items-center gap-1.5 ml-auto sm:ml-0">
                  <label htmlFor="target-runs-input" className="font-bold text-emerald-700 dark:text-emerald-300">
                    Runs:
                  </label>
                  <NumericInput
                    id="target-runs-input"
                    min={1}
                    max={999}
                    fallback={120}
                    value={targetRuns}
                    onChange={(val) => setTargetRuns(val)}
                    className="bg-[var(--card)] border border-emerald-500/40 text-[var(--foreground)] font-black focus:outline-none focus:ring-1 focus:ring-emerald-400 py-0.5 rounded-md text-caption w-16 px-1.5 text-center"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Teams Selection Card */}
          <div className="floating-card p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-2.5">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span className="font-bold uppercase tracking-wider text-caption text-emerald-600 dark:text-emerald-400">
                  Participating Teams
                </span>
              </div>
              {savedTeams.length > 0 ? (
                <span className="text-caption text-[var(--muted-foreground)] font-medium">
                  {savedTeams.length} teams available
                </span>
              ) : (
                <Link
                  href="/teams"
                  className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Create Team</span>
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
                        (Chasing)
                      </span>
                    )}
                  </span>
                  {savedTeams.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowTeamModal('home')}
                      className="hover:underline flex items-center font-bold text-emerald-600 text-[11px] gap-1 shrink-0 ml-1"
                    >
                      <Users className="w-3 h-3" /> Pick
                    </button>
                  )}
                </label>
                <div className="relative flex items-center">
                  <div className="absolute left-3.5 pointer-events-none z-10">
                    <TeamBadgeIcon type="home" size="sm" />
                  </div>
                  <input
                    type="text"
                    required
                    value={homeTeam}
                    onChange={(e) => setHomeTeam(e.target.value)}
                    placeholder={isChaseMode ? 'Chasing Team (Batting)' : 'HOME TEAM'}
                    className="input-field font-bold pl-11 pr-3.5 py-2.5 min-h-btn w-full text-body-small"
                  />
                </div>
              </div>

              {/* Away / Defending Team */}
              <div className="space-y-1.5">
                <label className="font-semibold flex items-center justify-between text-caption">
                  <span className="flex items-center gap-1.5 truncate">
                    <TeamBadgeIcon type="away" size="xs" showLabel />
                    {isChaseMode && (
                      <span className="truncate text-[var(--muted-foreground)] text-xs font-normal">
                        (Defending)
                      </span>
                    )}
                  </span>
                  {savedTeams.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowTeamModal('away')}
                      className="hover:underline flex items-center font-bold text-blue-600 dark:text-blue-400 text-[11px] gap-1 shrink-0 ml-1"
                    >
                      <Users className="w-3 h-3" /> Pick
                    </button>
                  )}
                </label>
                <div className="relative flex items-center">
                  <div className="absolute left-3.5 pointer-events-none z-10">
                    <TeamBadgeIcon type="away" size="sm" />
                  </div>
                  <input
                    type="text"
                    required
                    value={awayTeam}
                    onChange={(e) => setAwayTeam(e.target.value)}
                    placeholder={isChaseMode ? 'Defending Team (Bowling)' : 'AWAY TEAM'}
                    className="input-field font-bold pl-11 pr-3.5 py-2.5 min-h-btn w-full text-body-small"
                  />
                </div>
              </div>
            </div>

            {/* Quick Saved Team Pickers or Empty State */}
            {savedTeams.length > 0 ? (
              <div className="pt-1 border-t border-[var(--border)]/60">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] block mb-1.5">
                  Quick Pick Saved Teams:
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
              <div className="pt-2 border-t border-[var(--border)]/60 flex items-center justify-between gap-2 text-caption bg-emerald-500/5 dark:bg-emerald-500/10 p-2.5 rounded-xl border border-emerald-500/20">
                <span className="text-[var(--muted-foreground)] text-xs">
                  No saved teams yet. Enter team names manually, or create reusable squads in Squad Manager.
                </span>
                <Link
                  href="/teams"
                  className="shrink-0 flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400 text-xs hover:underline"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Squad Manager</span>
                </Link>
              </div>
            )}
          </div>

          {/* Match Overs & Venue Card */}
          <div className="floating-card p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-2.5">
              <span className="font-bold uppercase tracking-wider text-caption text-emerald-600 dark:text-emerald-400">
                Match Overs & Venue
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Overs Selection */}
              <div className="space-y-1.5">
                <label className="font-semibold text-caption block">
                  Match Overs (1 - 90)
                </label>
                <div className="flex items-center gap-1.5">
                  {[5, 6, 10, 20].map((quickOver) => (
                    <button
                      key={quickOver}
                      type="button"
                      onClick={() => setOvers(quickOver)}
                      className={`flex-1 py-2 rounded-xl text-caption font-bold border transition-all active:scale-95 ${
                        overs === quickOver
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs font-black'
                          : 'bg-[var(--muted)] text-[var(--muted-foreground)] border-[var(--border)] hover:border-emerald-500/40 hover:text-[var(--foreground)]'
                      }`}
                    >
                      {quickOver} Ov
                    </button>
                  ))}
                </div>
                <NumericInput
                  min={1}
                  max={90}
                  fallback={6}
                  required
                  value={overs}
                  onChange={(val) => setOvers(Number(val) || 6)}
                  className="input-field font-black text-center text-body-small mt-1"
                />
              </div>

              {/* Venue Selection & Automatic GPS Detection */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-semibold flex items-center text-caption gap-1">
                    <MapPin className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> Ground / Venue
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleDetectGps}
                      disabled={gpsStatus === 'detecting'}
                      className="text-caption font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 disabled:opacity-50"
                      title="Auto-detect current ground using GPS"
                    >
                      <Crosshair className={`w-3.5 h-3.5 ${gpsStatus === 'detecting' ? 'animate-spin' : ''}`} />
                      <span>{gpsStatus === 'detecting' ? 'Locating...' : 'Auto-GPS'}</span>
                    </button>
                    <span className="opacity-30">•</span>
                    <button
                      type="button"
                      onClick={() => setShowGroundModal(true)}
                      className="text-caption font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
                    >
                      <span>{selectedGround ? 'Change' : 'Pick on Map'}</span>
                    </button>
                  </div>
                </div>

                {/* Unapplied Detected Ground Prompt (Authorization Protection) */}
                {unappliedDetectedGround && (
                  <div className="p-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 flex items-center justify-between gap-2 text-caption animate-fadeIn">
                    <div className="min-w-0">
                      <span className="font-bold text-emerald-800 dark:text-emerald-300 block truncate">
                        📍 Nearby Ground Detected: {unappliedDetectedGround.name}
                      </span>
                      <span className="text-[11px] text-[var(--muted-foreground)] block">
                        Within {unappliedDetectedGround.detectionRadiusMeters || 100}m ring • {Math.round((unappliedDetectedGround.confidenceScore || 0.8) * 100)}% match
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={handleApplyDetectedGround}
                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-[11px] shadow-xs"
                      >
                        Use Detected
                      </button>
                      <button
                        type="button"
                        onClick={() => setUnappliedDetectedGround(null)}
                        className="px-2 py-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)] text-[11px]"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}

                {/* Selected Ground Card */}
                {selectedGround ? (
                  <div className="p-3.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 dark:bg-emerald-500/15 flex flex-col gap-2 mt-1 shadow-xs transition-all">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        {isEditingGroundName ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={editedGroundName}
                              onChange={(e) => setEditedGroundName(e.target.value)}
                              className="input-field text-body-small py-1 px-2.5 font-bold"
                              placeholder="Ground Name"
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={handleConfirmGround}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[11px] font-bold shrink-0 shadow-2xs"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setIsEditingGroundName(false);
                                setEditedGroundName(selectedGround.name);
                              }}
                              className="px-2 py-1 text-[var(--muted-foreground)] text-[11px]"
                            >
                              Cancel
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
                                  <CheckCircle2 className="w-2.5 h-2.5" /> User-Defined
                                </span>
                              ) : selectedGround.isProvisional ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-800 dark:text-amber-300 text-[9px] font-extrabold tracking-wider uppercase">
                                  Provisional Fallback
                                </span>
                              ) : selectedGround.locationSource === 'AUTO_DETECTED' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-[9px] font-extrabold tracking-wider uppercase">
                                  Auto-Detected ({selectedGround.detectionRadiusMeters || 100}m)
                                </span>
                              ) : null}
                            </div>

                            {selectedGround.referencePlaceName &&
                              selectedGround.referencePlaceName.toLowerCase() !== selectedGround.name.toLowerCase() && (
                                <p className="text-[11px] text-[var(--muted-foreground)] mt-0.5">
                                  Named after nearby reference: <strong className="text-[var(--foreground)]">{selectedGround.referencePlaceName}</strong>
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
                            title="Edit ground name"
                          >
                            Edit
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
                          Clear
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-[var(--muted-foreground)] pt-1.5 border-t border-emerald-500/20">
                      <div className="flex items-center gap-2">
                        <span className="font-mono">
                          Playing Spot: {selectedGround.latitude.toFixed(4)}°, {selectedGround.longitude.toFixed(4)}°
                        </span>
                        {selectedGround.accuracy && <span>(±{selectedGround.accuracy}m)</span>}
                      </div>

                      {!selectedGround.isUserConfirmed && (
                        <button
                          type="button"
                          onClick={handleConfirmGround}
                          className="px-2.5 py-0.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-[10px] shadow-2xs transition-colors"
                        >
                          Confirm Ground
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
                          {showAlternatives ? 'Hide alternative nearby venues' : `See other nearby options (${smartDetectionResult.alternativeCandidates.length})`}
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
                                  <span className="text-[10px] text-[var(--muted-foreground)]">~{alt.distanceMeters}m away</span>
                                </div>
                                <span className="font-bold text-emerald-600 text-[10px] shrink-0">Switch</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex gap-2 items-center mt-1">
                    <input
                      type="text"
                      value={venue}
                      onChange={(e) => setVenue(e.target.value)}
                      placeholder="e.g. Sher-e-Bangla Stadium"
                      className="input-field"
                    />
                    <button
                      type="button"
                      onClick={handleDetectGps}
                      disabled={gpsStatus === 'detecting'}
                      className="btn-primary py-2.5 px-3.5 shrink-0 text-caption min-h-[42px]"
                      title="Auto-detect current ground via GPS"
                    >
                      <Crosshair className={`w-4 h-4 ${gpsStatus === 'detecting' ? 'animate-spin' : ''}`} />
                      <span className="hidden sm:inline">GPS</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowGroundModal(true)}
                      className="btn-secondary py-2.5 px-3.5 shrink-0 text-caption min-h-[42px]"
                      title="Open Grounds Map & Places Selector"
                    >
                      <MapPin className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <span className="hidden sm:inline">Map</span>
                    </button>
                  </div>
                )}

                {/* GPS Detecting Indicator */}
                {gpsStatus === 'detecting' && (
                  <div className="p-2.5 rounded-xl border border-blue-500/30 bg-blue-500/10 flex items-center gap-2 text-caption text-blue-700 dark:text-blue-300 animate-pulse">
                    <RotateCw className="w-4 h-4 animate-spin shrink-0" />
                    <span>Detecting GPS position and discovering nearby cricket grounds...</span>
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
                      Retry
                    </button>
                  </div>
                )}

                {/* Low GPS Accuracy Warning */}
                {gpsStatus === 'acquired' && gpsResult?.isLowAccuracy && !selectedGround && (
                  <div className="p-2 rounded-xl border border-amber-500/40 bg-amber-500/10 flex items-center justify-between gap-2 text-[11px] text-amber-800 dark:text-amber-200">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                      <span>Low GPS accuracy (±{gpsResult.accuracy}m). We recommend picking on map.</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleDetectGps}
                      className="font-bold underline shrink-0"
                    >
                      Retry
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
                            Detected Nearby Grounds ({nearbyCandidates.length}):
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
                                <span className="text-caption font-bold text-emerald-600">Select</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      !isDetectingGrounds && gpsResult && (
                        <div className="p-2.5 rounded-xl border border-[var(--border)] bg-[var(--muted)]/50 flex items-center justify-between gap-2 text-caption">
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
                            <span>{isSavingCurrentLocation ? 'Saving...' : 'Save as Ground'}</span>
                          </button>
                        </div>
                      )
                    )}
                  </div>
                )}

                <span className="text-[11px] text-[var(--muted-foreground)] block">
                  Ground details and GPS coordinates will be linked to the match scorecard
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: TOSS, RULES & ACTION (5 cols on Desktop) */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          {/* Toss Results Card */}
          <div className="floating-card p-4 sm:p-5 space-y-3.5">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-2.5">
              <span className="font-bold uppercase tracking-wider text-caption text-emerald-600 dark:text-emerald-400">
                Toss Results
              </span>
              <span className="text-[11px] text-[var(--muted-foreground)] font-semibold">
                {isChaseMode ? 'Pre-set' : 'Coin Toss'}
              </span>
            </div>

            {isChaseMode ? (
              <div className="bg-emerald-500/10 border border-emerald-500/20 flex items-center p-3 rounded-xl gap-3">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0 text-emerald-600 dark:text-emerald-400 font-bold text-xs select-none">
                  ✦
                </div>
                <div className="text-caption">
                  <p className="font-extrabold text-emerald-600 dark:text-emerald-400">Toss Bypassed in Target Chess Mode</p>
                  <p className="text-[var(--muted-foreground)] text-[11px] leading-snug mt-0.5">
                    <strong>{homeTeam || 'HOME TEAM'}</strong> bats in 2nd Innings chasing {targetRuns} against <strong>{awayTeam || 'AWAY TEAM'}</strong>.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <p className="font-semibold text-caption mb-1.5 text-[var(--muted-foreground)]">Who won the toss?</p>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setTossWinner('home')}
                      className={`p-2.5 rounded-xl border text-left font-bold text-caption transition-all flex items-center gap-2 ${
                        tossWinner === 'home'
                          ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shadow-xs'
                          : 'border-[var(--border)] bg-[var(--muted)] text-[var(--muted-foreground)]'
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
                            <span className="opacity-40 uppercase tracking-wider font-bold">
                              HOME TEAM
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
                          ? 'border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400 shadow-xs'
                          : 'border-[var(--border)] bg-[var(--muted)] text-[var(--muted-foreground)]'
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
                            <span className="opacity-40 uppercase tracking-wider font-bold">
                              AWAY TEAM
                            </span>
                          )}
                        </span>
                      </div>
                    </button>
                  </div>
                </div>

                <div>
                  <p className="font-semibold text-caption mb-1.5 text-[var(--muted-foreground)]">Toss decision</p>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setTossDecision('Batting')}
                      className={`p-2.5 rounded-xl border text-center font-bold text-caption transition-all flex items-center justify-center gap-2 min-h-btn-sm ${
                        tossDecision === 'Batting'
                          ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shadow-xs'
                          : 'border-[var(--border)] bg-[var(--muted)] text-[var(--muted-foreground)]'
                      }`}
                    >
                      <img
                        src="/assets/illustrations/st_bat.png"
                        alt="Bat"
                        className="object-contain shrink-0 w-4 h-4"
                      />
                      <span className="truncate">Elected to Bat</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setTossDecision('Bowling')}
                      className={`p-2.5 rounded-xl border text-center font-bold text-caption transition-all flex items-center justify-center gap-2 min-h-btn-sm ${
                        tossDecision === 'Bowling'
                          ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shadow-xs'
                          : 'border-[var(--border)] bg-[var(--muted)] text-[var(--muted-foreground)]'
                      }`}
                    >
                      <img
                        src="/assets/illustrations/opening_bowler.png"
                        alt="Bowl"
                        className="object-contain shrink-0 w-4 h-4"
                      />
                      <span className="truncate">Elected to Bowl</span>
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
          />

          {/* Advanced Rules Accordion Card */}
          <div className="floating-card overflow-hidden">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center justify-between font-bold hover:bg-[var(--muted)]/50 transition-colors p-3.5 text-body-small min-h-[44px] w-full"
            >
              <div className="flex items-center gap-2">
                <Sliders className="text-emerald-600 w-4 h-4" />
                <span>Advanced Cricket Rules</span>
              </div>
              {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showAdvanced && (
              <div className="border-t border-[var(--border)] space-y-3 p-4 text-body-small animate-fadeIn">
                {/* Players per team */}
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-body-small">Players per team</div>
                    <div className="text-caption text-[var(--muted-foreground)]">Standard limit 2 to 20 players</div>
                  </div>
                  <NumericInput
                    min={2}
                    max={20}
                    fallback={11}
                    value={players}
                    onChange={(val) => setPlayers(val)}
                    className="bg-[var(--muted)] border border-[var(--border)] font-bold shrink-0 py-1.5 rounded-lg text-center w-16 px-2 text-body-small"
                  />
                </div>

                {/* Wide Ball Rules */}
                <div className="border-t border-[var(--border)]/60 pt-2.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-body-small">Wide Ball Extra</div>
                      <div className="text-caption text-[var(--muted-foreground)]">Awards extra run to batting team</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={wideBall}
                      onChange={(e) => setWideBall(e.target.checked)}
                      className="accent-emerald-600 rounded shrink-0 w-4 h-4"
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
                        <span>Re-ball delivery</span>
                      </label>
                      <div className="flex items-center gap-1.5">
                        <span>Penalty:</span>
                        <NumericInput
                          min={1}
                          max={20}
                          fallback={1}
                          value={wideRun}
                          onChange={(val) => setWideRun(val)}
                          className="rounded bg-[var(--muted)] border font-bold text-center w-12 px-1 py-0.5 text-caption"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* No Ball Rules */}
                <div className="border-t border-[var(--border)]/60 pt-2.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-body-small">No Ball & Free Hit</div>
                      <div className="text-caption text-[var(--muted-foreground)]">Awards extra and activates Free Hit</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={noBall}
                      onChange={(e) => setNoBall(e.target.checked)}
                      className="accent-emerald-600 rounded shrink-0 w-4 h-4"
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
                        <span>Re-ball delivery</span>
                      </label>
                      <div className="flex items-center gap-1.5">
                        <span>Penalty:</span>
                        <NumericInput
                          min={1}
                          max={20}
                          fallback={1}
                          value={noBallRun}
                          onChange={(val) => setNoBallRun(val)}
                          className="rounded bg-[var(--muted)] border font-bold text-center w-12 px-1 py-0.5 text-caption"
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
            className="btn-primary py-3.5 px-6 rounded-xl text-body min-h-btn w-full font-black tracking-wide gap-2.5 shadow-sm active:scale-[0.99] transition-all"
          >
            <span>Next: Opening Players</span>
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
          className="fixed inset-0 !m-0 bg-slate-950/70 backdrop-blur-sm z-50 overflow-y-auto overscroll-contain flex justify-center items-start sm:items-center p-2.5 sm:p-4 min-h-full animate-fadeIn"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowTeamModal(null);
          }}
        >
          <div
            className="overflow-hidden bg-[var(--card)] border border-[var(--border)] shadow-floating-lg max-w-md rounded-2xl w-full flex flex-col max-h-[calc(100dvh-2rem)] sm:max-h-[85vh] my-auto animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 sm:px-5 py-3 shrink-0 bg-[var(--card)]">
              <h3 id="select-team-modal-title" className="font-extrabold text-body tracking-tight">Select Saved Team</h3>
              <button
                type="button"
                onClick={() => setShowTeamModal(null)}
                aria-label="Close Team Modal"
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
                    No saved teams found. Create your custom teams in the Squad Manager first.
                  </p>
                  <Link
                    href="/teams"
                    onClick={() => setShowTeamModal(null)}
                    className="btn-primary"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>Create Team</span>
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
                        {team.players.length} players
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
                  <span>Add New Team in Squad Manager</span>
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
