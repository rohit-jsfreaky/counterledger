// Copy the published evidence + data the site shows into src/generated/ (runs before dev/build).
// The site never computes its own numbers: everything comes from the same files `uv run verify` checks.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = resolve(web, '..');
const out = join(web, 'src', 'generated');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const copyTree = (from, to, keep = (p) => p.endsWith('.json') || p.endsWith('.csv')) => {
  if (!existsSync(from)) return 0;
  let n = 0;
  for (const name of readdirSync(from)) {
    const src = join(from, name);
    const dst = join(to, name);
    if (statSync(src).isDirectory()) n += copyTree(src, dst, keep);
    else if (keep(src)) {
      mkdirSync(dirname(dst), { recursive: true });
      cpSync(src, dst);
      n++;
    }
  }
  return n;
};

let n = 0;
n += copyTree(join(root, 'evidence'), join(out, 'evidence'));
n += copyTree(join(root, 'data'), join(out, 'data'), (p) => {
  const r = relative(join(root, 'data'), p).replace(/\\/g, '/');
  if (r.startsWith('raw/') && !r.endsWith('hourly.csv') && !r.endsWith('meta.json')) return false;
  if (r.startsWith('live/') && !(r.endsWith('hourly.csv'))) return false;
  if (r.startsWith('sources/')) return false;
  return r.endsWith('.json') || r.endsWith('.csv');
});
// fresh build output if present, else the committed copy (CI and fresh clones have no target/)
const idl = [join(root, 'program', 'target', 'idl', 'counterledger.json'), join(root, 'program', 'idl', 'counterledger.json')].find(existsSync);
cpSync(idl, join(out, 'idl.json'));
n++;
console.log(`sync-data: ${n} files -> src/generated/`);
