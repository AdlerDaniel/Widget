let noteListOpen = false,
  renderedNoteId = null;
function noteName(n) {
  return (
    n.title?.trim() ||
    n.text?.trim().split("\n")[0].slice(0, 55) ||
    "Без названия"
  );
}
function notesContent(w) {
  const notes = w.notes || [{ id: "first", title: "", text: w.text || "" }],
    n = notes.find((n) => n.id === w.activeNoteId) || notes[0];
  return `<div class="widget-content notes-content"><div class="notes-toolbar"><button id="notes-list-toggle" aria-expanded="${noteListOpen}" title="Список заметок">${noteListOpen ? "← К записи" : "Список"} <span>${notes.length}</span></button><button id="note-add" title="Добавить заметку" aria-label="Добавить заметку">＋</button></div>${noteListOpen ? `<div class="notes-list" aria-label="Список заметок">${notes.map((item) => `<button class="note-list-item ${item.id === n.id ? "active" : ""}" data-note-id="${esc(item.id)}"><strong>${esc(noteName(item))}</strong><span>${esc(item.text.replace(/\n/g, " ").slice(0, 100) || "Пустая заметка")}</span></button>`).join("")}</div>` : `<input class="note-title-input" id="note-title" maxlength="150" aria-label="Название заметки" placeholder="Название заметки" value="${esc(n.title || "")}"><textarea class="note-area" id="note" placeholder="Запишите важное…" aria-label="Текст заметки">${esc(n.text)}</textarea><div class="note-actions"><button id="note-save">Сохранить</button><span id="note-status" role="status">Автосохранение</span><button id="note-delete" aria-label="Удалить заметку" title="Удалить заметку">Удалить</button></div>`}</div>`;
}
function bindNotes(w) {
  if (w.type !== "note") return;
  const active = w.activeNoteId || "first";
  const send = (a) => api.patch(id, { noteAction: a });
  const change = async (a) => {
    document.activeElement?.blur();
    noteListOpen = false;
    await send(a);
  };
  bind("#notes-list-toggle", () => {
    document.activeElement?.blur();
    noteListOpen = !noteListOpen;
    renderWidget();
  });
  bind("#note-add", () => change({ type: "add" }));
  root
    .querySelectorAll("[data-note-id]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          act(() => change({ type: "select", id: b.dataset.noteId }))),
    );
  const title = document.querySelector("#note-title"),
    text = document.querySelector("#note");
  if (title)
    title.oninput = () =>
      act(() => send({ type: "update", id: active, title: title.value }));
  if (text)
    text.oninput = () =>
      act(() => send({ type: "update", id: active, text: text.value }));
  bind("#note-save", async () => {
    await send({
      type: "update",
      id: active,
      title: title.value,
      text: text.value,
    });
    const status = document.querySelector("#note-status");
    if (status) status.textContent = "Сохранено ✓";
  });
  bind("#note-delete", () => {
    const b = document.querySelector("#note-delete");
    if (b.dataset.confirm !== "yes") {
      b.dataset.confirm = "yes";
      b.textContent = "Удалить?";
      return;
    }
    return change({ type: "delete", id: active });
  });
}
function calendarMarkerControls(w) {
  const marker = w.eventMarkers?.[selectedDate] || {};
  return `<div class="event-markers"><select id="event-marker-style" aria-label="Вид отметки даты">${[
    ["dot", "Точка снизу"],
    ["ring", "Обводка даты"],
    ["text", "Цвет цифры"],
  ]
    .map(
      ([v, t]) =>
        `<option value="${v}" ${(marker.style || "dot") === v ? "selected" : ""}>${t}</option>`,
    )
    .join(
      "",
    )}</select><label title="Цвет отметки"><span>Цвет</span><input type="color" id="event-marker-color" aria-label="Цвет отметки даты" value="${esc(marker.color || w.accent)}"></label></div>`;
}
