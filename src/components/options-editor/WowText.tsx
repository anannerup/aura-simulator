import { WowString } from "@/render/WowString";

/** Option text as the game shows it: `|c` colour escapes become coloured spans. */
export function WowText({ text }: { text: unknown }) {
  return <WowString text={text} />;
}
