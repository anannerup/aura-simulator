// Print a short summary of out/*.json (after run.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out');
const read = (f) => JSON.parse(fs.readFileSync(path.join(out, f), 'utf8'));
const short = (x, n = 300) => (typeof x === 'string' ? x : JSON.stringify(x))?.slice(0, n);

const v = read('validation.json');
for (const [k, x] of Object.entries(v)) {
  if (k === '__tutorialImports') {
    for (const t of x) {
      console.log(`TUTORIAL ${t.id} [${t.regionType}/${t.trigger1}] v${t.internalVersionIn}->${t.internalVersionOut} prepareOk=${t.prepareOk} errs=${(t.handlerErrors || []).length}`);
      console.log('   validate:', short(t.validation.validate, 160), '| warnings:', short(t.validation.triggerWarnings?.map((w) => w.text), 200));
    }
    continue;
  }
  console.log(`SAMPLE ${k}`);
  console.log('   prepare:', short(x.prepareReport, 400));
  console.log('   add:', short(x.addReport, 400));
  console.log('   validation:', short(x.validation, 600));
  console.log('   same after Add:', JSON.stringify(x.validation) === JSON.stringify(x.validationAfterAdd));
}
for (const f of fs.readdirSync(out).filter((f) => f.startsWith('options-'))) {
  const o = read(f);
  console.log(f, 'setup', short(o.setup, 200));
  for (const [tab, e] of Object.entries(o.tabs)) {
    const count = (n) => (n ? 1 + (n.args || []).reduce((s, c) => s + count(c), 0) : 0);
    console.log(`   ${tab}: ${e.error ? 'ERROR ' + short(e.error, 300) : `${count(e.tree)} nodes, ${e.stats.errors} eval errors, ${e.ms} ms`}`);
    if (e.stats?.errorSamples?.length) for (const s of e.stats.errorSamples.slice(0, 4)) console.log('       ', short(s, 220));
  }
}
