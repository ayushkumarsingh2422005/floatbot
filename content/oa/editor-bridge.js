/**
 * MAIN-world editor bridge — Monaco / CodeMirror / Ace / textarea.
 * Uses CustomEvent + postMessage so isolated world can always reach us.
 */
(function () {
  "use strict";
  if (window.__floatbotEditorBridge) return;
  window.__floatbotEditorBridge = true;

  const SOURCE = "floatbot-editor";

  function isOurUi(el) {
    if (!el || !el.closest) return false;
    return !!(el.closest("#floatbot-root") || el.closest("#fb-root") || el.closest("[data-floatbot]"));
  }

  function getMonacoApi() {
    if (window.monaco?.editor) return window.monaco;
    try {
      if (typeof window.require === "function") {
        const mod =
          window.require("vs/editor/editor.main") ||
          window.require("vs/editor/editor.api") ||
          window.require("monaco-editor");
        if (mod?.editor) return mod;
      }
    } catch (_) {}
    // Scan globals for a monaco-like API
    try {
      for (const key of Object.keys(window)) {
        try {
          const v = window[key];
          if (v && v.editor && typeof v.editor.getModels === "function") return v;
        } catch (_) {}
      }
    } catch (_) {}
    return null;
  }

  function findMonaco() {
    const monaco = getMonacoApi();
    if (!monaco?.editor) return null;

    try {
      if (typeof monaco.editor.getEditors === "function") {
        const eds = monaco.editor.getEditors().filter((ed) => {
          try {
            const node = ed.getDomNode?.();
            return node && !isOurUi(node) && node.offsetParent !== null;
          } catch (_) {
            return true;
          }
        });
        if (eds.length) {
          // Prefer focused / largest
          const focused = eds.find((ed) => ed.hasTextFocus?.());
          return focused || eds[eds.length - 1];
        }
      }

      const models = monaco.editor.getModels?.() || [];
      if (models.length) {
        const model = models[models.length - 1];
        // Prefer an editor bound to this model
        if (typeof monaco.editor.getEditors === "function") {
          const eds = monaco.editor.getEditors();
          const bound = eds.find((ed) => ed.getModel?.() === model);
          if (bound) return bound;
        }
        return {
          getValue: () => model.getValue(),
          setValue: (v) => model.setValue(v),
          getModel: () => model,
        };
      }
    } catch (_) {}
    return null;
  }

  function findCodeMirror() {
    const nodes = document.querySelectorAll(".CodeMirror");
    for (const n of nodes) {
      if (isOurUi(n)) continue;
      if (n.CodeMirror) return n.CodeMirror;
    }
    const cm6 = document.querySelectorAll(".cm-editor");
    for (const n of cm6) {
      if (isOurUi(n)) continue;
      if (n.cmView?.view) return { __cm6: n.cmView.view };
      // CM6 sometimes stores view on parent
      if (n.parentElement?.cmView?.view) return { __cm6: n.parentElement.cmView.view };
    }
    return null;
  }

  function findAce() {
    try {
      if (typeof ace === "undefined" || !ace.edit) return null;
      const nodes = document.querySelectorAll(".ace_editor");
      for (const n of nodes) {
        if (isOurUi(n)) continue;
        try {
          const ed = ace.edit(n);
          if (ed) return ed;
        } catch (_) {}
      }
    } catch (_) {}
    return null;
  }

  function findTextarea() {
    const areas = [...document.querySelectorAll("textarea")].filter((t) => {
      if (isOurUi(t)) return false;
      if (t.classList.contains("inputarea")) return false; // monaco hidden textarea
      const r = t.getBoundingClientRect();
      return r.width > 160 && r.height > 80 && t.offsetParent !== null;
    });
    if (!areas.length) return null;
    areas.sort((a, b) => b.clientHeight * b.clientWidth - a.clientHeight * a.clientWidth);
    return areas[0];
  }

  function getEditor() {
    const monaco = findMonaco();
    if (monaco) return { type: "monaco", ed: monaco };
    const cm = findCodeMirror();
    if (cm) return { type: cm.__cm6 ? "cm6" : "cm5", ed: cm };
    const aceEd = findAce();
    if (aceEd) return { type: "ace", ed: aceEd };
    const ta = findTextarea();
    if (ta) return { type: "textarea", ed: ta };
    return null;
  }

  function focusMonacoDom() {
    const node =
      document.querySelector(".monaco-editor.focused") ||
      document.querySelector(".monaco-editor");
    if (!node || isOurUi(node)) return null;
    const ta = node.querySelector("textarea.inputarea") || node.querySelector("textarea");
    try {
      (ta || node).focus();
    } catch (_) {}
    return ta || node;
  }

  function readCode() {
    const found = getEditor();
    if (!found) return { ok: false, error: "No editor found" };
    const { type, ed } = found;
    try {
      if (type === "monaco") return { ok: true, type, code: ed.getValue() };
      if (type === "cm5") return { ok: true, type, code: ed.getValue() };
      if (type === "cm6") {
        const view = ed.__cm6 || ed;
        return { ok: true, type, code: view.state.doc.toString() };
      }
      if (type === "ace") return { ok: true, type, code: ed.getValue() };
      if (type === "textarea") return { ok: true, type, code: ed.value };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
    return { ok: false, error: "Unsupported editor" };
  }

  function writeMonaco(ed, code) {
    if (typeof ed.setValue === "function") {
      ed.setValue(code);
      return true;
    }
    const model = ed.getModel?.();
    if (model && typeof model.setValue === "function") {
      model.setValue(code);
      return true;
    }
    // Push full-range edit
    if (typeof ed.executeEdits === "function" && model) {
      const full = model.getFullModelRange?.();
      if (full) {
        ed.executeEdits("floatbot", [{ range: full, text: code }]);
        return true;
      }
    }
    return false;
  }

  function writeCode(code, { typed = false } = {}) {
    const found = getEditor();
    if (!found) {
      // Last resort: focus monaco textarea — caller may paste
      const el = focusMonacoDom();
      return {
        ok: false,
        error: "No editor API found",
        canPaste: !!el,
      };
    }
    const { type, ed } = found;
    try {
      if (typed && type === "textarea") return typeInto(ed, code);

      if (type === "monaco") {
        if (!writeMonaco(ed, code)) return { ok: false, error: "Monaco write failed" };
        try {
          ed.focus?.();
        } catch (_) {}
        return { ok: true, type };
      }
      if (type === "cm5") {
        ed.setValue(code);
        ed.focus?.();
        return { ok: true, type };
      }
      if (type === "cm6") {
        const view = ed.__cm6 || ed;
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: code },
        });
        view.focus?.();
        return { ok: true, type };
      }
      if (type === "ace") {
        ed.setValue(code, -1);
        ed.focus?.();
        return { ok: true, type };
      }
      if (type === "textarea") {
        const proto = window.HTMLTextAreaElement.prototype;
        const desc = Object.getOwnPropertyDescriptor(proto, "value");
        if (desc?.set) desc.set.call(ed, code);
        else ed.value = code;
        ed.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertFromPaste", data: code }));
        ed.dispatchEvent(new Event("change", { bubbles: true }));
        ed.focus();
        return { ok: true, type };
      }
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
    return { ok: false, error: "Unsupported editor" };
  }

  function typeInto(el, code) {
    (async () => {
      el.focus();
      const proto = window.HTMLTextAreaElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, "value");
      let value = "";
      for (let i = 0; i < code.length; i++) {
        value += code[i];
        if (desc?.set) desc.set.call(el, value);
        else el.value = value;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        if (i % 3 === 0) await new Promise((r) => setTimeout(r, 4 + Math.random() * 8));
      }
      el.dispatchEvent(new Event("change", { bubbles: true }));
      reply({ type: "TYPED_DONE", frame: location.href });
    })();
    return { ok: true, type: "textarea", typing: true };
  }

  function reply(payload) {
    window.postMessage({ source: SOURCE, ...payload }, "*");
    try {
      document.documentElement.dispatchEvent(
        new CustomEvent("floatbot-editor-res", { detail: { source: SOURCE, ...payload }, bubbles: true })
      );
    } catch (_) {}
  }

  function handleRequest(data) {
    if (!data || data.source !== "floatbot-ui") return;
    const { requestId, action, code, typed } = data;
    let result;
    if (action === "read") result = readCode();
    else if (action === "write") result = writeCode(code || "", { typed: !!typed });
    else if (action === "ping") result = { ok: true, type: getEditor()?.type || "none" };
    else if (action === "focus") {
      const el = focusMonacoDom();
      result = { ok: !!el, type: el ? "focus" : "none" };
    } else result = { ok: false, error: "Unknown action" };

    reply({
      requestId,
      result,
      frame: location.href,
      isTop: window === window.top,
    });
  }

  window.addEventListener("message", (event) => handleRequest(event.data));
  document.documentElement.addEventListener("floatbot-editor-req", (event) => {
    handleRequest(event.detail);
  });
})();
