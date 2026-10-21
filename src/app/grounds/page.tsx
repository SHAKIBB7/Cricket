'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  MapPin,
  Search,
  Plus,
  Play,
  History,
  Trash2,
  Maximize2,
  Navigation as NavIcon,
  AlertCircle,
  WifiOff,
  Filter,
  CheckCircle,
  Building,
  ChevronRight,
} from 'lucide-react';
import { CricketGround } from '@/domain/cricket/types';
import { GroundRepository, GroundStats } from '@/infrastructure/storage/GroundRepository';
import dynamic from 'next/dynamic';
import { getCricketGroundMapIcon } from '@/components/maps/CricketMarkerIcon';
import { AutoGpsLocationService, GpsLocationResult } from '@/infrastructure/gps/AutoGpsLocationService';
import { GoogleMapsLoaderService, GoogleMapsStatus } from '@/infrastructure/maps/GoogleMapsLoaderService';

const GroundSelectorModal = dynamic(
  () => import('@/components/modals/GroundSelectorModal').then((mod) => mod.GroundSelectorModal),
  { ssr: false }
);

export default function GroundsPage() {
  const router = useRouter();

  const [grounds, setGrounds] = useState<CricketGround[]>([]);
  const [statsMap, setStatsMap] = useState<Record<string, GroundStats>>({});
  const [selectedGround, setSelectedGround] = useState<CricketGround | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [activityFilter, setActivityFilter] = useState<'ALL' | 'ACTIVE' | 'RECENT'>('ALL');

  // Maps API state
  const [mapsStatus, setMapsStatus] = useState<GoogleMapsStatus>('IDLE');
  const [mapsError, setMapsError] = useState<string | undefined>();
  const [isLocating, setIsLocating] = useState(false);
  const [userGps, setUserGps] = useState<GpsLocationResult | null>(null);

  // Modal
  const [showAddModal, setShowAddModal] = useState(false);

  // Google Maps DOM & Instances
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const googleMapInstanceRef = useRef<google.maps.Map | null>(null);
  const markersMapRef = useRef<Map<string, google.maps.Marker>>(new Map());

  // Load grounds and statistics
  const loadGroundsData = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const allGrounds = await GroundRepository.getAllGrounds();
      setGrounds(allGrounds);

      const statsRecord: Record<string, GroundStats> = {};
      for (const g of allGrounds) {
        statsRecord[g.id] = await GroundRepository.getGroundStats(g.id);
      }
      setStatsMap(statsRecord);

      // Default select first ground if none selected
      if (allGrounds.length > 0) {
        setSelectedGround((prev) => prev || allGrounds[0]);
      }
    } catch (err) {
      console.error('Failed to load grounds data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGroundsData();

    // Check Google Maps loader
    GoogleMapsLoaderService.load().then((res) => {
      setMapsStatus(res.status);
      setMapsError(res.errorMessage);
    });

    // Proactively check location permissions
    AutoGpsLocationService.checkPermission().then((perm) => {
      if (perm === 'granted') {
        AutoGpsLocationService.getCurrentPosition()
          .then((pos) => setUserGps(pos))
          .catch(() => {});
      }
    });
  }, [loadGroundsData]);

  // Filtered grounds
  const filteredGrounds = useMemo(() => {
    return grounds.filter((g) => {
      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = g.name.toLowerCase().includes(q);
        const matchesAddress = g.address?.toLowerCase().includes(q);
        if (!matchesName && !matchesAddress) return false;
      }

      const stats = statsMap[g.id];
      const matchCount = stats?.totalMatches || 0;

      // Activity filter
      if (activityFilter === 'ACTIVE' && matchCount === 0) {
        return false;
      }
      if (activityFilter === 'RECENT' && !stats?.mostRecentMatchDate) {
        return false;
      }

      return true;
    });
  }, [grounds, statsMap, searchQuery, activityFilter]);

  // Initialize Google Map
  useEffect(() => {
    if (mapsStatus !== 'LOADED' || !mapElementRef.current || googleMapInstanceRef.current) return;

    const google = (window as any).google;
    if (!google?.maps) return;

    // Center on selected ground or default coordinate
    const center = selectedGround
      ? { lat: selectedGround.latitude, lng: selectedGround.longitude }
      : grounds.length > 0
      ? { lat: grounds[0].latitude, lng: grounds[0].longitude }
      : { lat: 20.5937, lng: 78.9629 };

    const map = new google.maps.Map(mapElementRef.current, {
      center,
      zoom: selectedGround ? 14 : 5,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      zoomControl: true,
      gestureHandling: 'greedy',
    });

    googleMapInstanceRef.current = map;
  }, [mapsStatus, grounds, selectedGround]);

  // Synchronize Markers with Filtered Grounds
  useEffect(() => {
    if (mapsStatus !== 'LOADED' || !googleMapInstanceRef.current) return;

    const google = (window as any).google;
    if (!google?.maps) return;

    const map = googleMapInstanceRef.current;
    const currentMarkers = markersMapRef.current;

    // Clear previous markers
    currentMarkers.forEach((marker) => marker.setMap(null));
    currentMarkers.clear();

    if (filteredGrounds.length === 0) return;

    const bounds = new google.maps.LatLngBounds();

    filteredGrounds.forEach((ground) => {
      const isSelected = selectedGround?.id === ground.id;
      const marker = new google.maps.Marker({
        position: { lat: ground.latitude, lng: ground.longitude },
        map,
        title: ground.name,
        icon: getCricketGroundMapIcon(isSelected),
        animation: isSelected ? google.maps.Animation.DROP : undefined,
      });

      marker.addListener('click', () => {
        setSelectedGround(ground);
        map.panTo({ lat: ground.latitude, lng: ground.longitude });
      });

      currentMarkers.set(ground.id, marker);
      bounds.extend({ lat: ground.latitude, lng: ground.longitude });
    });

    // Auto fit bounds if multiple markers exist and user hasn't explicitly clicked a ground
    if (filteredGrounds.length > 1 && !selectedGround) {
      map.fitBounds(bounds, { top: 40, right: 40, bottom: 40, left: 40 });
    }
  }, [filteredGrounds, mapsStatus, selectedGround]);

  // Update Marker Selection State & Pan
  useEffect(() => {
    if (!selectedGround || mapsStatus !== 'LOADED') return;

    const google = (window as any).google;
    if (!google?.maps) return;

    // Update icons: highlight selected, normal for others
    markersMapRef.current.forEach((marker, id) => {
      const isSelected = id === selectedGround.id;
      marker.setIcon(getCricketGroundMapIcon(isSelected));
      if (isSelected) {
        marker.setZIndex(999);
      } else {
        marker.setZIndex(1);
      }
    });

    // Pan map smoothly to selected ground
    if (googleMapInstanceRef.current) {
      googleMapInstanceRef.current.panTo({
        lat: selectedGround.latitude,
        lng: selectedGround.longitude,
      });
    }
  }, [selectedGround, mapsStatus]);

  // Fit bounds to all current markers
  const handleFitBounds = () => {
    if (!googleMapInstanceRef.current || filteredGrounds.length === 0) return;

    const google = (window as any).google;
    if (!google?.maps) return;

    const bounds = new google.maps.LatLngBounds();
    filteredGrounds.forEach((g) => {
      bounds.extend({ lat: g.latitude, lng: g.longitude });
    });

    googleMapInstanceRef.current.fitBounds(bounds, { top: 40, right: 40, bottom: 40, left: 40 });
  };

  // Request user GPS location
  const handleLocateMe = async () => {
    setIsLocating(true);
    try {
      const pos = await AutoGpsLocationService.getCurrentPosition();
      setUserGps(pos);

      if (googleMapInstanceRef.current) {
        googleMapInstanceRef.current.panTo({ lat: pos.latitude, lng: pos.longitude });
        googleMapInstanceRef.current.setZoom(15);
      }
    } catch (err: any) {
      alert(err.message || 'Unable to retrieve location.');
    } finally {
      setIsLocating(false);
    }
  };

  // Delete Ground action
  const handleDeleteGround = async (ground: CricketGround, e: React.MouseEvent) => {
    e.stopPropagation();
    const stats = statsMap[ground.id];
    const matchCount = stats?.totalMatches || 0;

    const confirmMsg =
      matchCount > 0
        ? `Are you sure you want to delete "${ground.name}"? ${matchCount} matches played here will retain the venue name in history.`
        : `Delete "${ground.name}" from saved cricket grounds?`;

    if (!confirm(confirmMsg)) return;

    await GroundRepository.deleteGround(ground.id);
    if (selectedGround?.id === ground.id) {
      setSelectedGround(null);
    }
    loadGroundsData();
  };

  const selectedStats = selectedGround ? statsMap[selectedGround.id] : null;

  return (
    <div className="w-full flex-1 flex flex-col gap-3 min-h-0 pb-safe pb-8">
      {/* ── TOP HEADER / TOOLBAR ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--card)] border border-[var(--border)] rounded-2xl p-3.5 sm:p-4 shadow-floating shrink-0">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 shrink-0 hidden sm:flex">
            <MapPin className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div>
            <h1 className="font-black tracking-tight text-h2 leading-tight">Cricket Grounds Map</h1>
            <p className="text-caption text-[var(--muted-foreground)]">
              Discover, save, and revisit grounds hosting your cricket matches
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="btn-primary py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold shadow-xs active:scale-95"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>Add Ground</span>
          </button>
        </div>
      </div>

      {/* ── API KEY, OFFLINE, OR ERROR NOTICE BANNERS ── */}
      {mapsStatus === 'NO_API_KEY' && (
        <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200 text-caption flex items-start gap-2.5 shrink-0">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
          <div className="min-w-0">
            <strong className="block font-bold">Google Maps API Key Not Configured</strong>
            <span>
              Google Maps tiles and Places search require a key. Add{' '}
              <code className="font-mono px-1 py-0.5 rounded bg-black/10 dark:bg-white/10">
                NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
              </code>{' '}
              to <code className="font-mono">.env.local</code> (for local development) or your Vercel Project Environment Variables. All your saved grounds, match records, and custom offline grounds remain fully functional below.
            </span>
          </div>
        </div>
      )}

      {mapsStatus === 'ERROR' && (
        <div className="p-3.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-900 dark:text-rose-200 text-caption flex items-start gap-2.5 shrink-0">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
          <div className="min-w-0 space-y-1">
            <strong className="block font-bold">Google Maps Platform Authentication / Billing Notice</strong>
            <span>
              {mapsError ||
                'Google Maps failed to authenticate. If you deployed to Vercel, ensure NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is added to Vercel Environment Variables, Cloud Billing is enabled for project 687129620648, and your deployment domain (https://*.vercel.app/*) is allowed under Credentials.'}
            </span>
            <div className="text-[11px] opacity-90 pt-0.5">
              <span>Tip: All saved grounds and match stats remain 100% accessible. You can also add custom grounds manually below.</span>
            </div>
          </div>
        </div>
      )}

      {mapsStatus === 'OFFLINE' && (
        <div className="p-3.5 rounded-xl border border-blue-500/30 bg-blue-500/10 text-blue-900 dark:text-blue-200 text-caption flex items-start gap-2.5 shrink-0">
          <WifiOff className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <strong className="block font-bold">Offline Mode Active</strong>
            <span>
              Interactive Google Maps tiles require internet connectivity. You can view your saved grounds, inspect match history, and create custom grounds offline.
            </span>
          </div>
        </div>
      )}

      {/* ── MAIN WORKSPACE: MAP VIEW & GROUNDS EXPLORER ── */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-3.5 min-h-[500px]">
        {/* LEFT COLUMN: INTERACTIVE MAP & MAP OVERLAYS (8 cols on Desktop) */}
        <div className="lg:col-span-8 flex flex-col gap-2.5 relative min-h-[360px] lg:min-h-0 bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-floating">
          {/* Map Floating Controls Header */}
          <div className="absolute top-3 left-3 right-3 z-10 flex items-center justify-between pointer-events-none gap-2">
            {/* Quick search input */}
            <div className="relative pointer-events-auto w-full max-w-xs shadow-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search grounds..."
                className="w-full bg-[var(--card)]/95 backdrop-blur-md border border-[var(--border)] rounded-xl pl-9 pr-3 py-2 text-caption focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
              />
            </div>

            {/* Map action buttons */}
            <div className="flex items-center gap-1.5 pointer-events-auto shrink-0 shadow-md">
              <button
                type="button"
                onClick={handleFitBounds}
                disabled={filteredGrounds.length === 0}
                className="p-2 rounded-xl bg-[var(--card)]/95 backdrop-blur-md border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors disabled:opacity-40"
                title="Fit map to all saved grounds"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleLocateMe}
                disabled={isLocating}
                className="p-2 rounded-xl bg-[var(--card)]/95 backdrop-blur-md border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors disabled:opacity-40"
                title="Center on my location"
              >
                <NavIcon className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Map Canvas or Offline/No-Key Fallback Canvas */}
          {mapsStatus === 'LOADED' ? (
            <div ref={mapElementRef} className="w-full h-full min-h-[360px]" />
          ) : (
            <div className="w-full h-full min-h-[360px] flex flex-col items-center justify-center p-6 text-center space-y-3 bg-[var(--muted)]/30">
              <div className="p-4 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <MapPin className="w-10 h-10" />
              </div>
              <div className="max-w-md space-y-1">
                <h3 className="font-extrabold text-body">
                  {mapsStatus === 'OFFLINE'
                    ? 'Offline Cricket Grounds'
                    : mapsStatus === 'ERROR'
                    ? 'Google Maps Key / Billing Setup Notice'
                    : 'Google Maps View Offline'}
                </h3>
                <p className="text-caption text-[var(--muted-foreground)]">
                  {mapsStatus === 'OFFLINE'
                    ? 'Satellite and street map tiles cannot be fetched offline. All saved grounds and match counts are listed in the side panel.'
                    : mapsStatus === 'ERROR'
                    ? (mapsError || 'Google Cloud requires active billing and allowed referrers to load map tiles.')
                    : 'Configure your Google Maps API key in .env.local or Vercel Environment Variables to activate full satellite and street maps.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-caption transition-colors shadow-xs"
              >
                + Add Custom Ground
              </button>
            </div>
          )}

          {/* Mobile Bottom Selected Ground Floating Summary Bar */}
          {selectedGround && (
            <div className="lg:hidden absolute bottom-3 left-3 right-3 z-10 bg-[var(--card)]/95 backdrop-blur-md border border-[var(--border)] rounded-xl p-3 shadow-xl flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h4 className="font-bold text-body-small truncate text-emerald-700 dark:text-emerald-400">
                  {selectedGround.name}
                </h4>
                <p className="text-[11px] text-[var(--muted-foreground)] truncate">
                  {selectedStats?.totalMatches || 0} matches • {selectedGround.address || 'Address not listed'}
                </p>
              </div>
              <Link
                href={`/matches/new?groundId=${selectedGround.id}`}
                className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg font-bold text-caption shrink-0 flex items-center gap-1 shadow-xs"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Play</span>
              </Link>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: GROUND DETAILS & SAVED GROUNDS DIRECTORY (4 cols on Desktop) */}
        <div className="lg:col-span-4 flex flex-col gap-3 min-h-0">
          {/* Active / Selected Ground Details Card */}
          {selectedGround ? (
            <div className="bg-[var(--card)] border border-emerald-500/40 rounded-2xl p-4 sm:p-5 shadow-floating space-y-3.5 shrink-0 animate-fadeIn">
              <div className="flex items-start justify-between gap-2 border-b border-[var(--border)] pb-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-caption font-bold text-emerald-600 dark:text-emerald-400">
                    <CheckCircle className="w-4 h-4 shrink-0" />
                    <span>Selected Ground</span>
                  </div>
                  <h3 className="font-extrabold text-body sm:text-h3 leading-tight mt-0.5 truncate text-[var(--foreground)]">
                    {selectedGround.name}
                  </h3>
                  {selectedGround.address && (
                    <p className="text-caption text-[var(--muted-foreground)] mt-0.5 line-clamp-2">
                      {selectedGround.address}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={(e) => handleDeleteGround(selectedGround, e)}
                  className="p-1.5 rounded-lg text-red-500 hover:bg-red-500/10 transition-colors shrink-0"
                  title="Delete this ground"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {/* Match Statistics Badges */}
              <div className="grid grid-cols-2 gap-2 text-caption">
                <div className="p-2.5 rounded-xl bg-[var(--muted)]/60 border border-[var(--border)]">
                  <span className="text-[11px] text-[var(--muted-foreground)] block">Matches Played</span>
                  <strong className="text-body font-black text-emerald-600 dark:text-emerald-400">
                    {selectedStats?.totalMatches || 0}
                  </strong>
                </div>

                <div className="p-2.5 rounded-xl bg-[var(--muted)]/60 border border-[var(--border)]">
                  <span className="text-[11px] text-[var(--muted-foreground)] block">Most Recent</span>
                  <span className="text-[12px] font-bold truncate block">
                    {selectedStats?.mostRecentMatchDate
                      ? new Date(selectedStats.mostRecentMatchDate).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })
                      : 'None yet'}
                  </span>
                </div>
              </div>

              {/* Distance from current user position */}
              {userGps && (
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1.5 rounded-lg">
                  <MapPin className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    ~{AutoGpsLocationService.formatDistance(
                      AutoGpsLocationService.calculateDistanceMeters(
                        userGps.latitude,
                        userGps.longitude,
                        selectedGround.latitude,
                        selectedGround.longitude
                      )
                    )}{' '}
                    from your location
                  </span>
                </div>
              )}

              {/* Geographic Coordinates & Source */}
              <div className="flex flex-col gap-1 text-[11px] text-[var(--muted-foreground)] bg-[var(--muted)]/40 p-2 rounded-lg">
                <div className="flex items-center justify-between font-mono">
                  <span>Lat: {selectedGround.latitude.toFixed(5)}</span>
                  <span>•</span>
                  <span>Lng: {selectedGround.longitude.toFixed(5)}</span>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-[var(--border)]/50 text-[10px]">
                  <span className="font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                    Source: {selectedGround.locationSource || 'MAP_SELECTED'}
                  </span>
                  {selectedGround.accuracy && (
                    <span>Accuracy: ±{selectedGround.accuracy}m</span>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-1">
                <Link
                  href={`/matches/new?groundId=${selectedGround.id}`}
                  className="btn-primary w-full py-3 rounded-xl font-black text-caption shadow-xs active:scale-[0.98]"
                >
                  <Play className="w-4 h-4 fill-current shrink-0" />
                  <span>Start Match Here</span>
                </Link>

                <div className="grid grid-cols-2 gap-2">
                  <Link
                    href={`/matches/history?groundId=${selectedGround.id}`}
                    className="btn-secondary py-2 px-2 text-caption font-bold text-center truncate"
                  >
                    <History className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">History ({selectedStats?.totalMatches || 0})</span>
                  </Link>

                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${selectedGround.latitude},${selectedGround.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary py-2 px-2 text-caption font-bold text-center truncate"
                  >
                    <NavIcon className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">Directions</span>
                  </a>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 shadow-floating text-center text-[var(--muted-foreground)] space-y-2 shrink-0">
              <MapPin className="w-8 h-8 mx-auto opacity-30 text-emerald-600" />
              <p className="text-caption font-semibold">Select a marker on the map to view ground details</p>
            </div>
          )}

          {/* Saved Grounds Directory & Filter Bar */}
          <div className="flex-1 flex flex-col bg-[var(--card)] border border-[var(--border)] rounded-2xl p-3.5 sm:p-4 shadow-floating min-h-0">
            {/* Filter Chips - Segmented Control */}
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-2.5 mb-2.5">
              <span className="font-extrabold text-caption tracking-wider uppercase text-[var(--muted-foreground)]">
                Saved Grounds ({filteredGrounds.length})
              </span>

              <div className="segmented-control p-0.5">
                <button
                  type="button"
                  onClick={() => setActivityFilter('ALL')}
                  className={`text-[11px] py-1 px-2.5 rounded-lg font-bold transition-all ${
                    activityFilter === 'ALL'
                      ? 'bg-[var(--card)] text-emerald-600 dark:text-emerald-400 shadow-xs border border-[var(--border)]/70 font-black'
                      : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  }`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setActivityFilter('ACTIVE')}
                  className={`text-[11px] py-1 px-2.5 rounded-lg font-bold transition-all ${
                    activityFilter === 'ACTIVE'
                      ? 'bg-[var(--card)] text-emerald-600 dark:text-emerald-400 shadow-xs border border-[var(--border)]/70 font-black'
                      : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  }`}
                >
                  Played
                </button>
              </div>
            </div>

            {/* Grounds List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[160px]">
              {isLoading ? (
                <div className="py-8 text-center text-caption text-[var(--muted-foreground)]">
                  Loading grounds...
                </div>
              ) : filteredGrounds.length === 0 ? (
                <div className="py-8 text-center text-[var(--muted-foreground)] space-y-2">
                  <Building className="w-8 h-8 mx-auto opacity-30" />
                  <p className="text-caption">
                    {grounds.length === 0
                      ? 'No grounds saved yet. Click "+ Add Ground" to add your first venue.'
                      : 'No grounds match your filter query.'}
                  </p>
                </div>
              ) : (
                filteredGrounds.map((ground) => {
                  const isSelected = selectedGround?.id === ground.id;
                  const stats = statsMap[ground.id];
                  const matchCount = stats?.totalMatches || 0;

                  return (
                    <div
                      key={ground.id}
                      onClick={() => setSelectedGround(ground)}
                      className={`p-2.5 rounded-xl border transition-all flex items-center justify-between gap-2.5 cursor-pointer ${
                        isSelected
                          ? 'border-emerald-500 bg-emerald-500/10 shadow-xs'
                          : 'border-[var(--border)] hover:bg-[var(--muted)]/60'
                      }`}
                    >
                      <div className="min-w-0">
                        <h4 className="font-bold text-body-small truncate text-emerald-800 dark:text-emerald-300">
                          {ground.name}
                        </h4>
                        <div className="flex items-center gap-2 text-[11px] text-[var(--muted-foreground)] mt-0.5">
                          <span>
                            {matchCount} {matchCount === 1 ? 'match' : 'matches'}
                          </span>
                          <span>•</span>
                          <span className="truncate">{ground.address || 'Custom Venue'}</span>
                        </div>
                      </div>

                      <ChevronRight
                        className={`w-4 h-4 shrink-0 transition-transform ${
                          isSelected ? 'text-emerald-600 rotate-90' : 'text-[var(--muted-foreground)] opacity-50'
                        }`}
                      />
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── GROUND SELECTOR / ADD MODAL ── */}
      {showAddModal && (
        <GroundSelectorModal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          onSelectGround={(newGround) => {
            setSelectedGround(newGround);
            loadGroundsData();
          }}
        />
      )}
    </div>
  );
}
