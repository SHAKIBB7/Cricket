/**
 * MatchNarrativeEngine
 * 
 * Generates natural language match report narratives and sports journalism highlights
 * in both English and Bengali (বাংলা) from a MatchScorecard.
 */

import { MatchScorecard, Player, Bowler } from '../types';
import { cleanPlayerName, strikeRate, economyRate } from '../formatters';
import { ManOfTheMatchEngine } from './ManOfTheMatchEngine';

export interface MatchNarrative {
  headlineEn: string;
  headlineBn: string;
  summaryEn: string;
  summaryBn: string;
  battingHighlightsEn: string;
  battingHighlightsBn: string;
  bowlingHighlightsEn: string;
  bowlingHighlightsBn: string;
  motmHighlightEn: string;
  motmHighlightBn: string;
  fullReportEn: string;
  fullReportBn: string;
}

function toBnDigits(num: number | string): string {
  const bnDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  return String(num).replace(/[0-9]/g, (d) => bnDigits[Number(d)]);
}

export class MatchNarrativeEngine {
  public static generateNarrative(match: MatchScorecard): MatchNarrative {
    const teamA = match.teamA || 'Team A';
    const teamB = match.teamB || 'Team B';
    const winner = match.winner;
    const loser = match.loser;
    const isTie = match.resultType === 'TIE';
    const isSuperOver = !!match.superOverMatchId || !!match.advancedSettings?.isSuperOver;

    // Top Batsman
    let topBatter: { player: Player; team: string } | null = null;
    const allBatters: { player: Player; team: string }[] = [];
    if (match.firstInnings) {
      match.firstInnings.players.forEach((p) => allBatters.push({ player: p, team: match.firstInnings!.team }));
    }
    if (match.secondInnings) {
      match.secondInnings.players.forEach((p) => allBatters.push({ player: p, team: match.secondInnings!.team }));
    }
    allBatters.sort((a, b) => b.player.runs - a.player.runs);
    if (allBatters.length > 0 && allBatters[0].player.runs > 0) {
      topBatter = allBatters[0];
    }

    // Top Bowler
    let topBowler: { bowler: Bowler; team: string } | null = null;
    const allBowlers: { bowler: Bowler; team: string }[] = [];
    if (match.firstInnings) {
      match.firstInnings.bowlers.forEach((b) => allBowlers.push({ bowler: b, team: match.firstInnings!.bowlingTeam }));
    }
    if (match.secondInnings) {
      match.secondInnings.bowlers.forEach((b) => allBowlers.push({ bowler: b, team: match.secondInnings!.bowlingTeam }));
    }
    allBowlers.sort((a, b) => {
      if (b.bowler.wickets !== a.bowler.wickets) return b.bowler.wickets - a.bowler.wickets;
      return a.bowler.runs - b.bowler.runs;
    });
    if (allBowlers.length > 0 && (allBowlers[0].bowler.wickets > 0 || allBowlers[0].bowler.ballsBowled > 0)) {
      topBowler = allBowlers[0];
    }

    // Player of the match
    const momResult = ManOfTheMatchEngine.resolveForMatch(match);

    // 1. Headlines
    let headlineEn = '';
    let headlineBn = '';

    if (isSuperOver && match.superOverResult) {
      headlineEn = `${match.superOverResult.winner} Triumphs in Nail-Biting Super Over Thriller Against ${loser || teamA}`;
      headlineBn = `শ্বাসরুদ্ধকর সুপার ওভারে ${loser || teamA}-এর বিপক্ষে অবিস্মরণীয় জয় পেল ${match.superOverResult.winner}`;
    } else if (isTie) {
      headlineEn = `Epic Tie: ${teamA} and ${teamB} Share Honors in High-Stakes Clash`;
      headlineBn = `মহানাটকীয় সমতা: ${teamA} ও ${teamB}-এর শ্বাসরুদ্ধকর ম্যাচ টাই`;
    } else if (winner) {
      if (match.marginType === 'RUNS') {
        headlineEn = `${winner} Clinches ${match.margin}-Run Victory in Dominant Display Over ${loser || 'Opponents'}`;
        headlineBn = `${loser || 'প্রতিপক্ষ'}-এর বিপক্ষে ${match.margin} রানের দাপুটে জয় তুলে নিল ${winner}`;
      } else if (match.marginType === 'WICKETS') {
        headlineEn = `${winner} Cruises to ${match.margin}-Wicket Win in Clinical Chase Against ${loser || 'Opponents'}`;
        headlineBn = `${loser || 'প্রতিপক্ষ'}-এর বিপক্ষে দারুণ রান তাড়া করে ${match.margin} উইকেটের জয় ছিনিয়ে নিল ${winner}`;
      } else {
        headlineEn = `${winner} Emerges Victorious in Thrilling Encounter Over ${loser || 'Opponents'}`;
        headlineBn = `${loser || 'প্রতিপক্ষ'}-কে হারিয়ে নাটকীয় জয় নিশ্চিত করল ${winner}`;
      }
    } else {
      headlineEn = `${teamA} vs ${teamB} Match Concluded`;
      headlineBn = `${teamA} বনাম ${teamB} ম্যাচ সমাপ্ত`;
    }

    // 2. Batting Highlights
    let battingEn = 'Batting contributions remained evenly distributed.';
    let battingBn = 'ব্যাটারদের অবদান সামগ্রিকভাবে দলীয় স্কোরে প্রভাব ফেলেছে।';
    if (topBatter) {
      const bName = cleanPlayerName(topBatter.player.name);
      const bRuns = topBatter.player.runs;
      const bBalls = topBatter.player.balls;
      const bSr = strikeRate(bRuns, bBalls);
      const bBoundaries = `${topBatter.player.fours} fours and ${topBatter.player.sixes} sixes`;
      const bBoundariesBn = `${toBnDigits(topBatter.player.fours)}টি চার ও ${toBnDigits(topBatter.player.sixes)}টি ছক্কা`;

      battingEn = `${bName} played an inspiring knock, smashing ${bRuns} runs off ${bBalls} balls (${bBoundaries}) at an impressive strike rate of ${bSr}.`;
      battingBn = `${bName} চমৎকার ব্যাটিং উপহার দেন, ${toBnDigits(bBalls)} বলে খেলেন ${toBnDigits(bRuns)} রানের দুর্দান্ত ইনিংস (${bBoundariesBn}, স্ট্রাইক রেট ${toBnDigits(bSr)})।`;
    }

    // 3. Bowling Highlights
    let bowlingEn = 'Bowlers maintained disciplined lines throughout the contest.';
    let bowlingBn = 'বোলাররা ইনিংসজুড়ে নিয়ন্ত্রিত লাইন ও লেন্থ বজায় রাখেন।';
    if (topBowler) {
      const bwName = cleanPlayerName(topBowler.bowler.name);
      const bwWkts = topBowler.bowler.wickets;
      const bwRuns = topBowler.bowler.runs;
      const bwOvers = `${Math.floor(topBowler.bowler.ballsBowled / 6)}.${topBowler.bowler.ballsBowled % 6}`;
      const bwEco = economyRate(bwRuns, topBowler.bowler.ballsBowled);

      bowlingEn = `With the ball, ${bwName} was the chief destroyer, scalping ${bwWkts} wicket${bwWkts === 1 ? '' : 's'} for ${bwRuns} runs in ${bwOvers} overs (Economy: ${bwEco}).`;
      bowlingBn = `বল হাতে প্রতিপক্ষকে চাপে রাখেন ${bwName}, ${toBnDigits(bwOvers)} ওভারে মাত্র ${toBnDigits(bwRuns)} রান দিয়ে শিকার করেন ${toBnDigits(bwWkts)}টি উইকেট (ইকোনমি: ${toBnDigits(bwEco)})।`;
    }

    // 4. Player of the Match
    let motmEn = '';
    let motmBn = '';
    if (momResult) {
      motmEn = `Player of the Match honors were awarded to ${momResult.name} (${momResult.role}) with a total impact rating of ${momResult.finalScore || momResult.totalPoints} points.`;
      motmBn = `অনবদ্য অলরাউন্ড নৈপুণ্যের জন্য ম্যাচসেরা (Player of the Match) নির্বাচিত হন ${momResult.name} (${toBnDigits(momResult.finalScore || momResult.totalPoints)} পয়েন্ট)।`;
    }

    // 5. Innings Scores Lines
    const inn1StrEn = match.firstInnings
      ? `${match.firstInnings.team} ${match.firstInnings.totalRuns}/${match.firstInnings.totalWickets} (${match.firstInnings.oversString} ov)`
      : '';
    const inn2StrEn = match.secondInnings
      ? `${match.secondInnings.team} ${match.secondInnings.totalRuns}/${match.secondInnings.totalWickets} (${match.secondInnings.oversString} ov)`
      : '';
    const scoresEn = inn1StrEn && inn2StrEn ? `[${inn1StrEn} vs ${inn2StrEn}] ` : '';

    const inn1StrBn = match.firstInnings
      ? `${match.firstInnings.team} ${toBnDigits(match.firstInnings.totalRuns)}/${toBnDigits(match.firstInnings.totalWickets)} (${toBnDigits(match.firstInnings.oversString)} ওভার)`
      : '';
    const inn2StrBn = match.secondInnings
      ? `${match.secondInnings.team} ${toBnDigits(match.secondInnings.totalRuns)}/${toBnDigits(match.secondInnings.totalWickets)} (${toBnDigits(match.secondInnings.oversString)} ওভার)`
      : '';
    const scoresBn = inn1StrBn && inn2StrBn ? `[${inn1StrBn} বনাম ${inn2StrBn}] ` : '';

    // 6. Full Consolidated Reports
    const fullReportEn = `${headlineEn}\n${scoresEn ? scoresEn.trim() + '\n\n' : '\n'}${battingEn}\n\n${bowlingEn}\n\n${motmEn}`.trim();
    const fullReportBn = `${headlineBn}\n${scoresBn ? scoresBn.trim() + '\n\n' : '\n'}${battingBn}\n\n${bowlingBn}\n\n${motmBn}`.trim();

    return {
      headlineEn,
      headlineBn,
      summaryEn: `${headlineEn}. ${scoresEn}${battingEn} ${bowlingEn}`,
      summaryBn: `${headlineBn}। ${scoresBn}${battingBn} ${bowlingBn}`,
      battingHighlightsEn: battingEn,
      battingHighlightsBn: battingBn,
      bowlingHighlightsEn: bowlingEn,
      bowlingHighlightsBn: bowlingBn,
      motmHighlightEn: motmEn,
      motmHighlightBn: motmBn,
      fullReportEn,
      fullReportBn,
    };
  }
}
