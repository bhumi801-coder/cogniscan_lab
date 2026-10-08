import React, { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import Benchmark from './components/Benchmark.jsx';
import Guide from './components/Guide.jsx';
import History from './components/History.jsx';
import Simulator from './components/Simulator.jsx';

const TABS = [['sim', 'Simulator'], ['bench', 'Benchmark'], ['hist', 'History'], ['guide', 'Guide']];

export default function App() {
  const [view, setView] = useState(() => (TABS.some(([id]) => id === location.hash.slice(1)) ? location.hash.slice(1) : 'sim'));
  const [status, setStatus] = useState({ cls: '', text: 'Connecting…' });
  const [presets, setPresets] = useState([]);
  const [metrics, setMetrics] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [replay, setReplay] = useState(null);
  const [injected, setInjected] = useState(null);

  const toast = useCallback((msg, err = false) => {
    const id = Math.random();
    setToasts((t) => [...t, { id, msg, err }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const go = useCallback((v) => { setView(v); history.replaceState(null, '', '#' + v); }, []);

  useEffect(() => {
    (async () => {
      try {
        const t0 = performance.now(); await api('/health');
        setStatus({ cls: 'ok', text: `API online · ${Math.round(performance.now() - t0)} ms` });
        const [p, m] = await Promise.all([api('/presets'), api('/metrics')]);
        setMetrics(m); setPresets(p);
      } catch {
        setStatus({ cls: 'bad', text: 'API offline – start the backend' });
        toast('Backend not reachable. Run: npm run dev', true);
      }
    })();
  }, [toast]);

  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <header className="top">
        <a className="brand" href="#sim" onClick={() => go('sim')} aria-label="CogniScan Lab home"><span className="logo" aria-hidden="true" />CogniScan <em>Lab</em></a>
        <nav aria-label="Main">
          {TABS.map(([id, label]) => <button key={id} className={view === id ? 'on' : ''} onClick={() => go(id)}>{label}</button>)}
        </nav>
        <div className={'status ' + status.cls} role="status"><i /><span>{status.text}</span></div>
      </header>
      <main id="main">
        <Simulator presets={presets} metrics={metrics} active={view === 'sim'} replay={replay} toast={toast} />
        <Benchmark presets={presets} metrics={metrics} active={view === 'bench'} injected={injected} toast={toast} />
        <History active={view === 'hist'} toast={toast}
          onReplay={(r) => { setReplay({ params: r.params, n: Math.random() }); go('sim'); }}
          onOpenBench={(r) => { setInjected({ data: { summary: r.summary.summary, wins: r.summary.wins, seeds: r.params.seeds, params: r.params }, label: r.name.replace('Benchmark – ', '') }); go('bench'); }} />
        <Guide active={view === 'guide'} metrics={metrics} />
      </main>
      <div id="toasts" aria-live="polite">{toasts.map((t) => <div key={t.id} className={'toast' + (t.err ? ' err' : '')}>{t.msg}</div>)}</div>
    </>
  );
}
