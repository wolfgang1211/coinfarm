import { Metadata } from "next";

// Farcaster Frame: renders as an interactive embed in FC clients.
export const metadata: Metadata = {
  title: "CoinFarm",
  other: {
    "fc:frame": JSON.stringify({
      version: "1",
      imageUrl: "https://coinfarm.vercel.app/og.png",
      button: {
        title: "⛏ Start Mining",
        action: { type: "launch_frame", name: "CoinFarm", url: "https://coinfarm.vercel.app" },
      },
    }),
  },
};

export default function FramePage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-8 font-mono">
      <h1 className="text-3xl font-bold">⛏ CoinFarm</h1>
      <p className="mt-2 text-zinc-400">Idle crypto miner — mine, trade, stake, prestige.</p>
      <a href="/" className="mt-6 rounded bg-emerald-600 px-6 py-3 font-bold hover:bg-emerald-500">Open Game →</a>
    </main>
  );
}
