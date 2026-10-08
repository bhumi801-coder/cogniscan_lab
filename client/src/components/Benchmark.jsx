import React, { useEffect, useState } from 'react';
import { post } from '../api.js';
import { LANE_NAMES } from '../scene.js';
import { COL, F, ORDER } from '../format.js';
import { BarChart } from './Charts.jsx';
import Tip from './Tip.jsx';

const KEYS = ['poi', 'found_ratio', 'ttd_all_ms', 'fa_per_1000', 'efficiency', 'latency_mean_ms'];
const PCT = ['poi', 'found_ratio', 'efficiency'];

export default function Benchmark({ presets, metrics, active, injected, toast }) {
  const [presetId, setPresetId] = useState('balanced');
  const [seeds, setSeeds] = useState(30);
  const [busy, setBusy] = useState(null);
  const [result, setResult] = useState(null);   // { data, label }
  const [all, setAll] = useState(null);         // [[preset, data], ...]

  useEffect(() => { if (injected) { setResult(injected); setAll(null); } }, [injected]);

  const runBench = (id) => {
    const pr = presets.find((x) => x.id === id);
    return post('/benchmark', { ...pr.params, seed: 100, seeds, save: true, name: `Benchmark – ${pr.name}` });
  };
  const runOne = async () => {
    setBusy('Running…');
    try {
      const d = await runBench(presetId);
      setResult({ data: d, label: presets.find((x) => x.id === presetId).name }); setAll(null);
      toast(`Benchmark done in ${(d.server_ms / 1000).toFixed(1)} s`);
    } catch (e) { toast('Benchmark failed: ' + e.message, true); }
    setBusy(null);
  };
  const runAll = async () => {
    const out = [];
    try {
      for (let i = 0; i < presets.length; i++) { setBusy(`Scenario ${i + 1}/${presets.length}…`); out.push([presets[i], await runBench(presets[i].id)]); }
      const sel = out.find(([pr]) => pr.id === presetId) || out[0];
      setResult({ data: sel[1], label: sel[0].name }); setAll(out);
      toast('All scenarios evaluated and saved to History');
    } catch (e) { toast('Evaluation failed: ' + e.message, true); }
    setBusy(null);
  };
  const mk = (key, scale = 1) => all.map(([pr, d]) => ({ label: pr.name, bars: ORDER.map((s) => ({ name: LANE_NAMES[s], color: COL[s], value: d.summary[s][key].mean * scale, err: d.summary[s][key].ci95 * scale })) }));

  return (
    <section id="view-bench" className={'view' + (active ? ' on' : '')}>
      <div className="panel bar">
        <label className="f inline">Scenario
          <select value={presetId} onChange={(e) => setPresetId(e.target.value)}>
            {presets.map((p) => <option key={p.id} value={p.id}>{p.name} – {p.desc}</option>)}
          </select>
        </label>
        <label className="f inline">Runs <output>{seeds}</output><input type="range" min="5" max="60" step="5" value={seeds} onChange={(e) => setSeeds(+e.target.value)} /></label>
        <button className="primary" onClick={runOne} disabled={!!busy}>{busy && !busy.startsWith('Scenario') ? busy : 'Run benchmark'}</button>
        <button className="ghost" onClick={runAll} disabled={!!busy}>{busy?.startsWith('Scenario') ? busy : 'Evaluate all scenarios'}</button>
      </div>

      {!result && (
        <div className="panel empty">
          <h2>How good is it, really?</h2>
          <p>A benchmark repeats the experiment on many different random radar worlds and reports the average with its error margin. Pick a scenario and run it.</p>
        </div>
      )}
      {result && <Results r={result} metrics={metrics} />}
      {all && (
        <div className="grid2">
          <div className="panel"><h3>Intercept rate by scenario</h3><div className="chart"><BarChart groups={mk('poi', 100)} fmt={(v) => v.toFixed(0) + '%'} yMax={100} /></div></div>
          <div className="panel"><h3>Time to detect by scenario (lower is better)</h3><div className="chart"><BarChart groups={mk('ttd_all_ms')} fmt={(v) => Math.round(v)} /></div></div>
        </div>
      )}
    </section>
  );
}

function Results({ r, metrics }) {
  const d = r.data, S = d.summary, W = d.wins, n = d.seeds ?? d.params.seeds;
  const mean = (s, k) => S[s][k].mean;
  const c = 'cogniscan', f = 'fixed';
  const dt = (mean(c, 'ttd_all_ms') - mean(f, 'ttd_all_ms')) / mean(f, 'ttd_all_ms');
  const bestT = ORDER.reduce((a, s) => (mean(s, 'ttd_all_ms') < mean(a, 'ttd_all_ms') ? s : a));
  const fa = mean(c, 'fa_per_1000') - mean(f, 'fa_per_1000');
  const stats = [
    [`×${W.poi_gain_x?.toFixed(1) ?? '–'}`, 'more pulses caught than fixed sweep', 'hl'],
    [`${Math.round((W.poi_vs_fixed ?? 0) * 100)}%`, `of ${n} radar worlds: CogniScan intercepts more`, 'hl'],
    [`${Math.round((W.ttd_vs_fixed ?? 0) * 100)}%`, `of ${n} radar worlds: CogniScan detects sooner`, ''],
    [F.latency_mean_ms(mean(c, 'latency_mean_ms')), 'scheduler decision time (measured)', ''],
  ];
  const ci = (k, m) => (k === 'latency_mean_ms' ? null : k === 'ttd_all_ms' ? Math.round(m.ci95) : PCT.includes(k) ? (m.ci95 * 100).toFixed(1) : m.ci95.toFixed(1));
  return (
    <div>
      <div className="stats">{stats.map(([a, b, cl]) => <div key={b} className={'stat ' + cl}><b>{a}</b><span>{b}</span></div>)}</div>
      <div className="grid2">
        <div className="panel">
          <h3>Results table <span className="small muted">{r.label} · mean ± 95% CI over {n} runs</span></h3>
          <div className="scroll">
            <table className="t">
              <thead><tr><th>Metric</th>{ORDER.map((s) => <th key={s} style={{ color: COL[s] }}>{LANE_NAMES[s]}</th>)}</tr></thead>
              <tbody>
                {KEYS.map((k) => {
                  const low = metrics.find((x) => x.key === k)?.better === 'low';
                  const vals = ORDER.map((s) => mean(s, k)); const b = low ? Math.min(...vals) : Math.max(...vals);
                  return (
                    <tr key={k}>
                      <td>{metrics.find((x) => x.key === k)?.label}<Tip metrics={metrics} k={k} /></td>
                      {ORDER.map((s) => { const m = S[s][k]; const e = ci(k, m); return <td key={s} className={m.mean === b ? 'best' : ''}>{F[k](m.mean)}{e != null && <span className="muted"> ±{e}</span>}</td>; })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div className="panel">
          <h3>Intercept rate (higher is better)</h3>
          <div className="chart"><BarChart yMax={100} fmt={(v) => v.toFixed(0) + '%'} groups={[{ label: r.label, bars: ORDER.map((s) => ({ name: LANE_NAMES[s], color: COL[s], value: S[s].poi.mean * 100, err: S[s].poi.ci95 * 100 })) }]} /></div>
        </div>
      </div>
      <div className="panel" style={{ marginTop: 16 }}>
        <h3>Reading the results</h3>
        <ul className="notes">
          <li>CogniScan caught <b>{F.poi(mean(c, 'poi'))}</b> of all pulses versus <b>{F.poi(mean(f, 'poi'))}</b> for the fixed sweep (×{W.poi_gain_x?.toFixed(1)}), and won in {Math.round(W.poi_vs_fixed * 100)}% of {n} random radar worlds.</li>
          <li>Radars spotted at least once: {F.found_ratio(mean(c, 'found_ratio'))} (CogniScan) vs {F.found_ratio(mean(f, 'found_ratio'))} (fixed).</li>
          <li>{Math.abs(dt) < 0.05
            ? <>Time to detect is about the same as a fixed sweep ({F.ttd_all_ms(mean(c, 'ttd_all_ms'))} vs {F.ttd_all_ms(mean(f, 'ttd_all_ms'))}) – the gain is in catching <i>more pulses</i>, not in finding the first one sooner.</>
            : <>Time to detect is {Math.abs(Math.round(dt * 100))}% {dt < 0 ? 'faster' : 'slower'} than a fixed sweep ({F.ttd_all_ms(mean(c, 'ttd_all_ms'))} vs {F.ttd_all_ms(mean(f, 'ttd_all_ms'))}).</>}</li>
          {bestT !== c && <li>Be aware: {LANE_NAMES[bestT]} finds radars for the first time slightly sooner ({F.ttd_all_ms(mean(bestT, 'ttd_all_ms'))}). CogniScan's strength is catching many more pulses of the radars it finds.</li>}
          <li>False alarms: {mean(c, 'fa_per_1000').toFixed(1)} vs {mean(f, 'fa_per_1000').toFixed(1)} per 1000 ms – {Math.abs(fa) < 1 ? 'about the same' : fa < 0 ? 'lower with CogniScan' : 'higher with CogniScan'}.</li>
          <li>Scan efficiency: {F.efficiency(mean(c, 'efficiency'))} of CogniScan's scan moments caught something, versus {F.efficiency(mean(f, 'efficiency'))} for the fixed sweep.</li>
          <li>Each scheduling decision takes about {F.latency_mean_ms(mean(c, 'latency_mean_ms'))} on average in this JavaScript demo, so real-time use looks realistic (to be confirmed on embedded hardware).</li>
        </ul>
      </div>
    </div>
  );
}
