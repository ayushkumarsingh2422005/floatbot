/**
 * Lightweight Markdown → HTML for Floatbot assistant replies.
 * Safe: escapes raw HTML; supports fences, inline code, emphasis, headings, lists, links.
 */
(function (global) {
  "use strict";

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderInline(text) {
    let s = escapeHtml(text);
    // links [text](url)
    s = s.replace(
      /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    );
    // inline code
    s = s.replace(/`([^`\n]+)`/g, '<code class="md-inline">$1</code>');
    // bold
    s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/__(.+?)__/g, "<strong>$1</strong>");
    // italic (avoid matching inside already-processed tags roughly)
    s = s.replace(/(^|[^*])\*([^*\n]+)\*([^*]|$)/g, "$1<em>$2</em>$3");
    s = s.replace(/(^|[^_])_([^_\n]+)_([^_]|$)/g, "$1<em>$2</em>$3");
    return s;
  }

  function floatbotRenderMarkdown(src) {
    if (!src) return "";

    const fences = [];
    let text = String(src).replace(/\r\n/g, "\n");

    // Extract fenced code blocks first
    text = text.replace(/```([^\n`]*)\n?([\s\S]*?)```/g, (_, lang, code) => {
      const i = fences.length;
      fences.push({
        lang: String(lang || "").trim(),
        code: String(code).replace(/\n$/, ""),
      });
      return `\n\n%%FENCE${i}%%\n\n`;
    });

    const lines = text.split("\n");
    const out = [];
    let i = 0;
    let listType = null; // 'ul' | 'ol'

    function closeList() {
      if (listType) {
        out.push(`</${listType}>`);
        listType = null;
      }
    }

    while (i < lines.length) {
      const line = lines[i];
      const fenceMatch = line.trim().match(/^%%FENCE(\d+)%%$/);
      if (fenceMatch) {
        closeList();
        const block = fences[+fenceMatch[1]];
        const langLabel = escapeHtml(block.lang || "code");
        out.push(
          `<div class="code-block">` +
            `<div class="code-toolbar">` +
            `<span class="code-lang">${langLabel}</span>` +
            `<div class="code-actions">` +
            `<button type="button" class="code-btn" data-code-action="copy" title="Copy code">Copy</button>` +
            `<button type="button" class="code-btn primary" data-code-action="insert" title="Insert at your cursor in the page">Insert</button>` +
            `</div></div>` +
            `<pre><code>${escapeHtml(block.code)}</code></pre>` +
            `</div>`
        );
        i++;
        continue;
      }

      if (!line.trim()) {
        closeList();
        i++;
        continue;
      }

      const heading = line.match(/^(#{1,3})\s+(.+)$/);
      if (heading) {
        closeList();
        const level = heading[1].length;
        out.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
        i++;
        continue;
      }

      const ul = line.match(/^\s*[-*+]\s+(.+)$/);
      if (ul) {
        if (listType !== "ul") {
          closeList();
          out.push("<ul>");
          listType = "ul";
        }
        out.push(`<li>${renderInline(ul[1])}</li>`);
        i++;
        continue;
      }

      const ol = line.match(/^\s*\d+\.\s+(.+)$/);
      if (ol) {
        if (listType !== "ol") {
          closeList();
          out.push("<ol>");
          listType = "ol";
        }
        out.push(`<li>${renderInline(ol[1])}</li>`);
        i++;
        continue;
      }

      const quote = line.match(/^\s*>\s?(.*)$/);
      if (quote) {
        closeList();
        out.push(`<blockquote>${renderInline(quote[1])}</blockquote>`);
        i++;
        continue;
      }

      // Paragraph: gather consecutive plain lines
      closeList();
      const para = [line];
      i++;
      while (i < lines.length) {
        const next = lines[i];
        if (!next.trim()) break;
        if (/^%%FENCE\d+%%$/.test(next.trim())) break;
        if (/^#{1,3}\s+/.test(next)) break;
        if (/^\s*[-*+]\s+/.test(next)) break;
        if (/^\s*\d+\.\s+/.test(next)) break;
        if (/^\s*>/.test(next)) break;
        para.push(next);
        i++;
      }
      out.push(`<p>${para.map(renderInline).join("<br>")}</p>`);
    }

    closeList();
    return out.join("");
  }

  global.floatbotRenderMarkdown = floatbotRenderMarkdown;
  global.floatbotEscapeHtml = escapeHtml;
})(typeof window !== "undefined" ? window : globalThis);
