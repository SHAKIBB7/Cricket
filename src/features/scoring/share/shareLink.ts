/**
 * Live match share links (improvement run — sharing & exports).
 *
 * One canonical share target for a match: the public match
 * center (/matches/center/<id>). Both the match center and the
 * summary page share THIS link (the summary page previously
 * shared its own URL, which lands recipients on a post-match
 * screen instead of the live scorecard).
 *
 * Access rules are NOT changed here: a private match
 * (isPublic === false) stays owner-only on the backend — the
 * share flow only warns the sharer, via the toast copy from
 * shareToastMessage(), that the link will not open for anyone
 * else.
 */
import type { MatchScorecard } from '@/domain/cricket/types';

export function buildMatchCenterPath(matchId: string): string {
  return `/matches/center/${matchId}`;
}

export function buildMatchCenterUrl(matchId: string, origin?: string): string {
  const path = buildMatchCenterPath(matchId);
  if (origin) return `${origin.replace(/\/+$/, '')}${path}`;
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${path}`;
  }
  return path;
}

/** Only an explicit false is private; legacy matches (undefined) stay public. */
export function isPrivateMatch(match: Pick<MatchScorecard, 'isPublic'>): boolean {
  return match.isPublic === false;
}

export type ShareLinkOutcome = 'shared' | 'copied' | 'aborted' | 'unavailable';

export interface ShareLinkResult {
  outcome: ShareLinkOutcome;
  url: string;
  isPrivate: boolean;
}

type Translate = (key: string, fallback?: string) => string;
const passthrough: Translate = (_key, fallback) => fallback ?? _key;

/**
 * The AppToast copy for a finished share attempt. Returns null
 * when no toast is needed (a successful public share via the OS
 * sheet is its own confirmation, and a user-cancelled sheet
 * should stay silent). A PRIVATE match always earns a warning,
 * however the link left the device — the recipient cannot open
 * it, and the sharer should know before they send it on.
 */
export function shareToastMessage(
  result: ShareLinkResult,
  t: Translate = passthrough
): string | null {
  switch (result.outcome) {
    case 'copied':
      return result.isPrivate
        ? t(
            'share_link_private_copied',
            'Link copied — this is a private match, so only you can open it.'
          )
        : t('share_link_copied', 'Match link copied to clipboard!');
    case 'shared':
      return result.isPrivate
        ? t('share_link_private', 'Private match — only you can open this link.')
        : null;
    case 'aborted':
      return null;
    case 'unavailable':
    default:
      return t('share_link_failed', 'Unable to copy match link.');
  }
}

/**
 * Share the match-center link: Web Share API first (native
 * sheet), clipboard as the fallback. Never throws — every
 * failure mode is folded into the returned outcome so callers
 * can toast uniformly.
 */
export async function shareMatchCenterLink(
  match: MatchScorecard,
  origin?: string
): Promise<ShareLinkResult> {
  const url = buildMatchCenterUrl(match.id, origin);
  const base: Omit<ShareLinkResult, 'outcome'> = {
    url,
    isPrivate: isPrivateMatch(match),
  };

  const shareTitle = `${match.teamA} vs ${match.teamB} — Live Match Center`;
  const shareText =
    match.status === 'COMPLETED'
      ? `${match.teamA} vs ${match.teamB}: ${match.result || 'Match completed'}. Full scorecard on Cric Scorer Pro!`
      : `Live cricket score: ${match.teamA} vs ${match.teamB}. Follow the live scorecard on Cric Scorer Pro!`;

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: shareTitle, text: shareText, url });
      return { ...base, outcome: 'shared' };
    } catch (err: any) {
      if (err?.name === 'AbortError') return { ...base, outcome: 'aborted' };
      // A non-abort share failure falls through to the clipboard.
    }
  }

  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.clipboard?.writeText === 'function'
  ) {
    try {
      await navigator.clipboard.writeText(url);
      return { ...base, outcome: 'copied' };
    } catch {
      return { ...base, outcome: 'unavailable' };
    }
  }

  return { ...base, outcome: 'unavailable' };
}
