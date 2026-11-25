/**
 * Short two-note chime synthesized with Web Audio (no audio file to ship or license).
 * Browsers, iOS Safari in particular, only allow audio after a user gesture, so the
 * AudioContext is created/resumed on the first tap or click (see unlockChimeOnFirstGesture).
 */
type Ctx = AudioContext;
let ctx: Ctx | null = null;

function getCtx(): Ctx | null {
  if (ctx) return ctx;
  const AC: typeof AudioContext | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  return ctx;
}

/** Call once at startup: resumes audio on the first user gesture so later chimes can play. */
export function unlockChimeOnFirstGesture(): () => void {
  const unlock = () => {
    const c = getCtx();
    if (c && c.state === 'suspended') void c.resume();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
  return unlock;
}

export function playChime(): void {
  const c = getCtx();
  if (!c) return;
  if (c.state === 'suspended') void c.resume();
  const start = c.currentTime + 0.01;
  [880, 1318.5].forEach((freq, i) => {
    const t = start + i * 0.18;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    osc.connect(gain).connect(c.destination);
    osc.start(t);
    osc.stop(t + 0.5);
  });
}
