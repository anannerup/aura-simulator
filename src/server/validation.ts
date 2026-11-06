import { DEFAULT_ADDON_REF, type AuraCore, type ValidationResult } from "@/core";
import { getServerAuraCore } from "@/server/workspaces/aura-core";

/**
 * Validation and combat warnings for a state code, in Node (for the push API: merge the result into
 * the response as `validation`). Uses the shared server-side aura core of `ref`; its full addon VM
 * loads on the first call (~0.3 s) and stays loaded.
 */
export async function validateCode(
  code: string,
  options: { ref?: string; core?: AuraCore } = {},
): Promise<ValidationResult> {
  const core = options.core ?? (await getServerAuraCore(options.ref ?? DEFAULT_ADDON_REF));
  return core.validate(core.decode(code));
}
