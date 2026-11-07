/** Web Worker that hosts the full addon VM (see host.ts for the page side). */
import type { FromWorker, ToWorker } from "./host";
import { loadAddonVM, type AddonVM } from "./vm";
import { errorMessage } from "@/lib/errors";

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
    vm = loadAddonVM(msg.ref, { fetchSource, wasmUri: msg.wasmUri, game: msg.game });
    return (await vm).report;
  }
  if (!vm) throw new Error("The addon VM is not loaded");
  const loaded = (await vm) as unknown as Record<string, (...args: unknown[]) => unknown>;
  return loaded[msg.method](...msg.args);
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
        message: errorMessage(e),
      }),
  );
};
