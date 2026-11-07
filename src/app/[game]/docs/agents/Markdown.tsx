import type { ReactNode } from "react";

/**
 * Renders the small Markdown subset the agent docs use: #-headings (to ####), paragraphs, "- " lists,
 * fenced code blocks, `inline code` and **bold**. Keeps the docs one Markdown source for people and agents.
 */
export function Markdown({ source }: { source: string }) {
  const blocks: ReactNode[] = [];
  const lines = source.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const key = blocks.length;
    if (line.startsWith("```")) {
      const body: string[] = [];
      for (i++; i < lines.length && !lines[i].startsWith("```"); i++) body.push(lines[i]);
      i++;
      blocks.push(
        <pre key={key}>
          <code>{body.join("\n")}</code>
        </pre>,
      );
    } else if (/^#{1,4} /.test(line)) {
      const level = line.indexOf(" ");
      const text = inline(line.slice(level + 1));
      const Heading = (["h1", "h2", "h3", "h4"] as const)[level - 1];
      blocks.push(<Heading key={key}>{text}</Heading>);
      i++;
    } else if (line.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && (lines[i].startsWith("- ") || (lines[i].startsWith("  ") && items.length))) {
        if (lines[i].startsWith("- ")) items.push(lines[i].slice(2));
        else items[items.length - 1] += ` ${lines[i].trim()}`;
        i++;
      }
      blocks.push(
        <ul key={key}>
          {items.map((item, n) => (
            <li key={n}>{inline(item)}</li>
          ))}
        </ul>,
      );
    } else if (line.trim() === "") {
      i++;
    } else {
      const para: string[] = [];
      while (i < lines.length && lines[i].trim() !== "" && !/^(#{1,4} |- |```)/.test(lines[i])) para.push(lines[i++]);
      blocks.push(<p key={key}>{inline(para.join(" "))}</p>);
    }
  }
  return <>{blocks}</>;
}

function inline(text: string): ReactNode[] {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*)/).map((part, n) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 1) return <code key={n}>{part.slice(1, -1)}</code>;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 3) return <strong key={n}>{part.slice(2, -2)}</strong>;
    return part;
  });
}
