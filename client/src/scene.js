import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const BW = 0.1;        // width of one frequency bin (world units)
const DZ = 0.028;      // depth per simulated ms
const HIST = 260;      // ms of history drawn behind the "now" line
const GAP = 10;        // distance between lanes
const W = 12;          // band width in world units
const bx = (bin) => -W / 2 + (bin + 0.5) * BW;

export const LANE_COLORS = { fixed: 0x8CA0C0, random: 0xB79CFF, cogniscan: 0x4C8DFF };
export const LANE_NAMES = { fixed: 'Fixed sweep', random: 'Random hop', cogniscan: 'CogniScan' };
const C_HIT = new THREE.Color(0x34d399), C_MISS = new THREE.Color(0xffb020), C_DONE = new THREE.Color(0x9a6a1c);
const dummy = new THREE.Object3D();
const tmpC = new THREE.Color();

export class Stage3D {
  constructor(canvas, labelHost) {
    this.canvas = canvas; this.labelHost = labelHost;
    this.lanes = []; this.t = 0; this.duration = 1; this.playing = false; this.speed = 1;
    this.onTime = null; this.onEnd = null; this._emit = 0; this.goal = null;
    this.ok = true;
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch (e) { this.ok = false; return; }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050914);
    this.scene.fog = new THREE.Fog(0x050914, 22, 62);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true; this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.47; this.controls.minDistance = 3; this.controls.maxDistance = 45;
    this.scene.add(new THREE.AmbientLight(0x8aa4d6, 0.9));
    const d = new THREE.DirectionalLight(0xffffff, 0.9); d.position.set(4, 10, 6); this.scene.add(d);
    this._stars();
    this.setFocus('all', true);
    this._resize();
    new ResizeObserver(() => this._resize()).observe(canvas.parentElement);
    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this._tick());
  }

  _stars() {
    const n = 700, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = 40 + Math.random() * 40, a = Math.random() * Math.PI * 2, e = Math.random() * 0.9 + 0.05;
      pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = e * 40; pos[i * 3 + 2] = Math.sin(a) * r - 25;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0x7f9bd6, size: 0.18, transparent: true, opacity: 0.7, fog: false }));
    this.scene.add(this.stars);
  }

  _resize() {
    if (!this.ok) return;
    const p = this.canvas.parentElement, w = p.clientWidth, h = p.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  clear() {
    for (const l of this.lanes) {
      this.scene.remove(l.group);
      l.group.traverse((o) => { o.geometry?.dispose?.(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose()); });
      l.label.remove();
    }
    this.lanes = [];
  }

  load(sceneData, results, order) {
    if (!this.ok) return;
    this.clear();
    this.duration = sceneData.duration;
    this.dwell = sceneData.dwell; this.win = sceneData.win;
    order.forEach((name, idx) => this.lanes.push(this._lane(name, idx, sceneData, results[name].trace)));
    this.seek(0);
    this.setFocus(this.focus || 'all', true);
  }

  _lane(name, idx, sd, trace) {
    const z0 = -idx * GAP, col = LANE_COLORS[name];
    const group = new THREE.Group(); this.scene.add(group);
    const depth = HIST * DZ;
    // floor
    const plate = new THREE.Mesh(new THREE.BoxGeometry(W + 0.5, 0.08, depth + 1.2),
      new THREE.MeshStandardMaterial({ color: 0x0a1428, roughness: 0.8, metalness: 0.2 }));
    plate.position.set(0, -0.05, z0 - depth / 2 + 0.2); group.add(plate);
    // grid
    const pts = [];
    for (let b = 0; b <= 120; b += 10) { pts.push(bx(b) - BW / 2, 0.0, z0 + 0.35, bx(b) - BW / 2, 0.0, z0 - depth); }
    for (let k = 0; k <= HIST; k += 40) { const z = z0 - k * DZ; pts.push(-W / 2, 0.0, z, W / 2, 0.0, z); }
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    group.add(new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: 0x24406e, transparent: true, opacity: 0.55 })));
    // now line
    const now = new THREE.Mesh(new THREE.PlaneGeometry(W, 0.06), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9 }));
    now.rotation.x = -Math.PI / 2; now.position.set(0, 0.03, z0); group.add(now);
    // receiver window
    const ww = this.win * BW;
    const win = new THREE.Group();
    const wm = new THREE.Mesh(new THREE.BoxGeometry(ww, 1.4, 0.55),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
    wm.position.y = 0.7; win.add(wm);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(ww, 1.4, 0.55)), new THREE.LineBasicMaterial({ color: 0xdbe8ff }));
    edges.position.y = 0.7; win.add(edges);
    const beam = new THREE.Mesh(new THREE.PlaneGeometry(ww, depth * 0.55),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false }));
    beam.rotation.x = -Math.PI / 2; beam.position.set(0, 0.02, -depth * 0.275); win.add(beam);
    win.position.set(bx(trace.windows[0] + this.win / 2 - 0.5), 0, z0); group.add(win);
    // pulses
    const P = sd.pulses;
    const pulses = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ toneMapped: false }), P.length);
    pulses.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    pulses.setColorAt(0, C_HIT); pulses.instanceColor.setUsage(THREE.DynamicDrawUsage);
    pulses.frustumCulled = false; group.add(pulses);
    // false alarms
    const fa = trace.false_alarms;
    const faMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.11), new THREE.MeshBasicMaterial({ color: 0xff5c6c, toneMapped: false }), Math.max(1, fa.length));
    faMesh.frustumCulled = false; group.add(faMesh);
    // belief towers (CogniScan only)
    let belief = null;
    if (name === 'cogniscan' && trace.beliefs.length) {
      belief = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.8, toneMapped: false }), sd.bins);
      belief.frustumCulled = false; group.add(belief);
    }
    // rings pool
    const rings = [];
    for (let i = 0; i < 24; i++) {
      const r = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.3, 36), new THREE.MeshBasicMaterial({ color: 0x34d399, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
      r.rotation.x = -Math.PI / 2; r.visible = false; group.add(r); rings.push({ m: r, age: 9 });
    }
    // label
    const label = document.createElement('div'); label.className = 'lane-label';
    label.style.color = '#' + col.toString(16).padStart(6, '0');
    label.innerHTML = `${LANE_NAMES[name]}<b>0%</b>`;
    this.labelHost.appendChild(label);
    const hits = Object.entries(trace.hits).map(([pid, t]) => [t, P[+pid][2]]).sort((a, b) => a[0] - b[0]);
    return { name, z0, group, win, winGroup: win, pulses, faMesh, belief, rings, label, hits, hp: 0, P, trace, hitMap: trace.hits, wx: win.position.x, ringIdx: 0, faList: fa, pOut: label.querySelector('b'), sd };
  }

  seek(t) {
    this.t = Math.max(0, Math.min(this.duration, t));
    for (const l of this.lanes) { l.hp = this._bs(l.hits, this.t); }
    this._lastT = this.t;
  }
  _bs(arr, t) { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m][0] <= t) lo = m + 1; else hi = m; } return lo; }

  play(v) { if (v && this.t >= this.duration - 1) this.seek(0); this.playing = v; }

  setFocus(name, instant) {
    this.focus = name;
    let pos, look;
    if (name === 'all' || !this.lanes.some((l) => l.name === name)) {
      const n = Math.max(this.lanes.length, 3);
      pos = new THREE.Vector3(0, 12 + n * 2.2, 13 + n * 0.5); look = new THREE.Vector3(0, 0, -(n - 1) * GAP * 0.5 - 1);
    } else {
      const l = this.lanes.find((x) => x.name === name);
      pos = new THREE.Vector3(0, 5.2, l.z0 + 7.2); look = new THREE.Vector3(0, 0, l.z0 - 2.4);
    }
    if (instant) { this.camera.position.copy(pos); this.controls.target.copy(look); this.camera.lookAt(look); this.goal = null; }
    else this.goal = { pos, look };
  }

  _spawnRing(l, bin) {
    const r = l.rings[l.ringIdx++ % l.rings.length];
    r.age = 0; r.m.visible = true; r.m.position.set(bx(bin), 0.06, l.z0);
  }

  _tick() {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    if (this.playing && this.lanes.length) {
      this.t += dt * 150 * this.speed;
      if (this.t >= this.duration) { this.t = this.duration; this.playing = false; this.onEnd?.(); }
    }
    const t = this.t;
    if (this.goal) {
      this.camera.position.lerp(this.goal.pos, 0.07); this.controls.target.lerp(this.goal.look, 0.07);
      if (this.camera.position.distanceTo(this.goal.pos) < 0.05) this.goal = null;
    }
    this.controls.update();
    this.stars.rotation.y += dt * 0.004;
    for (const l of this.lanes) this._updateLane(l, t, dt);
    this._emit += dt;
    if (this._emit > 0.1) { this._emit = 0; this.onTime?.(t); }
    this._labels();
    this.renderer.render(this.scene, this.camera);
  }

  _updateLane(l, t, dt) {
    // window position
    const wi = Math.min(l.trace.windows.length - 1, Math.floor(t / this.dwell));
    const tx = bx(l.trace.windows[wi] + this.win / 2 - 0.5);
    l.wx += (tx - l.wx) * Math.min(1, dt * 18);
    l.winGroup.position.x = l.wx;
    // rings for new hits
    while (l.hp < l.hits.length && l.hits[l.hp][0] <= t) {
      if (t - l.hits[l.hp][0] < 40 && this.playing) this._spawnRing(l, l.hits[l.hp][1]);
      l.hp++;
    }
    if (t < this._lastT - 1) l.hp = this._bs(l.hits, t);
    for (const r of l.rings) {
      if (!r.m.visible) continue;
      r.age += dt; const k = r.age / 0.7;
      if (k >= 1) { r.m.visible = false; continue; }
      r.m.scale.setScalar(0.5 + k * 4.5); r.m.material.opacity = (1 - k) * 0.9;
    }
    // pulses
    const P = l.P, z0 = l.z0, hm = l.hitMap;
    for (let i = 0; i < P.length; i++) {
      const p = P[i], ts = p[0], te = p[1];
      if (ts > t || t - te > HIST) { dummy.scale.set(0, 0, 0); dummy.position.set(0, -5, 0); dummy.updateMatrix(); l.pulses.setMatrixAt(i, dummy.matrix); continue; }
      const end = Math.min(t, te), len = Math.max((end - ts) * DZ, 0.05);
      const age = Math.max(0, t - te) / HIST;
      const ht = hm[i], got = ht !== undefined && ht <= t;
      const h = (got ? 0.95 : 0.45) * (1 - age * 0.65);
      dummy.position.set(bx(p[2]), h / 2 + 0.03, z0 - ((t - ts) + (t - end)) * 0.5 * DZ);
      dummy.scale.set(BW * 0.85, h, len); dummy.updateMatrix(); l.pulses.setMatrixAt(i, dummy.matrix);
      l.pulses.setColorAt(i, got ? C_HIT : (t < te ? C_MISS : C_DONE));
    }
    l.pulses.instanceMatrix.needsUpdate = true; l.pulses.instanceColor.needsUpdate = true;
    // false alarms
    const fa = l.faList;
    for (let i = 0; i < fa.length; i++) {
      const [ft, fb] = fa[i];
      if (ft > t || t - ft > HIST) { dummy.scale.set(0, 0, 0); dummy.position.set(0, -5, 0); }
      else { dummy.scale.setScalar(1); dummy.position.set(bx(fb), 0.2, z0 - (t - ft) * DZ); }
      dummy.updateMatrix(); l.faMesh.setMatrixAt(i, dummy.matrix);
    }
    l.faMesh.instanceMatrix.needsUpdate = true;
    // belief towers
    if (l.belief) {
      const snap = l.trace.beliefs[Math.min(l.trace.beliefs.length - 1, Math.floor(t / (this.dwell * 2)))];
      for (let b = 0; b < snap.length; b++) {
        const h = 0.04 + (snap[b] / 99) * 1.7;
        dummy.position.set(bx(b), h / 2, z0 + 0.62); dummy.scale.set(BW * 0.8, h, 0.22); dummy.updateMatrix(); l.belief.setMatrixAt(b, dummy.matrix);
      }
      l.belief.instanceMatrix.needsUpdate = true;
    }
  }

  _labels() {
    if (!this.lanes.length) return;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight, v = new THREE.Vector3();
    for (const l of this.lanes) {
      v.set(-W / 2, 0.15, l.z0 + 0.4).project(this.camera);
      const vis = v.z < 1 && v.x > -1.2 && v.x < 1.2;
      l.label.style.display = vis ? '' : 'none';
      l.label.style.left = Math.max(8, (v.x * 0.5 + 0.5) * w) + 'px';
      l.label.style.top = Math.max(60, (-v.y * 0.5 + 0.5) * h) + 'px';
    }
  }

  dispose() {
    this.renderer?.setAnimationLoop(null);
    this.clear();
    this.controls?.dispose();
    this.renderer?.dispose();
  }

  setLivePoi(map) { for (const l of this.lanes) if (map[l.name] != null) l.pOut.textContent = Math.round(map[l.name] * 100) + '%'; }
}
