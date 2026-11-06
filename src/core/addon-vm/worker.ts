/** Web Worker that hosts the full addon VM (see remote.ts for the page side). */
import type { FromWorker, ToWorker } from "./remote";
import type { OptionAddress } from "./options";
import { loadAddonVM, type AddonVM, type VMState } from "./vm";

const scope = self as unknown as {
  postMessage(message: FromWorker): void;
  onmessage: ((event: MessageEvent<ToWorker>) => void) | null;
};

let vm: Promise<AddonVM> | undefined;
let nextFetch = 1;
const fetches = new Map<number, { resolve: (text: string) => void; reject: (e: Error) => void }>();

function fetchSource(path: string): Promise<string> {
  const id = nextFetch++;
  return new Promise((resolve, reject) => {
    fetches.set(id, { resolve, reject });
    scope.postMessage({ type: "fetch", id, path });
  });
}

async function handle(msg: Exclude<ToWorker, { type: "fetched" }>): Promise<unknown> {
  if (msg.type === "load") {
    vm = loadAddonVM(msg.ref, { fetchSource, wasmUri: msg.wasmUri });
    return (await vm).report;
  }
  if (!vm) throw new Error("The addon VM is not loaded");
  const loaded = await vm;
  switch (msg.method) {
    case "fillDefaults":
      return loaded.fillDefaults(msg.args[0] as Parameters<AddonVM["fillDefaults"]>[0]);
    case "validate":
      return loaded.validate(msg.args[0] as Parameters<AddonVM["validate"]>[0]);
    case "registries":
      return loaded.registries();
    case "options":
      return loaded.options(msg.args[0] as VMState, msg.args[1] as { tab?: string } | undefined);
    case "setOption":
      return loaded.setOption(msg.args[0] as VMState, msg.args[1] as OptionAddress, msg.args[2]);
    case "setSpells":
      return loaded.setSpells(msg.args[0] as Parameters<AddonVM["setSpells"]>[0]);
  }
}

scope.onmessage = (event) => {
  const msg = event.data;
  if (msg.type === "fetched") {
    const p = fetches.get(msg.id);
    fetches.delete(msg.id);
    if (msg.error !== undefined) p?.reject(new Error(msg.error));
    else p?.resolve(msg.text ?? "");
    return;
  }
  handle(msg).then(
    (value) => scope.postMessage({ type: "result", id: msg.id, value }),
    (e: unknown) =>
      scope.postMessage({
        type: "error",
        id: msg.id,
        name: e instanceof Error ? e.name : "Error",
        message: e instanceof Error ? e.message : String(e),
      }),
  );
};
