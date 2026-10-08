// Tiny persistence layer: saved runs are kept in a JSON file (no native dependencies).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data', 'runs.json');
let runs = null;

export function init(file) {
  if (file) FILE = file;
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  try { runs = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { runs = []; }
}
function persist() {
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(runs));
  fs.renameSync(tmp, FILE);
}
export function save(kind, name, params, summary) {
  if (!runs) init();
  const id = (runs.reduce((m, r) => Math.max(m, r.id), 0)) + 1;
  runs.push({ id, created: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), kind, name, params, summary });
  persist();
  return id;
}
export const list = (limit = 100) => { if (!runs) init(); return [...runs].sort((a, b) => b.id - a.id).slice(0, limit); };
export const get = (id) => { if (!runs) init(); return runs.find((r) => r.id === id) || null; };
export function remove(id) {
  if (!runs) init();
  const n = runs.length; runs = runs.filter((r) => r.id !== id);
  if (runs.length === n) return false;
  persist(); return true;
}
