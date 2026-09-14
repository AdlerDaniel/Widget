const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  themes,
  resolveWidget,
  resolveTheme,
  appearance,
  onAccent,
  contrastRatio,
  resolveAppearance,
} = require("../src/themes");
const { createWidget, patchWidget } = require("../src/model");
test("twelve palettes and existing MediaCategorize colors", () => {
  assert.equal(Object.keys(themes).length, 12);
  assert.equal(themes["purple-dark"].accent, "#c8a0f0");
  assert.equal(themes["brown-dark"].bg, "#1b1511");
  for (const t of Object.values(themes))
    for (const field of ["bg", "panel", "text", "accent", "onAccent"])
      assert.match(t[field], /^#[a-f0-9]{6}$/i);
});
test("legacy widgets preserve colors, content, bounds and opacity", () => {
  const w = {
    ...createWidget("note"),
    theme: undefined,
    text: "Запись",
    background: "#123456",
    opacity: 65,
    x: -900,
  };
  const r = resolveWidget(
    w,
    { theme: "red-light" },
    { accent: "#ff00ff", dark: false },
  );
  assert.equal(r.background, w.background);
  assert.equal(r.text, w.text);
  assert.equal(r.opacity, 65);
  assert.equal(r.x, -900);
  assert.equal(r.theme, "custom");
  assert.equal(r.autoTextContrast, true);
  assert.equal(r.foreground, w.foreground);
});
test("inherited themes track app; independent themes do not", () => {
  const w = createWidget("calendar");
  assert.equal(
    resolveWidget(w, { theme: "green-light" }, {}).background,
    themes["green-light"].panel,
  );
  const independent = patchWidget(w, { theme: "brown-dark" });
  assert.equal(
    resolveWidget(independent, { theme: "red-light" }, {}).accent,
    themes["brown-dark"].accent,
  );
  assert.equal(independent.opacity, w.opacity);
});
test("system accent follows exact Windows RGB and mode", () => {
  for (const dark of [false, true]) {
    const p = resolveTheme("system", { accent: "#ff6600", dark });
    assert.equal(p.accent, "#ff6600");
    assert.equal(p.mode, dark ? "dark" : "light");
  }
  assert.equal(onAccent("#ffffff"), "#111111");
  assert.equal(onAccent("#000000"), "#ffffff");
});
test("appearance limits and invalid theme input are safe", () => {
  assert.equal(appearance({ opacity: 0 }).opacity, 35);
  assert.equal(appearance({ opacity: 500 }).opacity, 100);
  assert.equal(appearance({ theme: "__proto__" }).theme, "purple-dark");
  assert.equal(
    patchWidget(createWidget("note"), { theme: "nope" }).theme,
    "app",
  );
});
test("automatic text reaches readable contrast and manual colors stay independent", () => {
  const app = resolveAppearance(
    { theme: "purple-dark", foreground: "#18121e" },
    {},
  );
  assert.ok(contrastRatio(app.bg, app.text) >= 4.5);
  assert.ok(contrastRatio(app.panel, app.icon) >= 4.5);
  const manualApp = resolveAppearance(
    {
      theme: "purple-dark",
      foreground: "#ff22aa",
      autoTextContrast: false,
    },
    {},
  );
  assert.equal(manualApp.text, "#ff22aa");
  const themed = patchWidget(createWidget("clock"), {
    foreground: "#12ab34",
    autoTextContrast: false,
  });
  assert.equal(themed.theme, "app");
  assert.equal(
    resolveWidget(themed, { theme: "brown-dark" }, {}).foreground,
    "#12ab34",
  );
});
