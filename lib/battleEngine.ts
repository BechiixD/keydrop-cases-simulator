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
  const userFraction = (100 - cfg.borrowPercent) / 100;
  let nonce = startNonce;

  const playerResults: BattlePlayerResult[] = cfg.players.map((p, idx) => {
    const drops: Drop[] = [];
    let totalValue = 0;
    let entryCostRaw = 0;
    const playerStart = nonce;
    for (let ci = 0; ci < cfg.cases.length; ci++) {
      const c: CaseDefinition = cfg.cases[ci];
      const count = Math.max(0, p.counts[ci] ?? 0);
      if (count <= 0) continue;
      const res = runBatch(c, count, serverSeed, p.clientSeed, nonce);
      nonce += count;
      drops.push(...res.drops);
      totalValue += res.totalValue;
      entryCostRaw += c.price * count;
    }
    const entryMultiplier = p.isUser ? userFraction : 1;
    const entryCost = entryCostRaw * entryMultiplier;
    return {
      name: p.name,
      isUser: p.isUser,
      clientSeed: p.clientSeed,
      teamIndex: Math.floor(idx / teamSize),
      drops,
      totalValue,
      startNonce: playerStart,
      nonceCount: nonce - playerStart,
      entryCost,
      net: 0,
    };
  });

  const teams: BattleTeamResult[] = [];
  for (let t = 0; t < numTeams; t++) {
    const members = playerResults.filter((pr) => pr.teamIndex === t);
    const totalValue = members.reduce((a, m) => a + m.totalValue, 0);
    const entryCost = members.reduce((a, m) => a + m.entryCost, 0);
    teams.push({
      index: t,
      playerNames: members.map((m) => m.name),
      totalValue,
      rank: 0,
      payout: 0,
      delta: 0,
      entryCost,
      net: 0,
    });
  }

  const ranked = [...teams].sort((a, b) => {
    if (cfg.mode === "classic") return b.totalValue - a.totalValue;
    return a.totalValue - b.totalValue;
  });
  ranked.forEach((t, i) => (t.rank = i + 1));
  const winner = ranked[0];

  const userPlayer = playerResults.find((pr) => pr.isUser);
  const userTeamWon = userPlayer ? userPlayer.teamIndex === winner.index : false;

  let totalBattleDrops = 0;
  for (const t of teams) {
    totalBattleDrops += t.totalValue;
  }
  const rawShare = teamSize > 0 ? totalBattleDrops / teamSize : 0;

  for (const pr of playerResults) {
    if (pr.teamIndex === winner.index) {
      const rewardFraction = pr.isUser ? userFraction : 1;
      pr.net = (rawShare * rewardFraction) - pr.entryCost;
    } else {
      pr.net = 0 - pr.entryCost;
    }
  }

  for (const t of teams) {
    if (t === winner) {
      const members = playerResults.filter((pr) => pr.teamIndex === t.index);
      t.payout = members.reduce((s, m) => s + Math.max(0, m.net + m.entryCost), 0);
      t.net = members.reduce((s, m) => s + m.net, 0);
      t.delta = t.net;
    } else {
      t.payout = 0;
      t.delta = -t.totalValue;
      t.net = 0 - t.entryCost;
    }
  }

  const userNet = userPlayer ? userPlayer.net : 0;

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
    userNet,
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