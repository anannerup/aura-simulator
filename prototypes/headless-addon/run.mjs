// End-to-end prototype: load Musca Auras headlessly, then write
//   out/load-report.json      files, timings, memory, touched (stubbed) APIs
//   out/registries.json       (a) region/sub-region defaults + properties, trigger prototypes, secretAura registries
//   out/validation.json       (b) PreAdd (Modernize + Migrate + defaults) and validation per sample aura
//   out/options-<sample>.json (c) evaluated option tables per tab for one icon aura
//
// Usage: node prototypes/headless-addon/run.mjs [addonsDir]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAddon, DEFAULT_ADDONS_DIR } from './loader.mjs';
import { samples, toLua } from './samples.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, 'out');
fs.mkdirSync(outDir, { recursive: true });
const write = (name, obj) => {
  fs.writeFileSync(path.join(outDir, name), JSON.stringify(obj, null, 1) + '\n');
  console.log('wrote', path.relative(process.cwd(), path.join(outDir, name)));
};
const J = (lua, code) => JSON.parse(lua.doStringSync(`return __bridge.json(${code})`));

const { lua, report } = await loadAddon({ addonsDir: process.argv[2] || DEFAULT_ADDONS_DIR });
lua.doStringSync(fs.readFileSync(path.join(here, 'extract.lua'), 'utf8'));

// ---- (a) registries
let t = performance.now();
const registries = J(lua, '__extract.registries()');
const registriesMs = +(performance.now() - t).toFixed(0);
write('registries.json', registries);

J(lua, '__extract.setupOptions()'); // TriggerSecretWarnings (options addon) needs OptionsPrivate.Private
// ---- (b) prepare + validate each sample, plus the addon's own tutorial imports as known-good fixtures
t = performance.now();
const validation = {};
const iv = registries.internalVersion;
for (const [name, aura] of Object.entries(samples)) {
  lua.doStringSync(`__sample = ${toLua({ ...aura, internalVersion: iv })}`);
  const prepared = J(lua, '(function() local d, r = __extract.prepare(__sample) __prepared = d return { report = r } end)()');
  const result = J(lua, '__extract.validate(__prepared)');
  const added = J(lua, '__extract.add(__extract.deepcopy(__prepared))');
  // Validation again after Add (Add runs the trigger systems; the result should not change)
  const afterAdd = J(lua, `__extract.validate(WeakAuras.GetData(${JSON.stringify(aura.id)}))`);
  validation[name] = {
    input: aura,
    prepareReport: prepared.report,
    validation: result,
    addReport: added,
    validationAfterAdd: afterAdd,
    prepared: J(lua, '__prepared'),
  };
}
validation.__tutorialImports = J(lua, `(function()
  local LD, LS = LibStub("LibDeflate"), LibStub("LibSerialize")
  local src = io.open("/addons/WeakAuras/ForeverTutorial.lua"):read("*a")
  local out = {}
  for imp in src:gmatch('import = "(!WA:2![^"]+)"') do
    local ok, t = LS:Deserialize(LD:DecompressDeflate(LD:DecodeForPrint(imp:sub(7))))
    local list = { t.d }
    for _, c in ipairs(t.c or {}) do list[#list + 1] = c end
    for _, d in ipairs(list) do
      local prepared, r = __extract.prepare(d)
      out[#out + 1] = { id = d.id, regionType = d.regionType, internalVersionIn = d.internalVersion,
        internalVersionOut = prepared.internalVersion, prepareOk = r.ok, handlerErrors = r.handlerErrors,
        trigger1 = prepared.triggers[1] and prepared.triggers[1].trigger.type,
        validation = __extract.validate(prepared) }
    end
  end
  return out
end)()`);
const validationMs = +(performance.now() - t).toFixed(0);
write('validation.json', validation);

// ---- (c) options for the icon samples
const setup = J(lua, '__extract.setupOptions()');
const optionsTimings = {};
for (const name of ['modern-icon-glow-ok', 'aura2-icon-spellids']) {
  t = performance.now();
  const opts = J(lua, `__extract.options(${JSON.stringify(samples[name].id)})`);
  optionsTimings[name] = +(performance.now() - t).toFixed(0);
  write(`options-${name}.json`, { setup, aura: samples[name].id, tabs: opts });
}

// ---- (c') edits through the addon's own option setters: turn on the trigger's Remaining Time filter
{
  const id = JSON.stringify(samples['modern-icon-glow-ok'].id);
  const before = J(lua, `__extract.deepcopy(WeakAuras.GetData(${id}).triggers[1].trigger)`);
  const steps = [
    ['trigger', ['trigger.1.secretAura.useRem'], true],
    ['trigger', ['trigger.1.secretAura.rem'], '180'],
    ['region', ['icon.desaturate'], true],
  ].map(([tab, p, v]) => {
    const r = J(lua, `(function() local r = __extract.setOption(${id}, ${JSON.stringify(tab)}, ${toLua(p)}, ${toLua(v)}) return { ok = r.ok, error = r.error } end)()`);
    return { tab, path: p, value: v, ...r };
  });
  const after = J(lua, `WeakAuras.GetData(${id})`);
  write('set-option-demo.json', {
    aura: samples['modern-icon-glow-ok'].id,
    steps,
    triggerBefore: before,
    triggerAfter: after.triggers[1].trigger,
    desaturateAfter: after.desaturate,
    validationAfter: J(lua, `__extract.validate(WeakAuras.GetData(${id}))`),
  });
}

// ---- load report
const touched = J(lua, '__shim.touched');
const touchedList = Object.entries(touched)
  .map(([k, v]) => ({ api: k, count: v.count, files: Object.keys(v.files).length }))
  .sort((a, b) => b.count - a.count);
report.extractTimings = { registriesMs, validationMs, optionsTimings };
report.memoryBytesAfter = Math.round(lua.doStringSync('collectgarbage("collect") return collectgarbage("count")') * 1024);
report.touchedCount = touchedList.length;
report.touched = touchedList;
report.prints = J(lua, '__shim.prints or {}');
write('load-report.json', report);

const bad = report.files.filter((f) => f.status !== 'ok');
console.log(`files: ${report.files.length - bad.length}/${report.files.length} ok; load ${report.timings.total} ms; ` +
  `heap ${(report.memoryBytes / 1e6).toFixed(1)} MB -> ${(report.memoryBytesAfter / 1e6).toFixed(1)} MB after extraction`);
console.log('extract timings', report.extractTimings);
for (const [name, v] of Object.entries(validation)) {
  if (name.startsWith('__')) continue;
  console.log(`${name}: validate=${JSON.stringify(v.validation.validate)} status=${JSON.stringify(v.validation.triggerStatusPlain)}`);
}
