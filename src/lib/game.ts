// CoinFarm game core v2: state, upgrades, staking, price sim,
// prestige, milestones, crits, golden events, achievements
export type UpgradeId = "gpu" | "asic" | "farm" | "quantum";

export interface GameState {
  // core economy
  coins: number;
  totalMined: number;          // lifetime, never resets
  runMined: number;            // this prestige run
  perClickLevel: number;
  upgrades: Record<UpgradeId, number>;
  // staking
  stakedAmount: number;
  stakeStartTime: number;
  pendingRewards: number;
  // market
  price: number;
  priceHistory: number[];
  // prestige
  prestigePoints: number;      // permanent multiplier currency
  prestiges: number;
  // session juice
  clicksTotal: number;
  critCount: number;
  goldensClicked: number;
  bestPortfolioValue: number;
  // boost state
  boostMult: number;           // active global multiplier from golden event
  boostUntil: number;
  frenzyMult: number;          // click frenzy multiplier
  frenzyUntil: number;
  // achievements
  achievements: string[];
  // market trading (USD cash side)
  usdCash: number;
  realizedPnl: number;
  trades: { type: "buy" | "sell"; amount: number; price: number; time: number }[];
  // daily streak
  dailyStreak: number;
  lastDailyClaim: number;
  // timing
  lastTick: number;
  lastGoldenSpawn: number;
  createdAt: number;
}

export const TICK_MS = 1000;

export function newGame(): GameState {
  return {
    coins: 0,
    totalMined: 0,
    runMined: 0,
    perClickLevel: 1,
    upgrades: { gpu: 0, asic: 0, farm: 0, quantum: 0 },
    stakedAmount: 0,
    stakeStartTime: 0,
    pendingRewards: 0,
    price: 1,
    priceHistory: [1],
    prestigePoints: 0,
    prestiges: 0,
    clicksTotal: 0,
    critCount: 0,
    goldensClicked: 0,
    bestPortfolioValue: 0,
    boostMult: 1,
    boostUntil: 0,
    frenzyMult: 1,
    frenzyUntil: 0,
    achievements: [],
    usdCash: 0,
    realizedPnl: 0,
    trades: [],
    dailyStreak: 0,
    lastDailyClaim: 0,
    lastTick: Date.now(),
    lastGoldenSpawn: Date.now(),
    createdAt: Date.now(),
  };
}

export const OFFLINE_CAP_MS = 8 * 3600 * 1000; // 8h cap
export const GOLDEN_SPAWN_MIN_MS = 45_000;
export const GOLDEN_SPAWN_VAR_MS = 75_000;

// ---- Prestige ----
export const PRESTIGE_UNLOCK = 2_000_000; // lifetime mined to unlock first prestige

// sqrt-based: doubling prestige points needs 4x more mining
export function prestigeGain(s: GameState): number {
  if (s.runMined < PRESTIGE_UNLOCK / 20) return 0;
  return Math.floor(Math.pow(s.runMined / 25_000, 0.5));
}

export function globalMult(s: GameState): number {
  return 1 + s.prestigePoints * 0.06; // +6% per point
}

export function doPrestige(s: GameState): GameState | null {
  const gain = prestigeGain(s);
  if (gain <= 0) return null;
  return {
    ...newGame(),
    totalMined: s.totalMined,
    clicksTotal: s.clicksTotal,
    critCount: s.critCount,
    goldensClicked: s.goldensClicked,
    bestPortfolioValue: s.bestPortfolioValue,
    prestigePoints: s.prestigePoints + gain,
    prestiges: s.prestiges + 1,
    achievements: [...s.achievements],
    price: s.price,
    priceHistory: s.priceHistory.slice(-60),
  };
}

// ---- Mining rates ----
const UPGRADE_DEFS: {
  id: UpgradeId; name: string; icon: string; baseCost: number; costMult: number; rate: number;
}[] = [
  { id: "gpu", name: "GPU Rig", icon: "🖥️", baseCost: 60, costMult: 1.15, rate: 0.5 },
  { id: "asic", name: "ASIC Miner", icon: "📦", baseCost: 1500, costMult: 1.16, rate: 5 },
  { id: "farm", name: "Mining Farm", icon: "🏭", baseCost: 25000, costMult: 1.18, rate: 45 },
  { id: "quantum", name: "Quantum Node", icon: "🌌", baseCost: 500000, costMult: 1.22, rate: 420 },
];

export { UPGRADE_DEFS };

// milestone: every 25 owned doubles that tier's output
export function tierMultiplier(owned: number): number {
  return Math.pow(2, Math.floor(owned / 25));
}

export function upgradeCost(id: UpgradeId, owned: number): number {
  const def = UPGRADE_DEFS.find((u) => u.id === id)!;
  return Math.ceil(def.baseCost * Math.pow(def.costMult, owned));
}

export function bulkCost(id: UpgradeId, owned: number, n: number): number {
  const def = UPGRADE_DEFS.find((u) => u.id === id)!;
  let total = 0;
  for (let i = 0; i < n; i++) total += Math.ceil(def.baseCost * Math.pow(def.costMult, owned + i));
  return total;
}

export function passiveRate(s: GameState): number {
  let base = UPGRADE_DEFS.reduce(
    (sum, def) => sum + s.upgrades[def.id] * def.rate * tierMultiplier(s.upgrades[def.id]),
    0
  );
  return base * globalMult(s) * activeBoost(s);
}

function activeBoost(s: GameState): number {
  const now = Date.now();
  let m = 1;
  if (now < s.boostUntil) m *= s.boostMult;
  return m;
}

export function isFrenzy(s: GameState): boolean {
  return Date.now() < s.frenzyUntil;
}

// ---- Clicking ----
export function clickValue(s: GameState): number {
  // quadratic growth in level, plus small idle synergy
  const base = 1 + (s.perClickLevel - 1) * (2 + s.perClickLevel * 0.5) + passiveRate(s) * 0.05;
  let v = base * globalMult(s);
  if (isFrenzy(s)) v *= s.frenzyMult;
  return Math.max(1, Math.floor(v));
}

export function rollCrit(): boolean {
  return Math.random() < 0.05; // 5% crit
}
export const CRIT_MULT = 7;

export function upgradeClickCost(level: number): number {
  return Math.ceil(25 * Math.pow(1.55, level - 1));
}

// ---- Staking ----
export const STAKE_APY = 0.25;

export function stakeRewards(s: GameState, now = Date.now()): number {
  if (s.stakedAmount <= 0) return s.pendingRewards;
  const secs = (now - s.stakeStartTime) / 1000;
  const earned = ((s.stakedAmount * STAKE_APY) / (365 * 24 * 3600)) * secs;
  return s.pendingRewards + earned;
}

// ---- Golden events ----
export type GoldenKind = "coins" | "frenzy" | "boost";
export interface GoldenEvent {
  kind: GoldenKind;
  label: string;
}

export function shouldSpawnGolden(s: GameState, now = Date.now()): boolean {
  return now - s.lastGoldenSpawn > GOLDEN_SPAWN_MIN_MS + Math.random() * GOLDEN_SPAWN_VAR_MS;
}

export function applyGolden(s: GameState, kind: GoldenKind): { state: GameState; message: string } {
  const now = Date.now();
  const base = { ...s, lastGoldenSpawn: now, goldensClicked: s.goldensClicked + 1 };
  switch (kind) {
    case "coins": {
      const amount = Math.max(20, Math.floor((passiveRate(s) * 120 + clickValue(s) * 30) * (1 + s.prestigePoints * 0.05)));
      return { state: { ...base, coins: s.coins + amount }, message: `💎 Whale dumped on you! +${fmtNum(amount)} $FARM` };
    }
    case "frenzy":
      return { state: { ...base, frenzyMult: 7, frenzyUntil: now + 20_000 }, message: "🔥 CLICK FRENZY! x7 clicks for 20s!" };
    case "boost":
      return { state: { ...base, boostMult: 3, boostUntil: now + 45_000 }, message: "⚡ HASHRATE SURGE! x3 production for 45s!" };
  }
}

export function pickGoldenKind(): GoldenKind {
  const r = Math.random();
  if (r < 0.4) return "coins";
  if (r < 0.7) return "frenzy";
  return "boost";
}

// ---- Achievements ----
export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  check: (s: GameState) => boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "first-click", name: "Genesis Block", desc: "Mine your first coin", check: (s) => s.clicksTotal >= 1 },
  { id: "click-100", name: "Carpal Tunnel", desc: "Click 100 times", check: (s) => s.clicksTotal >= 100 },
  { id: "click-1000", name: "Autoclicker Energy", desc: "Click 1000 times", check: (s) => s.clicksTotal >= 1000 },
  { id: "gpu-10", name: "Rig Enthusiast", desc: "Own 10 GPU Rigs", check: (s) => s.upgrades.gpu >= 10 },
  { id: "asic-10", name: "Serious Farmer", desc: "Own 10 ASIC Miners", check: (s) => s.upgrades.asic >= 10 },
  { id: "farm-5", name: "Industrialist", desc: "Own 5 Mining Farms", check: (s) => s.upgrades.farm >= 5 },
  { id: "quantum-1", name: "Futurist", desc: "Own a Quantum Node", check: (s) => s.upgrades.quantum >= 1 },
  { id: "mined-10k", name: "Five Figures", desc: "Mine 10K lifetime $FARM", check: (s) => s.totalMined >= 10_000 },
  { id: "mined-1m", name: "Millionaire", desc: "Mine 1M lifetime $FARM", check: (s) => s.totalMined >= 1e6 },
  { id: "mined-1b", name: "Whale", desc: "Mine 1B lifetime $FARM", check: (s) => s.totalMined >= 1e9 },
  { id: "stake-1k", name: "Yield Farmer", desc: "Stake 1,000 $FARM at once", check: (s) => s.stakedAmount >= 1000 },
  { id: "stake-100k", name: "DeFi Degen", desc: "Stake 100K $FARM at once", check: (s) => s.stakedAmount >= 100_000 },
  { id: "crit-10", name: "Lucky Miner", desc: "Land 10 critical hits", check: (s) => s.critCount >= 10 },
  { id: "crit-100", name: "Blessed by RNG", desc: "Land 100 critical hits", check: (s) => s.critCount >= 100 },
  { id: "golden-1", name: "Golden Touch", desc: "Catch a golden event", check: (s) => s.goldensClicked >= 1 },
  { id: "golden-25", name: "Event Hunter", desc: "Catch 25 golden events", check: (s) => s.goldensClicked >= 25 },
  { id: "prestige-1", name: "Reborn", desc: "Prestige once", check: (s) => s.prestiges >= 1 },
  { id: "prestige-5", name: "Cycle of Life", desc: "Prestige 5 times", check: (s) => s.prestiges >= 5 },
  { id: "pump-10x", name: "To The Moon", desc: "See $FARM hit $10", check: (s) => Math.max(s.price, ...s.priceHistory.slice(-240)) >= 10 },
];

// achievement bonus: each grants +1% global
export function achievementMult(s: GameState): number {
  return 1 + s.achievements.length * 0.01;
}

export function newAchievements(s: GameState): string[] {
  const have = new Set(s.achievements);
  return ACHIEVEMENTS.filter((a) => !have.has(a.id) && a.check(s)).map((a) => a.id);
}

// ---- Price simulation: GBM with mean reversion + occasional pumps/dumps ----
function gaussian(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function nextPrice(price: number): number {
  const drift = -0.02 * Math.log(price); // mean reversion toward 1
  const vol = 0.04;
  let np = price * Math.exp(drift + gaussian() * vol);
  // rare pump/dump event (0.3% per tick)
  if (Math.random() < 0.003) {
    np *= Math.random() < 0.6 ? 1.3 + Math.random() * 0.7 : 0.5 + Math.random() * 0.2;
  }
  return Math.max(0.05, Math.min(20, np));
}

export type TickResult = { state: GameState; offlineMs: number };

export function tick(s: GameState, now = Date.now()): TickResult {
  const rawElapsed = Math.max(0, now - s.lastTick);
  if (rawElapsed < 200) return { state: s, offlineMs: 0 };

  const cappedElapsed = Math.min(rawElapsed, OFFLINE_CAP_MS);
  const steps = Math.floor(cappedElapsed / TICK_MS);

  // offline (no tab open) earns at 50% efficiency
  const wasAway = rawElapsed > 5000;
  const eff = wasAway ? 0.5 : 1;

  let { coins, price } = s;
  let mined = 0;
  const priceHistory = [...s.priceHistory];
  for (let i = 0; i < steps; i++) {
    const rate = passiveRate(s) * eff;
    coins += rate;
    mined += rate;
    price = nextPrice(price);
    priceHistory.push(price);
  }
  while (priceHistory.length > 240) priceHistory.shift();

  // staking accrual over elapsed time
  let pendingRewards = s.pendingRewards;
  let stakeStartTime = s.stakeStartTime;
  if (s.stakedAmount > 0) {
    const secs = cappedElapsed / 1000;
    pendingRewards += ((s.stakedAmount * STAKE_APY) / (365 * 24 * 3600)) * secs;
    stakeStartTime = now;
  }

  const next: GameState = {
    ...s,
    coins,
    totalMined: s.totalMined + mined,
    runMined: s.runMined + mined,
    price,
    priceHistory,
    pendingRewards,
    stakeStartTime,
    lastTick: now,
    bestPortfolioValue: Math.max(s.bestPortfolioValue, (s.coins + s.stakedAmount) * s.price),
  };
  return { state: next, offlineMs: wasAway ? rawElapsed : 0 };
}

// ---- formatting helper shared by UI ----
export function fmtNum(n: number): string {
  if (n >= 1e12) return (n / 1e12).toFixed(2) + "T";
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e4) return (n / 1e3).toFixed(1) + "K";
  if (n >= 100) return Math.floor(n).toString();
  return n.toFixed(n < 10 ? 2 : 1);
}
