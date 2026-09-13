const { test } = require("node:test"),
  assert = require("node:assert/strict");
const { createWidget, patchWidget } = require("../src/model");
const { normalizeNotes } = require("../src/notes");
test("legacy text becomes the first note without loss", () => {
  const w = normalizeNotes({
    type: "note",
    text: "Старая запись\nВторая строка",
  });
  assert.equal(w.notes[0].text, w.text);
  assert.equal(w.activeNoteId, w.notes[0].id);
  assert.deepEqual(normalizeNotes(w), w);
});
test("notes can be added, renamed, switched and removed without replacing other records", () => {
  let w = patchWidget(createWidget("note"), { text: "Первая" }),
    first = w.activeNoteId;
  w = patchWidget(w, { noteAction: { type: "add" } });
  const second = w.activeNoteId;
  w = patchWidget(w, {
    noteAction: { type: "update", id: second, title: "Работа", text: "Вторая" },
  });
  w = patchWidget(w, { noteAction: { type: "select", id: first } });
  assert.equal(w.text, "Первая");
  w = patchWidget(w, {
    noteAction: { type: "update", id: second, text: "Другая" },
  });
  assert.equal(w.text, "Первая");
  assert.equal(w.notes[1].title, "Работа");
  w = patchWidget(w, { text: "Исправленная первая" });
  assert.equal(w.notes[0].text, w.text);
  w = patchWidget(w, { noteAction: { type: "delete", id: first } });
  assert.equal(w.text, "Другая");
  w = patchWidget(w, { noteAction: { type: "delete", id: second } });
  assert.equal(w.notes.length, 1);
  assert.equal(w.text, "");
  assert.throws(() =>
    patchWidget(w, { noteAction: { type: "select", id: "missing" } }),
  );
});
test("calendar markers are independently styled and survive text edits", () => {
  let w = createWidget("calendar");
  w = patchWidget(w, {
    event: {
      date: "2026-09-15",
      text: "План",
      markerStyle: "ring",
      markerColor: "#ff4321",
    },
  });
  w = patchWidget(w, {
    event: {
      date: "2026-09-16",
      text: "Другой",
      markerStyle: "text",
      markerColor: "#33aaee",
    },
  });
  w = patchWidget(w, { event: { date: "2026-09-15", text: "Новый план" } });
  assert.deepEqual(w.eventMarkers["2026-09-15"], {
    style: "ring",
    color: "#ff4321",
  });
  w = patchWidget(w, {
    event: { date: "2026-09-15", markerStyle: "invalid", markerColor: "bad" },
  });
  assert.equal(w.eventMarkers["2026-09-15"].style, "ring");
  w = patchWidget(w, { event: { date: "2026-09-15", text: "" } });
  assert.equal(w.eventMarkers["2026-09-15"], undefined);
  assert.equal(w.events["2026-09-16"], "Другой");
});
