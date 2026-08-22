// Server-side sanity validation for leaderboard submissions.
// Full server-authoritative simulation is v3; for now we bound-check
// plausible progression using known game constants.

import { GameState } from "./game";

const MAX_PLAUSIBLE_PER_HOUR = 5e9; // generous ceiling: late-game quantum farms + prestiges

export function validateSubmission(payload: {
  totalMined: number;
  prestiges: number;
  achievements: number;
  createdAt?: number;
}): { ok: boolean; reason?: string } {
  const { totalMined, prestiges, achievements } = payload;
  if (!isFinite(totalMined) || totalMined < 0) return { ok: false, reason: "bad number" };
  if (totalMined > 1e18) return { ok: false, reason: "implausible score" };
  if (prestiges > 1000) return { ok: false, reason: "too many prestiges" };
  if (achievements > 100) return { ok: false, reason: "too many achievements" };

  // time-based check when createdAt provided (client-trusted for now)
  if (payload.createdAt) {
    const hours = Math.max(0.1, (Date.now() - payload.createdAt) / 3600000);
    const rate = totalMined / hours;
    if (rate > MAX_PLAUSIBLE_PER_HOUR) return { ok: false, reason: "mining rate too high" };
  }
  return { ok: true };
}

// Extract a minimal, safe summary from a full client save state.
export function summarizeSave(s: Partial<GameState>) {
  return {
    totalMined: Math.floor(Number(s.totalMined) || 0),
    prestiges: Math.min(1000, Math.max(0, Math.floor(Number(s.prestiges) || 0))),
    achievements: Array.isArray(s.achievements) ? s.achievements.length : 0,
    createdAt: Number(s.createdAt) || undefined,
  };
}
