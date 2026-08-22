"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  GameState, newGame, tick, upgradeCost, bulkCost, upgradeClickCost,
  passiveRate, clickValue, stakeRewards, rollCrit, CRIT_MULT, isFrenzy,
  prestigeGain, doPrestige, PRESTIGE_UNLOCK, globalMult, achievementMult,
  shouldSpawnGolden, pickGoldenKind, applyGolden, newAchievements,
  ACHIEVEMENTS, UPGRADE_DEFS, UpgradeId, fmtNum, GoldenKind,
} from "@/lib/game";
import { executeTrade, checkDailyBonus, dailyAvailable } from "@/lib/wave2";
import { PERKS, perkCost, PerkId } from "@/lib/perks";
import { effectiveApy, offlineCap } from "@/lib/game";
import { sfx, setMuted, isMuted } from "@/lib/sfx";
import { msUntilSeasonEnd, fmtCountdown } from "@/lib/season";
import { GEN_ART } from "@/components/gen-art";

const SAVE_KEY = "coinfarm-save-v2";

function loadGame(): GameState {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return { ...newGame(), ...JSON.parse(raw) };
  } catch {}
  return newGame();
}

interface FloatText { id: number; x: number; y: number; text: string; crit: boolean }
interface Toast { id: number; text: string }

let floatId = 0;

export default function Home() {
  const [state, setState] = useState<GameState | null>(null);
  const [stakeInput, setStakeInput] = useState("");
  const [tradeAmount, setTradeAmount] = useState("");
  const [floats, setFloats] = useState<FloatText[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [golden, setGolden] = useState<{ x: number; y: number } | null>(null);
  const [showAchievements, setShowAchievements] = useState(false);
  const [showPerks, setShowPerks] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [lbEntries, setLbEntries] = useState<{ name: string; totalMined: number; prestiges: number; achievements: number }[] | null>(null);
  const [playerName, setPlayerName] = useState("");
  const [lbScope, setLbScope] = useState<"all" | "season">("season");
  const [dailyClaimable, setDailyClaimable] = useState(false);
  const [offlineReport, setOfflineReport] = useState<string | null>(null);
  const [muteState, setMuteState] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  const mineBtnRef = useRef<HTMLButtonElement>(null);

  const pushToast = useCallback((text: string) => {
    const id = ++floatId;
    setToasts((t) => [...t.slice(-3), { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  useEffect(() => {
    const loaded = loadGame();
    const { state: caught, offlineMs } = tick(loaded);
    setState(caught);
    if (offlineMs > 60_000) {
      const mins = Math.floor(offlineMs / 60000);
      setOfflineReport(`Your rigs kept running for ${mins >= 60 ? Math.floor(mins / 60) + "h " : ""}${mins % 60}m at 50% efficiency.`);
    }
  }, []);

  useEffect(() => {
    const iv = setInterval(() => {
      setState((s) => {
        if (!s) return s;
        const { state: next } = tick(s);
        setDailyClaimable(dailyAvailable(next));
        if (!golden && shouldSpawnGolden(next)) {
          setGolden({ x: 8 + Math.random() * 70, y: 15 + Math.random() * 65 });
          next.lastGoldenSpawn = Date.now();
        }
        const newly = newAchievements(next);
        if (newly.length > 0) {
          next.achievements = [...next.achievements, ...newly];
          for (const id of newly) {
            const def = ACHIEVEMENTS.find((a) => a.id === id);
            if (def) pushToast(`🏆 ${def.name} — +1% global`);
          }
          sfx.achievement();
        }
        return { ...next };
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [golden, pushToast]);

  useEffect(() => {
    const iv = setInterval(() => {
      if (stateRef.current)
        localStorage.setItem(SAVE_KEY, JSON.stringify({ ...stateRef.current, lastTick: Date.now() }));
    }, 5000);
    return () => clearInterval(iv);
  }, []);

  const addFloat = useCallback((text: string, crit: boolean) => {
    const id = ++floatId;
    const rect = mineBtnRef.current?.getBoundingClientRect();
    const x = rect ? Math.min(rect.left + Math.random() * rect.width * 0.7, window.innerWidth - 90) : 200;
    const y = rect ? rect.top + 24 : 300;
    setFloats((f) => [...f.slice(-14), { id, x, y, text, crit }]);
    setTimeout(() => setFloats((f) => f.filter((x2) => x2.id !== id)), 1000);
  }, []);

  const doMine = () => {
    if (!state) return;
    const crit = rollCrit(state);
    let v = clickValue(state);
    if (crit) v *= CRIT_MULT;
    setState((s) => s ? { ...s, coins: s.coins + v, totalMined: s.totalMined + v, runMined: s.runMined + v, clicksTotal: s.clicksTotal + 1, critCount: s.critCount + (crit ? 1 : 0) } : s);
    if (crit) sfx.crit(); else sfx.click();
    addFloat(`+${fmtNum(v)}${crit ? " CRIT!" : ""}`, crit);
  };

  // space to mine
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        doMine();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const clickGolden = () => {
    if (!state || !golden) return;
    setGolden(null);
    const kind = pickGoldenKind();
    const { state: next, message } = applyGolden(state, kind);
    setState(next);
    sfx.golden();
    pushToast(message);
  };

  const buyUpgrade = (id: UpgradeId, n: number) => {
    setState((s) => {
      if (!s) return s;
      const cost = n === 1 ? upgradeCost(id, s.upgrades[id]) : bulkCost(id, s.upgrades[id], n);
      if (s.coins < cost) return s;
      const newOwned = s.upgrades[id] + n;
      if (Math.floor(newOwned / 25) > Math.floor(s.upgrades[id] / 25)) {
        const def = UPGRADE_DEFS.find((d) => d.id === id)!;
        pushToast(`🌟 MILESTONE! ${def.name} output ×${Math.pow(2, Math.floor(newOwned / 25))}`);
        sfx.achievement();
      }
      return { ...s, coins: s.coins - cost, upgrades: { ...s.upgrades, [id]: newOwned } };
    });
    sfx.buy();
  };

  const buyClickLevel = () => {
    setState((s) => {
      if (!s) return s;
      const cost = upgradeClickCost(s.perClickLevel);
      if (s.coins < cost) return s;
      return { ...s, coins: s.coins - cost, perClickLevel: s.perClickLevel + 1 };
    });
    sfx.buy();
  };

  const doStake = (all = false) => {
    setState((s) => {
      if (!s) return s;
      const amount = all ? s.coins : parseFloat(stakeInput);
      if (!amount || amount <= 0 || amount > s.coins) return s;
      const now = Date.now();
      return { ...s, coins: s.coins - amount, stakedAmount: s.stakedAmount + amount, pendingRewards: stakeRewards(s, now), stakeStartTime: now };
    });
    setStakeInput("");
  };

  const unstake = () => {
    setState((s) => {
      if (!s || s.stakedAmount <= 0) return s;
      const now = Date.now();
      const rewards = stakeRewards(s, now);
      return { ...s, coins: s.coins + s.stakedAmount + rewards, totalMined: s.totalMined + rewards, runMined: s.runMined + rewards, stakedAmount: 0, pendingRewards: 0, stakeStartTime: now };
    });
  };

  const trade = (side: "buy" | "sell") => {
    setState((s) => {
      if (!s) return s;
      let amount = parseFloat(tradeAmount);
      if (side === "sell" && tradeAmount.toLowerCase() === "all") amount = s.coins;
      const { state: next, message } = executeTrade(s, side, amount);
      pushToast(next ? message : "❌ " + message);
      return next ?? s;
    });
    setTradeAmount("");
  };

  const claimDaily = () => {
    setState((s) => {
      if (!s) return s;
      const r = checkDailyBonus(s);
      if (!r) return s;
      pushToast(`📅 Day ${r.streak} streak: +${fmtNum(r.reward)} $FARM`);
      setDailyClaimable(false);
      return r.state;
    });
    sfx.golden();
  };

  const prestige = () => {
    setState((s) => {
      if (!s) return s;
      const next = doPrestige(s);
      if (!next) return s;
      pushToast(`✨ Prestiged! +${prestigeGain(s)} pts → +${((globalMult(next) / (1 + next.prestigePoints * 0)) - 1).toFixed(0)} boost`);
      sfx.prestige();
      return next;
    });
  };

  const buyPerk = (id: PerkId, maxLevel: number, cost: number) => {
    setState((s) => {
      if (!s) return s;
      const lvl = s.perks[id] ?? 0;
      if (lvl >= maxLevel || s.prestigePoints < cost) return s;
      pushToast("🧪 Research complete!");
      return { ...s, prestigePoints: s.prestigePoints - cost, perks: { ...s.perks, [id]: lvl + 1 } };
    });
    sfx.buy();
  };

  const openLeaderboard = async (scope: "all" | "season" = lbScope) => {
    setShowLeaderboard(true);
    try {
      setPlayerName(localStorage.getItem("coinfarm-name") ?? "");
      const res = await fetch(`/api/leaderboard?scope=${scope}`);
      const data = await res.json();
      setLbEntries(data.top ?? []);
    } catch { setLbEntries([]); }
  };

  const submitScore = async () => {
    const s = stateRef.current;
    if (!s || !playerName.trim()) return;
    localStorage.setItem("coinfarm-name", playerName.trim());
    try {
      const res = await fetch("/api/leaderboard", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: playerName.trim(), totalMined: Math.floor(s.totalMined), prestiges: s.prestiges, achievements: s.achievements, createdAt: s.createdAt }),
      });
      const data = await res.json();
      pushToast(data.ok ? `📡 #${data.rank} all-time · #${data.seasonRank ?? "?"} season` : `❌ ${data.error}`);
      openLeaderboard();
    } catch { pushToast("❌ Submit failed"); }
  };

  const shareScore = async () => {
    const s = stateRef.current;
    if (!s) return;
    const text = `⛏ I've mined ${fmtNum(s.totalMined)} $FARM (${s.prestiges} prestiges) in CoinFarm! Can you beat me?`;
    const url = "https://coinfarm.vercel.app";
    if (navigator.share) { try { await navigator.share({ text, url }); return; } catch {} }
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text + " " + url)}`, "_blank");
  };

  // chart with area fill + current price chip
  const chart = (() => {
    if (!state || state.priceHistory.length < 2) return null;
    const h = state.priceHistory.slice(-120);
    const min = Math.min(...h), max = Math.max(...h);
    const range = max - min || 1;
    const W = 340, H = 64;
    const up = h[h.length - 1] >= h[0];
    const c = up ? "#34d399" : "#f87171";
    const pts = h.map((p, i) => `${((i / (h.length - 1)) * W).toFixed(1)},${(H - 4 - ((p - min) / range) * (H - 8)).toFixed(1)}`);
    return (
      <div className="chart-wrap mt-3">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full block" style={{ height: 64 }}>
          <defs>
            <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c} stopOpacity="0.22" />
              <stop offset="100%" stopColor={c} stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={`0,${H} ${pts.join(" ")} ${W},${H}`} fill="url(#area)" />
          <polyline points={pts.join(" ")} fill="none" stroke={c} strokeWidth="1.8" strokeLinejoin="round" />
          <circle cx={W} cy={parseFloat(pts[pts.length - 1].split(",")[1])} r="2.6" fill={c} />
        </svg>
        <span className="chart-current absolute top-1.5 right-1.5 font-bold" style={{ color: c }}>
          ${state.price.toFixed(3)}
        </span>
      </div>
    );
  })();

  if (!state) return <main className="app-bg" />;

  const gain = prestigeGain(state);
  const canPrestige = gain > 0;
  const frenzy = isFrenzy(state);
  const boosted = Date.now() < state.boostUntil;
  const priceUp = state.priceHistory.length > 1 && state.price >= state.priceHistory[state.priceHistory.length - 2];

  return (
    <main className="app-bg px-4 pb-10 pt-5 max-w-md mx-auto select-none">
      {/* ===== header ===== */}
      <header className="flex items-center justify-between mb-4">
        <h1 className="font-display text-lg font-extrabold tracking-tight">
          <span className="pick-swing inline-block mr-1">⛏</span>
          Coin<span className="text-emerald-400">Farm</span>
        </h1>
        <nav className="flex gap-1.5">
          <button onClick={() => setShowAchievements(true)} className="topbar-btn">🏆 {state.achievements.length}<span className="opacity-50">/{ACHIEVEMENTS.length}</span></button>
          <button onClick={() => setShowPerks(true)} className="topbar-btn">🧪 {state.prestigePoints} PP</button>
          <button onClick={() => openLeaderboard()} className="topbar-btn">📡</button>
          <button onClick={() => { const m = !isMuted(); setMuted(m); setMuteState(m); }} className="topbar-btn">{muteState ? "🔇" : "🔊"}</button>
        </nav>
      </header>

      {/* ===== balance hero ===== */}
      <section className="balance-hero p-5">
        <div className="flex items-center justify-center gap-3">
          <span className="coin-badge">$</span>
          <div className="text-left">
            <div className="animate-coinglow font-display text-[32px] leading-none font-extrabold tabular-nums">{fmtNum(state.coins)}</div>
            <div className="sec-label mt-1">$FARM balance</div>
          </div>
        </div>

        {chart}

        <div className="mt-2 flex items-center justify-between text-xs">
          <span className="text-zinc-400">portfolio <b className="text-zinc-200">${fmtNum((state.coins + state.stakedAmount) * state.price)}</b></span>
          <span className="text-zinc-400">passive <b className="text-emerald-400">{fmtNum(passiveRate(state))}/s</b></span>
        </div>

        {(boosted || frenzy) && (
          <div className={`mt-3 rounded-xl py-2 text-center text-sm font-bold ${frenzy ? "bg-red-500/20 text-red-300" : "bg-yellow-500/15 text-yellow-300"}`}>
            {frenzy ? `🔥 FRENZY ×${state.frenzyMult} · ${Math.ceil((state.frenzyUntil - Date.now()) / 1000)}s` : `⚡ SURGE ×${state.boostMult} · ${Math.ceil((state.boostUntil - Date.now()) / 1000)}s`}
          </div>
        )}
      </section>

      {/* ===== mine ===== */}
      <button ref={mineBtnRef} onClick={doMine} className={`mine-btn sheen mt-4 w-full block text-white ${frenzy ? "mine-btn-frenzy" : ""}`}>
        <span className="pick-swing text-3xl block mb-1">⛏️</span>
        <span className="mine-amount">+{fmtNum(clickValue(state))}</span>
        <span className="block text-[11px] opacity-80 mt-1 font-semibold tracking-wide">TAP TO MINE · 5% ×7 CRIT</span>
      </button>

      <button onClick={buyClickLevel} disabled={state.coins < upgradeClickCost(state.perClickLevel)} className="sub-action mt-2">
        <span>⛏️ Pick Lv.{state.perClickLevel} → {state.perClickLevel + 1}</span>
        <span className="tabular-nums">{fmtNum(upgradeClickCost(state.perClickLevel))} 🪙</span>
      </button>

      {/* floating numbers */}
      {floats.map((f) => (
        <span key={f.id} className={`float-num ${f.crit ? "float-crit" : "float-normal"}`} style={{ left: f.x, top: f.y }}>{f.text}</span>
      ))}

      {/* ===== generators ===== */}
      <div className="sec-label mt-6 mb-2 pl-1">⛏️ Mining hardware</div>
      <div className="space-y-2">
        {(() => {
          const contributions = UPGRADE_DEFS.map((def) => def.rate * state.upgrades[def.id] * Math.pow(2, Math.floor(state.upgrades[def.id] / 25)));
          const total = contributions.reduce((a, b) => a + b, 0) || 1;
          return UPGRADE_DEFS.map((def, idx) => {
            const owned = state.upgrades[def.id];
            const cost = upgradeCost(def.id, owned);
            const afford = state.coins >= cost;
            const share = (contributions[idx] / total) * 100;
            const Art = GEN_ART[def.id];
            return (
              <div key={def.id} className={`gen-card card-${def.id} p-3 ${afford ? "affordable" : ""}`}>
                <div className="flex gap-3">
                  <div className="gen-art-frame"><Art className="w-full h-full" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <div className="gen-name truncate">{def.name} <span className="text-zinc-500 font-normal">×{owned}</span></div>
                        <div className="gen-meta">{fmtNum(def.rate * Math.pow(2, Math.floor(owned / 25)))}/s each · milestone in {25 - (owned % 25)}</div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => buyUpgrade(def.id, 1)} disabled={!afford} className="buy-btn">{fmtNum(cost)}</button>
                        <button onClick={() => buyUpgrade(def.id, 10)} disabled={state.coins < bulkCost(def.id, owned, 10)} className="buy-btn">×10</button>
                      </div>
                    </div>
                    <div className="share-track mt-2"><div className="share-bar" style={{ width: `${share}%` }} /></div>
                  </div>
                </div>
              </div>
            );
          });
        })()}
      </div>

      {/* ===== market ===== */}
      <div className="sec-label mt-6 mb-2 pl-1">📈 Market · cash ${(state.usdCash ?? 0).toFixed(2)} · 1% fee</div>
      <div className="panel p-3">
        <div className="flex items-center justify-between text-xs mb-2">
          <span className={priceUp ? "text-emerald-400" : "text-red-400"}>${state.price.toFixed(3)} {priceUp ? "▲" : "▼"}</span>
          <span className="text-zinc-500">sell pumps · buy dips</span>
        </div>
        <div className="flex gap-1.5">
          <input value={tradeAmount} onChange={(e) => setTradeAmount(e.target.value)} placeholder="amount or 'all'" inputMode="decimal" className="text-input flex-1 min-w-0" />
          <button onClick={() => trade("sell")} className="primary-pill sell-pill">Sell</button>
          <button onClick={() => trade("buy")} className="primary-pill buy-pill">Buy</button>
        </div>
      </div>

      {/* ===== staking ===== */}
      <div className="sec-label mt-6 mb-2 pl-1">🏦 Staking · {(effectiveApy(state) * 100).toFixed(0)}% APR</div>
      <div className="panel p-3">
        <div className="grid grid-cols-2 gap-2 text-center mb-3">
          <div className="rounded-xl bg-black/30 py-2">
            <div className="font-display font-bold tabular-nums">{fmtNum(state.stakedAmount)}</div>
            <div className="sec-label mt-0.5">staked</div>
          </div>
          <div className="rounded-xl bg-black/30 py-2">
            <div className="font-display font-bold tabular-nums text-emerald-400">{fmtNum(stakeRewards(state))}</div>
            <div className="sec-label mt-0.5">rewards</div>
          </div>
        </div>
        <div className="flex gap-1.5">
          <input value={stakeInput} onChange={(e) => setStakeInput(e.target.value)} placeholder="amount" inputMode="decimal" className="text-input flex-1 min-w-0" />
          <button onClick={() => doStake(false)} className="primary-pill">Stake</button>
          <button onClick={() => doStake(true)} className="buy-btn !h-[34px]">All</button>
        </div>
        <button onClick={unstake} disabled={state.stakedAmount <= 0} className="sub-action mt-2 !h-[34px] text-xs">Unstake all + claim rewards</button>
      </div>

      {/* ===== prestige ===== */}
      <div className="sec-label mt-6 mb-2 pl-1">✨ Prestige</div>
      <div className={`panel p-4 ${canPrestige ? "!border-purple-500/40" : ""}`}>
        <p className="text-xs text-zinc-400 leading-relaxed">
          Reset this run's coins & hardware. Keep <b className="text-purple-300">{state.prestigePoints} PP</b> forever —
          each point is <b className="text-purple-300">+6%</b> global, spendable in the Research Lab.
        </p>
        <button onClick={prestige} disabled={!canPrestige}
          className={`mt-3 w-full rounded-xl py-3 font-display font-extrabold text-white transition-all ${canPrestige ? "perk-btn !w-full !h-auto !py-3" : "bg-white/5 text-zinc-500 cursor-default"}`}
          style={canPrestige ? {} : { boxShadow: "none" }}>
          {canPrestige ? `PRESTIGE NOW → +${gain} PP` : `reach ${fmtNum(PRESTIGE_UNLOCK)} mined this run (${fmtNum(state.runMined)})`}
        </button>
      </div>

      {/* ===== footer actions ===== */}
      <div className="mt-6 flex justify-center gap-2">
        <button onClick={() => setShowStats(true)} className="topbar-btn">📊 Stats</button>
        <button onClick={shareScore} className="topbar-btn">🐦 Share</button>
      </div>
      <p className="footer-note mt-3">
        lifetime {fmtNum(state.totalMined)} · clicks {fmtNum(state.clicksTotal)} · 🏆 season ends in {fmtCountdown(msUntilSeasonEnd())}
        <span className="block mt-0.5 opacity-60">space = mine · autosaved locally</span>
      </p>

      {/* daily bonus */}
      {dailyClaimable && (
        <button onClick={claimDaily} className="daily-pill fixed top-16 right-4 z-40">📅 DAILY BONUS</button>
      )}

      {/* golden event */}
      {golden && (
        <button onClick={clickGolden} className="golden-coin" style={{ left: `${golden.x}%`, top: `${golden.y}%` }}>💰</button>
      )}

      {/* toasts */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-md space-y-1.5 pointer-events-none">
        {toasts.map((t) => <div key={t.id} className="toast-item">{t.text}</div>)}
      </div>

      {/* offline welcome */}
      {offlineReport && (
        <div className="sheet-backdrop z-[60]" onClick={() => setOfflineReport(null)}>
          <div className="welcome-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="font-display font-bold text-base mb-1">🌙 Welcome back</div>
            <p className="text-zinc-400 text-sm">{offlineReport}</p>
            <button onClick={() => setOfflineReport(null)} className="primary-pill w-full !h-10 mt-4">Collect</button>
          </div>
        </div>
      )}

      {/* ===== sheets ===== */}
      {showAchievements && (
        <div className="sheet-backdrop" onClick={() => setShowAchievements(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <SheetHeader title={`🏆 Achievements · +1% each`} onClose={() => setShowAchievements(false)} />
            {ACHIEVEMENTS.map((a) => {
              const done = state.achievements.includes(a.id);
              return (
                <div key={a.id} className={`sheet-row ${done ? "" : "opacity-40"}`}>
                  <span>{done ? "✅" : "⬜"} <b className="ml-1">{a.name}</b></span>
                  <span className="text-xs text-zinc-500 text-right">{a.desc}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showPerks && (
        <div className="sheet-backdrop" onClick={() => setShowPerks(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <SheetHeader title={`🧪 Research Lab · ${state.prestigePoints} PP`} onClose={() => setShowPerks(false)} />
            <p className="text-xs text-zinc-500 mb-2">Permanent upgrades — survive prestige resets.</p>
            {PERKS.map((p) => {
              const lvl = state.perks[p.id] ?? 0;
              const maxed = lvl >= p.maxLevel;
              const cost = maxed ? 0 : perkCost(p, lvl);
              return (
                <div key={p.id} className="sheet-row">
                  <div>
                    <div>{p.icon} <b className="ml-1">{p.name}</b> <span className="text-xs text-zinc-500">Lv.{lvl}/{p.maxLevel}</span></div>
                    <div className="text-xs text-zinc-500">{p.desc}</div>
                  </div>
                  <button onClick={() => buyPerk(p.id, p.maxLevel, cost)} disabled={maxed || state.prestigePoints < cost} className="perk-btn shrink-0 ml-3">
                    {maxed ? "MAX" : `${cost} PP`}
                  </button>
                </div>
              );
            })}
            <div className="mt-3 text-xs text-zinc-500">APY {(effectiveApy(state) * 100).toFixed(0)}% · offline cap {Math.round(offlineCap(state) / 3600000)}h</div>
          </div>
        </div>
      )}

      {showLeaderboard && (
        <div className="sheet-backdrop" onClick={() => setShowLeaderboard(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <SheetHeader title="📡 Leaderboard" onClose={() => setShowLeaderboard(false)} />
            <div className="flex gap-1.5 mb-3">
              {(["season", "all"] as const).map((sc) => (
                <button key={sc} onClick={() => { setLbScope(sc); openLeaderboard(sc); }}
                  className={`topbar-btn flex-1 justify-center ${lbScope === sc ? "!bg-emerald-600/30 !border-emerald-500/50 text-white" : ""}`}>
                  {sc === "season" ? "🏆 Season" : "🌍 All-Time"}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5 mb-3">
              <input value={playerName} onChange={(e) => setPlayerName(e.target.value)} placeholder="your miner name" maxLength={20} className="text-input flex-1 min-w-0" />
              <button onClick={submitScore} disabled={!playerName.trim()} className="primary-pill shrink-0">Submit</button>
            </div>
            {lbEntries === null ? <div className="text-sm text-zinc-500 py-6 text-center">loading…</div>
              : lbEntries.length === 0 ? <div className="text-sm text-zinc-500 py-6 text-center">No entries yet — be the first whale 🐋</div>
                : lbEntries.map((e, i) => {
                  const me = e.name === playerName.trim();
                  return (
                    <div key={e.name} className={`sheet-row ${me ? "text-emerald-400 font-bold" : ""}`}>
                      <span>#{i + 1} {e.name}{me && " (you)"}</span>
                      <span className={me ? "" : "text-zinc-400"}>{fmtNum(e.totalMined)} · P{e.prestiges}</span>
                    </div>
                  );
                })}
          </div>
        </div>
      )}

      {showStats && (
        <div className="sheet-backdrop" onClick={() => setShowStats(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <SheetHeader title="📊 Miner Statistics" onClose={() => setShowStats(false)} />
            {([
              ["Lifetime mined", `${fmtNum(state.totalMined)} $FARM`],
              ["This run", `${fmtNum(state.runMined)} $FARM`],
              ["Portfolio value", `$${fmtNum((state.coins + state.stakedAmount) * state.price + (state.usdCash ?? 0))}`],
              ["USD cash", `$${(state.usdCash ?? 0).toFixed(2)}`],
              ["Best portfolio", `$${fmtNum(state.bestPortfolioValue)}`],
              ["Total clicks", fmtNum(state.clicksTotal)],
              ["Critical hits", fmtNum(state.critCount)],
              ["Golden events", String(state.goldensClicked)],
              ["Prestiges", String(state.prestiges)],
              ["Achievements", `${state.achievements.length}/${ACHIEVEMENTS.length}`],
              ["Daily streak", `${state.dailyStreak ?? 0} days`],
              ["Passive rate", `${fmtNum(passiveRate(state))}/s`],
              ["Playing since", new Date(state.createdAt).toLocaleDateString()],
            ] as [string, string][]).map(([k, v]) => (
              <div key={k} className="sheet-row"><span className="text-zinc-400">{k}</span><span className="tabular-nums">{v}</span></div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}

function SheetHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex justify-between items-center mb-3 sticky top-0 bg-[#14161a] pt-1 pb-2 z-10">
      <div className="font-display font-bold">{title}</div>
      <button onClick={onClose} className="topbar-btn !px-2.5">✕</button>
    </div>
  );
}
