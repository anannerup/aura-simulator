import type { AddonSourceFetcher } from "../addon-source";
import type { AuraPacks, NewAuraPage, OptionAddress, OptionEdit, OptionsTree } from "./options";
import type { AddonVMReport, Registries, VMState } from "./vm";
import type { LuaObject } from "../lua-value";
import type { ValidationResult } from "./validation";

/** The full addon VM seen from outside: the same calls as AddonVM, asynchronous (inline or in a Web Worker). */
export interface AsyncAddonVM {
  readonly report: AddonVMReport;
  fillDefaults(state: VMState): Promise<VMState>;
  validate(state: VMState): Promise<ValidationResult>;
  registries(): Promise<Registries>;
  options(state: VMState, request?: { tab?: string }): Promise<OptionsTree>;
  setOption(state: VMState, address: OptionAddress, value: unknown): Promise<OptionEdit<LuaObject>>;
  newAuraPage(): Promise<NewAuraPage>;
  newAura(regionType: string, sourceData?: LuaObject): Promise<LuaObject>;
  packs(): Promise<AuraPacks>;
  /** Stops the VM (terminates the worker). */
  dispose(): void;
}

type Method = "fillDefaults" | "validate" | "registries" | "options" | "setOption" | "newAuraPage" | "newAura" | "packs";

/** Messages between the page and the worker. */
export type ToWorker =
  | { type: "load"; id: number; ref: string; wasmUri?: string }
  | { type: "call"; id: number; method: Method; args: unknown[] }
  | { type: "fetched"; id: number; text?: string; error?: string };

export type FromWorker =
  | { type: "result"; id: number; value: unknown }
  | { type: "error"; id: number; name: string; message: string }
  | { type: "fetch"; id: number; path: string };

/** Loads the full addon VM in an in-process Lua VM (Node, tests, or a page without workers). */
export async function loadInlineAddonVM(
  ref: string,
  options: { fetchSource: AddonSourceFetcher; wasmUri?: string },
): Promise<AsyncAddonVM> {
  const { loadAddonVM } = await import("./vm");
  const vm = await loadAddonVM(ref, options);
  return {
    report: vm.report,
    fillDefaults: async (state) => vm.fillDefaults(state),
    validate: async (state) => vm.validate(state),
    registries: async () => vm.registries(),
    options: async (state, request) => vm.options(state, request),
    setOption: async (state, address, value) => vm.setOption(state, address, value),
    newAuraPage: async () => vm.newAuraPage(),
    newAura: async (regionType, sourceData) => vm.newAura(regionType, sourceData),
    packs: async () => vm.packs(),
    dispose() {},
  };
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

  type Request = { type: "load"; ref: string; wasmUri?: string } | { type: "call"; method: Method; args: unknown[] };
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
  const call = <T>(method: Method, ...args: unknown[]) =>
    send({ type: "call", method, args }) as Promise<T>;
  return {
    report,
    fillDefaults: (state) => call<VMState>("fillDefaults", state),
    validate: (state) => call<ValidationResult>("validate", state),
    registries: () => call<Registries>("registries"),
    options: (state, request) => call<OptionsTree>("options", state, request),
    setOption: (state, address, value) => call<OptionEdit<LuaObject>>("setOption", state, address, value),
    newAuraPage: () => call<NewAuraPage>("newAuraPage"),
    newAura: (regionType, sourceData) => call<LuaObject>("newAura", regionType, sourceData),
    packs: () => call<AuraPacks>("packs"),
    dispose: () => worker.terminate(),
  };
}
