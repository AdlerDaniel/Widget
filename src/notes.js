const { randomUUID } = require("node:crypto");
function normalizeNotes(w) {
  if (w.type !== "note") return w;
  const notes =
    Array.isArray(w.notes) && w.notes.length
      ? w.notes
      : [{ id: "first", title: "", text: w.text || "" }];
  const activeNoteId = notes.some((n) => n.id === w.activeNoteId)
    ? w.activeNoteId
    : notes[0].id;
  return {
    ...w,
    notes,
    activeNoteId,
    text: notes.find((n) => n.id === activeNoteId).text,
  };
}
function patchNotes(w, patch) {
  if (w.type !== "note") return w;
  const out = normalizeNotes(w),
    notes = out.notes.map((n) => ({ ...n }));
  if (typeof patch.text === "string")
    notes.find((n) => n.id === out.activeNoteId).text = patch.text.slice(
      0,
      100000,
    );
  const a = patch.noteAction;
  if (a && typeof a === "object") {
    if (a.type === "add") {
      if (notes.length >= 100)
        throw Error("В одном виджете можно хранить до 100 заметок");
      const n = { id: randomUUID(), title: "", text: "" };
      notes.push(n);
      out.activeNoteId = n.id;
    } else {
      const index = notes.findIndex((n) => n.id === a.id);
      if (index < 0) throw Error("Заметка не найдена");
      if (a.type === "select") out.activeNoteId = a.id;
      if (a.type === "update") {
        if (typeof a.title === "string")
          notes[index].title = a.title.slice(0, 150);
        if (typeof a.text === "string")
          notes[index].text = a.text.slice(0, 100000);
      }
      if (a.type === "delete") {
        notes.splice(index, 1);
        if (!notes.length)
          notes.push({ id: randomUUID(), title: "", text: "" });
        if (out.activeNoteId === a.id)
          out.activeNoteId = notes[Math.min(index, notes.length - 1)].id;
      }
    }
  }
  return {
    ...out,
    notes,
    text: notes.find((n) => n.id === out.activeNoteId).text,
  };
}
module.exports = { normalizeNotes, patchNotes };
