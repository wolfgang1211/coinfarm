# ⛏ CoinFarm

A crypto-themed idle/clicker game. Mine $FARM, ride a simulated market, stake for yield, catch golden events, and prestige to grow forever.

## Play

```
npm install
npm run dev
# → http://localhost:3000
```

## Features

- **Click mining** with quadratic upgrade curve and 5% ×7 critical hits
- **4 generator tiers** (GPU Rig → ASIC → Mining Farm → Quantum Node) with x2 milestone bonuses every 25 owned
- **Simulated market** — mean-reverting random walk with rare pump/dump events; live SVG chart
- **Market trading** — sell $FARM into USD cash on pumps, buy dips (1% fee)
- **Staking** with compounding APR (upgradeable via research)
- **Golden events** — floating 💰 grants whale bonuses, ×7 click frenzies, or ×3 surges
- **Prestige** — reset for prestige points (+6% each, forever); first prestige lands ~50 min in, second run is ~35% faster (simulated)
- **Research Lab** — spend prestige points on 6 permanent perk trees
- **19 achievements**, each granting +1% global production
- **Daily streak bonus** scaling up to day 7
- **Offline progress** — 8h base cap at 50% efficiency, extendable via Night Shift perk
- **Global leaderboard** — submit your lifetime mined total (`/api/leaderboard`)
- **Synth SFX** via Web Audio (no asset files), mutable
- Autosave to localStorage every 5s

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS · zero game dependencies

## Balance

Economy verified by simulation (`npx tsx` against `src/lib/game.ts`): first prestige ≈ 49 min active play, second run ≈ 33 min.
