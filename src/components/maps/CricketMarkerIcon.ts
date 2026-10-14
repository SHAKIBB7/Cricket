/**
 * CricketMarkerIcon — Custom Cricket-Themed Map Pin Icons
 *
 * Provides crisp SVG-based cricket ball and stadium pin markers designed for
 * high-DPI retina rendering on Google Maps.
 */

export function getCricketBallMarkerSvg(options?: {
  isSelected?: boolean;
  matchCount?: number;
}): string {
  const isSelected = options?.isSelected || false;
  const pinColor = isSelected ? '#059669' : '#dc2626'; // Emerald if selected, Cricket Red otherwise
  const strokeColor = '#ffffff';

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 48" width="40" height="48">
      <!-- Pin Drop Shadow -->
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000" flood-opacity="0.35"/>
      </filter>
      
      <!-- Main Pin Body -->
      <path d="M20 47 C20 47 37 30 37 19 A17 17 0 0 0 3 19 C3 30 20 47 20 47 Z" 
            fill="${pinColor}" 
            stroke="#ffffff" 
            stroke-width="1.5"
            filter="url(#shadow)"/>
      
      <!-- Cricket Ball Sphere -->
      <circle cx="20" cy="18" r="11" fill="#b91c1c" stroke="#fecaca" stroke-width="0.8"/>
      
      <!-- Cricket Ball White Seam (curved arc with stitch notches) -->
      <path d="M12 12 Q 20 18 28 24" 
            stroke="#ffffff" 
            stroke-width="1.4" 
            stroke-dasharray="1.5,1.2" 
            fill="none"/>
      
      <!-- Seam Highlight -->
      <path d="M11 14 Q 19 20 27 26" 
            stroke="#ffffff" 
            stroke-width="0.6" 
            stroke-opacity="0.6" 
            stroke-dasharray="1,1" 
            fill="none"/>
      
      <!-- Inner Gloss Accent -->
      <circle cx="16" cy="14" r="2.5" fill="#ffffff" opacity="0.35"/>
    </svg>
  `.trim();
}

/**
 * Returns a Google Maps standard Icon object using an encoded SVG data URI.
 */
export function getCricketGroundMapIcon(isSelected: boolean = false): google.maps.Icon | undefined {
  if (typeof window === 'undefined' || !(window as any).google?.maps) {
    return undefined;
  }

  const svg = getCricketBallMarkerSvg({ isSelected });
  const encoded = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;

  return {
    url: encoded,
    scaledSize: new google.maps.Size(isSelected ? 44 : 36, isSelected ? 52 : 44),
    origin: new google.maps.Point(0, 0),
    anchor: new google.maps.Point(isSelected ? 22 : 18, isSelected ? 52 : 44),
  };
}
