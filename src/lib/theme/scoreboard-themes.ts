export interface ScoreboardTheme {
  id: string;
  name: string;
  primary: string;
  secondary: string;
  background: string;
  deep: string;
  overlay: string;
  panel: string;
  strongText: string;
  bowlerAccent: string;
}

export const SCOREBOARD_THEMES: ScoreboardTheme[] = [
  {
    id: 'sunrise',
    name: 'Sunrise',
    primary: '#FF5722',
    secondary: '#FF9800',
    background: '#FFF8F6',
    deep: '#BF360C',
    overlay: '#FFFFFF',
    panel: '#FFFFFF',
    strongText: '#261815',
    bowlerAccent: '#D84315',
  },
  {
    id: 'ocean',
    name: 'Ocean',
    primary: '#0D6EFD',
    secondary: '#0284C7',
    background: '#F0F6FF',
    deep: '#0A2540',
    overlay: '#FFFFFF',
    panel: '#FFFFFF',
    strongText: '#0A192F',
    bowlerAccent: '#0A58CA',
  },
  {
    id: 'midnight',
    name: 'Midnight',
    primary: '#059669',
    secondary: '#10B981',
    background: '#F1F5F9',
    deep: '#0F172A',
    overlay: '#FFFFFF',
    panel: '#FFFFFF',
    strongText: '#0B1320',
    bowlerAccent: '#047857',
  },
  {
    id: 'stadium_green',
    name: 'Stadium Green',
    primary: '#1B7A4E',
    secondary: '#2E7D32',
    background: '#E8F5E9',
    deep: '#0A3322',
    overlay: '#FFFFFF',
    panel: '#FAFEFC',
    strongText: '#0A1810',
    bowlerAccent: '#156240',
  },
  {
    id: 'sunlight_contrast',
    name: 'Sunlight Contrast',
    primary: '#D97706',
    secondary: '#F59E0B',
    background: '#FFFBEB',
    deep: '#451A03',
    overlay: '#FFFFFF',
    panel: '#FFFFFF',
    strongText: '#1C1917',
    bowlerAccent: '#92400E',
  },
  {
    id: 'royal_violet',
    name: 'Royal Violet',
    primary: '#7C3AED',
    secondary: '#C026D3',
    background: '#FAF5FF',
    deep: '#3B0764',
    overlay: '#FFFFFF',
    panel: '#FFFFFF',
    strongText: '#1E1035',
    bowlerAccent: '#6D28D9',
  },
];
