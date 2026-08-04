/**
 * OA problem scrapers — site adapters + generic fallback.
 */
(function (global) {
  "use strict";

  function textOf(el) {
    if (!el) return "";
    return (el.innerText || el.textContent || "").replace(/\u00a0/g, " ").trim();
  }

  function first(selectors, root) {
    const r = root || document;
    for (const sel of selectors) {
      try {
        const el = r.querySelector(sel);
        if (el && textOf(el).length > 8) return el;
      } catch (_) {}
    }
    return null;
  }

  function clean(text, max) {
    const t = String(text || "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (max && t.length > max) return t.slice(0, max) + "\n…";
    return t;
  }

  function detectLanguage() {
    const candidates = [
      '[data-cy="lang-select"]',
      ".ant-select-selection-item",
      "#select2-language-container",
      'button[aria-haspopup="listbox"]',
      ".hr-monaco-language",
      ".select-language",
      '[class*="language"] button',
      ".current-language-name",
    ];
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      const t = textOf(el);
      if (t && t.length < 40) {
        const lower = t.toLowerCase();
        if (/python|java|c\+\+|c#|javascript|typescript|go|rust|kotlin|swift|ruby|php|scala|sql/.test(lower)) {
          return t;
        }
      }
    }
    const body = document.body?.innerText?.slice(0, 2000) || "";
    const m = body.match(/\b(Python3?|Java(?:script)?|TypeScript|C\+\+|C#|Go|Rust|Kotlin)\b/i);
    return m ? m[1] : "";
  }

  function scrapeLeetCode() {
    const title =
      textOf(first(['[data-cy="question-title"]', ".text-title-large", 'div[class*="title"] a'])) ||
      document.title.replace(/ - LeetCode.*/, "").trim();
    const desc = first([
      '[data-track-load="description_content"]',
      ".elfjS",
      'div[class*="description"] .content__u3I1',
      ".question-content",
      "#qd-content",
    ]);
    return {
      site: "leetcode",
      title,
      statement: clean(textOf(desc), 12000),
      language: detectLanguage(),
    };
  }

  function scrapeHackerRank() {
    const title =
      textOf(first([".challenge-title", "h1.ui-icon-label", ".challenge-name", "h2.challenge-title"])) ||
      document.title.replace(/ \| HackerRank.*/, "").trim();
    const desc = first([
      "#problem_statement",
      ".challenge-body-html",
      ".problem-statement",
      ".hackdown-content",
      "#challenge-statement",
    ]);
    return {
      site: "hackerrank",
      title,
      statement: clean(textOf(desc), 12000),
      language: detectLanguage(),
    };
  }

  function scrapeCodility() {
    const title = textOf(first([".task-title", "h1", ".nbr"])) || document.title;
    const desc = first([".task-description", "#task-description", ".description", "article"]);
    return {
      site: "codility",
      title: clean(title, 200),
      statement: clean(textOf(desc), 12000),
      language: detectLanguage(),
    };
  }

  function scrapeHackerEarth() {
    const title = textOf(first([".title", "h1", ".problem-title"])) || document.title;
    const desc = first([".problem-description", "#problem-statement", ".problem"]);
    return {
      site: "hackerearth",
      title: clean(title, 200),
      statement: clean(textOf(desc), 12000),
      language: detectLanguage(),
    };
  }

  function scrapeCodeSignal() {
    const title = textOf(first(["[data-testid='task-title']", "h1", ".task-title"])) || document.title;
    const desc = first(["[data-testid='task-description']", ".markdown", "article"]);
    return {
      site: "codesignal",
      title: clean(title, 200),
      statement: clean(textOf(desc), 12000),
      language: detectLanguage(),
    };
  }

  function scrapeGeneric() {
    const title = clean(document.title, 200);
    const main = first(["article", "main", "[role='main']", "#content", ".content"]);
    let statement = clean(textOf(main), 8000);
    if (statement.length < 80) {
      statement = clean(document.body?.innerText || "", 6000);
    }
    return {
      site: "generic",
      title,
      statement,
      language: detectLanguage(),
    };
  }

  function floatbotScrapeProblem() {
    const host = location.hostname || "";
    let result;
    if (/leetcode\.com/i.test(host)) result = scrapeLeetCode();
    else if (/hackerrank\.com/i.test(host)) result = scrapeHackerRank();
    else if (/codility\.com/i.test(host)) result = scrapeCodility();
    else if (/hackerearth\.com/i.test(host)) result = scrapeHackerEarth();
    else if (/codesignal\.com/i.test(host)) result = scrapeCodeSignal();
    else result = scrapeGeneric();

    if (!result.statement || result.statement.length < 40) {
      const g = scrapeGeneric();
      if (g.statement.length > (result.statement || "").length) {
        result.statement = g.statement;
        if (!result.title) result.title = g.title;
      }
    }

    result.url = location.href;
    result.scrapedAt = Date.now();
    return result;
  }

  function floatbotFormatProblemPrompt(problem) {
    const parts = [];
    if (problem.title) parts.push(problem.title);
    if (problem.language) parts.push(`Language: ${problem.language}`);
    if (problem.url) parts.push(problem.url);
    if (parts.length) parts.push("");
    parts.push(problem.statement || "");
    return parts.join("\n").trim();
  }

  global.floatbotScrapeProblem = floatbotScrapeProblem;
  global.floatbotFormatProblemPrompt = floatbotFormatProblemPrompt;
  global.floatbotDetectLanguage = detectLanguage;
})(typeof window !== "undefined" ? window : globalThis);
