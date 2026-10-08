import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import * as db from '../server/db.js';
import * as sim from '../server/sim.js';
import { createApp } from '../server/index.js';

db.init(path.join(os.tmpdir(), `cogniscan-test-${process.pid}.json`));

test('simulation is deterministic for a seed', () => {
  const p = { ...sim.DEFAULTS, seed: 3 };
  const a = sim.simulate(p, sim.STRATEGIES, false), b = sim.simulate(p, sim.STRATEGIES, false);
  for (const s of sim.STRATEGIES) assert.equal(a.results[s].metrics.poi, b.results[s].metrics.poi);
});

test('CogniScan beats fixed sweep on POI', () => {
  const b = sim.benchmark(sim.DEFAULTS, 15);
  assert.ok(b.summary.cogniscan.poi.mean > 1.5 * b.summary.fixed.poi.mean);
});

test('API flow: simulate, history, csv, delete, validation', async () => {
  const server = createApp().listen(0);
  const base = `http://localhost:${server.address().port}/api`;
  const j = (p, o) => fetch(base + p, { headers: { 'Content-Type': 'application/json' }, ...o });
  try {
    assert.equal((await (await j('/health')).json()).status, 'ok');
    let r = await j('/simulate', { method: 'POST', body: JSON.stringify({ emitters: 6, duration: 800, name: 't' }) });
    const s = await r.json(); assert.equal(r.status, 200); assert.ok(s.scene && s.run_id);
    assert.equal((await j(`/runs/${s.run_id}`)).status, 200);
    assert.match(await (await j(`/runs/${s.run_id}/csv`)).text(), /strategy/);
    r = await j('/benchmark', { method: 'POST', body: JSON.stringify({ seeds: 3, duration: 600 }) });
    assert.ok((await r.json()).wins.poi_vs_fixed >= 0);
    assert.equal((await j(`/runs/${s.run_id}`, { method: 'DELETE' })).status, 200);
    assert.equal((await j(`/runs/${s.run_id}`)).status, 404);
    assert.equal((await j('/simulate', { method: 'POST', body: JSON.stringify({ emitters: 99 }) })).status, 422);
  } finally { server.close(); }
});
