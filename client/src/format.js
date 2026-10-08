import { LANE_COLORS } from './scene.js';

export const ORDER = ['fixed', 'random', 'cogniscan'];
export const COL = Object.fromEntries(ORDER.map((k) => [k, '#' + LANE_COLORS[k].toString(16).padStart(6, '0')]));
export const F = {
  poi: (v) => (v * 100).toFixed(1) + '%',
  found_ratio: (v) => (v * 100).toFixed(0) + '%',
  efficiency: (v) => (v * 100).toFixed(1) + '%',
  ttd_all_ms: (v) => Math.round(v) + ' ms',
  ttd_found_ms: (v) => (v == null ? '–' : Math.round(v) + ' ms'),
  fa_per_1000: (v) => v.toFixed(1),
  fa_ratio: (v) => (v * 100).toFixed(0) + '%',
  latency_mean_ms: (v) => v.toFixed(3) + ' ms',
  latency_p95_ms: (v) => v.toFixed(3) + ' ms',
};
export const metricInfo = (metrics, k) => metrics.find((m) => m.key === k);
