/**
 * Focus Shield (MAIN world) — while Floatbot is open, the host page
 * cannot observe blur / visibility / focus-loss from chatbot use.
 *
 * Uses capture blockers + property overrides only (no addEventListener
 * monkey-patch), so we don't show up in Permissions-Policy unload warnings.
 */
(function () {
  "use strict";

  if (window.__floatbotFocusShield) return;
  window.__floatbotFocusShield = true;

  let shieldActive = false;

  const blockedTypes = [
    "blur",
    "focus",
    "focusin",
    "focusout",
    "visibilitychange",
    "pagehide",
    "pageshow",
    "freeze",
    "resume",
  ];

  const captureBlocker = (event) => {
    if (!shieldActive) return;
    if (!blockedTypes.includes(event.type)) return;
    event.stopImmediatePropagation();
  };

  blockedTypes.forEach((type) => {
    window.addEventListener(type, captureBlocker, true);
    document.addEventListener(type, captureBlocker, true);
  });

  ["mouseleave", "mouseout"].forEach((type) => {
    document.addEventListener(
      type,
      (event) => {
        if (!shieldActive) return;
        if (event.target === document || event.target === document.documentElement) {
          event.stopImmediatePropagation();
        }
      },
      true
    );
  });

  const hiddenDesc =
    Object.getOwnPropertyDescriptor(Document.prototype, "hidden") ||
    Object.getOwnPropertyDescriptor(HTMLDocument.prototype, "hidden");
  const visDesc =
    Object.getOwnPropertyDescriptor(Document.prototype, "visibilityState") ||
    Object.getOwnPropertyDescriptor(HTMLDocument.prototype, "visibilityState");

  try {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      enumerable: true,
      get() {
        if (shieldActive) return false;
        return hiddenDesc && hiddenDesc.get ? hiddenDesc.get.call(this) : false;
      },
    });
  } catch (_) {}

  try {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      enumerable: true,
      get() {
        if (shieldActive) return "visible";
        return visDesc && visDesc.get ? visDesc.get.call(this) : "visible";
      },
    });
  } catch (_) {}

  try {
    const webkitHidden = Object.getOwnPropertyDescriptor(Document.prototype, "webkitHidden");
    if (webkitHidden && webkitHidden.get) {
      Object.defineProperty(document, "webkitHidden", {
        configurable: true,
        get() {
          if (shieldActive) return false;
          return webkitHidden.get.call(this);
        },
      });
    }
  } catch (_) {}

  const origHasFocus = Document.prototype.hasFocus;
  Document.prototype.hasFocus = function () {
    if (shieldActive) return true;
    return origHasFocus.call(this);
  };

  function syncFromAttr() {
    try {
      shieldActive = document.documentElement.getAttribute("data-floatbot-shield") === "1";
    } catch (_) {}
  }

  window.addEventListener("floatbot-shield", (e) => {
    shieldActive = !!(e.detail && e.detail.active);
  });

  try {
    const mo = new MutationObserver(syncFromAttr);
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-floatbot-shield"],
    });
    syncFromAttr();
  } catch (_) {}

  // Unlock text selection only while exam mode is on
  (function unlockSelection() {
    const style = document.createElement("style");
    style.id = "floatbot-select-unlock";
    style.textContent = `
      html[data-floatbot-exam="1"] , html[data-floatbot-exam="1"] body, html[data-floatbot-exam="1"] body *, html[data-floatbot-exam="1"] * {
        -webkit-user-select: text !important;
        -moz-user-select: text !important;
        -ms-user-select: text !important;
        user-select: text !important;
      }
    `;
    const mount = () => {
      if (document.getElementById("floatbot-select-unlock")) return;
      (document.head || document.documentElement).appendChild(style);
    };
    if (document.head || document.documentElement) mount();
    else document.addEventListener("DOMContentLoaded", mount, { once: true });

    const origPreventDefault = Event.prototype.preventDefault;
    Event.prototype.preventDefault = function () {
      const exam = document.documentElement.getAttribute("data-floatbot-exam") === "1";
      if (
        exam &&
        (this.type === "selectstart" ||
          this.type === "copy" ||
          this.type === "cut" ||
          this.type === "paste")
      ) {
        return;
      }
      return origPreventDefault.call(this);
    };
  })();
})();
