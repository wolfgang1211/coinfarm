"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  GameState, newGame, tick, upgradeCost, bulkCost, upgradeClickCost,
  passiveRate, clickValue, stakeRewards, rollCrit, CRIT_MULT, isFrenzy,
  prestigeGain, doPrestige, PRESTIGE_UNLOCK, globalMult, achievementMult,
  shouldSpawnGolden, pickGoldenKind, applyGolden, newAchievements,
  ACHIEVEMENTS, UPGRADE_DEFS, UpgradeId, STAKE_APY, fmtNum, GoldenKind,
} from "@/lib/game";
import { executeTrade, checkDailyBonus, dailyAvailable, fmtShort } from "@/lib/wave2";
import { PERKS, perkCost, PerkId } from "@/lib/perks";
import { effectiveApy, offlineCap } from "@/lib/game";
import { sfx, setMuted, isMuted } from "@/lib/sfx";

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
  const [floats, setFloats] = useState<FloatText[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [golden, setGolden] = useState<{ x: number; y: number } | null>(null);
  const [showAchievements, setShowAchievements] = useState(false);
  const [offlineReport, setOfflineReport] = useState<string | null>(null);
  const [tradeAmount, setTradeAmount] = useState("");
  const [dailyClaimable, setDailyClaimable] = useState(false);
  const [showPerks, setShowPerks] = useState(false);
  const [muteState, setMuteState] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [lbEntries, setLbEntries] = useState<{ name: string; totalMined: number; prestiges: number; achievements: number; rank?: number }[] | null>(null);
  const [playerName, setPlayerName] = useState("");
  const [showStats, setShowStats] = useState(false);
  const [lbScope, setLbScope] = useState<"all" | "season">("season");
  const stateRef = useRef(state);
  stateRef.current = state;
  const mineBtnRef = useRef<HTMLButtonElement>(null);

  const pushToast = useCallback((text: string) => {
    const id = ++floatId;
    setToasts((t) => [...t.slice(-3), { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  // init
  useEffect(() => {
    const loaded = loadGame();
    const { state: caught, offlineMs } = tick(loaded);
    setState(caught);
    if (offlineMs > 60_000) {
      const mins = Math.floor(offlineMs / 60000);
      setOfflineReport(`While you were away (${mins >= 60 ? Math.floor(mins / 60) + "h " : ""}${mins % 60}m), your rigs kept mining at 50% efficiency.`);
    }
  }, []);

  // game loop
  useEffect(() => {
    const iv = setInterval(() => {
      setState((s) => {
        if (!s) return s;
        const { state: next } = tick(s);
        setDailyClaimable(dailyAvailable(next));
        // golden spawn check
        if (!golden && shouldSpawnGolden(next)) {
          setGolden({ x: 10 + Math.random() * 80, y: 15 + Math.random() * 70 });
          next.lastGoldenSpawn = Date.now();
        }
        // achievements check
        const newly = newAchievements(next);
        if (newly.length > 0) {
          next.achievements = [...next.achievements, ...newly];
          for (const id of newly) {
            const def = ACHIEVEMENTS.find((a) => a.id === id);
            if (def) pushToast(`🏆 ${def.name} — ${def.desc} (+1% global)`);
          }
          sfx.achievement();
        }
        return { ...next };
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [golden, pushToast]);

  // autosave
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
    const x = rect ? rect.left + Math.random() * rect.width : 200;
    const y = rect ? rect.top + 20 : 300;
    setFloats((f) => [...f.slice(-14), { id, x, y, text, crit }]);
    setTimeout(() => setFloats((f) => f.filter((x2) => x2.id !== id)), 1000);
  }, []);

  const doMine = () => {
    if (!state) return;
    const crit = rollCrit();
    let v = clickValue(state);
    if (crit) v *= CRIT_MULT;
    setState((s) => s ? { ...s, coins: s.coins + v, totalMined: s.totalMined + v, runMined: s.runMined + v, clicksTotal: s.clicksTotal + 1, critCount: s.critCount + (crit ? 1 : 0) } : s);
    if (crit) sfx.crit(); else sfx.click();
    addFloat(`+${fmtNum(v)}${crit ? " CRIT!" : ""}`, crit);
  };

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
      // milestone celebration: crossed a 25-boundary
      const before = Math.floor(s.upgrades[id] / 25);
      const after = Math.floor(newOwned / 25);
      let milestoneMsg: string | null = null;
      if (after > before) {
        const def = UPGRADE_DEFS.find((d) => d.id === id)!;
        milestoneMsg = `🌟 MILESTONE! ${def.name} output x${Math.pow(2, after)}!`;
        setTimeout(() => sfx.achievement(), 50);
      }
      if (milestoneMsg) pushToast(milestoneMsg);
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
      const total = s.stakedAmount + stakeRewards(s, now);
      return { ...s, coins: s.coins + total, totalMined: s.totalMined + stakeRewards(s, now), runMined: s.runMined + stakeRewards(s, now), stakedAmount: 0, pendingRewards: 0, stakeStartTime: now };
    });
  };

  const prestige = () => {
    setState((s) => {
      if (!s) return s;
      const next = doPrestige(s);
      if (!next) return s;
      pushToast(`✨ Prestiged! +${prestigeGain(s)} points → +${((globalMult(next) - 1) * 100).toFixed(0)}% permanent boost`);
      return next;
    });
  };

  const trade = (side: "buy" | "sell") => {
    setState((s) => {
      if (!s) return s;
      let amount = parseFloat(tradeAmount);
      if (side === "sell" && tradeAmount === "all") amount = s.coins;
      const { state: next, message } = executeTrade(s, side, amount);
      pushToast(next ? (side === "sell" ? "💸 " : "🛒 ") + message : "❌ " + message);
      return next ?? s;
    });
    setTradeAmount("");
  };

  const claimDaily = () => {
    setState((s) => {
      if (!s) return s;
      const result = checkDailyBonus(s);
      if (!result) return s;
      pushToast(`📅 Daily bonus day ${result.streak}: +${fmtNum(result.reward)} $FARM!`);
      setDailyClaimable(false);
      return result.state;
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
  };

  // keyboard shortcut: space mines (when no input focused)
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

  const shareScore = async () => {
    const s = stateRef.current;
    if (!s) return;
    const text = `⛏ I've mined ${fmtNum(s.totalMined)} $FARM (${s.prestiges} prestiges, ${s.achievements.length} achievements) in CoinFarm! Can you beat me?`;
    const url = "https://coinfarm.vercel.app";
    if (navigator.share) {
      try { await navigator.share({ text, url }); return; } catch {}
    }
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text + " " + url)}`, "_blank");
  };

  const openLeaderboard = async (scope: "all" | "season" = lbScope) => {
    setShowLeaderboard(true);
    try {
      const savedName = localStorage.getItem("coinfarm-name") ?? "";
      setPlayerName(savedName);
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
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: playerName.trim(), totalMined: Math.floor(s.totalMined), prestiges: s.prestiges, achievements: s.achievements, createdAt: s.createdAt }),
      });
      const data = await res.json();
      if (data.ok) pushToast(`📡 Submitted! #${data.rank} all-time · #${data.seasonRank ?? "?"} this season`);
      else pushToast(`❌ ${data.error}`);
      openLeaderboard();
    } catch { pushToast("❌ Submit failed"); }
  };

  // chart
  const chart = (() => {
    if (!state || state.priceHistory.length < 2) return null;
    const h = state.priceHistory.slice(-120);
    const min = Math.min(...h), max = Math.max(...h);
    const range = max - min || 1;
    const W = 280, H = 56;
    const up = h[h.length - 1] >= h[0];
    const color = up ? "#22c55e" : "#ef4444";
    const pts = h.map((p, i) => `${((i / (h.length - 1)) * W).toFixed(1)},${(H - ((p - min) / range) * H).toFixed(1)}`).join(" ");
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-14 mt-1">
        <polyline points={pts} fill="none" stroke={color} strokeWidth="2" />
      </svg>
    );
  })();

  if (!state) return <main className="min-h-screen bg-zinc-950 text-zinc-100" />;

  const gain = prestigeGain(state);
  const canPrestige = gain > 0;
  const achMult = achievementMult(state);
  const frenzy = isFrenzy(state);
  const boosted = Date.now() < state.boostUntil;

  return (
    <main className="relative min-h-screen bg-zinc-950 text-zinc-100 p-4 max-w-md mx-auto font-mono select-none overflow-hidden">
      {/* header */}
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold tracking-tight">
          ⛏ CoinFarm <span className="text-xs text-zinc-500">idle miner</span>
        </h1>
        <button onClick={() => setShowAchievements(!showAchievements)} className="text-sm border border-zinc-700 rounded px-2 py-1 hover:border-emerald-500">
          🏆 {state.achievements.length}/{ACHIEVEMENTS.length}
        </button>
        <button onClick={() => setShowPerks(!showPerks)} className="ml-1 text-sm border border-purple-700 rounded px-2 py-1 hover:border-purple-400">
          🧪 {state.prestigePoints} PP
        </button>
        <button onClick={() => openLeaderboard()} className="ml-1 text-sm border border-sky-700 rounded px-2 py-1 hover:border-sky-400">
          📡 Top
        </button>
        <button
          onClick={() => { const m = !isMuted(); setMuted(m); setMuteState(m); }}
          className="ml-1 text-sm border border-zinc-700 rounded px-2 py-1 hover:border-zinc-500"
        >
          {muteState ? "🔇" : "🔊"}
        </button>
      </div>

      {/* balance */}
      <div className={`mt-3 rounded-lg border bg-zinc-900 p-4 text-center transition-colors ${boosted ? "border-yellow-500/60" : "border-zinc-800"}`}>
        <div className="text-3xl font-bold animate-coinglow">{fmtNum(state.coins)} $FARM</div>
        {boosted && <div className="text-xs text-yellow-400 animate-pulse">⚡ SURGE x{state.boostMult} active</div>}
        <div className={`mt-1 text-sm ${state.priceHistory.length > 1 && state.price >= state.priceHistory[state.priceHistory.length - 2] ? "text-green-400" : "text-red-400"}`}>
          ${state.price.toFixed(3)}
        </div>
        {chart}
        <div className="mt-1 text-xs text-zinc-500">
          portfolio ≈ ${fmtNum((state.coins + state.stakedAmount) * state.price)} · passive {fmtNum(passiveRate(state))}/s
        </div>
      </div>

      {/* boosts bar */}
      {(frenzy || boosted) && (
        <div className={`mt-2 rounded py-1.5 text-center text-sm font-bold ${frenzy ? "bg-red-600/30 text-red-300" : "bg-yellow-600/20 text-yellow-300"}`}>
          {frenzy && `🔥 FRENZY x${state.frenzyMult} · ${Math.ceil((state.frenzyUntil - Date.now()) / 1000)}s `}
          {!frenzy && boosted && `⚡ x${state.boostMult} · ${Math.ceil((state.boostUntil - Date.now()) / 1000)}s`}
        </div>
      )}

      {/* click */}
      <button
        ref={mineBtnRef}
        onClick={doMine}
        className={`mt-3 w-full rounded-lg border py-4 text-lg font-bold transition-colors ${
          frenzy ? "border-red-500 bg-red-600/25 hover:bg-red-600/40 active:bg-red-600/50" : "border-emerald-700 bg-emerald-600/20 hover:bg-emerald-600/30 active:bg-emerald-600/40"
        }`}
      >
        ⛏ MINE +{fmtNum(clickValue(state))}
        <span className="block text-[10px] text-zinc-400 font-normal">5% chance of 7x critical hit</span>
      </button>

      {/* floating numbers */}
      {floats.map((f) => (
        <span key={f.id} style={{ left: f.x, top: f.y }} className={`pointer-events-none fixed z-50 animate-floatup font-bold ${f.crit ? "text-yellow-300 text-2xl" : "text-emerald-300 text-lg"}`}>
          {f.text}
        </span>
      ))}

      <div className="flex gap-2 mt-2">
        <button onClick={buyClickLevel} disabled={state.coins < upgradeClickCost(state.perClickLevel)} className="flex-1 rounded border border-zinc-700 py-1.5 text-sm disabled:opacity-30 hover:border-zinc-500">
          ⛏️ Pick Lv.{state.perClickLevel}→{state.perClickLevel + 1} — {fmtNum(upgradeClickCost(state.perClickLevel))} 🪙
        </button>
      </div>

      {/* upgrades */}
      <div className="mt-4 space-y-2">
        {UPGRADE_DEFS.map((def) => {
          const owned = state.upgrades[def.id];
          const cost = upgradeCost(def.id, owned);
          const afford = state.coins >= cost;
          const toNextMilestone = 25 - (owned % 25);
          return (
            <div key={def.id} className={`rounded-lg border p-3 ${afford ? "border-zinc-700" : "border-zinc-800 opacity-40"}`}>
              <div className="flex justify-between items-center">
                <div>
                  <div className="font-bold">{def.icon} {def.name}</div>
                  <div className="text-xs text-zinc-500">
                    owned {owned} · {fmtNum(def.rate * Math.pow(2, Math.floor(owned / 25)))}/s each · milestone in {toNextMilestone}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => buyUpgrade(def.id, 1)} disabled={!afford} className="rounded bg-zinc-800 px-2 py-1 text-sm enabled:hover:bg-zinc-700">{fmtNum(cost)} 🪙</button>
                  <button onClick={() => buyUpgrade(def.id, 10)} disabled={state.coins < bulkCost(def.id, owned, 10)} className="rounded border border-zinc-600 px-2 py-1 text-sm enabled:hover:border-emerald-500">x10</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* market trading */}
      <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex justify-between">
          <span className="font-bold">📈 Market</span>
          <span className="text-xs text-zinc-500">cash: ${(state.usdCash ?? 0).toFixed(2)} · 1% fee</span>
        </div>
        <p className="mt-1 text-xs text-zinc-500">Sell $FARM into cash on pumps, buy back on dips.</p>
        <div className="mt-2 flex gap-2">
          <input value={tradeAmount} onChange={(e) => setTradeAmount(e.target.value)} placeholder="amount (or 'all')" inputMode="decimal"
            className="flex-1 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm outline-none focus:border-emerald-500" />
          <button onClick={() => trade("sell")} className="rounded bg-red-600/80 px-3 py-1 text-sm hover:bg-red-600">Sell</button>
          <button onClick={() => trade("buy")} className="rounded bg-sky-600/80 px-3 py-1 text-sm hover:bg-sky-600">Buy</button>
        </div>
      </div>

      {/* staking */}
      <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex justify-between"><span className="font-bold">🏦 Staking</span><span className="text-xs text-zinc-500">{(STAKE_APY * 100).toFixed(0)}% APR</span></div>
        <div className="mt-2 text-sm">staked: <b>{fmtNum(state.stakedAmount)}</b> $FARM</div>
        <div className="text-sm text-emerald-400">rewards: {fmtNum(stakeRewards(state))}</div>
        <div className="mt-2 flex gap-2">
          <input value={stakeInput} onChange={(e) => setStakeInput(e.target.value)} placeholder="amount" inputMode="decimal"
            className="flex-1 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm outline-none focus:border-emerald-500" />
          <button onClick={() => doStake(false)} className="rounded bg-emerald-600/80 px-3 py-1 text-sm hover:bg-emerald-600">Stake</button>
          <button onClick={() => doStake(true)} className="rounded border border-zinc-600 px-2 py-1 text-sm hover:border-emerald-500">All</button>
        </div>
        <button onClick={unstake} disabled={state.stakedAmount <= 0} className="mt-2 w-full rounded border border-zinc-700 py-1 text-sm disabled:opacity-30 hover:border-emerald-500">Unstake All + Claim</button>
      </div>

      {/* prestige */}
      <div className={`mt-4 rounded-lg border p-4 ${canPrestige ? "border-purple-600/60 bg-purple-900/10" : "border-zinc-800 bg-zinc-900 opacity-60"}`}>
        <div className="flex justify-between">
          <span className="font-bold">✨ Prestige</span>
          <span className="text-xs text-zinc-500">{state.prestigePoints} pts · +{((globalMult(state) - 1) * 100).toFixed(0)}% & +{((achMult - 1) * 100).toFixed(0)}% ach.</span>
        </div>
        <p className="mt-1 text-xs text-zinc-400">
          Reset coins & upgrades, keep lifetime stats. Each point = +2% forever.
        </p>
        <button onClick={prestige} disabled={!canPrestige} className="mt-2 w-full rounded bg-purple-600/80 py-2 text-sm font-bold disabled:opacity-40 hover:bg-purple-600">
          {canPrestige ? `PRESTIGE NOW → +${gain} pts` : `${fmtNum(PRESTIGE_UNLOCK)} run-mined to unlock (${fmtNum(state.runMined)})`}
        </button>
      </div>

      <div className="mt-4 mb-8">
        <div className="flex justify-center gap-2 mb-3 text-xs">
          <button onClick={() => setShowStats(true)} className="border border-zinc-700 rounded px-2 py-1 hover:border-emerald-500">📊 Stats</button>
          <button onClick={shareScore} className="border border-zinc-700 rounded px-2 py-1 hover:border-sky-500">🐦 Share</button>
        </div>
        <div className="text-center text-xs text-zinc-600">
          lifetime {fmtNum(state.totalMined)} · clicks {fmtNum(state.clicksTotal)} · goldens {state.goldensClicked} · prestiges {state.prestiges}
          <span className="block mt-0.5">space = mine</span>
        </div>
      </div>

      {/* daily bonus */}
      {dailyClaimable && (
        <button onClick={claimDaily} className="fixed top-14 right-4 z-40 rounded-full bg-gradient-to-r from-orange-500 to-pink-500 px-3 py-2 text-xs font-bold shadow-lg animate-bounce">
          📅 DAILY BONUS
        </button>
      )}

      {/* golden event */}
      {golden && (
        <button onClick={clickGolden}
          style={{ left: `${golden.x}%`, top: `${golden.y}%` }}
          className="fixed z-40 w-12 h-12 rounded-full bg-gradient-to-br from-yellow-200 to-yellow-500 shadow-[0_0_24px_rgba(250,204,21,0.8)] flex items-center justify-center text-xl animate-bounce">
          💰
        </button>
      )}

      {/* toasts */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 space-y-1 w-80 max-w-full">
        {toasts.map((t) => (
          <div key={t.id} className="rounded bg-zinc-800/95 border border-zinc-600 px-3 py-1.5 text-xs text-center shadow-lg">{t.text}</div>
        ))}
      </div>

      {/* offline report */}
      {offlineReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setOfflineReport(null)}>
          <div className="rounded-lg border border-emerald-700 bg-zinc-900 p-5 m-4 max-w-sm text-sm" onClick={(e) => e.stopPropagation()}>
            <div className="font-bold mb-1">🌙 Welcome back!</div>
            {offlineReport}
            <button onClick={() => setOfflineReport(null)} className="mt-3 w-full rounded bg-emerald-600 py-1.5 hover:bg-emerald-500">Collect</button>
          </div>
        </div>
      )}

      {/* stats panel */}
      {showStats && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60" onClick={() => setShowStats(false)}>
          <div className="rounded-t-xl sm:rounded-lg border border-zinc-700 bg-zinc-900 p-4 max-w-md w-full max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <div className="font-bold">📊 Miner Statistics</div>
              <button onClick={() => setShowStats(false)} className="text-zinc-400">✕</button>
            </div>
            {[
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
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between py-1.5 border-b border-zinc-800 last:border-0 text-sm">
                <span className="text-zinc-400">{k}</span><span>{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* leaderboard panel */}
      {showLeaderboard && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60" onClick={() => setShowLeaderboard(false)}>
          <div className="rounded-t-xl sm:rounded-lg border border-sky-700 bg-zinc-900 p-4 max-w-md w-full max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-2">
              <div className="font-bold">📡 Leaderboard</div>
              <button onClick={() => setShowLeaderboard(false)} className="text-zinc-400">✕</button>
            </div>
            <div className="flex gap-1 mb-2 text-xs">
              {(["season", "all"] as const).map((sc) => (
                <button key={sc} onClick={() => { setLbScope(sc); openLeaderboard(sc); }}
                  className={`rounded px-3 py-1 ${lbScope === sc ? "bg-sky-600/80" : "border border-zinc-700 hover:border-zinc-500"}`}>
                  {sc === "season" ? "🏆 Weekly Season" : "🌍 All-Time"}
                </button>
              ))}
            </div>
            <div className="flex gap-2 mb-3">
              <input value={playerName} onChange={(e) => setPlayerName(e.target.value)} placeholder="your miner name" maxLength={20}
                className="flex-1 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm outline-none focus:border-sky-500" />
              <button onClick={submitScore} disabled={!playerName.trim()} className="rounded bg-sky-600/80 px-3 py-1 text-sm hover:bg-sky-600 disabled:opacity-30">Submit</button>
            </div>
            {lbEntries === null ? (
              <div className="text-sm text-zinc-500 py-4 text-center">loading…</div>
            ) : lbEntries.length === 0 ? (
              <div className="text-sm text-zinc-500 py-4 text-center">No entries yet — be the first whale 🐋</div>
            ) : (
              lbEntries.map((e, i) => {
                const isYou = e.name === playerName.trim();
                return (
                  <div key={e.name} className={`flex justify-between py-1.5 border-b border-zinc-800 last:border-0 text-sm ${isYou ? "text-emerald-400 font-bold" : ""}`}>
                    <span>#{i + 1} {e.name} {isYou && "(you)"}</span>
                    <span className="text-zinc-400">{fmtNum(e.totalMined)} · P{e.prestiges}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* perks / research panel */}
      {showPerks && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60" onClick={() => setShowPerks(false)}>
          <div className="rounded-t-xl sm:rounded-lg border border-purple-700 bg-zinc-900 p-4 max-w-md w-full max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-2">
              <div className="font-bold">🧪 Research Lab — {state.prestigePoints} PP available</div>
              <button onClick={() => setShowPerks(false)} className="text-zinc-400">✕</button>
            </div>
            <p className="text-xs text-zinc-500 mb-2">Spend prestige points on permanent upgrades. Survives prestige resets.</p>
            {PERKS.map((p) => {
              const lvl = state.perks[p.id] ?? 0;
              const maxed = lvl >= p.maxLevel;
              const cost = maxed ? 0 : perkCost(p, lvl);
              const afford = !maxed && state.prestigePoints >= cost;
              return (
                <div key={p.id} className={`py-2 border-b border-zinc-800 last:border-0 flex items-center justify-between ${maxed ? "opacity-60" : ""}`}>
                  <div>
                    <div className="text-sm">{p.icon} <b>{p.name}</b> <span className="text-zinc-500">Lv.{lvl}/{p.maxLevel}</span></div>
                    <div className="text-xs text-zinc-500">{p.desc}</div>
                  </div>
                  <button
                    onClick={() => buyPerk(p.id, p.maxLevel, cost)}
                    disabled={maxed || !afford}
                    className={`ml-3 shrink-0 rounded px-3 py-1 text-sm ${maxed ? "border border-zinc-700 text-zinc-500" : "bg-purple-600/80 enabled:hover:bg-purple-600 disabled:opacity-30"}`}
                  >
                    {maxed ? "MAX" : `${cost} PP`}
                  </button>
                </div>
              );
            })}
            <div className="mt-2 text-xs text-zinc-500">
              Current: APY {(effectiveApy(state) * 100).toFixed(0)}% · offline cap {Math.round(offlineCap(state) / 3600000)}h
            </div>
          </div>
        </div>
      )}

      {/* achievements panel */}
      {showAchievements && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60" onClick={() => setShowAchievements(false)}>
          <div className="rounded-t-xl sm:rounded-lg border border-zinc-700 bg-zinc-900 p-4 max-w-md w-full max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-2">
              <div className="font-bold">🏆 Achievements (+1% each)</div>
              <button onClick={() => setShowAchievements(false)} className="text-zinc-400">✕</button>
            </div>
            {ACHIEVEMENTS.map((a) => {
              const done = state.achievements.includes(a.id);
              return (
                <div key={a.id} className={`py-1.5 border-b border-zinc-800 last:border-0 ${done ? "" : "opacity-40"}`}>
                  <div className="text-sm">{done ? "✅" : "⬜"} <b>{a.name}</b></div>
                  <div className="text-xs text-zinc-500 ml-6">{a.desc}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </main>
  );
}
