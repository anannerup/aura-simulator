// Headless loader for Musca Auras in wasmoon-lua5.1.
//
// loadAddon({ addonsDir }) creates a Lua 5.1 VM, installs shim.lua, mounts the addon folders into
// the VM's virtual file system and runs every Lua file in TOC order (expanding XML <Script>/<Include>),
// passing (addonName, Private) as varargs like the game does. Returns the VM plus a load report.
//
// The file source is abstracted as `readFile(addon, relPath) -> string|null` so the same loader
// works for a local install (here) or files fetched from jsDelivr per addon version (src/core).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Lua } from 'wasmoon-lua5.1';

const here = path.dirname(fileURLToPath(import.meta.url));

export const DEFAULT_ADDONS_DIR = path.join(
  process.env.HOME,
  'Games/battlenet/drive_c/Program Files (x86)/World of Warcraft/_forever_/Interface/AddOns',
);

/** Parse a .toc: metadata (## Key: Value) and the ordered file list. */
export function parseToc(text) {
  const meta = {};
  const files = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^##\s*([^:]+):\s*(.*)$/);
    if (m) { meta[m[1].trim()] = m[2].trim(); continue; }
    if (line.startsWith('#')) continue;
    files.push(line.replace(/\\/g, '/'));
  }
  return { meta, files };
}

/** Expand a .toc/.xml entry into the ordered list of .lua files it stands for. */
function expand(readFile, addon, relPath, out) {
  if (relPath.toLowerCase().endsWith('.lua')) { out.push(relPath); return; }
  if (!relPath.toLowerCase().endsWith('.xml')) return;
  const xml = readFile(addon, relPath);
  if (xml == null) { out.push({ missing: relPath }); return; }
  const dir = path.posix.dirname(relPath);
  // Only <Script file> and <Include file> matter; inline frame XML is ignored (no FrameXML runtime).
  const re = /<(Script|Include)\s+file\s*=\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(xml))) {
    const target = path.posix.normalize(path.posix.join(dir, m[2].replace(/\\/g, '/')));
    expand(readFile, addon, target, out);
  }
}

export function localReader(addonsDir) {
  // Case-insensitive path resolution (TOCs are written for Windows).
  const cache = new Map();
  const resolve = (abs) => {
    if (fs.existsSync(abs)) return abs;
    const parts = path.relative(addonsDir, abs).split(path.sep);
    let cur = addonsDir;
    for (const p of parts) {
      const key = cur;
      if (!cache.has(key)) cache.set(key, fs.existsSync(cur) ? fs.readdirSync(cur) : []);
      const hit = cache.get(key).find((e) => e.toLowerCase() === p.toLowerCase());
      if (!hit) return null;
      cur = path.join(cur, hit);
    }
    return cur;
  };
  return (addon, rel) => {
    const abs = resolve(path.join(addonsDir, addon, rel));
    return abs ? fs.readFileSync(abs, 'utf8') : null;
  };
}

export async function loadAddon({
  addonsDir = DEFAULT_ADDONS_DIR,
  addons = ['WeakAuras', 'WeakAurasOptions'],
  readFile = localReader(addonsDir),
  skip = () => false, // (addon, relPath) => boolean
} = {}) {
  const t0 = performance.now();
  const lua = await Lua.create();
  const tVm = performance.now();
  lua.doStringSync(fs.readFileSync(path.join(here, 'shim.lua'), 'utf8'));
  lua.doStringSync(fs.readFileSync(path.join(here, 'bridge.lua'), 'utf8'));

  const report = { addons: {}, files: [], timings: {} };
  for (const addon of addons) {
    const toc = parseToc(readFile(addon, `${addon}.toc`));
    lua.global.get('__shim').toc[addon] = toc.meta;
    const files = [];
    for (const f of toc.files) expand(readFile, addon, f, files);
    report.addons[addon] = { version: toc.meta.Version, interface: toc.meta.Interface, fileCount: files.length };
    const tA = performance.now();
    lua.doStringSync(`__shim.private[${JSON.stringify(addon)}] = __shim.private[${JSON.stringify(addon)}] or {}`);
    for (const f of files) {
      if (typeof f === 'object') { report.files.push({ addon, file: f.missing, status: 'missing' }); continue; }
      if (skip(addon, f)) { report.files.push({ addon, file: f, status: 'skipped' }); continue; }
      const src = readFile(addon, f);
      if (src == null) { report.files.push({ addon, file: f, status: 'missing' }); continue; }
      const vfsPath = `/addons/${addon}/${f}`;
      lua.mountFile(vfsPath, src);
      report.addons[addon].bytes = (report.addons[addon].bytes || 0) + Buffer.byteLength(src);
      const tf = performance.now();
      const res = JSON.parse(lua.doStringSync(
        `return __bridge.json(__shim.runFile(${JSON.stringify(addon)}, ${JSON.stringify(f)}, ${JSON.stringify(vfsPath)}))`,
      ));
      report.files.push({ addon, file: f, ms: +(performance.now() - tf).toFixed(1), ...res });
    }
    lua.doStringSync(`__shim.loadedAddons[${JSON.stringify(addon)}] = true`);
    // Game order: ADDON_LOADED after an addon's files; PLAYER_LOGIN once the core addon is in
    // (the options addon is load-on-demand and only loads after login).
    const events = [['ADDON_LOADED', addon]];
    if (addon === addons[0]) events.push(['PLAYER_LOGIN'], ['PLAYER_ENTERING_WORLD', true, false]);
    report.events = report.events || [];
    for (const [ev, ...args] of events) {
      const r = JSON.parse(lua.doStringSync(
        `return __bridge.json(__shim.fireSafe(${[JSON.stringify(ev), ...args.map((a) => JSON.stringify(a))].join(', ')}))`,
      ));
      report.events.push({ event: ev, args, ...r });
    }
    if (addon === addons[0]) {
      // Let the login coroutine run to completion through the mock frame loop.
      let ticks = 0;
      const errors = [];
      while (ticks < 500 && !lua.doStringSync('return WeakAuras.IsLoginFinished and WeakAuras.IsLoginFinished() or false')) {
        const r = JSON.parse(lua.doStringSync('return __bridge.json(__shim.tick(10))'));
        ticks += r.ticks;
        if (Array.isArray(r.errors)) errors.push(...r.errors);
      }
      report.login = {
        finished: lua.doStringSync('return WeakAuras.IsLoginFinished and WeakAuras.IsLoginFinished() or false'),
        ticks, errors: [...new Set(errors)].slice(0, 10),
      };
    }
    report.timings[addon] = +(performance.now() - tA).toFixed(0);
  }
  report.errorHandler = JSON.parse(lua.doStringSync("return __bridge.json(__shim.errors or {})"));
  report.timings.vmCreate = +(tVm - t0).toFixed(0);
  report.timings.total = +(performance.now() - t0).toFixed(0);
  report.memoryBytes = Math.round(lua.doStringSync("collectgarbage(\"collect\") return collectgarbage(\"count\")") * 1024);
  return { lua, report };
}

/** Run a Lua snippet that returns a JSON string (via __bridge.json) and parse it. */
export function callJson(lua, code) {
  const out = lua.doStringSync(code);
  return typeof out === 'string' ? JSON.parse(out) : out;
}
