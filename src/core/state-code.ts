/**
 * A state code: `!WA:<n>!` and LibDeflate's print-safe alphabet. Transmission.lua's StringToTable reads every n ≥ 2
 * alike (LibDeflate + LibSerialize); older strings (`!WA:1!`, `!…`, bare: AceSerializer/LibCompress) aren't loaded here.
 */
const STATE_CODE = /!WA:(?:[2-9]|[1-9]\d+)![A-Za-z0-9()]+/;
const WHOLE = new RegExp(`^${STATE_CODE.source}$`);
const EVERY = new RegExp(STATE_CODE.source, "g");

/** Cheap shape check (no decoding) of a whole text, ignoring surrounding whitespace. */
export const isStateCode = (text: string): boolean => WHOLE.test(text.trim());

/** Every state code in a text, in order. Codes end at the first character outside their alphabet. */
export const findStateCodes = (text: string): string[] => Array.from(text.matchAll(EVERY), (m) => m[0]);
