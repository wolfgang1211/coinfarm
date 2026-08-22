// Weekly season ladder: resets every Monday 00:00 UTC.
// Score = coins earned during the current season window.

export function seasonKey(now = Date.now()): string {
  const d = new Date(now);
  // Monday 00:00 UTC as season start
  const day = d.getUTCDay();
  const mondayUtc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((day + 6) % 7));
  return new Date(mondayUtc).toISOString().slice(0, 10);
}

export function msUntilSeasonEnd(now = Date.now()): number {
  const d = new Date(now);
  const day = d.getUTCDay();
  const nextMondayUtc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((day + 6) % 7) + 7);
  return nextMondayUtc - now;
}

export function fmtCountdown(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}
