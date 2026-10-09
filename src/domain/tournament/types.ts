export type TournamentFormat = 'knockout' | 'league';

export type TournamentStage =
 | 'league'
 | 'knockout'
 | 'qualifier1'
 | 'eliminator'
 | 'qualifier2'
 | 'final';

export type FixtureResultType = 'WIN' | 'TIE' | 'NO_RESULT';

export interface TournamentFixture {
 id: string;
 round: number;
 homeTeam: string;
 awayTeam?: string; // If undefined, homeTeam receives a bye
 winner?: string;
 loser?: string;
 resultType?: FixtureResultType;
 isTie: boolean;
 stage: TournamentStage;
 matchId?: string; // Optional linked match
 resultText?: string;
}

export interface TournamentStanding {
 team: string;
 played: number;
 wins: number;
 ties: number;
 losses: number;
 points: number;
 runsFor: number;
 ballsFor: number;
 runsAgainst: number;
 ballsAgainst: number;
 netRunRate: number;
}

export interface Tournament {
 id: string;
 name: string;
 format: TournamentFormat;
 teams: string[];
 fixtures: TournamentFixture[];
 createdAt: string;
 leagueMeetings: number;
 matchOvers: number;
 champion?: string;
}

export interface BattingLeader {
 name: string;
 team: string;
 innings: number;
 runs: number;
 balls: number;
 fours: number;
 sixes: number;
 dotBalls: number;
 highScore: number;
 fifties: number;
 hundreds: number;
 dismissals: number;
 average: number;
 strikeRate: number;
}

export interface BowlingLeader {
 name: string;
 team: string;
 innings: number;
 balls: number;
 runs: number;
 wickets: number;
 maidens: number;
 dotBalls: number;
 bestWickets: number;
 bestRuns: number;
 bestFigures: string;
 economy: number;
 average: number;
 strikeRate: number;
}
