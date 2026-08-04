const form = document.getElementById("form");
const statusEl = document.getElementById("status");
const modelSelect = document.getElementById("model");
const providerSelect = document.getElementById("provider");
const modelHint = document.getElementById("modelHint");
const apiBaseEl = document.getElementById("apiBase");

const bubbleSizeEl = document.getElementById("bubbleSize");
const bubbleOpacityEl = document.getElementById("bubbleOpacity");
const chatOpacityEl = document.getElementById("chatOpacity");
const chatFontSizeEl = document.getElementById("chatFontSize");

function fillModelSelect(selected) {
  const value = selected || FLOATBOT_DEFAULTS.model;
  modelSelect.innerHTML = FLOATBOT_MODELS.map((m) => {
    const sel = m.id === value ? " selected" : "";
    return `<option value="${m.id}"${sel}>${m.label} · ${m.tag}</option>`;
  }).join("");

  if (value && !FLOATBOT_MODELS.some((m) => m.id === value)) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = `${value} · Custom`;
    opt.selected = true;
    modelSelect.appendChild(opt);
  }
  updateModelHint();
}

function fillProviders(selected) {
  const cur = selected || FLOATBOT_DEFAULTS.provider;
  providerSelect.innerHTML = FLOATBOT_PROVIDERS.map((p) => {
    const sel = p.id === cur ? " selected" : "";
    return `<option value="${p.id}"${sel}>${p.label}</option>`;
  }).join("");
}

function updateModelHint() {
  const m = FLOATBOT_MODELS.find((x) => x.id === modelSelect.value);
  if (!m) {
    modelHint.textContent = "Custom model";
    return;
  }
  modelHint.innerHTML =
    m.tag === "Lite"
      ? `<span class="tag lite">Lite</span> Faster & cheaper`
      : `<span class="tag max">Max</span> Stronger reasoning`;
}

function syncRangeLabels() {
  document.getElementById("bubbleSizeVal").textContent = `${bubbleSizeEl.value}px`;
  document.getElementById("bubbleOpacityVal").textContent = `${bubbleOpacityEl.value}%`;
  document.getElementById("chatOpacityVal").textContent = `${chatOpacityEl.value}%`;
  document.getElementById("chatFontSizeVal").textContent = `${chatFontSizeEl.value}px`;
}

function applyProviderBase() {
  const p = FLOATBOT_PROVIDERS.find((x) => x.id === providerSelect.value);
  if (p && p.base) apiBaseEl.value = p.base;
}

modelSelect.addEventListener("change", updateModelHint);
providerSelect.addEventListener("change", applyProviderBase);
[bubbleSizeEl, bubbleOpacityEl, chatOpacityEl, chatFontSizeEl].forEach((el) => {
  el.addEventListener("input", syncRangeLabels);
});

chrome.storage.sync.get(FLOATBOT_DEFAULTS, (data) => {
  document.getElementById("apiKey").value = data.apiKey || "";
  apiBaseEl.value = data.apiBase || FLOATBOT_DEFAULTS.apiBase;
  document.getElementById("systemPrompt").value =
    data.systemPrompt || FLOATBOT_DEFAULTS.systemPrompt;
  fillProviders(data.provider || FLOATBOT_DEFAULTS.provider);
  fillModelSelect(data.model || FLOATBOT_DEFAULTS.model);

  bubbleSizeEl.value = data.bubbleSize ?? FLOATBOT_DEFAULTS.bubbleSize;
  bubbleOpacityEl.value = Math.round((data.bubbleOpacity ?? FLOATBOT_DEFAULTS.bubbleOpacity) * 100);
  chatOpacityEl.value = Math.round((data.chatOpacity ?? FLOATBOT_DEFAULTS.chatOpacity) * 100);
  chatFontSizeEl.value = data.chatFontSize ?? FLOATBOT_DEFAULTS.chatFontSize;
  document.getElementById("examMode").checked = !!data.examMode;
  document.getElementById("streamEnabled").checked = data.streamEnabled !== false;
  document.getElementById("typedInsert").checked = !!data.typedInsert;
  document.getElementById("persistChats").checked = data.persistChats !== false;
  syncRangeLabels();
});

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const next = {
    apiKey: document.getElementById("apiKey").value.trim(),
    apiBase: apiBaseEl.value.trim() || FLOATBOT_DEFAULTS.apiBase,
    provider: providerSelect.value || FLOATBOT_DEFAULTS.provider,
    model: modelSelect.value || FLOATBOT_DEFAULTS.model,
    systemPrompt:
      document.getElementById("systemPrompt").value.trim() || FLOATBOT_DEFAULTS.systemPrompt,
    bubbleSize: Number(bubbleSizeEl.value) || FLOATBOT_DEFAULTS.bubbleSize,
    bubbleOpacity: Math.min(1, Math.max(0.2, Number(bubbleOpacityEl.value) / 100)),
    chatOpacity: Math.min(1, Math.max(0.4, Number(chatOpacityEl.value) / 100)),
    chatFontSize: Number(chatFontSizeEl.value) || FLOATBOT_DEFAULTS.chatFontSize,
    examMode: document.getElementById("examMode").checked,
    streamEnabled: document.getElementById("streamEnabled").checked,
    typedInsert: document.getElementById("typedInsert").checked,
    persistChats: document.getElementById("persistChats").checked,
  };
  chrome.storage.sync.set(next, () => {
    statusEl.textContent = "Saved.";
    setTimeout(() => {
      statusEl.textContent = "";
    }, 1600);
  });
});
