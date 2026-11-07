import type { AddonSourceFetcher } from "../addon-source";
import type { AddonVM, AddonVMReport, LoadAddonVMOptions } from "./vm";

/** AddonVM's calls (everything but `ref`, `report` and `dispose`). */
export type AddonVMMethod = Exclude<
  { [K in keyof AddonVM]: AddonVM[K] extends (...args: never[]) => unknown ? K : never }[keyof AddonVM],
  "dispose"
>;

/** The full addon VM seen from outside: AddonVM's calls, asynchronous (inline or in a Web Worker). */
export type AsyncAddonVM = {
  [K in AddonVMMethod]: (...args: Parameters<AddonVM[K]>) => Promise<ReturnType<AddonVM[K]>>;
} & {
  readonly report: AddonVMReport;
  /** Stops the VM (terminates the worker). */
  dispose(): void;
};

/** Messages between the page and the worker. */
export type ToWorker =
  | { type: "load"; id: number; ref: string; wasmUri?: string }
  | { type: "call"; id: number; method: AddonVMMethod; args: unknown[] }
  | { type: "fetched"; id: number; text?: string; error?: string };

export type FromWorker =
  | { type: "result"; id: number; value: unknown }
  | { type: "error"; id: number; name: string; message: string }
  | { type: "fetch"; id: number; path: string };

/**
 * An AsyncAddonVM that sends every call through `call`, so a new AddonVM call needs no code here or in the
 * worker. Not a thenable (`then` is undefined), so it can be returned from async functions.
 */
function asyncVM(report: AddonVMReport, call: (method: AddonVMMethod, args: unknown[]) => Promise<unknown>, dispose: () => void): AsyncAddonVM {
  return new Proxy({ report, dispose } as AsyncAddonVM, {
    get: (target, name) =>
      name in target || typeof name !== "string" || name === "then"
        ? Reflect.get(target, name)
        : (...args: unknown[]) => call(name as AddonVMMethod, args),
  });
}

/** Loads the full addon VM in an in-process Lua VM (Node, tests, or a page without workers). */
export async function loadInlineAddonVM(ref: string, options: LoadAddonVMOptions): Promise<AsyncAddonVM> {
  const { loadAddonVM } = await import("./vm");
  const vm = await loadAddonVM(ref, options);
  const methods = vm as unknown as Record<AddonVMMethod, (...args: unknown[]) => unknown>;
  return asyncVM(vm.report, async (method, args) => methods[method](...args), () => vm.dispose());
}

/**
 * Loads the full addon VM in a Web Worker. Source files are still fetched on the page through
 * `fetchSource` (the worker asks for each file), so any fetcher works.
 */
export async function loadWorkerAddonVM(
  ref: string,
  options: { fetchSource: AddonSourceFetcher; wasmUri?: string },
): Promise<AsyncAddonVM> {
  const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module", name: `addon-vm-${ref}` });
  let nextId = 1;
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  let failed: Error | undefined;

  worker.onmessage = (event: MessageEvent<FromWorker>) => {
    const msg = event.data;
    if (msg.type === "fetch") {
      options.fetchSource(msg.path).then(
        (text) => worker.postMessage({ type: "fetched", id: msg.id, text } satisfies ToWorker),
        (e: unknown) =>
          worker.postMessage({ type: "fetched", id: msg.id, error: e instanceof Error ? e.message : String(e) } satisfies ToWorker),
      );
      return;
    }
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.type === "result") p.resolve(msg.value);
    else {
      const err = new Error(msg.message);
      err.name = msg.name;
      p.reject(err);
    }
  };
  worker.onerror = (event) => {
    failed = new Error(`The addon VM worker failed: ${event.message}`);
    for (const p of pending.values()) p.reject(failed);
    pending.clear();
  };

  type Request = { type: "load"; ref: string; wasmUri?: string } | { type: "call"; method: AddonVMMethod; args: unknown[] };
  const send = (msg: Request): Promise<unknown> => {
    if (failed) return Promise.reject(failed);
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      worker.postMessage({ ...msg, id } satisfies ToWorker);
    });
  };

  const wasmUri = options.wasmUri ? new URL(options.wasmUri, globalThis.location?.href).href : undefined;
  let report: AddonVMReport;
  try {
    report = (await send({ type: "load", ref, wasmUri })) as AddonVMReport;
  } catch (e) {
    worker.terminate();
    throw e;
  }
  return asyncVM(report, (method, args) => send({ type: "call", method, args }), () => {
    failed ??= new Error("The addon VM was disposed");
    worker.terminate();
  });
}
