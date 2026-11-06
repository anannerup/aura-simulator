// Print one tab of an options-*.json as an indented outline: key [type] "name" = value (hidden/disabled).
// Usage: node print-options.mjs out/options-modern-icon-glow-ok.json region [maxLines]
import fs from 'node:fs';

const [file, tab = 'region', max = '400'] = process.argv.slice(2);
const o = JSON.parse(fs.readFileSync(file, 'utf8'));
const lines = [];
const clean = (s) => (typeof s === 'string' ? s.replace(/\|c\w{8}|\|r/g, '') : s);
function walk(n, depth) {
  const flags = [n.hidden === true && 'hidden', n.disabled === true && 'disabled'].filter(Boolean).join(',');
  const vals = n.values && typeof n.values === 'object' ? ` values(${Object.keys(n.values).length})` : '';
  const range = n.min !== undefined || n.softMin !== undefined ? ` [${n.min ?? n.softMin}..${n.max ?? n.softMax}]` : '';
  const val = n.value !== undefined ? ` = ${JSON.stringify(n.value)}` : '';
  lines.push(`${'  '.repeat(depth)}${n.key ?? '(root)'} [${n.type}] "${clean(n.name) ?? ''}"${val}${range}${vals}${flags ? ' (' + flags + ')' : ''}`);
  for (const c of n.args || []) walk(c, depth + 1);
}
walk(o.tabs[tab].tree, 0);
console.log(lines.slice(0, +max).join('\n'));
