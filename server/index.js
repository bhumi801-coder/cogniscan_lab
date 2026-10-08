// CogniScan API + static frontend server.   Run:  npm start   (after npm run build)
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as db from './db.js';
import * as sim from './sim.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, '..', 'dist');

export const PRESETS = [
  { id: 'balanced', name: 'Balanced', desc: 'Mixed radar environment', params: { emitters: 8, hop_fraction: 0.4, pulse_min: 5, pulse_max: 9, noise: 0.3, duration: 3000 } },
  { id: 'dense', name: 'Dense', desc: 'Crowded spectrum, many emitters', params: { emitters: 14, hop_fraction: 0.4, pulse_min: 5, pulse_max: 9, noise: 0.3, duration: 3000 } },
  { id: 'agile', name: 'Agile / LPI', desc: 'Hopping, very short pulses', params: { emitters: 8, hop_fraction: 0.9, pulse_min: 3, pulse_max: 6, noise: 0.3, duration: 3000 } },
  { id: 'noisy', name: 'Noisy', desc: 'High noise, more false alarms', params: { emitters: 8, hop_fraction: 0.4, pulse_min: 5, pulse_max: 9, noise: 0.8, duration: 3000 } },
];
export const METRICS = [
  { key: 'poi', label: 'Probability of Intercept', unit: '%', better: 'high', help: 'Out of all radar pulses that were sent, how many did the receiver catch?' },
  { key: 'found_ratio', label: 'Emitters found', unit: '%', better: 'high', help: 'How many different radars were spotted at least once.' },
  { key: 'ttd_all_ms', label: 'Time to detect', unit: 'ms', better: 'low', help: 'Average wait before each radar is first caught. A radar never caught counts as the full run time.' },
  { key: 'fa_per_1000', label: 'False alarms', unit: '/1000 ms', better: 'low', help: 'Noise mistaken for a signal, per 1000 ms of scanning.' },
  { key: 'efficiency', label: 'Scan efficiency', unit: '%', better: 'high', help: 'Share of scanning moments (dwells) that actually caught something.' },
  { key: 'latency_mean_ms', label: 'Decision latency', unit: 'ms', better: 'low', help: 'Real computing time the scheduler needs to pick the next band (measured on this server).' },
];

const RULES = {
  emitters: [2, 20, true], hop_fraction: [0, 1, false], pulse_min: [2, 20, true], pulse_max: [2, 30, true],
  duration: [500, 8000, true], noise: [0, 1, false], seed: [0, 1_000_000, true], seeds: [3, 60, true],
};
function parse(body, extra = {}) {
  const out = {}, errs = [];
  for (const [k, [lo, hi, int]] of Object.entries(RULES)) {
    if (k === 'seeds' && !('seeds' in extra)) continue;
    let v = body[k] ?? (k === 'seeds' ? extra.seeds : sim.DEFAULTS[k]);
    if (typeof v !== 'number' || !Number.isFinite(v) || (int && !Number.isInteger(v)) || v < lo || v > hi) errs.push(`${k}: must be ${int ? 'an integer' : 'a number'} between ${lo} and ${hi}`);
    else out[k] = v;
  }
  if (errs.length) return { errs };
  out.pulse_max = Math.max(out.pulse_max, out.pulse_min);
  const name = typeof body.name === 'string' ? body.name.slice(0, 80) : extra.name;
  return { params: out, save: body.save !== false, name };
}

export function createApp() {
  db.init();
  const app = express();
  app.use(express.json({ limit: '100kb' }));
  const bad = (res, errs) => res.status(422).json({ detail: errs.join('; ') });

  app.get('/api/health', (_, res) => res.json({ status: 'ok', version: '1.0', time: Date.now() / 1000 }));
  app.get('/api/presets', (_, res) => res.json(PRESETS));
  app.get('/api/metrics', (_, res) => res.json(METRICS));

  app.post('/api/simulate', (req, res) => {
    const r = parse(req.body || {}, { name: 'Simulation' });
    if (r.errs) return bad(res, r.errs);
    const t0 = performance.now();
    const { seeds, ...p } = r.params;
    const out = sim.simulate(p);
    out.server_ms = Math.round((performance.now() - t0) * 10) / 10;
    if (r.save) out.run_id = db.save('simulation', r.name, out.params, Object.fromEntries(Object.entries(out.results).map(([s, v]) => [s, v.metrics])));
    res.json(out);
  });

  app.post('/api/benchmark', (req, res) => {
    const r = parse(req.body || {}, { name: 'Benchmark', seeds: 20 });
    if (r.errs) return bad(res, r.errs);
    const t0 = performance.now();
    const { seeds, ...p } = r.params;
    const out = sim.benchmark(p, seeds);
    out.server_ms = Math.round((performance.now() - t0) * 10) / 10;
    if (r.save) out.run_id = db.save('benchmark', r.name, { ...out.params, seeds }, { summary: out.summary, wins: out.wins });
    res.json(out);
  });

  app.get('/api/runs', (_, res) => res.json(db.list()));
  app.get('/api/runs/:id', (req, res) => { const r = db.get(+req.params.id); r ? res.json(r) : res.status(404).json({ detail: 'Run not found' }); });
  app.delete('/api/runs/:id', (req, res) => { db.remove(+req.params.id) ? res.json({ deleted: +req.params.id }) : res.status(404).json({ detail: 'Run not found' }); });
  app.get('/api/runs/:id/csv', (req, res) => {
    const r = db.get(+req.params.id);
    if (!r) return res.status(404).json({ detail: 'Run not found' });
    const rows = [];
    if (r.kind === 'benchmark') {
      rows.push('strategy,metric,mean,std,ci95,n');
      for (const [s, ms] of Object.entries(r.summary.summary)) for (const [k, v] of Object.entries(ms)) rows.push([s, k, v.mean, v.std, v.ci95, v.n].join(','));
    } else {
      rows.push('strategy,metric,value');
      for (const [s, ms] of Object.entries(r.summary)) for (const [k, v] of Object.entries(ms)) rows.push([s, k, v].join(','));
    }
    res.set({ 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename=cogniscan_run_${r.id}.csv` }).send(rows.join('\n') + '\n');
  });
  app.use('/api', (_, res) => res.status(404).json({ detail: 'Not found' }));

  if (fs.existsSync(DIST)) {
    app.use(express.static(DIST));
    app.use((req, res, next) => (req.method === 'GET' ? res.sendFile(path.join(DIST, 'index.html')) : next()));
  }
  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = process.env.PORT || 3001;
  createApp().listen(port, () => console.log(`CogniScan API on http://localhost:${port}` + (fs.existsSync(DIST) ? ' (serving built frontend)' : '')));
}
