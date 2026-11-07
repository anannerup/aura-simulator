/** A numeric comparison as the addon's generated checks write it (`value op threshold`; "=" is "=="). */
export function compare(a: number, op: string, b: number): boolean {
  switch (op) {
    case "<":
      return a < b;
    case "<=":
      return a <= b;
    case ">":
      return a > b;
    case ">=":
      return a >= b;
    case "==":
    case "=":
      return a === b;
    case "~=":
      return a !== b;
    default:
      return false;
  }
}
