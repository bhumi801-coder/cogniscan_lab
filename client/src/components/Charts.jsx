import React from 'react';

export function LineChart({ series, step, cursor }) {
  const W = 400, H = 170, L = 34, R = 8, T = 8, B = 22;
  const n = Math.max(...series.map((s) => s.values.length));
  const x = (i) => L + (i / Math.max(1, n - 1)) * (W - L - R);
  const y = (v) => T + (1 - v) * (H - T - B);
  const tMs = (n - 1) * step;
  const cx = cursor != null ? x(Math.min(n - 1, cursor / step)) : null;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Intercept rate over time">
      {[0, 0.25, 0.5, 0.75, 1].map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="rgba(120,160,230,.14)" />
          <text x={L - 6} y={y(v) + 4} textAnchor="end">{Math.round(v * 100)}%</text>
        </g>
      ))}
      {[0, 1, 2, 3, 4].map((k) => <text key={k} x={x(((n - 1) * k) / 4)} y={H - 6} textAnchor="middle">{Math.round((tMs * k) / 4)}</text>)}
      {series.map((s) => (
        <path key={s.name} fill="none" stroke={s.color} strokeWidth="2.2" strokeLinejoin="round"
          d={s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')} />
      ))}
      {cx != null && <line x1={cx} x2={cx} y1={T} y2={H - B} stroke="#fff" strokeDasharray="3 3" opacity=".6" />}
    </svg>
  );
}

export function BarChart({ groups, fmt = (v) => v.toFixed(0), yMax }) {
  const W = 560, H = 230, L = 40, R = 10, T = 14, B = 44;
  const max = yMax ?? (Math.max(...groups.flatMap((g) => g.bars.map((b) => (b.value || 0) + (b.err || 0)))) * 1.15 || 1);
  const y = (v) => T + (1 - v / max) * (H - T - B);
  const gw = (W - L - R) / groups.length;
  const legend = [...new Map(groups.flatMap((g) => g.bars).map((b) => [b.name, b.color])).entries()];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img">
      {[0, 1, 2, 3, 4].map((k) => {
        const v = (max * k) / 4;
        return (
          <g key={k}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="rgba(120,160,230,.14)" />
            <text x={L - 6} y={y(v) + 4} textAnchor="end">{fmt(v)}</text>
          </g>
        );
      })}
      {groups.map((g, gi) => {
        const bw = Math.min(groups.length === 1 ? 100 : 46, (gw * 0.8) / g.bars.length);
        const x0 = L + gi * gw + (gw - bw * g.bars.length) / 2;
        return (
          <g key={g.label}>
            {g.bars.map((b, bi) => {
              const bx = x0 + bi * bw, v = b.value || 0, top = y(v), cx = bx + bw / 2;
              return (
                <g key={b.name}>
                  <rect x={bx + 2} y={top} width={bw - 4} height={Math.max(0, H - B - top)} rx="4" fill={b.color}><title>{`${b.name}: ${fmt(v)}`}</title></rect>
                  {b.err > 0 && (
                    <>
                      <line x1={cx} x2={cx} y1={y(v + b.err)} y2={y(Math.max(0, v - b.err))} stroke="#fff" strokeWidth="1.6" />
                      <line x1={cx - 5} x2={cx + 5} y1={y(v + b.err)} y2={y(v + b.err)} stroke="#fff" strokeWidth="1.6" />
                    </>
                  )}
                  <text x={cx} y={top - (b.err ? y(v) - y(v + b.err) + 6 : 5)} textAnchor="middle" style={{ fill: '#e6edf8', fontWeight: 600 }}>{fmt(v)}</text>
                </g>
              );
            })}
            <text x={L + gi * gw + gw / 2} y={H - 24} textAnchor="middle" style={{ fill: '#cfdaee' }}>{g.label}</text>
          </g>
        );
      })}
      {legend.map(([name, color], i) => (
        <g key={name}>
          <rect x={L + i * 118} y={H - 12} width="9" height="9" rx="2" fill={color} />
          <text x={L + i * 118 + 14} y={H - 4}>{name}</text>
        </g>
      ))}
    </svg>
  );
}
