// ─────────────────────────────────────────────────────────────────
//  BatchHatch — Mechanical meter sounds via Web Audio API
//  Zero asset dependencies — everything synthesised at runtime
// ─────────────────────────────────────────────────────────────────

// Shared AudioContext — created once and reused (browsers cap instances)
let _ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!_ctx || _ctx.state === "closed") {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    _ctx = new AC();
  }
  // Resume if suspended (browser autoplay policy)
  if (_ctx.state === "suspended") _ctx.resume();
  return _ctx;
}

/** Mechanical dial click — triangle wave decaying from 120 → 30 Hz over 30ms */
export function playMeterClick(volume = 0.15): void {
  const ctx = getCtx();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "triangle";
  osc.frequency.setValueAtTime(120, now);
  osc.frequency.exponentialRampToValueAtTime(30, now + 0.03);

  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.04);
}

/** Heavier carry click — when a gear-linkage propagates to a higher dial */
export function playCarryClick(): void {
  const ctx = getCtx();
  if (!ctx) return;

  const now = ctx.currentTime;

  // Low thud
  const osc1  = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = "triangle";
  osc1.frequency.setValueAtTime(80, now);
  osc1.frequency.exponentialRampToValueAtTime(20, now + 0.05);
  gain1.gain.setValueAtTime(0.22, now);
  gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
  osc1.connect(gain1);
  gain1.connect(ctx.destination);
  osc1.start(now);
  osc1.stop(now + 0.06);

  // High tick layered on top
  const osc2  = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = "sine";
  osc2.frequency.setValueAtTime(800, now);
  osc2.frequency.exponentialRampToValueAtTime(200, now + 0.02);
  gain2.gain.setValueAtTime(0.06, now);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.02);
  osc2.connect(gain2);
  gain2.connect(ctx.destination);
  osc2.start(now);
  osc2.stop(now + 0.03);
}
