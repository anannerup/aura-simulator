import type { AuraCore, DecodedState } from "@/core";
import { stateFromNode, stateKey, type WorkspaceNode } from "@/workspace";

/** Codes remembered by content; enough for every top-level aura of a large workspace between decode and first use. */
const KNOWN_LIMIT = 512;

/**
 * State codes of workspace items through the aura core. An aura whose content came from a code (pasted, pushed,
 * stored) shows that very code again: a re-encode would change the table order and so the text.
 */
export class StateCodes {
  /** Per node (nodes are immutable, so identity is a safe key). */
  private readonly byNode = new WeakMap<WorkspaceNode, string>();
  /** Decoded codes by content (`stateKey`), oldest first. */
  private readonly known = new Map<string, string>();

  constructor(private readonly core: Pick<AuraCore, "decode" | "encode">) {}

  /** Decodes a code (throws for anything the addon wouldn't import) and remembers it for its content. */
  decode(code: string): DecodedState {
    const state = this.core.decode(code);
    const key = stateKey(state);
    this.known.delete(key);
    this.known.set(key, code);
    if (this.known.size > KNOWN_LIMIT) this.known.delete(this.known.keys().next().value!);
    return state;
  }

  /** Remembers the codes a file or storage carries; those that don't decode are ignored (they'll be encoded afresh). */
  learn(codes: string[]) {
    for (const code of codes) {
      try {
        this.decode(code);
      } catch {
        // not for this addon version, or broken
      }
    }
  }

  /** An aura's state code (a group's holds its descendants). Throws when the addon can't encode it. */
  of(node: WorkspaceNode): string {
    let code = this.byNode.get(node);
    if (!code) {
      const state = stateFromNode(node);
      code = this.known.get(stateKey(state)) ?? this.core.encode(state);
      this.byNode.set(node, code);
    }
    return code;
  }
}
