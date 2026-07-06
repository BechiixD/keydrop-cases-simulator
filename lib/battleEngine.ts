import type {
  BattleConfig,
  BattleFormat,
  BattlePlayerConfig,
  BattlePlayerResult,
  BattleResult,
  BattleTeamResult,
  CaseDefinition,
  Drop,
} from "@/lib/types";
import { hashServerSeed } from "@/lib/provablyFair";
import { runBatch } from "@/lib/caseEngine";

function teamSizeForFormat(f: BattleFormat): number {
  if (f === "1v1" || f === "1v1v1" || f === "1v1v1v1") return 1;
  if (f === "2v2") return 2;
  if (f === "3v3") return 3;
  return 1;
}

function numTeamsForFormat(f: BattleFormat): number {
  if (f === "1v1") return 2;
  if (f === "1v1v1") return 3;
  if (f === "1v1v1v1") return 4;
  if (f === "2v2") return 2;
  if (f === "3v3") return 2;
  return 2;
}

function validateConfig(cfg: BattleConfig): void {
  const ts = teamSizeForFormat(cfg.format);
  const nt = numTeamsForFormat(cfg.format);
  if (cfg.players.length !== ts * nt) {
    throw new Error(
      `format ${cfg.format} expects ${ts * nt} players, got ${cfg.players.length}`,
    );
  }
  if (cfg.cases.length === 0) {
    throw new Error("battle requires at least one case");
  }
  for (const p of cfg.players) {
    if (p.counts.length !== cfg.cases.length) {
      throw new Error(
        `player ${p.name}: counts length ${p.counts.length} != cases ${cfg.cases.length}`,
      );
    }
  }
  if (cfg.borrowPercent < 0 || cfg.borrowPercent > 90) {
    throw new Error(`borrowPercent ${cfg.borrowPercent} out of range [0, 90]`);
  }
}

function playerOpens(p: BattlePlayerConfig): number {
  return p.counts.reduce((a, b) => a + Math.max(0, b), 0);
}

/**
 * Run a battle. Nonces are global across players, so the whole battle is one
 * continuous deterministic chain over (serverSeed, clientSeed, nonce).
 */
export function runBattle(
  cfg: BattleConfig,
  serverSeed: string,
  startNonce: number,
): BattleResult {
  validateConfig(cfg);

  const teamSize = teamSizeForFormat(cfg.format);
  const numTeams = numTeamsForFormat(cfg.format);
  let nonce = startNonce;

  const playerResults: BattlePlayerResult[] = cfg.players.map((p, idx) => {
    const drops: Drop[] = [];
    let totalValue = 0;
    const playerStart = nonce;
    for (let ci = 0; ci < cfg.cases.length; ci++) {
      const c: CaseDefinition = cfg.cases[ci];
      const count = Math.max(0, p.counts[ci] ?? 0);
      if (count <= 0) continue;
      const res = runBatch(c, count, serverSeed, p.clientSeed, nonce);
      nonce += count;
      drops.push(...res.drops);
      totalValue += res.totalValue;
    }
    return {
      name: p.name,
      isUser: p.isUser,
      clientSeed: p.clientSeed,
      teamIndex: Math.floor(idx / teamSize),
      drops,
      totalValue,
      startNonce: playerStart,
      nonceCount: nonce - playerStart,
    };
  });

  const teams: BattleTeamResult[] = [];
  for (let t = 0; t < numTeams; t++) {
    const members = playerResults.filter((pr) => pr.teamIndex === t);
    const totalValue = members.reduce((a, m) => a + m.totalValue, 0);
    teams.push({
      index: t,
      playerNames: members.map((m) => m.name),
      totalValue,
      rank: 0,
      payout: 0,
      delta: 0,
    });
  }

  const ranked = [...teams].sort((a, b) => {
    if (cfg.mode === "classic") return b.totalValue - a.totalValue;
    return a.totalValue - b.totalValue;
  });
  ranked.forEach((t, i) => (t.rank = i + 1));
  const winner = ranked[0];

  const borrowFraction = (100 - cfg.borrowPercent) / 100;
  let totalFromLosers = 0;
  for (const t of teams) {
    if (t === winner) continue;
    const contribution = t.totalValue * borrowFraction;
    totalFromLosers += contribution;
    t.payout = t.totalValue - contribution;
    t.delta = -contribution;
  }
  winner.payout = winner.totalValue + totalFromLosers;
  winner.delta = totalFromLosers;

  const userTeam = playerResults.find((pr) => pr.isUser)?.teamIndex ?? -1;
  const userTeamResult = teams[userTeam] ?? null;
  const userDelta = userTeamResult ? userTeamResult.delta : 0;

  return {
    ranAt: Date.now(),
    format: cfg.format,
    mode: cfg.mode,
    borrowPercent: cfg.borrowPercent,
    serverSeed,
    serverSeedHash: hashServerSeed(serverSeed),
    startNonce,
    teamSize,
    numTeams,
    players: playerResults,
    teams,
    winnerTeamIndex: winner.index,
    userDelta,
  };
}

export const TEAM_COLORS = [
  "#e4ae39",
  "#5fd6a8",
  "#5e98d9",
  "#d32ce6",
];

export function teamColor(idx: number): string {
  return TEAM_COLORS[idx % TEAM_COLORS.length] ?? "#888";
}