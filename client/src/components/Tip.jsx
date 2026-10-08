import React from 'react';

export default function Tip({ metrics, k }) {
  const i = metrics.find((m) => m.key === k);
  return i ? <span className="tip" tabIndex={0} data-tip={i.help}>?</span> : null;
}
