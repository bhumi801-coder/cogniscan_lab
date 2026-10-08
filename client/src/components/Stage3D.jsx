import React, { useEffect, useRef, useState } from 'react';
import { Stage3D as Stage } from '../scene.js';

/** Hosts the Three.js scene. `onReady(stage)` hands the imperative stage object to the parent. */
export default function Stage3D({ onReady, children }) {
  const canvasRef = useRef(null);
  const labelsRef = useRef(null);
  const [noGL, setNoGL] = useState(false);

  useEffect(() => {
    const stage = new Stage(canvasRef.current, labelsRef.current);
    if (!stage.ok) { setNoGL(true); return undefined; }
    onReady(stage);
    return () => { stage.dispose?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <canvas id="gl" ref={canvasRef} aria-label="3D view of the receiver scanning the spectrum" role="img" />
      <div id="labels" ref={labelsRef} />
      {children}
      {noGL && <div className="nogl">3D view needs WebGL. The numbers and charts still work.</div>}
    </>
  );
}
