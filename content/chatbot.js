/**
 * Floatbot — floating bubble + AI chatbot panel (Shadow DOM).
 */
(function () {
  "use strict";

  if (window.__floatbotInjected) return;
  window.__floatbotInjected = true;

  const DEFAULTS = typeof FLOATBOT_DEFAULTS !== "undefined"
    ? FLOATBOT_DEFAULTS
    : {
        apiKey: "",
        apiBase: "https://api.openai.com/v1",
        provider: "openai",
        model: "gpt-4o-mini",
        corner: "bottom-right",
        bubbleSize: 56,
        bubbleOpacity: 1,
        chatOpacity: 0.98,
        chatFontSize: 13.5,
        examMode: false,
        typedInsert: false,
        streamEnabled: true,
        persistChats: true,
        systemPrompt:
          "You are Floatbot, a coding interview / OA assistant. Be concise.",
      };

  const MODELS = typeof FLOATBOT_MODELS !== "undefined"
    ? FLOATBOT_MODELS
    : [{ id: "gpt-4o-mini", label: "GPT-4o Mini", tag: "Lite" }];

  let settings = { ...DEFAULTS };
  let open = false;
  let messages = [];
  let sending = false;
  let corner = "bottom-right";
  const CORNERS = ["bottom-right", "bottom-left", "top-right", "top-left"];
  const EDGE = 22;

  function bubbleSizePx() {
    const n = Number(settings.bubbleSize);
    return Number.isFinite(n) ? Math.min(80, Math.max(40, n)) : 56;
  }

  // ── Root host + Shadow DOM ──────────────────────────────────────────
  const host = document.createElement("div");
  host.id = "floatbot-root";
  host.setAttribute("data-floatbot", "1");
  // Full-viewport host so fixed children receive clicks; page stays clickable via pointer-events:none
  Object.assign(host.style, {
    position: "fixed",
    zIndex: "2147483647",
    top: "0",
    left: "0",
    width: "100vw",
    height: "100vh",
    margin: "0",
    padding: "0",
    border: "none",
    overflow: "visible",
    pointerEvents: "none",
    background: "transparent",
  });
  (document.body || document.documentElement).appendChild(host);

  // Page-level CSS unlock only in exam mode (applied later via applyExamMode)
  const unlockStyle = document.createElement("style");
  unlockStyle.id = "floatbot-select-unlock-cs";
  unlockStyle.disabled = true;
  unlockStyle.textContent = `
    html, body, body * {
      -webkit-user-select: text !important;
      -moz-user-select: text !important;
      -ms-user-select: text !important;
      user-select: text !important;
    }
  `;
  (document.head || document.documentElement).appendChild(unlockStyle);

  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `
    :host {
      all: initial;
      position: fixed !important;
      inset: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      pointer-events: none !important;
      z-index: 2147483647 !important;
      display: block !important;
    }

    * {
      box-sizing: border-box;
      font-family: "Segoe UI", "Helvetica Neue", sans-serif;
    }

    .bubble {
      position: fixed;
      width: var(--fb-bubble-size, 56px);
      height: var(--fb-bubble-size, 56px);
      opacity: var(--fb-bubble-opacity, 1);
      border-radius: 50%;
      border: none;
      cursor: grab;
      pointer-events: auto !important;
      touch-action: none;
      background: linear-gradient(145deg, #0d7377 0%, #14919b 45%, #0a4d52 100%);
      box-shadow:
        0 8px 28px rgba(13, 115, 119, 0.45),
        0 2px 6px rgba(0, 0, 0, 0.18);
      display: flex;
      align-items: center;
      justify-content: center;
      transition:
        transform 0.22s cubic-bezier(0.34, 1.4, 0.64, 1),
        box-shadow 0.22s ease,
        top 0.25s ease,
        left 0.25s ease,
        right 0.25s ease,
        bottom 0.25s ease,
        opacity 0.2s ease;
      z-index: 2147483647;
      top: auto;
      left: auto;
      right: 22px;
      bottom: 22px;
    }

    .bubble.corner-bottom-right { top: auto; left: auto; right: 22px; bottom: 22px; }
    .bubble.corner-bottom-left  { top: auto; right: auto; left: 22px; bottom: 22px; }
    .bubble.corner-top-right    { bottom: auto; left: auto; right: 22px; top: 22px; }
    .bubble.corner-top-left     { bottom: auto; right: auto; left: 22px; top: 22px; }

    .bubble.dragging {
      cursor: grabbing;
      transition: none;
      transform: scale(1.06);
      box-shadow:
        0 14px 36px rgba(13, 115, 119, 0.55),
        0 4px 10px rgba(0, 0, 0, 0.25);
    }

    .bubble:hover:not(.dragging) {
      transform: scale(1.08);
      box-shadow:
        0 12px 32px rgba(13, 115, 119, 0.55),
        0 4px 10px rgba(0, 0, 0, 0.2);
    }

    .bubble:active:not(.dragging) { transform: scale(0.96); }

    .bubble.open {
      background: linear-gradient(145deg, #1a1a1a 0%, #333 100%);
    }

    .bubble svg {
      width: calc(var(--fb-bubble-size, 56px) * 0.46);
      height: calc(var(--fb-bubble-size, 56px) * 0.46);
      fill: #fff;
      pointer-events: none;
    }

    .panel {
      position: fixed;
      width: min(380px, calc(100vw - 32px));
      height: min(520px, calc(100vh - 120px));
      pointer-events: auto !important;
      display: flex;
      flex-direction: column;
      border-radius: 18px;
      overflow: hidden;
      font-size: var(--fb-chat-font, 13.5px);
      background:
        linear-gradient(165deg, rgba(250, 252, 252, 0.98) 0%, rgba(232, 242, 242, 0.98) 100%);
      box-shadow:
        0 20px 50px rgba(10, 40, 45, 0.28),
        0 0 0 1px rgba(13, 115, 119, 0.12);
      opacity: 0;
      transform: translateY(16px) scale(0.96);
      transition:
        opacity 0.2s ease,
        transform 0.22s cubic-bezier(0.34, 1.2, 0.64, 1),
        top 0.25s ease,
        left 0.25s ease,
        right 0.25s ease,
        bottom 0.25s ease;
      visibility: hidden;
      z-index: 2147483647;
      top: auto;
      left: auto;
      right: 22px;
      bottom: calc(var(--fb-bubble-size, 56px) + 34px);
      transform-origin: bottom right;
    }

    .panel.corner-bottom-right {
      top: auto; left: auto; right: 22px;
      bottom: calc(var(--fb-bubble-size, 56px) + 34px);
      transform-origin: bottom right;
    }
    .panel.corner-bottom-left {
      top: auto; right: auto; left: 22px;
      bottom: calc(var(--fb-bubble-size, 56px) + 34px);
      transform-origin: bottom left;
    }
    .panel.corner-top-right {
      bottom: auto; left: auto; right: 22px;
      top: calc(var(--fb-bubble-size, 56px) + 34px);
      transform-origin: top right;
    }
    .panel.corner-top-left {
      bottom: auto; right: auto; left: 22px;
      top: calc(var(--fb-bubble-size, 56px) + 34px);
      transform-origin: top left;
    }

    .panel.corner-top-right:not(.visible),
    .panel.corner-top-left:not(.visible) {
      transform: translateY(-16px) scale(0.96);
    }

    .panel.visible {
      opacity: var(--fb-chat-opacity, 0.98);
      transform: translateY(0) scale(1);
      visibility: visible;
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 16px;
      background: linear-gradient(120deg, #0d7377, #14919b);
      color: #fff;
      flex-shrink: 0;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .brand-mark {
      width: 28px;
      height: 28px;
      border-radius: 8px;
      background: rgba(255,255,255,0.2);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .brand-mark svg { width: 16px; height: 16px; fill: #fff; }

    .brand-text h1 {
      margin: 0;
      font-size: 15px;
      font-weight: 650;
      letter-spacing: 0.02em;
    }

    .brand-text p {
      margin: 0;
      font-size: 11px;
      opacity: 0.85;
    }

    .header-actions {
      display: flex;
      gap: 6px;
    }

    .icon-btn {
      width: 30px;
      height: 30px;
      border: none;
      border-radius: 8px;
      background: rgba(255,255,255,0.15);
      color: #fff;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s;
    }

    .icon-btn:hover { background: rgba(255,255,255,0.28); }
    .icon-btn svg { width: 15px; height: 15px; fill: currentColor; }

    .messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      scroll-behavior: smooth;
    }

    .messages::-webkit-scrollbar { width: 6px; }
    .messages::-webkit-scrollbar-thumb {
      background: rgba(13, 115, 119, 0.25);
      border-radius: 3px;
    }

    .empty {
      margin: auto;
      text-align: center;
      color: #5a7a7c;
      padding: 24px;
    }

    .empty strong {
      display: block;
      color: #0d7377;
      font-size: 15px;
      margin-bottom: 6px;
    }

    .empty span { font-size: 12.5px; line-height: 1.45; }

    .msg {
      max-width: 92%;
      padding: 10px 13px;
      border-radius: 14px;
      font-size: 1em;
      line-height: 1.5;
      word-break: break-word;
      animation: fadeIn 0.2s ease;
      user-select: text;
      -webkit-user-select: text;
      cursor: text;
    }

    .msg.user {
      white-space: pre-wrap;
      align-self: flex-end;
      background: #0d7377;
      color: #fff;
      border-bottom-right-radius: 4px;
    }

    .msg.assistant {
      white-space: normal;
      align-self: flex-start;
      background: #fff;
      color: #1a2e30;
      border: 1px solid rgba(13, 115, 119, 0.12);
      border-bottom-left-radius: 4px;
    }

    .msg .md-body {
      display: block;
    }

    .msg .md-body > *:first-child { margin-top: 0; }
    .msg .md-body > *:last-child { margin-bottom: 0; }

    .msg .md-body p {
      margin: 0 0 0.65em;
    }

    .msg .md-body h1,
    .msg .md-body h2,
    .msg .md-body h3 {
      margin: 0.75em 0 0.4em;
      line-height: 1.25;
      color: #0a4d52;
      font-weight: 700;
    }

    .msg .md-body h1 { font-size: 1.15em; }
    .msg .md-body h2 { font-size: 1.08em; }
    .msg .md-body h3 { font-size: 1.02em; }

    .msg .md-body ul,
    .msg .md-body ol {
      margin: 0.4em 0 0.65em;
      padding-left: 1.25em;
    }

    .msg .md-body li {
      margin: 0.2em 0;
    }

    .msg .md-body blockquote {
      margin: 0.5em 0;
      padding: 0.35em 0.75em;
      border-left: 3px solid #0d7377;
      color: #3d5c5e;
      background: rgba(13, 115, 119, 0.06);
      border-radius: 0 8px 8px 0;
    }

    .msg .md-body a {
      color: #0d7377;
      text-decoration: underline;
    }

    .msg .md-inline {
      font-family: ui-monospace, "Cascadia Code", "Consolas", monospace;
      font-size: 0.9em;
      background: rgba(13, 115, 119, 0.1);
      padding: 0.1em 0.35em;
      border-radius: 4px;
    }

    .code-block {
      margin: 0.55em 0;
      border-radius: 10px;
      overflow: hidden;
      border: 1px solid rgba(13, 115, 119, 0.18);
      background: #0f1f21;
      text-align: left;
    }

    .code-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 6px 8px;
      background: #162a2d;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }

    .code-lang {
      font-size: 10.5px;
      font-weight: 650;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: #8eb8bb;
      user-select: none;
    }

    .code-actions {
      display: flex;
      gap: 6px;
    }

    .code-btn {
      border: none;
      border-radius: 6px;
      padding: 4px 9px;
      font-size: 11px;
      font-weight: 650;
      font-family: inherit;
      cursor: pointer;
      background: rgba(255,255,255,0.08);
      color: #e8f2f2;
      transition: background 0.15s, color 0.15s;
    }

    .code-btn:hover {
      background: rgba(255,255,255,0.16);
    }

    .code-btn.primary {
      background: #0d7377;
      color: #fff;
    }

    .code-btn.primary:hover {
      background: #14919b;
    }

    .code-btn.ok {
      background: #1f6f4a;
      color: #fff;
    }

    .code-block pre {
      margin: 0;
      padding: 10px 12px;
      overflow-x: auto;
      max-height: 280px;
    }

    .code-block code {
      font-family: ui-monospace, "Cascadia Code", "Consolas", monospace;
      font-size: 12px;
      line-height: 1.45;
      color: #e6f0f0;
      white-space: pre;
      background: none;
      padding: 0;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: none; }
    }

    .msg.error {
      align-self: stretch;
      background: #fff0f0;
      color: #a33;
      border: 1px solid #f0c0c0;
      font-size: 12.5px;
      white-space: pre-wrap;
    }

    .msg.typing {
      align-self: flex-start;
      background: #fff;
      border: 1px solid rgba(13, 115, 119, 0.12);
      padding: 12px 16px;
    }

    .dots { display: flex; gap: 4px; }
    .dots span {
      width: 6px; height: 6px;
      border-radius: 50%;
      background: #0d7377;
      animation: bounce 1.2s infinite ease-in-out;
    }
    .dots span:nth-child(2) { animation-delay: 0.15s; }
    .dots span:nth-child(3) { animation-delay: 0.3s; }

    @keyframes bounce {
      0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
      40% { transform: translateY(-4px); opacity: 1; }
    }

    .composer {
      flex-shrink: 0;
      padding: 12px;
      border-top: 1px solid rgba(13, 115, 119, 0.1);
      background: rgba(255,255,255,0.7);
    }

    .composer-row {
      display: flex;
      gap: 8px;
      align-items: flex-end;
    }

    .composer textarea {
      flex: 1;
      resize: none;
      border: 1px solid rgba(13, 115, 119, 0.2);
      border-radius: 12px;
      padding: 10px 12px;
      font-size: 1em;
      line-height: 1.4;
      max-height: 100px;
      min-height: 42px;
      outline: none;
      background: #fff;
      color: #1a2e30;
      font-family: inherit;
      user-select: text;
      -webkit-user-select: text;
    }

    .composer textarea:focus {
      border-color: #0d7377;
      box-shadow: 0 0 0 3px rgba(13, 115, 119, 0.12);
    }

    .send-btn {
      width: 42px;
      height: 42px;
      border: none;
      border-radius: 12px;
      background: #0d7377;
      color: #fff;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: background 0.15s, transform 0.15s;
    }

    .send-btn:hover:not(:disabled) { background: #0a5c60; }
    .send-btn:disabled { opacity: 0.45; cursor: not-allowed; }
    .send-btn svg { width: 18px; height: 18px; fill: currentColor; pointer-events: none; }

    .settings {
      display: none;
      flex-direction: column;
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      gap: 12px;
    }

    .settings.active { display: flex; }
    .messages.hidden, .composer.hidden { display: none; }

    .field label {
      display: block;
      font-size: 11.5px;
      font-weight: 600;
      color: #3d5c5e;
      margin-bottom: 5px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .field input, .field select, .field textarea {
      width: 100%;
      border: 1px solid rgba(13, 115, 119, 0.2);
      border-radius: 10px;
      padding: 9px 11px;
      font-size: 13px;
      outline: none;
      background: #fff;
      color: #1a2e30;
      font-family: inherit;
    }

    .field input:focus, .field select:focus, .field textarea:focus {
      border-color: #0d7377;
      box-shadow: 0 0 0 3px rgba(13, 115, 119, 0.12);
    }

    .field textarea { min-height: 72px; resize: vertical; }

    .model-hint {
      margin: -4px 0 0;
      font-size: 12px;
      color: #5a7a7c;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .tag {
      display: inline-block;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      padding: 2px 7px;
      border-radius: 999px;
    }

    .tag.lite { background: #e6f4f4; color: #0d7377; }
    .tag.max { background: #1a2e30; color: #fff; }

    .advanced {
      border: 1px solid rgba(13, 115, 119, 0.18);
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.65);
      overflow: hidden;
    }

    .advanced summary {
      padding: 10px 12px;
      font-size: 12.5px;
      font-weight: 600;
      color: #3d5c5e;
      cursor: pointer;
      list-style: none;
      user-select: none;
    }

    .advanced summary::-webkit-details-marker { display: none; }

    .advanced summary::after {
      content: "+";
      float: right;
      font-weight: 700;
      color: #0d7377;
    }

    .advanced[open] summary::after { content: "−"; }

    .advanced-body {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 0 12px 12px;
    }

    .appearance {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 10px 12px;
      border: 1px solid rgba(13, 115, 119, 0.18);
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.65);
    }

    .appearance .section-title {
      margin: 0;
      font-size: 11px;
      font-weight: 650;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #3d5c5e;
    }

    .range-field span {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12px;
      font-weight: 600;
      color: #3d5c5e;
      margin-bottom: 4px;
      text-transform: none;
      letter-spacing: normal;
    }

    .range-field em {
      font-style: normal;
      color: #0d7377;
      font-weight: 700;
    }

    .range-field input[type="range"] {
      width: 100%;
      accent-color: #0d7377;
      padding: 0;
      border: none;
      background: transparent;
    }

    .hint {
      font-size: 11.5px;
      color: #6a8587;
      line-height: 1.4;
      margin: 0;
    }

    .save-row {
      display: flex;
      gap: 8px;
      margin-top: 4px;
    }

    .btn {
      flex: 1;
      border: none;
      border-radius: 10px;
      padding: 10px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
    }

    .btn.primary {
      background: #0d7377;
      color: #fff;
    }

    .btn.primary:hover { background: #0a5c60; }

    .btn.ghost {
      background: transparent;
      color: #3d5c5e;
      border: 1px solid rgba(13, 115, 119, 0.25);
    }

    .status {
      font-size: 12px;
      color: #0d7377;
      min-height: 16px;
    }

    .shield-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 10.5px;
      background: rgba(255,255,255,0.18);
      padding: 3px 8px;
      border-radius: 999px;
      margin-top: 2px;
    }

    .shield-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #7dffb3;
      box-shadow: 0 0 6px #7dffb3;
    }

    .oa-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding: 8px 10px;
      border-bottom: 1px solid rgba(13, 115, 119, 0.1);
      background: rgba(255,255,255,0.55);
      flex-shrink: 0;
    }

    .oa-btn, .chip {
      border: 1px solid rgba(13, 115, 119, 0.22);
      background: #fff;
      color: #0d7377;
      border-radius: 8px;
      padding: 5px 9px;
      font-size: 11px;
      font-weight: 650;
      font-family: inherit;
      cursor: pointer;
    }

    .oa-btn:hover, .chip:hover { background: #e6f4f4; }
    .chip.active { background: #0d7377; color: #fff; border-color: #0d7377; }

    .meta-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 4px 12px;
      font-size: 10.5px;
      color: #5a7a7c;
      border-bottom: 1px solid rgba(13, 115, 119, 0.08);
      flex-shrink: 0;
      gap: 8px;
    }

    .meta-bar .cost { color: #0d7377; font-weight: 650; }

    .composer-row {
      display: flex;
      gap: 8px;
      align-items: flex-end;
      width: 100%;
    }

    .stop-btn {
      width: 42px;
      height: 42px;
      border: none;
      border-radius: 12px;
      background: #a33;
      color: #fff;
      cursor: pointer;
      display: none;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      font-size: 11px;
      font-weight: 700;
      font-family: inherit;
    }

    .stop-btn.visible { display: flex; }

    .toggle-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      font-size: 12px;
      color: #3d5c5e;
      font-weight: 600;
    }

    .toggle-row input { accent-color: #0d7377; width: auto; }
  `;

  shadow.appendChild(style);

  const bubbleSvg = `<svg viewBox="0 0 24 24"><path d="M12 3C6.5 3 2 6.6 2 11c0 2.4 1.3 4.6 3.4 6.1L4 21l4.2-1.6c1.2.4 2.5.6 3.8.6 5.5 0 10-3.6 10-8S17.5 3 12 3zm0 14c-1.1 0-2.1-.2-3.1-.5l-.7-.2-.7.3-1.5.6.4-1.5.2-.7-.5-.6C4.8 13.2 4 12.1 4 11c0-3.3 3.6-6 8-6s8 2.7 8 6-3.6 6-8 6z"/></svg>`;
  const closeSvg = `<svg viewBox="0 0 24 24"><path d="M18.3 5.7a1 1 0 0 0-1.4 0L12 10.6 7.1 5.7a1 1 0 0 0-1.4 1.4l4.9 4.9-4.9 4.9a1 1 0 1 0 1.4 1.4l4.9-4.9 4.9 4.9a1 1 0 0 0 1.4-1.4L13.4 12l4.9-4.9a1 1 0 0 0 0-1.4z"/></svg>`;
  const gearSvg = `<svg viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.58.23-1.12.54-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.83 14.5a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.39.3.6.22l2.39-.96c.5.4 1.05.72 1.63.94l.36 2.54c.05.24.26.42.5.42h3.84c.24 0 .45-.18.5-.42l.36-2.54c.58-.22 1.12-.54 1.63-.94l2.39.96c.22.08.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5z"/></svg>`;
  const sendSvg = `<svg viewBox="0 0 24 24"><path d="M3.4 20.6 21 12 3.4 3.4 3 10.5l12 1.5-12 1.5z"/></svg>`;
  const clearSvg = `<svg viewBox="0 0 24 24"><path d="M6 7h12v2H6V7zm2 3h8l-.7 9.1a1 1 0 0 1-1 .9H9.7a1 1 0 0 1-1-.9L8 10zm3-5h2v2h-2V5z"/></svg>`;

  // Bubble
  const bubble = document.createElement("button");
  bubble.className = "bubble corner-bottom-right";
  bubble.type = "button";
  bubble.setAttribute("aria-label", "Open Floatbot");
  bubble.title = "Drag to a corner · Click to open";
  bubble.innerHTML = bubbleSvg;
  shadow.appendChild(bubble);

  // Panel
  const panel = document.createElement("div");
  panel.className = "panel corner-bottom-right";
  panel.innerHTML = `
    <div class="header">
      <div class="brand">
        <div class="brand-mark">${bubbleSvg}</div>
        <div class="brand-text">
          <h1>Floatbot</h1>
          <div class="shield-badge" data-shield-badge><span class="shield-dot"></span> Exam shield</div>
        </div>
      </div>
      <div class="header-actions">
        <button class="icon-btn" type="button" data-action="clear" title="Clear chat">${clearSvg}</button>
        <button class="icon-btn" type="button" data-action="settings" title="Settings">${gearSvg}</button>
        <button class="icon-btn" type="button" data-action="close" title="Close">${closeSvg}</button>
      </div>
    </div>
    <div class="oa-bar">
      <button type="button" class="oa-btn" data-action="scrape" title="Paste problem text into the box">Load problem</button>
    </div>
    <div class="meta-bar">
      <span data-oa-status>Ready · Alt+Shift+F open</span>
      <span class="cost" data-cost>Tokens: 0</span>
    </div>
    <div class="messages" data-view="messages"></div>
    <div class="settings" data-view="settings">
      <div class="field">
        <label>API Key</label>
        <input type="password" data-field="apiKey" placeholder="sk-..." autocomplete="off" />
      </div>
      <div class="field">
        <label>Provider</label>
        <select data-field="provider"></select>
      </div>
      <div class="field">
        <label>Model</label>
        <select data-field="model"></select>
      </div>
      <p class="model-hint" data-model-hint></p>
      <div class="appearance">
        <p class="section-title">Appearance</p>
        <div class="range-field">
          <span>Button size <em data-val="bubbleSize">56px</em></span>
          <input type="range" data-field="bubbleSize" min="40" max="80" step="2" />
        </div>
        <div class="range-field">
          <span>Button opacity <em data-val="bubbleOpacity">100%</em></span>
          <input type="range" data-field="bubbleOpacity" min="20" max="100" step="5" />
        </div>
        <div class="range-field">
          <span>Chat opacity <em data-val="chatOpacity">98%</em></span>
          <input type="range" data-field="chatOpacity" min="40" max="100" step="2" />
        </div>
        <div class="range-field">
          <span>Chat font size <em data-val="chatFontSize">13.5px</em></span>
          <input type="range" data-field="chatFontSize" min="12" max="18" step="0.5" />
        </div>
      </div>
      <div class="appearance">
        <p class="section-title">OA options</p>
        <label class="toggle-row">Exam mode (shield + select unlock)<input type="checkbox" data-field="examMode" /></label>
        <label class="toggle-row">Stream replies<input type="checkbox" data-field="streamEnabled" /></label>
        <label class="toggle-row">Typed insert (slow paste)<input type="checkbox" data-field="typedInsert" /></label>
        <label class="toggle-row">Persist chats per page<input type="checkbox" data-field="persistChats" /></label>
      </div>
      <details class="advanced">
        <summary>Advanced settings</summary>
        <div class="advanced-body">
          <div class="field">
            <label>API Base URL</label>
            <input type="text" data-field="apiBase" placeholder="https://api.openai.com/v1" />
          </div>
          <div class="field">
            <label>System prompt</label>
            <textarea data-field="systemPrompt"></textarea>
          </div>
          <p class="hint">OpenAI-compatible endpoints (Groq, Together, local…).</p>
        </div>
      </details>
      <div class="save-row">
        <button class="btn ghost" type="button" data-action="back">Back</button>
        <button class="btn primary" type="button" data-action="save">Save</button>
      </div>
      <div class="status" data-status></div>
    </div>
    <div class="composer" data-view="composer">
      <div class="composer-row">
        <textarea rows="1" placeholder="Ask anything… (Enter send)" data-input></textarea>
        <button class="stop-btn" type="button" data-action="stop" title="Stop">Stop</button>
        <button class="send-btn" type="button" data-action="send" title="Send">${sendSvg}</button>
      </div>
    </div>
  `;
  shadow.appendChild(panel);

  const messagesEl = panel.querySelector('[data-view="messages"]');
  const settingsEl = panel.querySelector('[data-view="settings"]');
  const composerEl = panel.querySelector('[data-view="composer"]');
  const inputEl = panel.querySelector("[data-input]");
  const statusEl = panel.querySelector("[data-status]");
  const sendBtn = panel.querySelector('[data-action="send"]');
  const stopBtn = panel.querySelector('[data-action="stop"]');
  const costEl = panel.querySelector("[data-cost]");
  const oaStatusEl = panel.querySelector("[data-oa-status]");
  const shieldBadgeEl = panel.querySelector("[data-shield-badge]");
  const providerSelectEl = panel.querySelector('[data-field="provider"]');

  let lastProblem = null;
  let lastCodeBlock = "";
  let tokenTotal = 0;
  let streamPort = null;

  // Keep focus inside chatbot without notifying the page
  function retainFocus(el) {
    // Use focus with preventScroll; shield blocks blur propagation to page
    try {
      el.focus({ preventScroll: true });
    } catch (_) {
      el.focus();
    }
  }

  function applyAppearance() {
    const size = bubbleSizePx();
    let bOp = Number(settings.bubbleOpacity);
    if (!Number.isFinite(bOp)) bOp = 1;
    bOp = Math.min(1, Math.max(0.2, bOp));
    let cOp = Number(settings.chatOpacity);
    if (!Number.isFinite(cOp)) cOp = 0.98;
    cOp = Math.min(1, Math.max(0.4, cOp));
    let font = Number(settings.chatFontSize);
    if (!Number.isFinite(font)) font = 13.5;
    font = Math.min(18, Math.max(12, font));

    host.style.setProperty("--fb-bubble-size", `${size}px`);
    host.style.setProperty("--fb-bubble-opacity", String(bOp));
    host.style.setProperty("--fb-chat-opacity", String(cOp));
    host.style.setProperty("--fb-chat-font", `${font}px`);
  }

  function applyCorner(next, { persist = false } = {}) {
    corner = CORNERS.includes(next) ? next : "bottom-right";
    const classes = CORNERS.map((c) => `corner-${c}`);
    bubble.classList.remove(...classes, "dragging");
    panel.classList.remove(...classes);
    bubble.classList.add(`corner-${corner}`);
    panel.classList.add(`corner-${corner}`);
    // Clear inline drag positions so CSS corners apply
    bubble.style.top = "";
    bubble.style.left = "";
    bubble.style.right = "";
    bubble.style.bottom = "";
    if (persist) {
      settings.corner = corner;
      chrome.storage.sync.set({ corner });
    }
  }

  function nearestCorner(x, y) {
    const size = bubbleSizePx();
    const cx = x + size / 2;
    const cy = y + size / 2;
    const midX = window.innerWidth / 2;
    const midY = window.innerHeight / 2;
    const vertical = cy < midY ? "top" : "bottom";
    const horizontal = cx < midX ? "left" : "right";
    return `${vertical}-${horizontal}`;
  }

  function setShield(active) {
    const on = !!(active && settings.examMode);
    try {
      document.documentElement.setAttribute("data-floatbot-shield", on ? "1" : "0");
      document.documentElement.setAttribute("data-floatbot-exam", settings.examMode ? "1" : "0");
    } catch (_) {}
    window.dispatchEvent(new CustomEvent("floatbot-shield", { detail: { active: on } }));
    if (shieldBadgeEl) {
      shieldBadgeEl.style.display = settings.examMode && open ? "inline-flex" : "none";
    }
  }

  function applyExamMode() {
    unlockStyle.disabled = !settings.examMode;
    try {
      document.documentElement.setAttribute("data-floatbot-exam", settings.examMode ? "1" : "0");
    } catch (_) {}
    // Stealth: less obvious host attrs when exam mode
    if (settings.examMode) {
      host.removeAttribute("data-floatbot");
      host.id = "fb-root";
    } else {
      host.setAttribute("data-floatbot", "1");
      host.id = "floatbot-root";
    }
    setShield(open);
  }

  function setOpen(next) {
    open = next;
    panel.classList.toggle("visible", open);
    bubble.classList.toggle("open", open);
    bubble.innerHTML = open ? closeSvg : bubbleSvg;
    bubble.setAttribute("aria-label", open ? "Close Floatbot" : "Open Floatbot");
    setShield(open);
    if (open) {
      showChat();
      requestAnimationFrame(() => retainFocus(inputEl));
    }
  }

  function showChat() {
    settingsEl.classList.remove("active");
    messagesEl.classList.remove("hidden");
    composerEl.classList.remove("hidden");
  }

  function showSettings() {
    settingsEl.classList.add("active");
    messagesEl.classList.add("hidden");
    composerEl.classList.add("hidden");
    fillSettingsForm();
  }

  const modelSelectEl = panel.querySelector('[data-field="model"]');
  const modelHintEl = panel.querySelector("[data-model-hint]");

  function updateModelHint() {
    const m = MODELS.find((x) => x.id === modelSelectEl.value);
    if (!m) {
      modelHintEl.textContent = "Custom model";
      return;
    }
    modelHintEl.innerHTML =
      m.tag === "Lite"
        ? `<span class="tag lite">Lite</span> Faster & cheaper`
        : `<span class="tag max">Max</span> Stronger reasoning`;
  }

  function fillModelSelect(selected) {
    const value = selected || DEFAULTS.model;
    modelSelectEl.innerHTML = MODELS.map((m) => {
      const sel = m.id === value ? " selected" : "";
      return `<option value="${m.id}"${sel}>${m.label} · ${m.tag}</option>`;
    }).join("");
    if (value && !MODELS.some((m) => m.id === value)) {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = `${value} · Custom`;
      opt.selected = true;
      modelSelectEl.appendChild(opt);
    }
    updateModelHint();
  }

  modelSelectEl.addEventListener("change", updateModelHint);

  function syncAppearanceLabels() {
    const sizeEl = settingsEl.querySelector('[data-field="bubbleSize"]');
    const bOpEl = settingsEl.querySelector('[data-field="bubbleOpacity"]');
    const cOpEl = settingsEl.querySelector('[data-field="chatOpacity"]');
    const fontEl = settingsEl.querySelector('[data-field="chatFontSize"]');
    settingsEl.querySelector('[data-val="bubbleSize"]').textContent = `${sizeEl.value}px`;
    settingsEl.querySelector('[data-val="bubbleOpacity"]').textContent = `${bOpEl.value}%`;
    settingsEl.querySelector('[data-val="chatOpacity"]').textContent = `${cOpEl.value}%`;
    settingsEl.querySelector('[data-val="chatFontSize"]').textContent = `${fontEl.value}px`;
  }

  function previewAppearanceFromForm() {
    settings.bubbleSize = Number(settingsEl.querySelector('[data-field="bubbleSize"]').value);
    settings.bubbleOpacity =
      Number(settingsEl.querySelector('[data-field="bubbleOpacity"]').value) / 100;
    settings.chatOpacity =
      Number(settingsEl.querySelector('[data-field="chatOpacity"]').value) / 100;
    settings.chatFontSize = Number(
      settingsEl.querySelector('[data-field="chatFontSize"]').value
    );
    syncAppearanceLabels();
    applyAppearance();
  }

  function fillProviderSelect() {
    const providers =
      typeof FLOATBOT_PROVIDERS !== "undefined"
        ? FLOATBOT_PROVIDERS
        : [{ id: "openai", label: "OpenAI", base: "https://api.openai.com/v1" }];
    const cur = settings.provider || "openai";
    providerSelectEl.innerHTML = providers
      .map((p) => `<option value="${p.id}"${p.id === cur ? " selected" : ""}>${p.label}</option>`)
      .join("");
  }

  function applyProviderBase() {
    const providers =
      typeof FLOATBOT_PROVIDERS !== "undefined" ? FLOATBOT_PROVIDERS : [];
    const p = providers.find((x) => x.id === settings.provider);
    if (p && p.base) {
      settings.apiBase = p.base;
      const baseInput = settingsEl.querySelector('[data-field="apiBase"]');
      if (baseInput) baseInput.value = p.base;
    }
  }

  function chatStorageKey() {
    return `floatbot-chat:${location.origin}${location.pathname}`;
  }

  function persistMessages() {
    if (!settings.persistChats) return;
    try {
      chrome.storage.local.set({
        [chatStorageKey()]: {
          messages: messages.filter((m) => !m.streaming),
          tokenTotal,
          updatedAt: Date.now(),
        },
      });
    } catch (_) {}
  }

  async function restoreMessages() {
    if (!settings.persistChats) return;
    return new Promise((resolve) => {
      chrome.storage.local.get(chatStorageKey(), (data) => {
        const saved = data[chatStorageKey()];
        if (saved?.messages?.length) {
          messages = saved.messages;
          tokenTotal = saved.tokenTotal || 0;
          updateCost();
        }
        resolve();
      });
    });
  }

  function updateCost() {
    if (costEl) costEl.textContent = `Tokens: ${tokenTotal}`;
  }

  function setOaStatus(text) {
    if (oaStatusEl) oaStatusEl.textContent = text;
  }

  function extractLastCode(content) {
    const m = String(content || "").match(/```(?:\w*)\n?([\s\S]*?)```/);
    return m ? m[1].replace(/\n$/, "") : "";
  }

  function fillSettingsForm() {
    settingsEl.querySelector('[data-field="apiKey"]').value = settings.apiKey || "";
    settingsEl.querySelector('[data-field="apiBase"]').value = settings.apiBase || DEFAULTS.apiBase;
    settingsEl.querySelector('[data-field="systemPrompt"]').value =
      settings.systemPrompt || DEFAULTS.systemPrompt;
    fillProviderSelect();
    fillModelSelect(settings.model || DEFAULTS.model);

    settingsEl.querySelector('[data-field="bubbleSize"]').value =
      settings.bubbleSize ?? DEFAULTS.bubbleSize;
    settingsEl.querySelector('[data-field="bubbleOpacity"]').value = Math.round(
      (settings.bubbleOpacity ?? DEFAULTS.bubbleOpacity) * 100
    );
    settingsEl.querySelector('[data-field="chatOpacity"]').value = Math.round(
      (settings.chatOpacity ?? DEFAULTS.chatOpacity) * 100
    );
    settingsEl.querySelector('[data-field="chatFontSize"]').value =
      settings.chatFontSize ?? DEFAULTS.chatFontSize;
    settingsEl.querySelector('[data-field="examMode"]').checked = !!settings.examMode;
    settingsEl.querySelector('[data-field="streamEnabled"]').checked =
      settings.streamEnabled !== false;
    settingsEl.querySelector('[data-field="typedInsert"]').checked = !!settings.typedInsert;
    settingsEl.querySelector('[data-field="persistChats"]').checked =
      settings.persistChats !== false;
    syncAppearanceLabels();
    statusEl.textContent = "";
  }

  function renderMessages() {
    messagesEl.innerHTML = "";
    if (!messages.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.innerHTML = `<strong>Ask Floatbot</strong><span>Your AI assistant floats on every page. Add an API key in settings to get started.</span>`;
      messagesEl.appendChild(empty);
      return;
    }
    for (const m of messages) {
      const div = document.createElement("div");
      div.className = `msg ${m.role}${m.error ? " error" : ""}`;
      if (m.role === "assistant" && !m.error && typeof floatbotRenderMarkdown === "function") {
        const body = document.createElement("div");
        body.className = "md-body";
        body.innerHTML = floatbotRenderMarkdown(m.content);
        div.appendChild(body);
      } else {
        div.textContent = m.content;
      }
      messagesEl.appendChild(div);
    }
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  // Remember last focused page input + caret so Insert works after clicking chatbot
  let lastPageEditable = null;
  let lastSelStart = 0;
  let lastSelEnd = 0;

  function isFloatbotNode(node) {
    if (!node) return false;
    if (node === host || host.contains(node)) return true;
    try {
      if (node.getRootNode && node.getRootNode() === shadow) return true;
    } catch (_) {}
    return false;
  }

  function isPageEditable(el) {
    if (!el || isFloatbotNode(el)) return false;
    const tag = el.tagName;
    if (tag === "TEXTAREA") return true;
    if (tag === "INPUT") {
      const type = (el.type || "text").toLowerCase();
      return ![
        "button",
        "submit",
        "checkbox",
        "radio",
        "file",
        "hidden",
        "image",
        "reset",
        "range",
        "color",
      ].includes(type);
    }
    if (el.isContentEditable) return true;
    return false;
  }

  function snapshotCaret(el) {
    if (!isPageEditable(el)) return;
    lastPageEditable = el;
    try {
      if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
        lastSelStart = el.selectionStart != null ? el.selectionStart : (el.value || "").length;
        lastSelEnd = el.selectionEnd != null ? el.selectionEnd : lastSelStart;
      }
    } catch (_) {}
  }

  document.addEventListener(
    "focusin",
    (e) => {
      snapshotCaret(e.target);
    },
    true
  );

  document.addEventListener(
    "pointerup",
    (e) => {
      snapshotCaret(e.target);
    },
    true
  );

  document.addEventListener(
    "keyup",
    (e) => {
      snapshotCaret(e.target);
    },
    true
  );

  document.addEventListener(
    "selectionchange",
    () => {
      try {
        const el = document.activeElement;
        if (isPageEditable(el)) snapshotCaret(el);
      } catch (_) {}
    },
    true
  );

  document.addEventListener(
    "focusout",
    (e) => {
      // Save caret right before focus moves into the chatbot
      if (isPageEditable(e.target)) snapshotCaret(e.target);
    },
    true
  );

  function insertTextIntoEditable(el, text) {
    if (!el || !text) return false;
    try {
      if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
        el.focus();
        const value = el.value || "";
        let start = lastPageEditable === el && lastSelStart != null ? lastSelStart : el.selectionStart;
        let end = lastPageEditable === el && lastSelEnd != null ? lastSelEnd : el.selectionEnd;
        if (start == null || start < 0) start = value.length;
        if (end == null || end < 0) end = start;
        start = Math.min(start, value.length);
        end = Math.min(Math.max(end, start), value.length);

        const next = value.slice(0, start) + text + value.slice(end);
        const proto =
          el.tagName === "TEXTAREA"
            ? window.HTMLTextAreaElement.prototype
            : window.HTMLInputElement.prototype;
        const desc = Object.getOwnPropertyDescriptor(proto, "value");
        if (desc && desc.set) desc.set.call(el, next);
        else el.value = next;

        const pos = start + text.length;
        try {
          el.setSelectionRange(pos, pos);
        } catch (_) {}
        lastSelStart = lastSelEnd = pos;

        el.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
      if (el.isContentEditable) {
        el.focus();
        const ok = document.execCommand("insertText", false, text);
        if (!ok) {
          const sel = window.getSelection();
          if (sel && sel.rangeCount) {
            const range = sel.getRangeAt(0);
            range.deleteContents();
            range.insertNode(document.createTextNode(text));
            range.collapse(false);
          } else {
            el.textContent = (el.textContent || "") + text;
          }
        }
        el.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      }
    } catch (_) {
      return false;
    }
    return false;
  }

  function flashCodeBtn(btn, label) {
    if (!btn || typeof btn.textContent !== "string") return;
    const prev = btn.textContent;
    btn.textContent = label;
    btn.classList?.add?.("ok");
    setTimeout(() => {
      btn.textContent = prev;
      btn.classList?.remove?.("ok");
    }, 1200);
  }

  async function copyCode(text, btn) {
    try {
      await navigator.clipboard.writeText(text);
      flashCodeBtn(btn, "Copied");
    } catch (_) {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;left:-9999px;top:0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        flashCodeBtn(btn, "Copied");
      } catch (__) {
        flashCodeBtn(btn, "Failed");
      }
      ta.remove();
    }
  }

  messagesEl.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-code-action]");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const block = btn.closest(".code-block");
    if (!block) return;
    const codeEl = block.querySelector("code");
    const text = codeEl ? codeEl.textContent : "";
    if (!text) return;

    const action = btn.getAttribute("data-code-action");
    if (action === "copy") {
      copyCode(text, btn);
      return;
    }
    if (action === "insert") {
      btn.disabled = true;
      try {
        await insertCodeSmart(text, btn);
      } finally {
        btn.disabled = false;
      }
      return;
    }
  });

  function showTyping() {
    const div = document.createElement("div");
    div.className = "msg typing";
    div.dataset.typing = "1";
    div.innerHTML = `<div class="dots"><span></span><span></span><span></span></div>`;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function hideTyping() {
    const t = messagesEl.querySelector("[data-typing]");
    if (t) t.remove();
  }

  async function loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(DEFAULTS, (data) => {
        settings = { ...DEFAULTS, ...data };
        resolve(settings);
      });
    });
  }

  async function saveSettingsFromForm() {
    const provider = providerSelectEl.value || "openai";
    const next = {
      apiKey: settingsEl.querySelector('[data-field="apiKey"]').value.trim(),
      apiBase: settingsEl.querySelector('[data-field="apiBase"]').value.trim() || DEFAULTS.apiBase,
      provider,
      model: modelSelectEl.value || DEFAULTS.model,
      systemPrompt:
        settingsEl.querySelector('[data-field="systemPrompt"]').value.trim() ||
        DEFAULTS.systemPrompt,
      bubbleSize: Number(settingsEl.querySelector('[data-field="bubbleSize"]').value) || DEFAULTS.bubbleSize,
      bubbleOpacity: Math.min(
        1,
        Math.max(0.2, Number(settingsEl.querySelector('[data-field="bubbleOpacity"]').value) / 100)
      ),
      chatOpacity: Math.min(
        1,
        Math.max(0.4, Number(settingsEl.querySelector('[data-field="chatOpacity"]').value) / 100)
      ),
      chatFontSize:
        Number(settingsEl.querySelector('[data-field="chatFontSize"]').value) ||
        DEFAULTS.chatFontSize,
      examMode: !!settingsEl.querySelector('[data-field="examMode"]').checked,
      streamEnabled: !!settingsEl.querySelector('[data-field="streamEnabled"]').checked,
      typedInsert: !!settingsEl.querySelector('[data-field="typedInsert"]').checked,
      persistChats: !!settingsEl.querySelector('[data-field="persistChats"]').checked,
    };
    settings = { ...settings, ...next };
    applyAppearance();
    applyExamMode();
    await chrome.storage.sync.set(next);
    statusEl.textContent = "Saved.";
    setTimeout(() => {
      if (statusEl.textContent === "Saved.") statusEl.textContent = "";
    }, 1500);
  }

  function abortStream() {
    try {
      streamPort?.postMessage({ type: "ABORT" });
      streamPort?.disconnect();
    } catch (_) {}
    streamPort = null;
    stopBtn.classList.remove("visible");
    sending = false;
    sendBtn.disabled = false;
  }

  async function sendMessage(overrideText) {
    const text = (overrideText != null ? overrideText : inputEl.value).trim();
    if (!text || sending) return;

    if (!settings.apiKey) {
      messages.push({
        role: "assistant",
        content: "No API key set. Open settings (gear icon) and add your key.",
        error: true,
      });
      renderMessages();
      showSettings();
      return;
    }

    messages.push({ role: "user", content: text });
    if (overrideText == null) {
      inputEl.value = "";
      autoResize();
    }
    renderMessages();
    persistMessages();
    sending = true;
    sendBtn.disabled = true;

    const pageContext = [
      `Page title: ${document.title || "(none)"}`,
      `Page URL: ${location.href}`,
      lastProblem?.language ? `Detected language: ${lastProblem.language}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const payload = {
      model: settings.model,
      messages: [
        { role: "system", content: `${settings.systemPrompt}\n\n${pageContext}` },
        ...messages
          .filter((m) => !m.error && !m.streaming)
          .map((m) => ({ role: m.role, content: m.content })),
      ],
      temperature: 0.4,
    };

    const base = settings.apiBase.replace(/\/$/, "");
    const useStream = settings.streamEnabled !== false;

    try {
      if (!useStream) {
        showTyping();
        const res = await chrome.runtime.sendMessage({
          type: "FLOATBOT_CHAT",
          apiBase: base,
          apiKey: settings.apiKey,
          body: payload,
        });
        hideTyping();
        if (!res || !res.ok) throw new Error((res && res.error) || "Request failed");
        const reply =
          res.data?.choices?.[0]?.message?.content?.trim() || "(No response content)";
        if (res.data?.usage?.total_tokens) {
          tokenTotal += res.data.usage.total_tokens;
          updateCost();
        }
        lastCodeBlock = extractLastCode(reply) || lastCodeBlock;
        messages.push({ role: "assistant", content: reply });
        renderMessages();
        persistMessages();
        return;
      }

      // Streaming
      messages.push({ role: "assistant", content: "", streaming: true });
      renderMessages();
      stopBtn.classList.add("visible");

      await new Promise((resolve, reject) => {
        const port = chrome.runtime.connect({ name: "floatbot-stream" });
        streamPort = port;
        let assembled = "";

        port.onMessage.addListener((msg) => {
          if (msg.type === "chunk") {
            assembled += msg.text || "";
            const last = messages[messages.length - 1];
            if (last?.streaming) {
              last.content = assembled;
              renderMessages();
            }
          } else if (msg.type === "done") {
            if (msg.usage?.total_tokens) {
              tokenTotal += msg.usage.total_tokens;
              updateCost();
            }
            const last = messages[messages.length - 1];
            if (last?.streaming) {
              last.content = assembled.trim() || "(No response content)";
              delete last.streaming;
            }
            lastCodeBlock = extractLastCode(assembled) || lastCodeBlock;
            renderMessages();
            persistMessages();
            port.disconnect();
            streamPort = null;
            resolve();
          } else if (msg.type === "aborted") {
            const last = messages[messages.length - 1];
            if (last?.streaming) {
              last.content = (assembled || "").trim() + "\n\n*(stopped)*";
              delete last.streaming;
            }
            renderMessages();
            persistMessages();
            streamPort = null;
            resolve();
          } else if (msg.type === "error") {
            port.disconnect();
            streamPort = null;
            reject(new Error(msg.error || "Stream failed"));
          }
        });

        port.onDisconnect.addListener(() => {
          streamPort = null;
        });

        port.postMessage({
          type: "START",
          apiBase: base,
          apiKey: settings.apiKey,
          body: payload,
        });
      });
    } catch (err) {
      hideTyping();
      const last = messages[messages.length - 1];
      if (last?.streaming) messages.pop();
      messages.push({
        role: "assistant",
        content: `Error: ${err.message || err}`,
        error: true,
      });
      renderMessages();
      persistMessages();
    } finally {
      sending = false;
      sendBtn.disabled = false;
      stopBtn.classList.remove("visible");
      if (open) retainFocus(inputEl);
    }
  }

  function fillComposer(text, status) {
    inputEl.value = text;
    autoResize();
    setOpen(true);
    showChat();
    if (status) setOaStatus(status);
    requestAnimationFrame(() => retainFocus(inputEl));
  }

  /** Paste raw scraped problem into the input — no canned instructions, does NOT send */
  function loadProblemDraft() {
    if (typeof floatbotScrapeProblem !== "function") {
      setOaStatus("Scraper unavailable");
      return;
    }
    lastProblem = floatbotScrapeProblem();
    const text =
      typeof floatbotFormatProblemPrompt === "function"
        ? floatbotFormatProblemPrompt(lastProblem)
        : lastProblem.statement || "";
    fillComposer(
      text,
      `Loaded ${lastProblem.site}: ${(lastProblem.title || "").slice(0, 40)}`
    );
  }

  async function insertCodeSmart(text, btn) {
    if (!text) {
      flashCodeBtn(btn, "Empty");
      return;
    }

    // Prefer the last page field the user focused (before opening chat)
    let target = lastPageEditable;
    if (!target || !document.contains(target) || !isPageEditable(target)) {
      const active = document.activeElement;
      target = isPageEditable(active) ? active : null;
    }

    if (!target) {
      flashCodeBtn(btn, "No cursor");
      setOaStatus("Click in a text field first, then Insert");
      return;
    }

    const ok = insertTextIntoEditable(target, text);
    if (ok) {
      flashCodeBtn(btn, "Inserted");
      setOaStatus("Inserted at cursor");
      lastCodeBlock = text;
    } else {
      flashCodeBtn(btn, "Failed");
      setOaStatus("Could not insert at cursor");
    }
  }

  function autoResize() {
    inputEl.style.height = "auto";
    inputEl.style.height = Math.min(inputEl.scrollHeight, 100) + "px";
  }

  // Drag to any corner + click to toggle
  let dragState = null;
  let suppressClick = false;

  bubble.addEventListener(
    "pointerdown",
    (e) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      e.preventDefault();
      e.stopPropagation();
      const rect = bubble.getBoundingClientRect();
      dragState = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        offsetX: e.clientX - rect.left,
        offsetY: e.clientY - rect.top,
        moved: false,
      };
      bubble.setPointerCapture(e.pointerId);
      bubble.classList.add("dragging");
      bubble.style.right = "auto";
      bubble.style.bottom = "auto";
      bubble.style.left = `${rect.left}px`;
      bubble.style.top = `${rect.top}px`;
    },
    true
  );

  bubble.addEventListener(
    "pointermove",
    (e) => {
      if (!dragState || e.pointerId !== dragState.pointerId) return;
      e.preventDefault();
      e.stopPropagation();
      const dx = e.clientX - dragState.startX;
      const dy = e.clientY - dragState.startY;
      if (!dragState.moved && dx * dx + dy * dy > 36) {
        dragState.moved = true;
      }
      let left = e.clientX - dragState.offsetX;
      let top = e.clientY - dragState.offsetY;
      left = Math.max(0, Math.min(left, window.innerWidth - bubbleSizePx()));
      top = Math.max(0, Math.min(top, window.innerHeight - bubbleSizePx()));
      bubble.style.left = `${left}px`;
      bubble.style.top = `${top}px`;
    },
    true
  );

  function endDrag(e) {
    if (!dragState || e.pointerId !== dragState.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    const moved = dragState.moved;
    const left = parseFloat(bubble.style.left) || 0;
    const top = parseFloat(bubble.style.top) || 0;
    try {
      bubble.releasePointerCapture(dragState.pointerId);
    } catch (_) {}
    dragState = null;
    bubble.classList.remove("dragging");

    if (moved) {
      suppressClick = true;
      applyCorner(nearestCorner(left, top), { persist: true });
      setTimeout(() => {
        suppressClick = false;
      }, 0);
    } else {
      // Snap back / keep corner, then treat as click
      applyCorner(corner);
      setOpen(!open);
    }
  }

  bubble.addEventListener("pointerup", endDrag, true);
  bubble.addEventListener("pointercancel", endDrag, true);

  bubble.addEventListener(
    "click",
    (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      // Click handled on pointerup for non-drag
    },
    true
  );

  function handlePanelAction(action) {
    if (action === "close") setOpen(false);
    else if (action === "settings") showSettings();
    else if (action === "back") showChat();
    else if (action === "save") saveSettingsFromForm();
    else if (action === "clear") {
      messages = [];
      renderMessages();
      persistMessages();
    } else if (action === "send") sendMessage();
    else if (action === "stop") abortStream();
    else if (action === "scrape") loadProblemDraft();
  }

  // Direct bindings — capture stopPropagation on panel was eating bubbled clicks
  sendBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    sendMessage();
  });

  stopBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    abortStream();
  });

  panel.querySelectorAll("[data-action]").forEach((el) => {
    if (el === sendBtn || el === stopBtn) return;
    el.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      handlePanelAction(el.getAttribute("data-action"));
    });
  });

  providerSelectEl?.addEventListener("change", () => {
    settings.provider = providerSelectEl.value;
    applyProviderBase();
  });

  // Contain events inside the widget without blocking target handlers
  ["mousedown", "mouseup", "click", "pointerdown", "pointerup", "keydown", "keyup", "keypress", "focus", "blur"].forEach(
    (type) => {
      panel.addEventListener(type, (e) => {
        e.stopPropagation();
      }); // bubble phase — runs after button handlers
      bubble.addEventListener(type, (e) => {
        e.stopPropagation();
      });
    }
  );

  inputEl.addEventListener("input", autoResize);
  inputEl.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Escape closes panel
  shadow.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape" && open) {
        e.stopPropagation();
        setOpen(false);
      }
    },
    true
  );

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    for (const key of Object.keys(DEFAULTS)) {
      if (changes[key]) settings[key] = changes[key].newValue;
    }
    if (changes.corner) {
      applyCorner(changes.corner.newValue || "bottom-right");
    }
    if (
      changes.bubbleSize ||
      changes.bubbleOpacity ||
      changes.chatOpacity ||
      changes.chatFontSize
    ) {
      applyAppearance();
    }
    if (changes.examMode) applyExamMode();
  });

  // Live preview while dragging appearance sliders
  ["bubbleSize", "bubbleOpacity", "chatOpacity", "chatFontSize"].forEach((field) => {
    const el = settingsEl.querySelector(`[data-field="${field}"]`);
    if (el) el.addEventListener("input", previewAppearanceFromForm);
  });

  // Hotkeys (page-level)
  window.addEventListener(
    "keydown",
    (e) => {
      if (!(e.altKey && e.shiftKey)) return;
      const k = e.key.toLowerCase();
      if (k === "f") {
        e.preventDefault();
        setOpen(!open);
      } else if (k === "p") {
        e.preventDefault();
        loadProblemDraft();
      } else if (k === "i" && lastCodeBlock) {
        e.preventDefault();
        insertCodeSmart(lastCodeBlock, null);
      }
    },
    true
  );

  // Init
  loadSettings().then(async () => {
    applyAppearance();
    applyExamMode();
    applyCorner(settings.corner || "bottom-right");
    await restoreMessages();
    renderMessages();
    updateCost();
    setOaStatus("Ready — click a field, then Insert at cursor");
  });

  // Re-assert shield while open in exam mode
  setInterval(() => {
    if (open && settings.examMode) setShield(true);
  }, 2000);
})();
