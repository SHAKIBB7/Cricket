'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  MapPin,
  Search,
  Plus,
  Navigation as NavIcon,
  X,
  AlertCircle,
  WifiOff,
  Check,
  Compass,
  Building,
  Bookmark,
  ExternalLink,
} from 'lucide-react';
import { CricketGround } from '@/domain/cricket/types';
import { GroundRepository, GroundStats } from '@/infrastructure/storage/GroundRepository';
import { GoogleMapsLoaderService, GoogleMapsStatus } from '@/infrastructure/maps/GoogleMapsLoaderService';
import { getCricketGroundMapIcon } from '@/components/maps/CricketMarkerIcon';

interface GroundSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectGround: (ground: CricketGround) => void;
  selectedGroundId?: string;
}

type TabType = 'places' | 'map' | 'custom' | 'saved';

export function GroundSelectorModal({
  isOpen,
  onClose,
  onSelectGround,
  selectedGroundId,
}: GroundSelectorModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('places');
  const [mapsStatus, setMapsStatus] = useState<GoogleMapsStatus>('IDLE');
  const [mapsError, setMapsError] = useState<string | undefined>();

  // Saved grounds
  const [savedGrounds, setSavedGrounds] = useState<CricketGround[]>([]);
  const [groundStatsMap, setGroundStatsMap] = useState<Record<string, GroundStats>>({});
  const [searchSavedQuery, setSearchSavedQuery] = useState('');
  const [isLoadingSaved, setIsLoadingSaved] = useState(true);

  // Places search tab state
  const [placesQuery, setPlacesQuery] = useState('');
  const [placesResults, setPlacesResults] = useState<
    Array<{
      name: string;
      address: string;
      latitude: number;
      longitude: number;
      placeId?: string;
    }>
  >([]);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState(false);
  const [placesSearchError, setPlacesSearchError] = useState<string | null>(null);

  // Map Picker tab state
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const googleMapRef = useRef<google.maps.Map | null>(null);
  const pickerMarkerRef = useRef<google.maps.Marker | null>(null);
  const [pickedLocation, setPickedLocation] = useState<{
    latitude: number;
    longitude: number;
    name: string;
    address: string;
  }>({
    latitude: 23.8103, // Default fallback (Dhaka) or London (51.5074, -0.1278)
    longitude: 90.4125,
    name: '',
    address: '',
  });

  const pickedLocationRef = useRef(pickedLocation);
  pickedLocationRef.current = pickedLocation;

  // Custom Local Ground tab state
  const [customName, setCustomName] = useState('');
  const [customLat, setCustomLat] = useState<string>('');
  const [customLng, setCustomLng] = useState<string>('');
  const [customAddress, setCustomAddress] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);

  // Geolocation state
  const [isLocating, setIsLocating] = useState(false);

  // Load saved grounds and initialize maps loader
  useEffect(() => {
    if (!isOpen) return;

    loadSavedGrounds();

    const unsubscribe = GoogleMapsLoaderService.subscribe((status, error) => {
      setMapsStatus(status);
      setMapsError(error);
    });

    // Check Google Maps load status
    GoogleMapsLoaderService.load().then((result) => {
      setMapsStatus(result.status);
      setMapsError(result.errorMessage);

      // If no API key or offline, suggest custom ground or saved grounds
      if (result.status === 'NO_API_KEY' || result.status === 'OFFLINE') {
        setActiveTab('custom');
      }
    });

    return () => {
      unsubscribe();
    };
  }, [isOpen]);

  async function loadSavedGrounds() {
    setIsLoadingSaved(true);
    try {
      const grounds = await GroundRepository.getAllGrounds();
      setSavedGrounds(grounds);

      const statsMap: Record<string, GroundStats> = {};
      for (const g of grounds) {
        statsMap[g.id] = await GroundRepository.getGroundStats(g.id);
      }
      setGroundStatsMap(statsMap);
    } catch (e) {
      console.error('Failed to load saved grounds:', e);
    } finally {
      setIsLoadingSaved(false);
    }
  }

  // Initialize interactive map for "Select on Map" tab
  useEffect(() => {
    if (activeTab !== 'map' || !mapContainerRef.current) return;

    const google = (window as any).google;
    if (!google?.maps) return;

    const initialPos = {
      lat: pickedLocationRef.current.latitude,
      lng: pickedLocationRef.current.longitude,
    };

    const map = new google.maps.Map(mapContainerRef.current, {
      center: initialPos,
      zoom: 13,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
    });

    googleMapRef.current = map;

    const marker = new google.maps.Marker({
      position: initialPos,
      map,
      draggable: true,
      icon: getCricketGroundMapIcon(true),
      title: 'Drag or click to choose cricket ground position',
    });

    pickerMarkerRef.current = marker;

    // Click on map moves marker
    map.addListener('click', (e: google.maps.MapMouseEvent) => {
      if (!e.latLng) return;
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();
      marker.setPosition({ lat, lng });
      setPickedLocation((prev) => ({
        ...prev,
        latitude: Number(lat.toFixed(6)),
        longitude: Number(lng.toFixed(6)),
      }));
    });

    // Marker drag end
    marker.addListener('dragend', () => {
      const pos = marker.getPosition();
      if (!pos) return;
      const lat = pos.lat();
      const lng = pos.lng();
      setPickedLocation((prev) => ({
        ...prev,
        latitude: Number(lat.toFixed(6)),
        longitude: Number(lng.toFixed(6)),
      }));
    });
  }, [activeTab, mapsStatus]);

  // Request explicit device geolocation
  const handleLocateMe = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsLocating(false);
        const lat = Number(position.coords.latitude.toFixed(6));
        const lng = Number(position.coords.longitude.toFixed(6));

        setPickedLocation((prev) => ({
          ...prev,
          latitude: lat,
          longitude: lng,
        }));
        setCustomLat(lat.toString());
        setCustomLng(lng.toString());

        if (googleMapRef.current && pickerMarkerRef.current) {
          googleMapRef.current.setCenter({ lat, lng });
          googleMapRef.current.setZoom(15);
          pickerMarkerRef.current.setPosition({ lat, lng });
        }
      },
      (error) => {
        setIsLocating(false);
        alert(
          error.code === error.PERMISSION_DENIED
            ? 'Location permission was denied. You can manually enter coordinates or pick on map.'
            : 'Unable to retrieve your location.'
        );
      },
      { timeout: 8000, enableHighAccuracy: true }
    );
  };

  // Google Places search execution
  const handlePlacesSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!placesQuery.trim()) return;

    const google = (window as any).google;
    if (!google?.maps?.places) {
      setPlacesSearchError('Google Places API is unavailable.');
      return;
    }

    setIsSearchingPlaces(true);
    setPlacesSearchError(null);

    // Create a dummy container for PlacesService
    const dummyDiv = document.createElement('div');
    const service = new google.maps.places.PlacesService(dummyDiv);

    service.textSearch(
      {
        query: `${placesQuery.trim()} cricket ground stadium`,
      },
      (results: google.maps.places.PlaceResult[] | null, status: google.maps.places.PlacesServiceStatus) => {
        setIsSearchingPlaces(false);
        if (status === google.maps.places.PlacesServiceStatus.OK && results && results.length > 0) {
          const formatted = results.map((r) => ({
            name: r.name || 'Cricket Ground',
            address: r.formatted_address || '',
            latitude: r.geometry?.location?.lat() || 0,
            longitude: r.geometry?.location?.lng() || 0,
            placeId: r.place_id,
          }));
          setPlacesResults(formatted);
        } else if (status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
          // Fallback search with generic query
          service.textSearch(
            { query: placesQuery.trim() },
            (subResults: google.maps.places.PlaceResult[] | null, subStatus: google.maps.places.PlacesServiceStatus) => {
              if (subStatus === google.maps.places.PlacesServiceStatus.OK && subResults && subResults.length > 0) {
                setPlacesResults(
                  subResults.map((r) => ({
                    name: r.name || 'Sports Ground',
                    address: r.formatted_address || '',
                    latitude: r.geometry?.location?.lat() || 0,
                    longitude: r.geometry?.location?.lng() || 0,
                    placeId: r.place_id,
                  }))
                );
              } else {
                setPlacesResults([]);
                setPlacesSearchError(`No cricket venues found for "${placesQuery}". Try a custom ground.`);
              }
            }
          );
        } else {
          setPlacesResults([]);
          setPlacesSearchError(
            mapsStatus === 'ERROR'
              ? (mapsError || 'Google Places API authentication or billing failed. Ensure Cloud Billing is enabled for your Google Cloud project and allowed in Credentials, or use the Custom Ground tab.')
              : 'Google Places search encountered an error. Please check connectivity or use the Custom Ground tab.'
          );
        }
      }
    );
  };

  // Select place from search results
  const handleSelectPlaceResult = async (result: {
    name: string;
    address: string;
    latitude: number;
    longitude: number;
    placeId?: string;
  }) => {
    try {
      const ground = await GroundRepository.findOrCreateFromPlace({
        name: result.name,
        latitude: result.latitude,
        longitude: result.longitude,
        googlePlaceId: result.placeId,
        address: result.address,
        locationSource: 'MAP_SELECTED',
      });
      onSelectGround(ground);
      onClose();
    } catch (err: any) {
      alert(`Could not save ground: ${err.message || err}`);
    }
  };

  // Submit map picker ground
  const handleSavePickedLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pickedLocation.name.trim()) {
      alert('Please enter a name for this cricket ground.');
      return;
    }

    try {
      const ground = await GroundRepository.saveGround({
        name: pickedLocation.name.trim(),
        latitude: pickedLocation.latitude,
        longitude: pickedLocation.longitude,
        address: pickedLocation.address.trim() || undefined,
        locationSource: 'MAP_SELECTED',
      });
      onSelectGround(ground);
      onClose();
    } catch (err: any) {
      alert(`Error saving ground: ${err.message || err}`);
    }
  };

  // Submit custom local ground
  const handleSaveCustomGround = async (e: React.FormEvent) => {
    e.preventDefault();
    setCustomError(null);

    const lat = parseFloat(customLat);
    const lng = parseFloat(customLng);

    if (isNaN(lat) || lat < -90 || lat > 90) {
      setCustomError('Latitude must be a valid number between -90 and 90.');
      return;
    }
    if (isNaN(lng) || lng < -180 || lng > 180) {
      setCustomError('Longitude must be a valid number between -180 and 180.');
      return;
    }

    try {
      const ground = await GroundRepository.saveGround({
        name: customName.trim(),
        latitude: lat,
        longitude: lng,
        address: customAddress.trim() || undefined,
        locationSource: 'MANUAL',
      });
      onSelectGround(ground);
      onClose();
    } catch (err: any) {
      setCustomError(err.message || 'Failed to save custom ground.');
    }
  };

  if (!isOpen) return null;

  const filteredSavedGrounds = savedGrounds.filter((g) => {
    if (!searchSavedQuery.trim()) return true;
    const q = searchSavedQuery.toLowerCase();
    return g.name.toLowerCase().includes(q) || (g.address && g.address.toLowerCase().includes(q));
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ground-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-fadeIn"
    >
      <div className="relative w-full max-w-2xl bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden text-[var(--foreground)]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-[var(--border)] bg-[var(--muted)]/40 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <h2 id="ground-modal-title" className="font-bold text-body leading-tight">Select Cricket Ground</h2>
              <p className="text-caption text-[var(--muted-foreground)]">
                Search Google Places, pick on map, or select a saved ground
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/grounds"
              target="_blank"
              className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline px-2.5 py-1.5 rounded-lg hover:bg-emerald-500/10 transition-colors"
              title="Open full interactive grounds map in new tab"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Full Map View</span>
            </Link>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--border)] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center border-b border-[var(--border)] bg-[var(--card)] px-2 sm:px-4 shrink-0 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('places')}
            className={`flex items-center gap-2 py-3 px-3 text-caption font-bold border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'places'
                ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
            }`}
          >
            <Search className="w-4 h-4" />
            <span>Search Places</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('map')}
            className={`flex items-center gap-2 py-3 px-3 text-caption font-bold border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'map'
                ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
            }`}
          >
            <Compass className="w-4 h-4" />
            <span>Pick on Map</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('custom')}
            className={`flex items-center gap-2 py-3 px-3 text-caption font-bold border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'custom'
                ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
            }`}
          >
            <Plus className="w-4 h-4" />
            <span>Custom Ground</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('saved')}
            className={`flex items-center gap-2 py-3 px-3 text-caption font-bold border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'saved'
                ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
            }`}
          >
            <Bookmark className="w-4 h-4" />
            <span>Saved ({savedGrounds.length})</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* TAB 1: GOOGLE PLACES SEARCH */}
          {activeTab === 'places' && (
            <div className="space-y-4">
              {mapsStatus !== 'LOADED' && (
                <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200 text-caption flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block font-bold">Google Maps API Unavailable</strong>
                    <span>
                      {mapsStatus === 'NO_API_KEY'
                        ? 'Google Maps API key is not configured in .env.local. You can choose from Saved Grounds or enter a Custom Ground offline.'
                        : mapsStatus === 'OFFLINE'
                        ? 'You are currently offline. Please use Saved Grounds or create a Custom Ground.'
                        : mapsError || 'Unable to connect to Google Maps Platform.'}
                    </span>
                  </div>
                </div>
              )}

              <form onSubmit={handlePlacesSearch} className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" />
                  <input
                    type="text"
                    value={placesQuery}
                    onChange={(e) => setPlacesQuery(e.target.value)}
                    placeholder="Search cricket grounds, stadiums, parks..."
                    className="w-full bg-[var(--muted)] border border-[var(--border)] rounded-xl pl-9 pr-3 py-2 text-body-small focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    disabled={mapsStatus !== 'LOADED'}
                  />
                </div>
                <button
                  type="submit"
                  disabled={mapsStatus !== 'LOADED' || isSearchingPlaces || !placesQuery.trim()}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-xl text-caption transition-colors shrink-0"
                >
                  {isSearchingPlaces ? 'Searching...' : 'Search'}
                </button>
              </form>

              {placesSearchError && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-caption flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{placesSearchError}</span>
                </div>
              )}

              {placesResults.length > 0 ? (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {placesResults.map((result, idx) => (
                    <div
                      key={result.placeId || idx}
                      className="p-3 rounded-xl border border-[var(--border)] hover:bg-[var(--muted)]/60 transition-colors flex items-center justify-between gap-3 cursor-pointer"
                      onClick={() => handleSelectPlaceResult(result)}
                    >
                      <div className="min-w-0">
                        <h4 className="font-bold text-body-small truncate text-emerald-700 dark:text-emerald-400">
                          {result.name}
                        </h4>
                        <p className="text-caption text-[var(--muted-foreground)] truncate mt-0.5">
                          {result.address || 'Address not available'}
                        </p>
                        <span className="text-[11px] font-mono text-[var(--muted-foreground)] opacity-75">
                          {result.latitude.toFixed(4)}, {result.longitude.toFixed(4)}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-caption font-bold rounded-lg shrink-0 shadow-xs"
                      >
                        Select
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-[var(--muted-foreground)] space-y-2">
                  <Building className="w-10 h-10 mx-auto opacity-30" />
                  <p className="text-caption">
                    Search for prominent venues (e.g., &quot;Melbourne Cricket Ground&quot;, &quot;Eden Gardens&quot;, or local sports fields).
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: SELECT ON MAP */}
          {activeTab === 'map' && (
            <div className="space-y-4">
              {!GoogleMapsLoaderService.isLoaded() && (mapsStatus === 'NO_API_KEY' || mapsStatus === 'OFFLINE') ? (
                <div
                  className={`p-4 rounded-xl border text-caption space-y-3 ${
                    mapsStatus === 'OFFLINE'
                      ? 'border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200'
                      : 'border-rose-500/30 bg-rose-500/10 text-rose-900 dark:text-rose-200'
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold">
                    {mapsStatus === 'OFFLINE' ? (
                      <WifiOff className="w-4 h-4" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                    )}
                    <span>
                      {mapsStatus === 'OFFLINE' ? 'Offline Mode Active' : 'Map View Unavailable'}
                    </span>
                  </div>
                  <p>
                    {mapsStatus === 'OFFLINE'
                      ? 'Interactive map tiles require internet connectivity. Please switch to the Custom Ground tab to enter coordinates directly.'
                      : 'Interactive map tiles require an internet connection and valid Google Maps API Key in .env.local or Vercel. Please switch to the Custom Ground tab to enter coordinates directly.'}
                  </p>
                  <div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('custom')}
                      className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-caption transition-colors inline-flex items-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Use Custom Ground Instead</span>
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {(mapsStatus === 'ERROR' || mapsError) && (
                    <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200 text-caption flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                        <span>
                          Cloud Billing is required to remove the development watermark. You can still pick coordinates on map or use Custom Ground.
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveTab('custom')}
                        className="underline font-bold shrink-0 text-emerald-600 dark:text-emerald-400"
                      >
                        Custom Ground
                      </button>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-caption">
                    <span className="text-[var(--muted-foreground)]">
                      Click the map or drag the pin to set ground location
                    </span>
                    <button
                      type="button"
                      onClick={handleLocateMe}
                      disabled={isLocating}
                      className="flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400 hover:underline disabled:opacity-50"
                    >
                      <NavIcon className="w-3.5 h-3.5" />
                      <span>{isLocating ? 'Locating...' : 'Locate Me'}</span>
                    </button>
                  </div>

                  <div className="relative w-full h-64 sm:h-72 rounded-xl overflow-hidden border border-[var(--border)] shadow-inner">
                    <div ref={mapContainerRef} className="w-full h-full" />
                  </div>

                  <form onSubmit={handleSavePickedLocation} className="space-y-3 pt-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-caption font-semibold mb-1">
                          Ground Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={pickedLocation.name}
                          onChange={(e) =>
                            setPickedLocation((prev) => ({ ...prev, name: e.target.value }))
                          }
                          placeholder="e.g. Riverside Cricket Club"
                          className="w-full bg-[var(--muted)] border border-[var(--border)] rounded-xl px-3 py-2 text-body-small focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>

                      <div>
                        <label className="block text-caption font-semibold mb-1">Address / Notes</label>
                        <input
                          type="text"
                          value={pickedLocation.address}
                          onChange={(e) =>
                            setPickedLocation((prev) => ({ ...prev, address: e.target.value }))
                          }
                          placeholder="e.g. North Oval, Sector 4"
                          className="w-full bg-[var(--muted)] border border-[var(--border)] rounded-xl px-3 py-2 text-body-small focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[11px] font-mono text-[var(--muted-foreground)]">
                        Lat: {pickedLocation.latitude.toFixed(6)} • Lng: {pickedLocation.longitude.toFixed(6)}
                      </span>

                      <button
                        type="submit"
                        disabled={!pickedLocation.name.trim()}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-xl text-caption transition-colors shadow-xs"
                      >
                        Save &amp; Select Ground
                      </button>
                    </div>
                  </form>
                </>
              )}
            </div>
          )}

          {/* TAB 3: CUSTOM LOCAL GROUND (OFFLINE FRIENDLY) */}
          {activeTab === 'custom' && (
            <form onSubmit={handleSaveCustomGround} className="space-y-4">
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-caption text-emerald-800 dark:text-emerald-300">
                <strong>Offline-Ready Custom Ground:</strong> Add unmapped or local village cricket grounds. Coordinates can be entered manually or populated via GPS.
              </div>

              {customError && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-caption flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{customError}</span>
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label className="block text-caption font-semibold mb-1">
                    Ground Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="e.g. Village Green Cricket Ground"
                    className="w-full bg-[var(--muted)] border border-[var(--border)] rounded-xl px-3 py-2 text-body-small focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-caption font-semibold">
                        Latitude <span className="text-red-500">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={handleLocateMe}
                        className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-0.5"
                      >
                        <NavIcon className="w-3 h-3" /> GPS
                      </button>
                    </div>
                    <input
                      type="number"
                      step="any"
                      required
                      value={customLat}
                      onChange={(e) => setCustomLat(e.target.value)}
                      placeholder="e.g. 51.5074"
                      className="w-full bg-[var(--muted)] border border-[var(--border)] rounded-xl px-3 py-2 text-body-small focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-caption font-semibold mb-1">
                      Longitude <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="any"
                      required
                      value={customLng}
                      onChange={(e) => setCustomLng(e.target.value)}
                      placeholder="e.g. -0.1278"
                      className="w-full bg-[var(--muted)] border border-[var(--border)] rounded-xl px-3 py-2 text-body-small focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-caption font-semibold mb-1">Address / Landmark (Optional)</label>
                  <input
                    type="text"
                    value={customAddress}
                    onChange={(e) => setCustomAddress(e.target.value)}
                    placeholder="e.g. Next to Community Centre"
                    className="w-full bg-[var(--muted)] border border-[var(--border)] rounded-xl px-3 py-2 text-body-small focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={!customName.trim() || !customLat || !customLng}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-xl text-caption transition-colors shadow-xs"
                >
                  Save &amp; Select Ground
                </button>
              </div>
            </form>
          )}

          {/* TAB 4: SAVED GROUNDS */}
          {activeTab === 'saved' && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" />
                <input
                  type="text"
                  value={searchSavedQuery}
                  onChange={(e) => setSearchSavedQuery(e.target.value)}
                  placeholder="Filter saved grounds by name or address..."
                  className="w-full bg-[var(--muted)] border border-[var(--border)] rounded-xl pl-9 pr-3 py-2 text-body-small focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {isLoadingSaved ? (
                <div className="py-8 text-center text-caption text-[var(--muted-foreground)]">
                  Loading saved grounds...
                </div>
              ) : filteredSavedGrounds.length === 0 ? (
                <div className="py-8 text-center text-[var(--muted-foreground)] space-y-2">
                  <Bookmark className="w-10 h-10 mx-auto opacity-30" />
                  <p className="text-caption">
                    {savedGrounds.length === 0
                      ? 'No grounds saved yet. Use Google Places search or add a custom ground above.'
                      : 'No saved grounds matched your filter query.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {filteredSavedGrounds.map((ground) => {
                    const stats = groundStatsMap[ground.id];
                    const isSelected = selectedGroundId === ground.id;

                    return (
                      <div
                        key={ground.id}
                        onClick={() => {
                          onSelectGround(ground);
                          onClose();
                        }}
                        className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-3 cursor-pointer ${
                          isSelected
                            ? 'border-emerald-500 bg-emerald-500/10'
                            : 'border-[var(--border)] hover:bg-[var(--muted)]/60'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-body-small text-emerald-700 dark:text-emerald-400 truncate">
                              {ground.name}
                            </span>
                            {isSelected && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-600 text-white font-bold">
                                Current
                              </span>
                            )}
                          </div>
                          {ground.address && (
                            <p className="text-caption text-[var(--muted-foreground)] truncate mt-0.5">
                              {ground.address}
                            </p>
                          )}
                          <div className="flex items-center gap-3 text-[11px] text-[var(--muted-foreground)] mt-1">
                            <span>
                              {stats?.totalMatches || 0} {stats?.totalMatches === 1 ? 'match' : 'matches'} played
                            </span>
                            <span>•</span>
                            <span className="font-mono">
                              {ground.latitude.toFixed(4)}, {ground.longitude.toFixed(4)}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-caption font-bold rounded-lg shrink-0 shadow-xs"
                        >
                          Select
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
