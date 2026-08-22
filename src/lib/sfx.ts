// Lightweight synth SFX via Web Audio API — no asset files needed.
let ctx: AudioContext | null = null;
let muted = false;

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try { ctx = new (window.AudioContext || (window as any).webkitAudioContext)(); } catch { return null; }
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

export function setMuted(m: boolean) { muted = m; }
export function isMuted() { return muted; }

function blip(freq: number, dur: number, type: OscillatorType = "sine", gain = 0.08) {
  const a = ac();
  if (!a || muted) return;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, a.currentTime);
  g.gain.setValueAtTime(gain, a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
  osc.connect(g).connect(a.destination);
  osc.start();
  osc.stop(a.currentTime + dur);
}

export const sfx = {
  click: () => blip(220 + Math.random() * 60, 0.06, "square", 0.04),
  crit: () => { blip(440, 0.15, "sawtooth", 0.1); setTimeout(() => blip(880, 0.2, "sawtooth", 0.1), 60); },
  buy: () => { blip(330, 0.08); setTimeout(() => blip(494, 0.12), 70); },
  golden: () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => blip(f, 0.18, "triangle", 0.09), i * 80)); },
  achievement: () => { [392, 523, 659].forEach((f, i) => setTimeout(() => blip(f, 0.22, "sine", 0.09), i * 100)); },
  prestige: () => { [262, 330, 392, 523, 659].forEach((f, i) => setTimeout(() => blip(f, 0.3, "triangle", 0.1), i * 120)); },
};
