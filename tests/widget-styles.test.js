const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createWidget, patchWidget } = require("../src/model");
const { styles, resizeBounds, styleDefaults } = require("../src/widget-styles");

test("each widget offers card, transparent and distinct styles", () => {
  for (const type of Object.keys(styles)) {
    assert.ok(styles[type].some((style) => style.id === "card"));
    assert.ok(styles[type].some((style) => style.id === "bare"));
    assert.ok(styles[type].some((style) => style.id === "glass"));
    assert.ok(styles[type].length >= 4);
  }
});

test("quote includes its landscape style and hides its heading by default", () => {
  assert.ok(styles.quote);
  for (const id of ["card", "bare", "glass", "quote-landscape"])
    assert.ok(styles.quote.some((style) => style.id === id));
  assert.equal(styleDefaults("quote-landscape").showTitle, false);
  assert.equal(styleDefaults("quote-landscape").showBackground, true);
});

test("frameless photo preset removes header and background without changing photo", () => {
  const w = {
    ...createWidget("photo"),
    photo: "file:///photo.png",
    x: 44,
    y: 88,
  };
  const p = patchWidget(w, { style: "photo-edge" });
  assert.equal(p.showTitle, false);
  assert.equal(p.showBackground, false);
  assert.equal(p.photo, w.photo);
  assert.equal(p.x, w.x);
  assert.equal(p.y, w.y);
});

test("styles are type-specific and heading/background remain independent", () => {
  const w = createWidget("clock");
  assert.equal(patchWidget(w, { style: "photo-round" }).style, "card");
  const p = patchWidget(w, {
    style: "bare",
    showTitle: false,
    showBackground: true,
  });
  assert.equal(p.showTitle, false);
  assert.equal(p.showBackground, true);
});

test("resize stays anchored and respects type-specific bounds", () => {
  const calendar = createWidget("calendar");
  assert.deepEqual(resizeBounds(calendar, -999, -999), {
    width: 300,
    height: 400,
  });
  assert.deepEqual(resizeBounds(calendar, 9999, 9999), {
    width: 900,
    height: 1000,
  });
  assert.deepEqual(resizeBounds(calendar, 43, 21), {
    width: 393,
    height: 461,
  });
  assert.equal(calendar.width, 350);
  assert.deepEqual(resizeBounds(createWidget("quote"), -999, -999), {
    width: 260,
    height: 190,
  });
});
