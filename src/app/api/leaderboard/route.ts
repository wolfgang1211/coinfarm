import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { validateSubmission, summarizeSave } from "@/lib/validate";
import { seasonKey } from "@/lib/season";

// File-backed leaderboard with weekly seasons.
const DB_PATH = path.join(process.cwd(), ".leaderboard.json");

interface Entry {
  name: string;
  totalMined: number;
  prestiges: number;
  achievements: number;
  updatedAt: number;
}

interface Db {
  allTime: Entry[];
  seasons: Record<string, Entry[]>;
}

async function readDb(): Promise<Db> {
  try {
    const parsed = JSON.parse(await fs.readFile(DB_PATH, "utf8"));
    return { allTime: parsed.allTime ?? [], seasons: parsed.seasons ?? {} };
  } catch {
    return { allTime: [], seasons: {} };
  }
}

async function writeDb(db: Db) {
  // keep only last 8 seasons
  const keys = Object.keys(db.seasons).sort();
  while (keys.length > 8) delete db.seasons[keys.shift()!];
  await fs.writeFile(DB_PATH, JSON.stringify(db), "utf8");
}

function top(entries: Entry[], n = 50): Entry[] {
  return [...entries].sort((a, b) => b.totalMined - a.totalMined).slice(0, n);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") ?? "all";
  const db = await readDb();
  if (scope === "season") {
    const key = seasonKey();
    const entries = db.seasons[key] ?? [];
    return NextResponse.json({ scope: "season", season: key, top: top(entries) });
  }
  return NextResponse.json({ scope: "all", top: top(db.allTime) });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const name = String(body.name ?? "").trim().slice(0, 20);
    if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

    const summary = summarizeSave(body);
    const check = validateSubmission(summary);
    if (!check.ok) return NextResponse.json({ error: check.reason }, { status: 400 });

    const db = await readDb();
    const key = seasonKey();

    const upsert = (entries: Entry[]): string | null => {
      const existing = entries.find((e) => e.name === name);
      if (existing) {
        if (summary.totalMined < existing.totalMined) return "score regression rejected";
        existing.totalMined = summary.totalMined;
        existing.prestiges = summary.prestiges;
        existing.achievements = summary.achievements;
        existing.updatedAt = Date.now();
      } else {
        entries.push({ name, ...summary, updatedAt: Date.now() } as Entry);
      }
      return null;
    };

    let err = upsert(db.allTime);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
    if (!db.seasons[key]) db.seasons[key] = [];
    upsert(db.seasons[key]);
    await writeDb(db);

    const rankAll = [...db.allTime].sort((a, b) => b.totalMined - a.totalMined).findIndex((e) => e.name === name) + 1;
    const rankSeason = [...(db.seasons[key] ?? [])].sort((a, b) => b.totalMined - a.totalMined).findIndex((e) => e.name === name) + 1;
    return NextResponse.json({ ok: true, rank: rankAll, seasonRank: rankSeason, season: key });
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
}
