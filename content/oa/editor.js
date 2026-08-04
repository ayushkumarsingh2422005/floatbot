/**
 * Isolated-world helper to talk to MAIN editor bridge (all frames).
 */
(function (global) {
  "use strict";

  const pending = new Map();
  let seq = 0;

  function onResult(data) {
    if (!data || data.source !== "floatbot-editor") return;
    if (data.type === "TYPED_DONE") return;
    const { requestId, result } = data;
    const entry = pending.get(requestId);
    if (!entry) return;
    entry.replies.push({ result, frame: data.frame, isTop: data.isTop });
    if (result?.ok) entry.resolveBest();
  }

  window.addEventListener("message", (event) => onResult(event.data));
  document.documentElement.addEventListener("floatbot-editor-res", (event) => {
    onResult(event.detail);
  });

  function request(action, payload = {}, timeoutMs = 1500) {
    return new Promise((resolve) => {
      const requestId = `fb-${Date.now()}-${++seq}`;
      const replies = [];
      let done = false;
      const finish = (value) => {
        if (done) return;
        done = true;
        pending.delete(requestId);
        resolve(value);
      };
      const entry = {
        action,
        replies,
        resolveBest() {
          const ok = replies.filter((r) => r.result?.ok);
          if (!ok.length) return;
          ok.sort((a, b) => {
            const ac = (a.result.code || "").length;
            const bc = (b.result.code || "").length;
            if (bc !== ac) return bc - ac;
            return (b.isTop ? 1 : 0) - (a.isTop ? 1 : 0);
          });
          finish(ok[0].result);
        },
      };
      pending.set(requestId, entry);

      const msg = { source: "floatbot-ui", requestId, action, ...payload };

      // Dual channel: postMessage + CustomEvent (cross-world)
      window.postMessage(msg, "*");
      try {
        document.documentElement.dispatchEvent(
          new CustomEvent("floatbot-editor-req", { detail: msg, bubbles: true })
        );
      } catch (_) {}

      try {
        if (window.top && window.top !== window) window.top.postMessage(msg, "*");
      } catch (_) {}
      try {
        document.querySelectorAll("iframe").forEach((f) => {
          try {
            f.contentWindow?.postMessage(msg, "*");
          } catch (_) {}
        });
      } catch (_) {}

      setTimeout(() => {
        if (done) return;
        if (replies.length) {
          const ok = replies.find((r) => r.result?.ok);
          finish(ok ? ok.result : replies[replies.length - 1].result);
        } else {
          finish({ ok: false, error: "Editor bridge timeout" });
        }
      }, timeoutMs);
    });
  }

  global.floatbotEditorRead = () => request("read", {}, 2000);
  global.floatbotEditorWrite = (code, opts) =>
    request("write", { code, typed: !!(opts && opts.typed) }, opts?.typed ? 4000 : 2500);
  global.floatbotEditorFocus = () => request("focus", {}, 800);
  global.floatbotEditorPing = () => request("ping", {}, 800);
})(typeof window !== "undefined" ? window : globalThis);
