import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

// Simple file-backed leaderboard. For production: swap for a real DB.
// Score = totalMined (lifetime). Client submits its save summary; we do
// light sanity checks server-side (no full validation yet — noted for v3).
const DB_PATH = path.join(process.cwd(), ".leaderboard.json");

interface Entry {
  name: string;
  totalMined: number;
  prestiges: number;
  achievements: number;
  updatedAt: number;
}

async function readDb(): Promise<Entry[]> {
  try {
    return JSON.parse(await fs.readFile(DB_PATH, "utf8"));
  } catch {
    return [];
  }
}

async function writeDb(entries: Entry[]) {
  await fs.writeFile(DB_PATH, JSON.stringify(entries), "utf8");
}

export async function GET() {
  const entries = await readDb();
  entries.sort((a, b) => b.totalMined - a.totalMined);
  return NextResponse.json({ top: entries.slice(0, 50) });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const name = String(body.name ?? "").trim().slice(0, 20);
    const totalMined = Number(body.totalMined);
    const prestiges = Math.max(0, Math.min(10000, Number(body.prestiges) || 0));
    const achievements = Math.max(0, Math.min(100, Number(body.achievements) || 0));
    if (!name || !isFinite(totalMined) || totalMined < 0) {
      return NextResponse.json({ error: "invalid payload" }, { status: 400 });
    }
    // crude anti-cheat: reject implausible jumps (client-reported for now)
    if (totalMined > 1e18) {
      return NextResponse.json({ error: "implausible score" }, { status: 400 });
    }
    const entries = await readDb();
    const existing = entries.find((e) => e.name === name);
    if (existing) {
      if (totalMined < existing.totalMined) {
        return NextResponse.json({ error: "score regression rejected" }, { status: 400 });
      }
      existing.totalMined = totalMined;
      existing.prestiges = prestiges;
      existing.achievements = achievements;
      existing.updatedAt = Date.now();
    } else {
      entries.push({ name, totalMined, prestiges, achievements, updatedAt: Date.now() });
    }
    await writeDb(entries);
    entries.sort((a, b) => b.totalMined - a.totalMined);
    const rank = entries.findIndex((e) => e.name === name) + 1;
    return NextResponse.json({ ok: true, rank });
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
}
