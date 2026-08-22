// Prestige research tree: spend prestige points (PP) on permanent perks.
// Points spent are consumed; bonuses are permanent across prestiges.

export type PerkId =
  | "click-power"     // +25% click value per level
  | "idle-power"      // +25% passive per level
  | "golden-freq"     // golden events spawn 15% faster per level
  | "crit-chance"     // +2% crit chance per level
  | "stake-boost"     // +10% APY per level
  | "offline-cap";    // +4h offline cap per level

export interface PerkDef {
  id: PerkId;
  name: string;
  desc: string;
  icon: string;
  maxLevel: number;
  cost: (level: number) => number; // cost to go from `level` to level+1
}

export const PERKS: PerkDef[] = [
  { id: "click-power", name: "Strong Arms", desc: "+25% click value / lvl", icon: "💪", maxLevel: 10, cost: (l) => 1 + l },
  { id: "idle-power", name: "Overclock", desc: "+25% passive rate / lvl", icon: "⚙️", maxLevel: 10, cost: (l) => 1 + l },
  { id: "golden-freq", name: "Lucky Charm", desc: "Golden events 15% more often / lvl", icon: "🍀", maxLevel: 5, cost: (l) => 2 + l * 2 },
  { id: "crit-chance", name: "Precision Drills", desc: "+2% crit chance / lvl", icon: "🎯", maxLevel: 10, cost: (l) => 1 + l * 2 },
  { id: "stake-boost", name: "Vault Contracts", desc: "+10% staking APR / lvl", icon: "🔒", maxLevel: 5, cost: (l) => 3 + l * 3 },
  { id: "offline-cap", name: "Night Shift", desc: "+4h offline cap / lvl", icon: "🌙", maxLevel: 3, cost: (l) => 2 + l * 4 },
];

export function perkCost(def: PerkDef, currentLevel: number): number {
  return def.cost(currentLevel);
}

// Derived helpers used by game.ts
export function perkLevels(s: { perks?: Partial<Record<PerkId, number>> }, id: PerkId): number {
  return s.perks?.[id] ?? 0;
}

export function clickPerkMult(levels: number): number {
  return 1 + levels * 0.25;
}
export function idlePerkMult(levels: number): number {
  return 1 + levels * 0.25;
}
export function critChance(levels: number): number {
  return 0.05 + levels * 0.02; // base 5%
}
export function stakeApy(levels: number): number {
  return 0.25 + levels * 0.025; // +10% relative per level
}
export function offlineCapMs(levels: number): number {
  return (8 + levels * 4) * 3600 * 1000;
}
export function goldenFreqDivisor(levels: number): number {
  return Math.max(0.55, 1 - levels * 0.15);
}
