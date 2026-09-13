const families = {
  purple: [
    "Фиолетовая",
    "#18121e",
    "#292034",
    "#40304f",
    "#f5edfa",
    "#baa7ca",
    "#564267",
    "#c8a0f0",
    "#47305e",
    "#734298",
  ],
  brown: [
    "Коричневая",
    "#1b1511",
    "#2c221b",
    "#46352a",
    "#f8f0e8",
    "#c3ad99",
    "#614937",
    "#dda877",
    "#513824",
    "#88552d",
  ],
  blue: [
    "Синяя",
    "#11151d",
    "#1b2230",
    "#283449",
    "#edf2fa",
    "#9aaac1",
    "#344158",
    "#739cff",
    "#293f68",
    "#315ed1",
  ],
  red: [
    "Красная",
    "#1d1115",
    "#301c23",
    "#492b35",
    "#faedf0",
    "#c69fa9",
    "#623c49",
    "#f29bb0",
    "#582b3a",
    "#b13555",
  ],
  yellow: [
    "Жёлтая",
    "#19180e",
    "#2b2918",
    "#434024",
    "#faf6de",
    "#c1bc91",
    "#5c5731",
    "#e5cc68",
    "#4d451d",
    "#796215",
  ],
  green: [
    "Зелёная",
    "#101914",
    "#1b2b22",
    "#294234",
    "#edf7f0",
    "#a4bcae",
    "#3d5b49",
    "#82d9a2",
    "#294d38",
    "#267745",
  ],
};
function mix(a, b, t) {
  return (
    "#" +
    [0, 2, 4]
      .map((i) =>
        Math.round(
          parseInt(a.slice(i + 1, i + 3), 16) * (1 - t) +
            parseInt(b.slice(i + 1, i + 3), 16) * t,
        )
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
function onAccent(hex) {
  const rgb = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 > 0.179
    ? "#111111"
    : "#ffffff";
}
const themes = {};
for (const [
  family,
  [name, bg, panel, hover, text, muted, border, accent, selected, lightAccent],
] of Object.entries(families)) {
  themes[family + "-dark"] = {
    id: family + "-dark",
    name: "Тёмно-" + name.toLowerCase(),
    mode: "dark",
    bg,
    panel,
    hover,
    text,
    muted,
    border,
    accent,
    selected,
    onAccent: onAccent(accent),
  };
  themes[family + "-light"] = {
    id: family + "-light",
    name: "Светло-" + name.toLowerCase(),
    mode: "light",
    bg: mix(accent, "#ffffff", 0.91),
    panel: mix(accent, "#ffffff", 0.98),
    hover: mix(accent, "#ffffff", 0.78),
    text: mix(lightAccent, "#111111", 0.7),
    muted: mix(lightAccent, "#555555", 0.65),
    border: mix(lightAccent, "#ffffff", 0.72),
    accent: lightAccent,
    selected: mix(accent, "#ffffff", 0.72),
    onAccent: onAccent(lightAccent),
  };
}
function validTheme(id, widget = false) {
  return (
    Object.hasOwn(themes, id) ||
    id === "system" ||
    (widget && ["app", "custom"].includes(id))
  );
}
function resolveTheme(id, system = { accent: "#739cff", dark: true }) {
  if (id === "system") {
    const base = themes["blue-" + (system.dark ? "dark" : "light")];
    const accent = /^#[a-f0-9]{6}$/i.test(system.accent)
      ? system.accent
      : base.accent;
    return {
      ...base,
      id: "system",
      name: "Акцент Windows",
      accent,
      onAccent: onAccent(accent),
      selected: mix(accent, base.bg, 0.8),
    };
  }
  return themes[id] || themes["purple-dark"];
}
function appearance(p = {}) {
  return {
    theme: validTheme(p.theme) ? p.theme : "purple-dark",
    opacity: Number.isFinite(p.opacity)
      ? Math.max(35, Math.min(100, p.opacity))
      : 100,
  };
}
function resolveWidget(w, appAppearance, system) {
  if (!w.theme || w.theme === "custom")
    return { ...w, theme: "custom", accentForeground: onAccent(w.accent) };
  const t = resolveTheme(
    w.theme === "app" ? appAppearance.theme : w.theme,
    system,
  );
  return {
    ...w,
    background: t.panel,
    foreground: t.text,
    accent: t.accent,
    accentForeground: t.onAccent,
  };
}
module.exports = {
  themes,
  validTheme,
  resolveTheme,
  resolveWidget,
  appearance,
  onAccent,
};
