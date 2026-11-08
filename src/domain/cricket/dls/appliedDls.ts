import type { AdvancedSettings } from '../types';

/**
 * The single source of truth for "what DLS target is currently in
 * force" (Ultimate audit F3).
 *
 * The engine stores the applied target on advancedSettings when
 * applyDlsTarget runs, and mirrors it into targetScore. Historically
 * every UI surface that wanted the number either read targetScore
 * (correct but unexplained) or RECOMPUTED a fresh DLS result from
 * current match state — which can legitimately differ from the
 * applied target once play continues, inviting a silent re-apply of
 * a different target. Surfaces should read the applied value from
 * here; DlsEngine.calculate stays reserved for genuinely new
 * calculations (a fresh interruption, live par).
 */
export interface AppliedDlsTarget {
  revisedTarget: number;
  revisedOvers: number;
}

export function getAppliedDlsTarget(
  settings: AdvancedSettings | null | undefined,
): AppliedDlsTarget | null {
  if (!settings?.dlsApplied) return null;
  const { dlsRevisedTarget, dlsRevisedOvers } = settings;
  if (typeof dlsRevisedTarget !== 'number' || !(dlsRevisedTarget > 0)) return null;
  return {
    revisedTarget: dlsRevisedTarget,
    revisedOvers: typeof dlsRevisedOvers === 'number' && dlsRevisedOvers > 0 ? dlsRevisedOvers : 0,
  };
}
