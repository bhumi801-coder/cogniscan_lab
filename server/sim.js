// CogniScan simulation engine (JavaScript port).
//
// Simulates a narrow-window ESM receiver that must catch short radar pulses spread
// over a wide band, under three scan strategies:
//   fixed      - classic sweep, window steps through the band in order
//   random     - window jumps to a random place each dwell
//   cogniscan  - bandit-style scheduler: Bayesian occupancy + exploration bonus +
//                pulse-timing prediction (stand-in for the planned PPO policy)
// All metrics are measured from the simulation, never hard-coded.

export const N_BINS = 120; // frequency bins across the band
export const WIN = 8; // receiver instantaneous window (bins)
export const DWELL = 4; // steps per scheduling decision (1 step = 1 ms)
export const STRATEGIES = ['fixed', 'random', 'cogniscan'];

export const DEFAULTS = { emitters: 8, hop_fraction: 0.4, pulse_min: 5, pulse_max: 9, duration: 3000, noise: 0.3, seed: 7 };

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
class Rng {
  constructor(seed) { this.f = mulberry32(seed); }
  random() { return this.f(); }
  randrange(n) { return Math.floor(this.f() * n); }
  randint(a, b) { return a + this.randrange(b - a + 1); }
}

const mean = (v) => v.reduce((a, b) => a + b, 0) / v.length;
const stdev = (v) => { const m = mean(v); return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1)); };

export function buildScenario(p) {
  const rng = new Rng(p.seed);
  const emitters = [];
  for (let i = 0; i < p.emitters; i++) {
    const hop = rng.random() < p.hop_fraction;
    const period = 60 + rng.randrange(100);
    const len = rng.randint(p.pulse_min, Math.max(p.pulse_min, p.pulse_max));
    const k = hop ? 3 : 1, bins = [];
    while (bins.length < k) {
      const b = 4 + rng.randrange(N_BINS - 8);
      if (!bins.includes(b)) bins.push(b);
    }
    emitters.push({ id: i, period, len, phase: rng.randrange(period), bins, hop });
  }
  const raw = [];
  for (const e of emitters) {
    let idx = Math.floor(e.phase / e.period) - 1;
    for (;;) {
      const ts = idx * e.period - e.phase;
      if (ts >= p.duration) break;
      const te = ts + e.len;
      if (te > 0) raw.push({ e: e.id, ts, te, bin: e.bins[((idx % e.bins.length) + e.bins.length) % e.bins.length] });
      idx++;
    }
  }
  raw.sort((a, b) => a.ts - b.ts || a.e - b.e);
  const activeAt = Array.from({ length: p.duration }, () => []);
  raw.forEach((q, pid) => {
    q.id = pid;
    for (let t = Math.max(q.ts, 0); t < Math.min(q.te, p.duration); t++) activeAt[t].push(pid);
  });
  return { params: p, emitters, pulses: raw, activeAt };
}

class Brain {
  constructor() {
    this.det = new Array(N_BINS).fill(0);
    this.vis = new Array(N_BINS).fill(0);
    this.hits = Array.from({ length: N_BINS }, () => []);
  }
  belief(b) { return (this.det[b] + 0.3) / (this.vis[b] + 2); }
  choose(t, rng) {
    const pref = [0];
    for (let b = 0; b < N_BINS; b++) {
      let sc = this.belief(b) + 0.6 / Math.sqrt(this.vis[b] + 1);
      const h = this.hits[b];
      if (h.length >= 2) {
        const p = h[1] - h[0];
        if (p >= 10) {
          let nx = h[1] + p;
          if (nx < t - 6) nx += (Math.floor((t - 6 - nx) / p) + 1) * p;
          const d = nx - t;
          if (d >= -4 && d <= DWELL + 1) sc += 3;
        }
      }
      pref.push(pref[b] + sc);
    }
    let best = 0, bs = -1e9;
    for (let s = 0; s <= N_BINS - WIN; s += 2) {
      const v = pref[s + WIN] - pref[s] + rng.random() * 0.05;
      if (v > bs) { bs = v; best = s; }
    }
    return best;
  }
}

export function runStrategy(sc, strategy, trace = false) {
  const p = sc.params, T = p.duration;
  const rng = new Rng(p.seed * 7919 + STRATEGIES.indexOf(strategy));
  const brain = strategy === 'cogniscan' ? new Brain() : null;
  const pd = 1 - 0.5 * p.noise; // chance to catch an in-window pulse per step
  const pfa = 0.003 * p.noise * WIN; // false-alarm chance per step
  const hits = new Map(), firstHit = new Map(), fa = [], windows = [], latMs = [], beliefs = [], hitTimes = [];
  let start = 0, left = 0, saw = new Set(), productive = false, prodDwells = 0, dwells = 0;
  for (let t = 0; t < T; t++) {
    if (left === 0) {
      if (dwells) {
        prodDwells += productive ? 1 : 0;
        if (brain) for (let b = start; b < start + WIN; b++) { brain.vis[b]++; if (saw.has(b)) brain.det[b]++; }
      }
      const t0 = performance.now();
      if (strategy === 'fixed') start = dwells ? (start + WIN) % N_BINS : 0;
      else if (strategy === 'random') start = rng.randrange(N_BINS - WIN + 1);
      else start = brain.choose(t, rng);
      latMs.push(performance.now() - t0);
      windows.push(start);
      if (trace && brain && dwells % 2 === 0) beliefs.push(Array.from({ length: N_BINS }, (_, b) => Math.min(99, Math.floor(brain.belief(b) * 160))));
      dwells++; left = DWELL; saw = new Set(); productive = false;
    }
    for (const pid of sc.activeAt[t]) {
      const q = sc.pulses[pid];
      if (!hits.has(pid) && q.bin >= start && q.bin < start + WIN && rng.random() < pd) {
        hits.set(pid, t); hitTimes.push(t); productive = true; saw.add(q.bin);
        if (!firstHit.has(q.e)) firstHit.set(q.e, t);
        if (brain) { const h = brain.hits[q.bin]; h.push(t); if (h.length > 2) h.shift(); }
      }
    }
    if (rng.random() < pfa) { const b = start + rng.randrange(WIN); fa.push([t, b]); saw.add(b); }
    left--;
  }
  prodDwells += productive ? 1 : 0;

  const total = sc.pulses.length;
  const firstTs = new Map();
  for (const q of sc.pulses) if (!firstTs.has(q.e)) firstTs.set(q.e, Math.max(q.ts, 0));
  const ttdFound = [], ttdAll = [];
  for (const e of sc.emitters) {
    const t0 = firstTs.get(e.id) ?? 0;
    if (firstHit.has(e.id)) { const d = Math.max(0, firstHit.get(e.id) - t0); ttdFound.push(d); ttdAll.push(d); }
    else ttdAll.push(T - t0);
  }
  const detections = hits.size + fa.length;
  const lat = [...latMs].sort((a, b) => a - b);
  const metrics = {
    poi: total ? hits.size / total : 0,
    pulses_caught: hits.size,
    pulses_total: total,
    emitters_found: firstHit.size,
    emitters_total: sc.emitters.length,
    found_ratio: sc.emitters.length ? firstHit.size / sc.emitters.length : 0,
    ttd_found_ms: ttdFound.length ? mean(ttdFound) : null,
    ttd_all_ms: ttdAll.length ? mean(ttdAll) : null,
    false_alarms: fa.length,
    fa_per_1000: (1000 * fa.length) / T,
    fa_ratio: detections ? fa.length / detections : 0,
    efficiency: dwells ? prodDwells / dwells : 0,
    latency_mean_ms: mean(latMs),
    latency_p95_ms: lat[Math.min(lat.length - 1, Math.floor(0.95 * lat.length))],
  };
  const starts = sc.pulses.map((q) => q.ts);
  hitTimes.sort((a, b) => a - b);
  const timeline = [];
  let si = 0, hi = 0;
  for (let t = 0; t <= T; t += 25) {
    while (si < starts.length && starts[si] <= t) si++;
    while (hi < hitTimes.length && hitTimes[hi] <= t) hi++;
    timeline.push(si ? Math.round((hi / si) * 1e4) / 1e4 : 0);
  }
  const out = { metrics, timeline };
  if (trace) out.trace = { windows, hits: Object.fromEntries([...hits].map(([k, v]) => [String(k), v])), false_alarms: fa, beliefs };
  return out;
}

export function simulate(p, strategies = STRATEGIES, trace = true) {
  const sc = buildScenario(p);
  const results = {};
  for (const s of strategies) results[s] = runStrategy(sc, s, trace);
  const out = { params: p, results };
  if (trace) out.scene = { dwell: DWELL, win: WIN, bins: N_BINS, duration: p.duration, emitters: sc.emitters, pulses: sc.pulses.map((q) => [q.ts, q.te, q.bin, q.e]) };
  return out;
}

function meanStd(v) {
  v = v.filter((x) => x != null);
  if (!v.length) return { mean: null, std: null, ci95: null, n: 0 };
  const m = mean(v), sd = v.length > 1 ? stdev(v) : 0;
  return { mean: m, std: sd, ci95: (1.96 * sd) / Math.sqrt(v.length), n: v.length };
}

export function benchmark(p, seeds, strategies = STRATEGIES) {
  const keys = ['poi', 'found_ratio', 'ttd_found_ms', 'ttd_all_ms', 'fa_per_1000', 'fa_ratio', 'efficiency', 'latency_mean_ms', 'latency_p95_ms'];
  const per = Object.fromEntries(strategies.map((s) => [s, Object.fromEntries(keys.map((k) => [k, []]))]));
  for (let i = 0; i < seeds; i++) {
    const sc = buildScenario({ ...p, seed: p.seed + i });
    for (const s of strategies) {
      const m = runStrategy(sc, s).metrics;
      for (const k of keys) per[s][k].push(m[k]);
    }
  }
  const summary = Object.fromEntries(strategies.map((s) => [s, Object.fromEntries(keys.map((k) => [k, meanStd(per[s][k])]))]));
  const wins = {};
  if (strategies.includes('fixed') && strategies.includes('cogniscan')) {
    const cnt = (a, b, f) => a.filter((x, i) => f(x, b[i])).length / seeds;
    wins.poi_vs_fixed = cnt(per.cogniscan.poi, per.fixed.poi, (x, y) => x > y);
    wins.ttd_vs_fixed = cnt(per.cogniscan.ttd_all_ms, per.fixed.ttd_all_ms, (x, y) => x < y);
    const fm = summary.fixed.poi.mean;
    wins.poi_gain_x = fm ? summary.cogniscan.poi.mean / fm : null;
  }
  return { params: p, seeds, summary, wins, samples: Object.fromEntries(strategies.map((s) => [s, { poi: per[s].poi }])) };
}
