/**
 * Background — chat (non-stream) + streaming via long-lived port.
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "FLOATBOT_CHAT") return false;

  (async () => {
    try {
      const url = `${message.apiBase.replace(/\/$/, "")}/chat/completions`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${message.apiKey}`,
        },
        body: JSON.stringify(message.body),
      });

      const text = await res.text();
      let data = null;
      try {
        data = JSON.parse(text);
      } catch (_) {
        data = { raw: text };
      }

      if (!res.ok) {
        const errMsg =
          data?.error?.message || data?.message || text || `HTTP ${res.status}`;
        sendResponse({ ok: false, error: errMsg, status: res.status });
        return;
      }

      sendResponse({ ok: true, data });
    } catch (err) {
      sendResponse({ ok: false, error: err.message || String(err) });
    }
  })();

  return true;
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "floatbot-stream") return;

  let aborted = false;
  port.onMessage.addListener(async (message) => {
    if (message?.type === "ABORT") {
      aborted = true;
      return;
    }
    if (message?.type !== "START") return;

    aborted = false;
    try {
      const url = `${message.apiBase.replace(/\/$/, "")}/chat/completions`;
      const body = { ...message.body, stream: true };
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${message.apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        let errMsg = text;
        try {
          const j = JSON.parse(text);
          errMsg = j?.error?.message || j?.message || text;
        } catch (_) {}
        port.postMessage({ type: "error", error: errMsg || `HTTP ${res.status}` });
        return;
      }

      if (!res.body || !res.body.getReader) {
        // Fallback: non-stream response body
        const text = await res.text();
        try {
          const data = JSON.parse(text);
          const content = data?.choices?.[0]?.message?.content || "";
          port.postMessage({ type: "chunk", text: content });
          port.postMessage({
            type: "done",
            usage: data?.usage || null,
          });
        } catch (err) {
          port.postMessage({ type: "error", error: err.message || String(err) });
        }
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let usage = null;

      while (!aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === "[DONE]") continue;
          try {
            const json = JSON.parse(payload);
            if (json.usage) usage = json.usage;
            const delta = json.choices?.[0]?.delta?.content;
            if (delta) port.postMessage({ type: "chunk", text: delta });
          } catch (_) {}
        }
      }

      if (aborted) {
        try {
          reader.cancel();
        } catch (_) {}
        port.postMessage({ type: "aborted" });
      } else {
        port.postMessage({ type: "done", usage });
      }
    } catch (err) {
      port.postMessage({ type: "error", error: err.message || String(err) });
    }
  });
});
