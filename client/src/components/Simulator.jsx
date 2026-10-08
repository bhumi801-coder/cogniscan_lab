import React, { useCallback, useEffect, useRef, useState } from 'react';
import { post } from '../api.js';
import { LANE_NAMES } from '../scene.js';
import { COL, F, ORDER } from '../format.js';
import { LineChart } from './Charts.jsx';
import Stage3D from './Stage3D.jsx';
import Tip from './Tip.jsx';

const toBody = (p) => ({ emitters: p.emitters, hop_fraction: p.hop / 100, pulse_min: p.pulse, pulse_max: p.pulse + 4, noise: p.noise / 100, duration: p.dur, seed: p.seed });
export const fromParams = (pp, seed = pp.seed) => ({ emitters: pp.emitters, hop: Math.round(pp.hop_fraction * 100), pulse: pp.pulse_min, noise: Math.round(pp.noise * 100), dur: pp.duration, seed });
const FOCUS = [['all', 'All'], ['fixed', 'Fixed'], ['random', 'Random'], ['cogniscan', 'CogniScan']];

export default function Simulator({ presets, metrics, active, replay, toast }) {
  const [p, setP] = useState({ emitters: 8, hop: 40, pulse: 5, noise: 30, dur: 3000, seed: 7 });
  const [preset, setPreset] = useState(null);
  const [save, setSave] = useState(true);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [focus, setFocusState] = useState('all');
  const [srv, setSrv] = useState('');
  const stage = useRef(null), dataRef = useRef(null), pRef = useRef(p), saveRef = useRef(save), presetRef = useRef(preset), started = useRef(false);
  pRef.current = p; saveRef.current = save; presetRef.current = preset;

  const onReady = useCallback((s) => {
    stage.current = s;
    s.onTime = (time) => {
      setT(time);
      const d = dataRef.current;
      if (d) {
        const live = {};
        for (const k of ORDER) { const tl = d.results[k].timeline; live[k] = tl[Math.min(tl.length - 1, Math.floor(time / 25))]; }
        s.setLivePoi(live);
      }
    };
    s.onEnd = () => setPlaying(false);
  }, []);

  const run = useCallback(async ({ params = pRef.current, auto = false, presetName } = {}) => {
    setLoading(true);
    try {
      const label = presetName ?? presets.find((x) => x.id === presetRef.current)?.name ?? 'Custom';
      const t0 = performance.now();
      const d = await post('/simulate', { ...toBody(params), save: auto ? false : saveRef.current, name: `Simulation – ${label}` });
      dataRef.current = d; setData(d);
      setSrv(`server ${d.server_ms} ms · total ${Math.round(performance.now() - t0)} ms`);
      if (stage.current) { stage.current.load(d.scene, d.results, ORDER); stage.current.play(true); }
      setPlaying(true); setT(0);
      if (d.run_id) toast(`Saved to History (#${d.run_id})`);
    } catch (e) { toast('Simulation failed: ' + e.message, true); }
    finally { setLoading(false); }
  }, [presets, toast]);

  // first automatic run
  useEffect(() => {
    if (started.current || !presets.length) return;
    started.current = true;
    const params = fromParams(presets[0].params, 7);
    setP(params); setPreset(presets[0].id); presetRef.current = presets[0].id;
    run({ params, auto: true, presetName: presets[0].name });
  }, [presets, run]);

  // replay from History
  useEffect(() => {
    if (!replay) return;
    const params = fromParams(replay.params, replay.params.seed);
    setP(params); setPreset(null); presetRef.current = null;
    run({ params, auto: true, presetName: 'Replay' });
  }, [replay]); // eslint-disable-line react-hooks/exhaustive-deps

  const togglePlay = useCallback((v) => {
    const next = v ?? !stage.current?.playing;
    stage.current?.play(next); setPlaying(next);
  }, []);
  const setFocus = (f) => { stage.current?.setFocus(f); setFocusState(f); };

  useEffect(() => {
    if (!active) return undefined;
    const h = (e) => {
      if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName) && e.target.type !== 'range') return;
      if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
      else if (e.key === 'r' || e.key === 'R') run();
      else if (['1', '2', '3', '4'].includes(e.key)) setFocus(FOCUS[+e.key - 1][0]);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [active, run, togglePlay]);

  const set = (k) => (e) => { setP({ ...p, [k]: +e.target.value }); setPreset(null); };
  const pickPreset = (pr) => { const params = fromParams(pr.params, p.seed || 7); setP(params); setPreset(pr.id); presetRef.current = pr.id; run({ params, presetName: pr.name }); };
  const dice = () => { const params = { ...p, seed: 1 + Math.floor(Math.random() * 9999) }; setP(params); run({ params }); };
  const duration = data?.scene.duration ?? 1;

  return (
    <section id="view-sim" className={'view' + (active ? ' on' : '')}>
      <aside className="panel controls" aria-label="Scenario controls">
        <h2>Scenario</h2>
        <div className="chips" role="group" aria-label="Presets">
          {presets.map((pr) => <button key={pr.id} title={pr.desc} className={preset === pr.id ? 'on' : ''} onClick={() => pickPreset(pr)}>{pr.name}</button>)}
        </div>
        <label className="f">Emitters <output>{p.emitters}</output><input type="range" min="2" max="20" value={p.emitters} onChange={set('emitters')} /></label>
        <label className="f">Hopping radars <output>{p.hop}%</output><input type="range" min="0" max="100" step="5" value={p.hop} onChange={set('hop')} /></label>
        <label className="f">Pulse length <output>{p.pulse}–{p.pulse + 4} ms</output><input type="range" min="2" max="14" value={p.pulse} onChange={set('pulse')} /></label>
        <label className="f">Noise level <output>{p.noise}%</output><input type="range" min="0" max="100" step="5" value={p.noise} onChange={set('noise')} /></label>
        <label className="f">Duration <output>{(p.dur / 1000).toFixed(1)} s</output><input type="range" min="1000" max="6000" step="500" value={p.dur} onChange={set('dur')} /></label>
        <div className="seed">
          <label className="f grow">Seed <input type="number" min="0" max="1000000" value={p.seed} onChange={(e) => setP({ ...p, seed: +e.target.value })} /></label>
          <button className="ghost" onClick={dice} title="New random seed" aria-label="Random seed">⟳</button>
        </div>
        <label className="check"><input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} /> Save this run to History</label>
        <button className="primary" onClick={() => run()} disabled={loading}>Run simulation <kbd>R</kbd></button>
        <p className="hint">Same seed = same radar world, so every strategy faces the exact same signals.</p>
      </aside>

      <div className="stage panel">
        <Stage3D onReady={onReady}>
          <div className="overlay tl">
            <div className="seg" role="group" aria-label="Camera focus">
              {FOCUS.map(([id, label], i) => <button key={id} className={focus === id ? 'on' : ''} onClick={() => setFocus(id)}>{label} <kbd>{i + 1}</kbd></button>)}
            </div>
          </div>
          <div className="legend overlay tr" aria-label="Legend">
            <span><i style={{ background: '#34d399' }} />Intercepted</span>
            <span><i style={{ background: '#ffb020' }} />Missed</span>
            <span><i style={{ background: '#ff5c6c' }} />False alarm</span>
            <span><i style={{ background: '#22d3ee' }} />Belief</span>
          </div>
          <div className="overlay bottom playbar">
            <button className="round" onClick={() => togglePlay()} aria-label="Play or pause">{playing ? '❚❚' : '▶'}</button>
            <input type="range" min="0" max="1000" value={(t / duration) * 1000} aria-label="Timeline"
              onChange={(e) => { const v = (+e.target.value / 1000) * duration; stage.current?.seek(v); setT(v); }} />
            <span id="clock">{Math.round(t)} / {data?.scene.duration ?? 0} ms</span>
            <div className="seg small" role="group" aria-label="Speed">
              {[0.5, 1, 2, 4].map((s) => <button key={s} className={speed === s ? 'on' : ''} onClick={() => { setSpeed(s); if (stage.current) stage.current.speed = s; }}>{s}×</button>)}
            </div>
          </div>
        </Stage3D>
        {loading && <div className="loading"><div className="spin" /><p>Running simulation…</p></div>}
      </div>

      <aside className="panel kpis" aria-label="Measured results">
        <div className="kpi-head"><h2>Measured results</h2><span className="small muted">{srv}</span></div>
        {data && <Cards data={data} metrics={metrics} />}
        <h3>Intercept rate over time</h3>
        <div className="chart">
          {data && <LineChart step={25} cursor={t} series={ORDER.map((s) => ({ name: s, color: COL[s], values: data.results[s].timeline }))} />}
        </div>
      </aside>
    </section>
  );
}

function Cards({ data, metrics }) {
  const M = Object.fromEntries(ORDER.map((s) => [s, data.results[s].metrics]));
  const rows = [
    ['found_ratio', 'Emitters found', (m) => `${m.emitters_found}/${m.emitters_total}`],
    ['ttd_all_ms', 'Time to detect', (m) => F.ttd_all_ms(m.ttd_all_ms)],
    ['fa_per_1000', 'False alarms', (m) => `${m.false_alarms} (${m.fa_per_1000.toFixed(1)}/s)`],
    ['efficiency', 'Scan efficiency', (m) => F.efficiency(m.efficiency)],
    ['latency_mean_ms', 'Decision latency', (m) => F.latency_mean_ms(m.latency_mean_ms)],
  ];
  const best = {};
  for (const k of ['poi', ...rows.map((r) => r[0])]) {
    const vals = ORDER.map((s) => M[s][k]);
    const low = metrics.find((x) => x.key === k)?.better === 'low';
    const b = low ? Math.min(...vals) : Math.max(...vals);
    best[k] = ORDER.filter((s) => M[s][k] === b);
  }
  return (
    <div id="cards">
      {[...ORDER].reverse().map((s) => {
        const m = M[s], gain = M.fixed.poi ? m.poi / M.fixed.poi : null;
        return (
          <div className="card" key={s} style={{ '--c': COL[s] }}>
            <div className="t"><b>{LANE_NAMES[s]}</b>{s === 'fixed' ? <span className="badge neutral">baseline</span> : <span className="badge">{gain ? '×' + gain.toFixed(1) : '–'} vs fixed</span>}</div>
            <div className={'big ' + (best.poi.includes(s) ? 'best' : '')}>{(m.poi * 100).toFixed(1)}%<small>{m.pulses_caught} of {m.pulses_total} pulses</small></div>
            <table><tbody>
              {rows.map(([k, label, f]) => <tr key={k}><td>{label}<Tip metrics={metrics} k={k} /></td><td className={best[k].includes(s) ? 'best' : ''}>{f(m)}</td></tr>)}
            </tbody></table>
          </div>
        );
      })}
    </div>
  );
}
