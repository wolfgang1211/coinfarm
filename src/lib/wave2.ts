// Wave 2 additions: market trading + daily streak

import { GameState } from "./game";

export interface Trade {
  type: "buy" | "sell";
  amount: number;
  price: number;
  time: number;
}

// ---- Market trading ----
export const TRADE_FEE = 0.01; // 1% spread

export function buyFarm(s: GameState, usdAmount: number): GameState | null {
  if (usdAmount <= 0) return null;
  // USD is virtual: convert coins to USD at current price for spending power.
  // Simpler model: you sell coins for USD cash, then use USD to buy dips.
  return null; // handled in UI via sell/buy of coin position
}

// Position-based trading: track USD cash and avg entry
export function initPortfolio(s: GameState): GameState {
  return s;
}

export function executeTrade(
  s: GameState,
  side: "buy" | "sell",
  coinAmount: number
): { state: GameState | null; message: string } {
  if (!coinAmount || coinAmount <= 0) return { state: null, message: "Invalid amount" };
  const price = s.price;
  if (side === "sell") {
    if (s.coins < coinAmount) return { state: null, message: "Not enough $FARM" };
    const usd = coinAmount * price * (1 - TRADE_FEE);
    return {
      state: {
        ...s,
        coins: s.coins - coinAmount,
        usdCash: (s.usdCash ?? 0) + usd,
        realizedPnl: (s.realizedPnl ?? 0),
        trades: [...(s.trades ?? []), { type: "sell" as const, amount: coinAmount, price, time: Date.now() }].slice(-100),
      },
      message: `Sold ${fmtShort(coinAmount)} $FARM @ $${price.toFixed(3)} → +$${usd.toFixed(2)} cash`,
    };
  }
  // buy: spend USD cash from wallet
  const cost = coinAmount * price * (1 + TRADE_FEE);
  if ((s.usdCash ?? 0) < cost) return { state: null, message: `Need $${cost.toFixed(2)} cash (have $${(s.usdCash ?? 0).toFixed(2)})` };
  return {
    state: {
      ...s,
      coins: s.coins + coinAmount,
      usdCash: (s.usdCash ?? 0) - cost,
      trades: [...(s.trades ?? []), { type: "buy" as const, amount: coinAmount, price, time: Date.now() }].slice(-100),
    },
    message: `Bought ${fmtShort(coinAmount)} $FARM @ $${price.toFixed(3)} for $${cost.toFixed(2)}`,
  };
}

export function fmtShort(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e4) return (n / 1e3).toFixed(1) + "K";
  return n.toFixed(n < 10 ? 2 : 0);
}

// ---- Daily streak ----
const DAY_MS = 24 * 3600 * 1000;

export function checkDailyBonus(s: GameState): { state: GameState; reward: number; streak: number } | null {
  const now = Date.now();
  const last = s.lastDailyClaim ?? 0;
  const since = now - last;
  if (since < DAY_MS * 0.75) return null; // not yet
  const streak = since > DAY_MS * 2 ? 1 : Math.min((s.dailyStreak ?? 0) + 1, 7);
  // reward scales with streak and passive rate
  const base = Math.max(100, passiveRateForDaily(s) * 300);
  const reward = Math.floor(base * (1 + streak * 0.25));
  return {
    state: {
      ...s,
      coins: s.coins + reward,
      dailyStreak: streak,
      lastDailyClaim: now,
    },
    reward,
    streak,
  };
}

function passiveRateForDaily(s: GameState): number {
  // import cycle avoidance: recompute simply
  let base = 0;
  const rates = [0.5, 5, 45, 420];
  const ids = ["gpu", "asic", "farm", "quantum"] as const;
  ids.forEach((id, i) => {
    const owned = s.upgrades[id];
    base += owned * rates[i] * Math.pow(2, Math.floor(owned / 25));
  });
  return base;
}

export function dailyAvailable(s: GameState): boolean {
  return Date.now() - (s.lastDailyClaim ?? 0) > DAY_MS * 0.75;
}
