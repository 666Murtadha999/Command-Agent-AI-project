/**
 * Tiny markdown renderer — enough for the mock agent's output (bold, inline
 * code, fenced code blocks, lists, paragraphs). Avoids pulling in a full
 * markdown lib for the MVP.
 */
import { useMemo } from "react";

export function MarkdownLite({ text }: { text: string }) {
  const blocks = useMemo(() => parse(text ?? ""), [text]);
  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {blocks.map((b, i) => {
        if (b.type === "code") {
          return (
            <pre
              key={i}
              className="font-mono text-xs bg-muted/40 border border-border rounded-md p-3 overflow-x-auto"
            >
              {b.content}
            </pre>
          );
        }
        if (b.type === "list") {
          return (
            <ul key={i} className="list-disc pl-5 space-y-1">
              {b.items.map((it, j) => (
                <li key={j}>
                  <InlineFmt text={it} />
                </li>
              ))}
            </ul>
          );
        }
        if (b.type === "olist") {
          return (
            <ol key={i} className="list-decimal pl-5 space-y-1">
              {b.items.map((it, j) => (
                <li key={j}>
                  <InlineFmt text={it} />
                </li>
              ))}
            </ol>
          );
        }
        return (
          <p key={i} className="whitespace-pre-wrap">
            <InlineFmt text={b.content} />
          </p>
        );
      })}
    </div>
  );
}

function InlineFmt({ text }: { text: string }) {
  // Split into segments handling **bold** and `code`.
  const parts: Array<{ k: "t" | "b" | "c"; v: string }> = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ k: "t", v: text.slice(last, m.index) });
    if (m[0].startsWith("**")) parts.push({ k: "b", v: m[0].slice(2, -2) });
    else parts.push({ k: "c", v: m[0].slice(1, -1) });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ k: "t", v: text.slice(last) });
  return (
    <>
      {parts.map((p, i) =>
        p.k === "b" ? (
          <strong key={i}>{p.v}</strong>
        ) : p.k === "c" ? (
          <code key={i} className="font-mono text-xs bg-muted/40 px-1 py-0.5 rounded">
            {p.v}
          </code>
        ) : (
          <span key={i}>{p.v}</span>
        )
      )}
    </>
  );
}

type Block =
  | { type: "p"; content: string }
  | { type: "code"; content: string }
  | { type: "list"; items: string[] }
  | { type: "olist"; items: string[] };

function parse(text: string): Block[] {
  const lines = text.split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("```")) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        buf.push(lines[i]);
        i++;
      }
      i++; // closing fence
      blocks.push({ type: "code", content: buf.join("\n") });
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      blocks.push({ type: "list", items });
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      blocks.push({ type: "olist", items });
      continue;
    }
    if (line.trim() === "") {
      i++;
      continue;
    }
    // paragraph: consume until blank or special line
    const buf: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].startsWith("```") &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i])
    ) {
      buf.push(lines[i]);
      i++;
    }
    blocks.push({ type: "p", content: buf.join("\n") });
  }
  return blocks;
}
