// Load the addon, then run a Lua file (argv[2]) in the loaded VM and print what it returns.
// The Lua chunk sees WA_PRIVATE / WAO_PRIVATE (the two addons' Private tables) as globals.
import fs from 'node:fs';
import { loadAddon } from './loader.mjs';

const { lua } = await loadAddon();
lua.doStringSync('WA_PRIVATE = __shim.private.WeakAuras; WAO_PRIVATE = __shim.private.WeakAurasOptions');
lua.doStringSync(fs.readFileSync(new URL('./extract.lua', import.meta.url), 'utf8'));
const out = lua.doStringSync(fs.readFileSync(process.argv[2], 'utf8'));
console.log(out);
