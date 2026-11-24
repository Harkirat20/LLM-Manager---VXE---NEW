import { Fragment, type ReactNode } from "react";

/** Minimal markdown renderer — headings, lists, code fences, bold/italic,
 *  inline code, links, quotes, hr. Enough for assistant prose without
 *  pulling a full parser into the bundle. */

function renderInline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // inline code | bold | italic | link
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)|(\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyBase}-${i++}`;
    if (tok.startsWith("`")) {
      nodes.push(<code key={key}>{tok.slice(1, -1)}</code>);
    } else if (tok.startsWith("**")) {
      nodes.push(<strong key={key}>{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith("[")) {
      const mm = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(tok);
      if (mm) {
        nodes.push(
          <a key={key} href={mm[2]} target="_blank" rel="noreferrer">
            {mm[1]}
          </a>,
        );
      } else {
        nodes.push(tok);
      }
    } else {
      nodes.push(<em key={key}>{tok.slice(1, -1)}</em>);
    }
    last = m.index + tok.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // fenced code
    if (line.trimStart().startsWith("```")) {
      const lang = line.trim().slice(3).trim();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        buf.push(lines[i]);
        i++;
      }
      i++; // closing fence (or EOF)
      out.push(
        <pre key={key++} data-lang={lang}>
          <code>{buf.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    // heading
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      const content = renderInline(h[2], `h${key}`);
      out.push(
        level === 1 ? (
          <h1 key={key++}>{content}</h1>
        ) : level === 2 ? (
          <h2 key={key++}>{content}</h2>
        ) : (
          <h3 key={key++}>{content}</h3>
        ),
      );
      i++;
      continue;
    }

    // hr
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      out.push(<hr key={key++} />);
      i++;
      continue;
    }

    // blockquote
    if (line.trimStart().startsWith(">")) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith(">")) {
        buf.push(lines[i].trimStart().replace(/^>\s?/, ""));
        i++;
      }
      out.push(
        <blockquote key={key++}>
          {renderInline(buf.join(" "), `q${key}`)}
        </blockquote>,
      );
      continue;
    }

    // unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      out.push(
        <ul key={key++}>
          {items.map((it, n) => (
            <li key={n}>{renderInline(it, `ul${key}-${n}`)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    // ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      out.push(
        <ol key={key++}>
          {items.map((it, n) => (
            <li key={n}>{renderInline(it, `ol${key}-${n}`)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    // blank
    if (!line.trim()) {
      i++;
      continue;
    }

    // paragraph — merge until blank/special
    const buf: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !lines[i].trimStart().startsWith("```") &&
      !/^(#{1,4})\s+/.test(lines[i]) &&
      !lines[i].trimStart().startsWith(">")
    ) {
      buf.push(lines[i]);
      i++;
    }
    out.push(
      <p key={key++}>
        {renderInline(buf.join(" "), `p${key}`)}
      </p>,
    );
  }

  return (
    <div className="md">
      {out.map((n, idx) => (
        <Fragment key={idx}>{n}</Fragment>
      ))}
    </div>
  );
}
