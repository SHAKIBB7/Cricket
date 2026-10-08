'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
 FileText,
 Share2,
 ArrowLeft,
 Award,
 Users,
 Clock,
 Sparkles,
 BarChart2,
} from 'lucide-react';
import { MatchRepository } from '@/infrastructure/storage/MatchRepository';
import { MatchScorecard, InningsData, Player, Bowler, FallOfWicket, Partnership } from '@/domain/cricket/types';
import {
 cleanPlayerName,
 strikeRate,
 economyRate,
 currentRunRate,
} from '@/domain/cricket/formatters';
import { ScorecardPdfGenerator } from '@/features/scoring/pdf/ScorecardPdfGenerator';
import { ManOfTheMatchEngine } from '@/domain/cricket/analytics/ManOfTheMatchEngine';
import { BatsmanProfileModal } from '@/components/modals/BatsmanProfileModal';
import { BowlerProfileModal } from '@/components/modals/BowlerProfileModal';
import { TeamBadgeIcon } from '@/components/common/TeamBadgeIcon';

export default function MatchCenterPage() {
 const params = useParams();
 const router = useRouter();
 const matchId = params.matchId as string;

 const [match, setMatch] = useState<MatchScorecard | null>(null);
 const [activeTab, setActiveTab] = useState<'scorecard' | 'partnerships' | 'info'>('scorecard');
 const [loading, setLoading] = useState(true);

 // Profile Modals State
 const [selectedBatsman, setSelectedBatsman] = useState<{
 player: Player;
 battingPosition?: number;
 partnerships?: Partnership[];
 fallOfWickets?: FallOfWicket[];
 } | null>(null);

 const [selectedBowler, setSelectedBowler] = useState<{
 bowler: Bowler;
 fallOfWickets?: FallOfWicket[];
 } | null>(null);

 useEffect(() => {
 async function loadMatch() {
 if (!matchId) return;
 const data = await MatchRepository.getMatch(matchId);
 setMatch(data || null);
 setLoading(false);
 }
 loadMatch();
 }, [matchId]);

 if (loading) {
 return (
 <div className="flex items-center justify-center min-h-[60vh]">
 <div className="border-4 border-emerald-600 border-t-transparent animate-spin rounded-full w-10 h-10" />
 </div>
);
 }

 if (!match) {
 return (
 <div className="text-center p-12 space-y-3">
 <h2 className="font-bold text-h3">Match Not Found</h2>
 <Link href="/matches/history" className="font-bold hover:underline text-emerald-600">
 Back to Matches
 </Link>
 </div>
);
 }

 const mom = ManOfTheMatchEngine.calculateForMatch(match.firstInnings, match.secondInnings);

 const renderInningsScorecard = (inn: InningsData, label: string) => {
 return (
 <div className="space-y-4">
 {/* Batting Card */}
 <div className="floating-card overflow-hidden">
 <div className="bg-[var(--muted)] border-b border-[var(--border)] flex items-center justify-between p-4">
 <span className="font-extrabold text-body-small">{label} — Batting</span>
 <span className="font-bold num-font text-body-small">
 {inn.totalRuns} - {inn.totalWickets} ({inn.oversString} ov)
 </span>
 </div>

 <div className="overflow-x-auto table-scroll-container">
 <table className="text-caption min-w-[480px] w-full">
 <thead className="bg-[var(--muted)]/50 font-bold uppercase border-b border-[var(--border)] text-[var(--muted-foreground)]">
 <tr>
 <th className="py-2.5 px-3">Batsman</th>
 <th className="hidden sm:table-cell py-2.5 px-3">Dismissal</th>
 <th className="py-2.5 px-2 text-right">R</th>
 <th className="py-2.5 px-2 text-right">B</th>
 <th className="py-2.5 px-2 text-right">4s</th>
 <th className="py-2.5 px-2 text-right">6s</th>
 <th className="py-2.5 text-right px-3">SR</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-[var(--border)] num-font">
 {inn.players.map((p, i) => {
 let dismissal = 'did not bat';
 if (p.isDismissed) dismissal = p.dismissalText || 'out';
 else if (p.balls > 0 || p.runs > 0) dismissal = 'not out*';

 return (
 <tr
 key={i}
 onClick={() =>
 setSelectedBatsman({
 player: p,
 battingPosition: i + 1,
 partnerships: inn.pastPartnerships,
 fallOfWickets: inn.fallOfWickets,
 })
 }
 className="hover:bg-[var(--muted)]/50 cursor-pointer transition-colors group"
 title="Click to view batsman profile & metrics"
 >
 <td className="font-bold group-hover:text-emerald-500 transition-colors px-3 py-2 text-body-small">
 <div className="flex flex-col">
 <div className="flex items-center gap-1.5">
 <span>{cleanPlayerName(p.name)}</span>
 <span className="opacity-0 group-hover:opacity-100 transition-opacity font-normal text-emerald-500">
 ↗
 </span>
 </div>
 <span className="sm:hidden font-normal italic font-sans truncate text-[var(--muted-foreground)] max-w-[150px]">
 {dismissal}
 </span>
 </div>
 </td>
 <td className="hidden sm:table-cell italic font-sans py-2.5 text-caption px-3">
 {dismissal}
 </td>
 <td className="font-black px-2 py-2 text-body-small">{p.runs}</td>
 <td className="px-2 py-2 text-caption">{p.balls}</td>
 <td className="px-2 py-2 text-caption">{p.fours}</td>
 <td className="px-2 py-2 text-caption">{p.sixes}</td>
 <td className="font-bold py-2 text-caption px-3">
 {strikeRate(p.runs, p.balls).toFixed(1)}
 </td>
 </tr>
);
 })}
 </tbody>
 </table>
 </div>

 <div className="bg-[var(--muted)]/30 border-t border-[var(--border)] flex justify-between text-caption p-3">
 <span>Extras:</span>
 <span className="font-bold num-font text-[var(--foreground)]">
 {inn.wideRuns + inn.nbRuns + inn.byeRuns + inn.lbRuns + inn.penaltyRuns} (w {inn.wideRuns}, nb {inn.nbRuns}, b {inn.byeRuns}, lb {inn.lbRuns})
 </span>
 </div>
 </div>

 {/* Bowling Card */}
 <div className="floating-card overflow-hidden">
 <div className="bg-[var(--muted)] border-b border-[var(--border)] flex items-center justify-between p-4">
 <span className="font-extrabold text-body-small">{inn.bowlingTeam} — Bowling</span>
 </div>

 <div className="overflow-x-auto table-scroll-container">
 <table className="text-caption min-w-[440px] w-full">
 <thead className="bg-[var(--muted)]/50 font-bold uppercase border-b border-[var(--border)] text-[var(--muted-foreground)]">
 <tr>
 <th className="py-2.5 px-3">Bowler</th>
 <th className="py-2.5 px-2 text-center">
 <span className="sm:hidden">O</span>
 <span className="hidden sm:inline">Overs</span>
 </th>
 <th className="py-2.5 px-2 text-center">
 <span className="sm:hidden">M</span>
 <span className="hidden sm:inline">Maidens</span>
 </th>
 <th className="py-2.5 px-2 text-center">
 <span className="sm:hidden">R</span>
 <span className="hidden sm:inline">Runs</span>
 </th>
 <th className="py-2.5 px-2 text-center">
 <span className="sm:hidden">W</span>
 <span className="hidden sm:inline">Wickets</span>
 </th>
 <th className="py-2.5 text-right px-3">
 <span className="sm:hidden">Eco</span>
 <span className="hidden sm:inline">Econ</span>
 </th>
 </tr>
 </thead>
 <tbody className="divide-y divide-[var(--border)] num-font">
 {inn.bowlers
 .filter((b) => b.ballsBowled > 0 || b.runs > 0 || b.wickets > 0)
 .map((b, i) => (
 <tr
 key={i}
 onClick={() =>
 setSelectedBowler({
 bowler: b,
 fallOfWickets: inn.fallOfWickets,
 })
 }
 className="hover:bg-[var(--muted)]/50 cursor-pointer transition-colors group"
 title="Click to view bowler profile & spell stats"
 >
 <td className="font-bold group-hover:text-blue-500 transition-colors px-3 py-2 text-body-small">
 <div className="flex items-center gap-1.5">
 <span>{cleanPlayerName(b.name)}</span>
 <span className="opacity-0 group-hover:opacity-100 transition-opacity font-normal text-blue-500">
 ↗
 </span>
 </div>
 </td>
 <td className="font-bold px-2 py-2 text-caption">
 {Math.floor(b.ballsBowled / 6)}.{b.ballsBowled % 6}
 </td>
 <td className="px-2 py-2 text-caption">{b.maidens}</td>
 <td className="font-black px-2 py-2 text-caption">{b.runs}</td>
 <td className="font-black px-2 py-2 text-body-small">{b.wickets}</td>
 <td className="font-bold py-2 text-caption px-3">
 {economyRate(b.runs, b.ballsBowled).toFixed(2)}
 </td>
 </tr>
))}
 </tbody>
 </table>
 </div>
 </div>

 {/* Fall of Wickets */}
 {inn.fallOfWickets && inn.fallOfWickets.length > 0 && (
 <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 text-caption space-y-2">
 <span className="font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
 Fall of Wickets
 </span>
 <div className="flex flex-wrap gap-2 pt-1">
 {inn.fallOfWickets.map((f, i) => {
 const victimPlayer = inn.players.find(
 (pl) => cleanPlayerName(pl.name).toLowerCase() === cleanPlayerName(f.player).toLowerCase()
);
 return (
 <button
 key={i}
 type="button"
 onClick={() => {
 if (victimPlayer) {
 setSelectedBatsman({
 player: victimPlayer,
 battingPosition: inn.players.indexOf(victimPlayer) + 1,
 partnerships: inn.pastPartnerships,
 fallOfWickets: inn.fallOfWickets,
 });
 }
 }}
 className="truncate bg-[var(--muted)] hover:bg-[var(--border)] border border-[var(--border)] font-semibold transition-colors cursor-pointer max-w-full px-4 rounded-lg text-left py-1"
 title="Click to view player profile"
 >
 <b className="text-red-500">{f.wicket}-{f.score}</b> ({cleanPlayerName(f.player)}, {f.over} ov)
 </button>
);
 })}
 </div>
 </div>
)}
 </div>
);
 };

 return (
 <div className="max-w-5xl xl:max-w-6xl mx-auto space-y-4 sm:space-y-5 w-full">
 {/* Top Header */}
 <div className="flex items-center justify-between">
 <button
 onClick={() => router.back()}
 className="flex items-center font-semibold hover:text-[var(--foreground)] gap-1.5 text-caption min-h-[38px] p-1"
 >
 <ArrowLeft className="w-4 h-4" /> Back
 </button>

 <div className="flex items-center gap-2">
 {match.status === 'ONGOING' && (
 <Link
 href={`/matches/score/${match.id}`}
 className="bg-emerald-600 hover:bg-emerald-500 font-bold flex items-center px-3 py-2 rounded-xl text-caption min-h-[38px]"
 >
 Resume Scorer
 </Link>
)}

 <button
 onClick={() => ScorecardPdfGenerator.downloadPdf(match)}
 className="flex items-center bg-[var(--muted)] hover:bg-[var(--border)] font-bold gap-1.5 px-3 py-2 rounded-xl min-h-[38px] text-caption"
 >
 <FileText className="text-emerald-600 w-4 h-4" />
 <span>Download PDF</span>
 </button>
 </div>
 </div>

 {/* Hero Match Center Scoreboard Banner */}
 <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 shadow-xl border border-white/10 rounded-3xl text-white p-8 space-y-4">
 <div className="flex items-center justify-between font-bold uppercase tracking-widest text-caption">
 <span className="truncate max-w-none">{match.venue || 'Venue not set'} • {match.totalOvers} Overs</span>
 <span className="bg-white/10 shrink-0 py-1 px-2 rounded-full text-caption">
 {match.status}
 </span>
 </div>

 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
 {/* Innings 1 */}
 {match.firstInnings && (
 <div className="space-y-1">
 <div className="flex items-center font-semibold gap-1.5 text-caption">
 <TeamBadgeIcon type="home" size="xs" />
 <span className="truncate">{match.firstInnings.team} (1st Inn)</span>
 </div>
 <div className="font-black num-font flex items-baseline">
            <span className="text-display font-black">{match.firstInnings.totalRuns}</span>
            <span className="text-xl font-light text-[var(--muted-foreground)] px-0.5">/</span>
            <span className="text-2xl font-bold text-[var(--muted-foreground)]">{match.firstInnings.totalWickets}</span>
 <span className="font-bold text-card-title ml-2">
 ({match.firstInnings.oversString} ov)
 </span>
 </div>
 </div>
)}

 {/* Innings 2 */}
 {match.secondInnings && (
 <div className="space-y-1">
 <div className="flex items-center font-semibold gap-1.5 text-caption">
 <TeamBadgeIcon type="away" size="xs" />
 <span className="truncate">{match.secondInnings.team} (2nd Inn)</span>
 </div>
 <div className="font-black num-font flex items-baseline">
            <span className="text-display font-black">{match.secondInnings.totalRuns}</span>
            <span className="text-xl font-light text-[var(--muted-foreground)] px-0.5">/</span>
            <span className="text-2xl font-bold text-[var(--muted-foreground)]">{match.secondInnings.totalWickets}</span>
 <span className="font-bold text-card-title ml-2">
 ({match.secondInnings.oversString} ov)
 </span>
 </div>
 </div>
)}
 </div>

 {/* Result Text */}
 <div className="border-t border-white/10 font-extrabold text-body-small pt-3">
 {match.result || (match.winner ? `${match.winner} won` : 'Match in progress')}
 </div>
 </div>

 {/* Man of the Match Hero Badge */}
 {mom && (
 <div className="bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent border border-amber-500/30 flex items-center justify-between p-4 rounded-2xl gap-3">
 <div className="flex items-center gap-3.5 min-w-0">
 <div className="bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shadow-md shadow-amber-500/10 shrink-0 rounded-xl w-12 h-12 p-1">
 <img
 src="/assets/illustrations/man_of_match.png"
 alt="Man of the Match"
 className="object-contain drop-shadow w-full h-full"
 />
 </div>
 <div className="min-w-0">
 <span className="font-bold uppercase tracking-wider dark:text-amber-400 text-amber-600">
 Man of the Match
 </span>
 <h4 className="font-black tracking-tight truncate text-body">{mom.name} ({mom.role})</h4>
 <p className="truncate text-caption">
 {mom.balls > 0 ? `${mom.runs} (${mom.balls}b)` : ''}
 {mom.balls > 0 && mom.ballsBowled > 0 ? ' • ' : ''}
 {mom.ballsBowled > 0 ? `${mom.wickets}/${mom.bowlingRuns} (${(mom.ballsBowled / 6).toFixed(1)} ov)` : ''}
 </p>
 </div>
 </div>
 <div className="shrink-0 text-right">
 <span className="text-caption">Impact</span>
 <div className="font-black num-font text-h3">{mom.totalPoints} pts</div>
 </div>
 </div>
)}

 {/* Tabs Switcher */}
 <div className="flex border-b border-[var(--border)] font-bold overflow-x-auto no-scrollbar gap-6 text-body-small">
 <button
 onClick={() => setActiveTab('scorecard')}
 className={`pb-2.5 sm:pb-3 border-b-2 whitespace-nowrap min-h-[40px] transition-colors ${
 activeTab === 'scorecard'
 ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
 : 'border-transparent text-[var(--muted-foreground)]'
 }`}
 >
 Scorecard
 </button>

 <button
 onClick={() => setActiveTab('partnerships')}
 className={`pb-2.5 sm:pb-3 border-b-2 whitespace-nowrap min-h-[40px] transition-colors ${
 activeTab === 'partnerships'
 ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
 : 'border-transparent text-[var(--muted-foreground)]'
 }`}
 >
 Partnerships
 </button>

 <button
 onClick={() => setActiveTab('info')}
 className={`pb-2.5 sm:pb-3 border-b-2 whitespace-nowrap min-h-[40px] transition-colors ${
 activeTab === 'info'
 ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
 : 'border-transparent text-[var(--muted-foreground)]'
 }`}
 >
 Match Info
 </button>
 </div>

 {/* Tab 1: Full Scorecards */}
 {activeTab === 'scorecard' && (
 <div className="space-y-6">
 {match.firstInnings && renderInningsScorecard(match.firstInnings, match.firstInnings.team)}
 {match.secondInnings && renderInningsScorecard(match.secondInnings, match.secondInnings.team)}
 </div>
)}

 {/* Tab 2: Partnerships */}
 {activeTab === 'partnerships' && (
 <div className="space-y-4">
 {[match.firstInnings, match.secondInnings].filter(Boolean).map((inn, idx) => (
 <div key={idx} className="bg-[var(--card)] border border-[var(--border)] p-5 rounded-2xl space-y-3">
 <h4 className="font-extrabold text-body-small">{inn!.team} Partnerships</h4>
 <div className="space-y-2">
 {inn!.pastPartnerships.length === 0 ? (
 <p className="italic text-caption">No partnerships completed yet.</p>
) : (
 inn!.pastPartnerships.map((p, i) => (
 <div key={i} className="bg-[var(--muted)] flex items-center justify-between p-3 rounded-xl text-caption gap-2">
 <div className="flex items-center min-w-0 gap-2">
 <img
 src="/assets/illustrations/running.png"
 alt="Partnership"
 className="object-contain shrink-0 w-4 h-4"
 />
 <span className="font-bold truncate">{cleanPlayerName(p.batter1)} & {cleanPlayerName(p.batter2)}</span>
 </div>
 <span className="font-black num-font shrink-0 text-caption">{p.runs} runs ({p.balls}b)</span>
 </div>
))
)}
 </div>
 </div>
))}
 </div>
)}

 {/* Tab 3: Match Info */}
 {activeTab === 'info' && (
 <div className="bg-[var(--card)] border border-[var(--border)] p-5 rounded-2xl space-y-3 text-body-small">
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <span className="font-semibold text-caption">Toss</span>
 <p className="font-bold mt-0.5 text-body-small">{match.tossWinner} opted to {match.tossDecision}</p>
 </div>
 <div>
 <span className="font-semibold text-caption">Venue</span>
 <p className="font-bold mt-0.5 text-body-small">{match.venue || 'Venue not set'}</p>
 </div>
 <div>
 <span className="font-semibold text-caption">Overs</span>
 <p className="font-bold mt-0.5 text-body-small">{match.totalOvers} Overs per side</p>
 </div>
 <div>
 <span className="font-semibold text-caption">Players</span>
 <p className="font-bold mt-0.5 text-body-small">{match.advancedSettings?.players || 11} per team</p>
 </div>
 </div>
 </div>
)}

 {/* ── BATSMAN & BOWLER PROFILE MODALS ── */}
 <BatsmanProfileModal
 player={selectedBatsman?.player || null}
 isOpen={!!selectedBatsman}
 onClose={() => setSelectedBatsman(null)}
 battingPosition={selectedBatsman?.battingPosition}
 partnerships={selectedBatsman?.partnerships}
 fallOfWickets={selectedBatsman?.fallOfWickets}
 />

 <BowlerProfileModal
 bowler={selectedBowler?.bowler || null}
 isOpen={!!selectedBowler}
 onClose={() => setSelectedBowler(null)}
 fallOfWickets={selectedBowler?.fallOfWickets}
 advancedSettings={match.advancedSettings}
 />
 </div>
);
}
