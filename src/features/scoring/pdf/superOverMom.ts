import type { InningsData, MatchScorecard } from '@/domain/cricket/types';

/**
 * L2: builds the ManOfTheMatchEngine super-over resolve option for the
 * PDF generators, in the same shape the summary and center pages use.
 * A tied match's award is incomplete without the super over: the
 * scorecard stores only the link (superOverMatchId) and the result,
 * so callers pass the loaded super-over scorecard here. Returns
 * undefined when there is nothing to add, keeping the plain resolve
 * (and its cache key) for ordinary matches.
 */
export function superOverMomOption(
  match: MatchScorecard,
  superOverMatch?: MatchScorecard | null
):
  | {
      superOver: {
        innings1?: InningsData;
        innings2?: InningsData;
        winner?: string;
      };
    }
  | undefined {
  if (!superOverMatch) return undefined;
  return {
    superOver: {
      innings1: superOverMatch.firstInnings,
      innings2: superOverMatch.secondInnings,
      winner: match.superOverResult?.winner,
    },
  };
}
