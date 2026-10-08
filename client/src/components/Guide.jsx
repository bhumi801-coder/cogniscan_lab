import React from 'react';

export default function Guide({ active, metrics }) {
  return (
    <section id="view-guide" className={'view' + (active ? ' on' : '')}>
      <div className="grid2">
        <div className="panel prose">
          <h2>What is CogniScan?</h2>
          <p>A receiver can only listen to a small slice of the radio band at a time, while radar pulses are short and may hop between frequencies. A <b>fixed sweep</b> just walks across the band in order and often arrives too late. <b>CogniScan</b> remembers where signals appeared, predicts when a radar will pulse again, and still explores unseen bands.</p>
          <h3>What you see in 3D</h3>
          <ul>
            <li>Each lane is one strategy facing the <b>same</b> radars. Frequency runs left to right; time flows away from you.</li>
            <li>The glowing box is the receiver window. Green bars were caught, amber bars were missed, red dots are false alarms.</li>
            <li>The cyan towers (CogniScan lane) are its belief map: where it thinks signals are likely.</li>
          </ul>
          <h3>Controls</h3>
          <p className="muted">Drag to orbit · scroll to zoom · <kbd>Space</kbd> play/pause · <kbd>1</kbd>–<kbd>4</kbd> camera focus · <kbd>R</kbd> run again</p>
          <h3>Honest limits</h3>
          <p>This is a simulation. The CogniScan scheduler here is a bandit-style stand-in (Bayesian occupancy + exploration + pulse-timing prediction) for the PPO policy planned for the full system. Latency is measured on this server in JavaScript; embedded targets will use a quantised C++/ONNX model.</p>
        </div>
        <div className="panel prose">
          <h2>How each factor is measured</h2>
          <dl>{metrics.map((m) => <React.Fragment key={m.key}><dt>{m.label} <span className="muted">({m.better === 'high' ? 'higher' : 'lower'} is better)</span></dt><dd>{m.help}</dd></React.Fragment>)}</dl>
        </div>
      </div>
      <div className="panel prose" style={{ marginTop: 16 }}>
        <h2>Architecture</h2>
        <p><b>Frontend:</b> React + Vite + Three.js (3D) · <b>Backend:</b> Node.js + Express simulation engine · <b>Storage:</b> JSON file · <b>API:</b> <code>/api/simulate</code>, <code>/api/benchmark</code>, <code>/api/runs</code>, <code>/api/presets</code>, <code>/api/metrics</code>, <code>/api/health</code>.</p>
        <p className="muted">Smart India Hackathon 2026 · SIH26055 · DRDO · Team InceptionX_2.0</p>
      </div>
    </section>
  );
}
