// Load both addons and print a per-file load report.
import { loadAddon } from './loader.mjs';

const { report } = await loadAddon();
const bad = report.files.filter((f) => f.status !== 'ok');
console.log(JSON.stringify(report.addons), report.timings, (report.memoryBytes / 1e6).toFixed(1) + 'MB');
console.log('ok', report.files.length - bad.length, 'bad', bad.length);
for (const b of bad) console.log(b.status, b.addon + '/' + b.file, (b.error || '').split('\n').slice(0, 3).join(' | '));
for (const e of report.events) {
  e.errors = Array.isArray(e.errors) ? e.errors : [];
  console.log('event', e.event, e.args, 'handlers', e.handlers, 'errors', e.errors.length);
  for (const err of e.errors) console.log('   ', err.split('\n').slice(0, 6).join(' | '));
}
console.log("login", report.login.finished, report.login.ticks);
console.log("errorhandler", JSON.stringify(report.errorHandler, null, 1).slice(0, 4000));
