// Browser stand-in for Node's `fs`: @wowserhq/io (used by @wowserhq/format's BLP decoder)
// requires it from a shim, but only uses it for file paths, which the browser never passes.
module.exports = {};
