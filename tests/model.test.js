const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { createWidget, patchWidget, clampBounds } = require("../src/model");
const Store = require("../src/store");
test("calendar records survive other edits and can be deleted independently", () => {
  let w = createWidget("calendar");
  w = patchWidget(w, { event: { date: "2026-09-13", text: "План" } });
  w = patchWidget(w, { event: { date: "2026-09-14", text: "Встреча" } });
  w = patchWidget(w, { background: "#ffffff" });
  assert.equal(w.events["2026-09-13"], "План");
  w = patchWidget(w, { event: { date: "2026-09-13", text: "" } });
  assert.deepEqual(w.events, { "2026-09-14": "Встреча" });
});
test("untrusted fields cannot replace ids, types or local photo paths", () => {
  const w = createWidget("note");
  const p = patchWidget(w, {
    id: "bad",
    type: "photo",
    photo: "https://bad",
    opacity: -500,
    width: 90000,
    background: "url(x)",
  });
  assert.equal(p.id, w.id);
  assert.equal(p.type, "note");
  assert.equal(p.photo, "");
  assert.equal(p.opacity, 25);
  assert.equal(p.width, 900);
  assert.equal(p.background, w.background);
});
test("disconnected monitors recover coordinates and negative monitor positions work", () => {
  const w = { ...createWidget("clock"), x: 3000, y: 3000 };
  const r = clampBounds(w, [{ x: 0, y: 0, width: 1920, height: 1080 }]);
  assert.ok(r.x + r.width <= 1920);
  assert.ok(r.y + r.height <= 1080);
  assert.equal(
    clampBounds({ ...w, x: -1000, y: 100 }, [
      { x: -1920, y: 0, width: 1920, height: 1080 },
    ]).x,
    -1000,
  );
});
test("settings persist unicode and recover from a corrupt primary file", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "widget-test-"));
  try {
    let s = new Store(dir);
    s.data.widgets = [{ ...createWidget("note"), text: "Моя заметка 🌿" }];
    s.save();
    s.save();
    fs.writeFileSync(s.file, "broken");
    s = new Store(dir);
    assert.equal(s.data.widgets[0].text, "Моя заметка 🌿");
    assert.equal(s.recovered, true);
    s.save();
    assert.equal(new Store(dir).data.widgets.length, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
