import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { F } from '../format.js';

export default function History({ active, onReplay, onOpenBench, toast }) {
  const [runs, setRuns] = useState(null);
  const [err, setErr] = useState(null);
  const load = useCallback(async () => {
    try { setRuns(await api('/runs')); setErr(null); } catch (e) { setErr(e.message); }
  }, []);
  useEffect(() => { if (active) load(); }, [active, load]);
  const del = async (id) => { await api('/runs/' + id, { method: 'DELETE' }); toast('Run deleted'); load(); };

  return (
    <section id="view-hist" className={'view' + (active ? ' on' : '')}>
      <div className="panel">
        <div className="kpi-head"><h2>Saved runs</h2><button className="ghost" onClick={load}>Refresh</button></div>
        <div className="scroll">
          {err && <p className="muted">Could not load history: {err}</p>}
          {runs && !runs.length && <p className="muted">No saved runs yet. Run a simulation or benchmark and it will appear here.</p>}
          {runs && runs.length > 0 && (
            <table className="t hist">
              <thead><tr><th>#</th><th>When</th><th>Type</th><th>Name</th><th>Setup</th><th>Result</th><th /></tr></thead>
              <tbody>
                {runs.map((r) => {
                  const p = r.params, bench = r.kind === 'benchmark';
                  return (
                    <tr key={r.id}>
                      <td>{r.id}</td><td>{new Date(r.created).toLocaleString()}</td>
                      <td><span className={'tag ' + (bench ? 'b' : '')}>{r.kind}</span></td>
                      <td style={{ color: '#fff' }}>{r.name}</td>
                      <td>{p.emitters} emitters · {Math.round(p.hop_fraction * 100)}% hop · noise {Math.round(p.noise * 100)}%{bench ? ` · ${p.seeds} runs` : ` · seed ${p.seed}`}</td>
                      <td>{bench ? `×${r.summary.wins.poi_gain_x?.toFixed(1)} POI vs fixed` : `POI ${F.poi(r.summary.cogniscan.poi)} vs ${F.poi(r.summary.fixed.poi)}`}</td>
                      <td><div className="h-actions">
                        <button onClick={() => (bench ? onOpenBench(r) : onReplay(r))}>{bench ? 'Open' : 'Replay'}</button>
                        <a href={`/api/runs/${r.id}/csv`} download>CSV</a>
                        <button className="del" onClick={() => del(r.id)} aria-label={`Delete run ${r.id}`}>Delete</button>
                      </div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  );
}
