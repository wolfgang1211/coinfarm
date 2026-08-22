import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { validateSubmission, summarizeSave } from "@/lib/validate";

// File-backed leaderboard. For production: swap for a real DB.
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
    if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

    const summary = summarizeSave(body);
    const check = validateSubmission(summary);
    if (!check.ok) return NextResponse.json({ error: check.reason }, { status: 400 });

    const entries = await readDb();
    const existing = entries.find((e) => e.name === name);
    if (existing) {
      if (summary.totalMined < existing.totalMined) {
        return NextResponse.json({ error: "score regression rejected" }, { status: 400 });
      }
      existing.totalMined = summary.totalMined;
      existing.prestiges = summary.prestiges;
      existing.achievements = summary.achievements;
      existing.updatedAt = Date.now();
    } else {
      entries.push({ name, ...summary, updatedAt: Date.now() } as Entry);
    }
    await writeDb(entries);
    entries.sort((a, b) => b.totalMined - a.totalMined);
    const rank = entries.findIndex((e) => e.name === name) + 1;
    return NextResponse.json({ ok: true, rank });
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
}
