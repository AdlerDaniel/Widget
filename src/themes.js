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
function luminance(hex) {
  const rgb = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
function contrastRatio(a, b) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}
function contrastText(background, preferred = "#ffffff") {
  if (
    /^#[a-f0-9]{6}$/i.test(preferred) &&
    contrastRatio(background, preferred) >= 4.5
  )
    return preferred;
  return contrastRatio(background, "#ffffff") >=
    contrastRatio(background, "#111111")
    ? "#ffffff"
    : "#111111";
}
function readableColor(background, color) {
  if (contrastRatio(background, color) >= 4.5) return color;
  const target =
    contrastRatio(background, "#ffffff") >= contrastRatio(background, "#111111")
      ? "#ffffff"
      : "#111111";
  for (let amount = 0.05; amount <= 1; amount += 0.05) {
    const candidate = mix(color, target, amount);
    if (contrastRatio(background, candidate) >= 4.5) return candidate;
  }
  return target;
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
    const dark = system.dark === true;
    const bg = dark
      ? mix(accent, "#101318", 0.88)
      : mix(accent, "#ffffff", 0.94);
    const panel = dark
      ? mix(accent, "#1b2027", 0.86)
      : mix(accent, "#ffffff", 0.975);
    const text = contrastText(panel, dark ? "#f4f6f8" : "#17191c");
    return {
      id: "system",
      name: "Акцент Windows",
      mode: dark ? "dark" : "light",
      bg,
      panel,
      hover: mix(accent, panel, dark ? 0.72 : 0.82),
      text,
      muted: mix(text, panel, 0.42),
      border: mix(accent, panel, dark ? 0.58 : 0.7),
      accent,
      onAccent: onAccent(accent),
      selected: mix(accent, panel, dark ? 0.68 : 0.8),
    };
  }
  return themes[id] || themes["purple-dark"];
}
function appearance(p = {}) {
  const theme = validTheme(p.theme) ? p.theme : "purple-dark";
  return {
    theme,
    opacity: Number.isFinite(p.opacity)
      ? Math.max(35, Math.min(100, p.opacity))
      : 100,
    autoTextContrast: p.autoTextContrast !== false,
    foreground: /^#[a-f0-9]{6}$/i.test(p.foreground || "")
      ? p.foreground
      : resolveTheme(theme).text,
  };
}
function resolveAppearance(p, system) {
  const a = appearance(p);
  const palette = resolveTheme(a.theme, system);
  const text = a.autoTextContrast
    ? contrastText(palette.bg, palette.text)
    : a.foreground;
  const accentText = readableColor(
    palette.panel,
    readableColor(palette.bg, palette.accent),
  );
  return {
    ...palette,
    text,
    accentText,
    icon: contrastText(palette.panel, text),
  };
}
function resolveWidget(w, appAppearance, system) {
  let t;
  const custom = !w.theme || w.theme === "custom";
  if (custom) t = { panel: w.background, text: w.foreground, accent: w.accent };
  else
    t = resolveTheme(w.theme === "app" ? appAppearance.theme : w.theme, system);
  const autoTextContrast = w.autoTextContrast !== false;
  const foreground =
    autoTextContrast === false ? w.foreground : contrastText(t.panel, t.text);
  const accentText = readableColor(t.panel, t.accent);
  return {
    ...w,
    theme: custom ? "custom" : w.theme,
    autoTextContrast,
    background: t.panel,
    foreground,
    accent: t.accent,
    accentText,
    accentForeground: onAccent(t.accent),
  };
}
module.exports = {
  themes,
  validTheme,
  resolveTheme,
  resolveAppearance,
  resolveWidget,
  appearance,
  onAccent,
  contrastRatio,
  contrastText,
  readableColor,
};
