/** Shared model list + defaults for Floatbot */
const FLOATBOT_MODELS = [
  { id: "gpt-4o-mini", label: "GPT-4o Mini", tag: "Lite" },
  { id: "gpt-4.1-mini", label: "GPT-4.1 Mini", tag: "Lite" },
  { id: "gpt-4o", label: "GPT-4o", tag: "Max" },
  { id: "gpt-4.1", label: "GPT-4.1", tag: "Max" },
  { id: "o4-mini", label: "o4-mini", tag: "Lite" },
  { id: "o3-mini", label: "o3-mini", tag: "Max" },
];

const FLOATBOT_PROVIDERS = [
  { id: "openai", label: "OpenAI", base: "https://api.openai.com/v1" },
  { id: "groq", label: "Groq", base: "https://api.groq.com/openai/v1" },
  { id: "openrouter", label: "OpenRouter", base: "https://openrouter.ai/api/v1" },
  { id: "custom", label: "Custom", base: "" },
];

const FLOATBOT_DEFAULTS = {
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
    "You are Floatbot, a coding interview / OA assistant. Be concise. Prefer correct, clean solutions. Format in Markdown. Put full solutions in a single fenced code block with a language tag. Mention time and space complexity briefly.",
};

function floatbotModelOptionsHtml(selected) {
  return FLOATBOT_MODELS.map((m) => {
    const sel = m.id === selected ? " selected" : "";
    return `<option value="${m.id}"${sel}>${m.label} · ${m.tag}</option>`;
  }).join("");
}
