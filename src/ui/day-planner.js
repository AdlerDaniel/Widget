"use strict";

const dayPlanner = (() => {
  const palette = ["violet", "blue", "teal", "green", "amber", "coral", "pink"];
  const pxPerMinute = 0.8;
  let selected = null;
  let expanded = false;
  let initialized = false;
  let completedOpen = false;
  let calendarOpen = false;
  let editor = null;
  let timelineScroll = 0;
  let autoScroll = true;
  let lastToday = null;
  let composing = false;
  let suspendedDraft = null;
  let pendingDraft = Promise.resolve();

  const timeMinutes = (value) =>
    Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  const clock = (value) =>
    `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
  const today = () => dateKey(new Date());
  const taskTime = (task) =>
    task.type === "time"
      ? task.time
      : task.type === "range"
        ? `${task.startTime}–${task.endTime}`
        : "";
  const range = (w) =>
    w.plannerRange === "all"
      ? [0, 24]
      : w.plannerRange === "early"
        ? [6, 24]
        : w.plannerRange === "custom"
          ? [w.plannerStart, w.plannerEnd]
          : [8, 22];
  function overdue(task) {
    if (task.completed) return false;
    if (task.date < today()) return true;
    if (task.date !== today() || task.type === "anytime") return false;
    const now = new Date();
    return (
      timeMinutes(task.type === "range" ? task.endTime : task.time) <
      now.getHours() * 60 + now.getMinutes()
    );
  }
  function taskOrder(task) {
    if (task.completed) return 4;
    if (overdue(task)) return 0;
    return { anytime: 1, time: 2, range: 3 }[task.type];
  }
  function tasksFor(w) {
    return (w.plannerTasks || [])
      .filter((task) => task.date === selected)
      .sort(
        (a, b) =>
          taskOrder(a) - taskOrder(b) ||
          (a.time || a.startTime || "").localeCompare(
            b.time || b.startTime || "",
          ) ||
          a.createdAt.localeCompare(b.createdAt),
      );
  }
  function row(task) {
    return `<div class="planner-task planner-color-${task.color} ${task.completed ? "is-complete" : ""} ${overdue(task) ? "is-overdue" : ""}"><input type="checkbox" data-planner-toggle="${esc(task.id)}" aria-label="Выполнить ${esc(task.title)}" ${task.completed ? "checked" : ""}><button type="button" class="planner-task-open" data-planner-open="${esc(task.id)}"><span class="planner-task-time">${overdue(task) ? '<span class="planner-overdue">!</span>' : ""}${esc(taskTime(task))}</span><span class="planner-task-title">${esc(task.title)}</span></button></div>`;
  }
  function compact(w, tasks) {
    const active = tasks.filter((task) => !task.completed);
    const completed = tasks.filter((task) => task.completed);
    return `<div class="planner-list planner-scroll">${active.length ? active.map(row).join("") : `<p class="planner-empty">${selected === today() ? "На сегодня задач нет" : "На этот день задач нет"}</p>`}${w.plannerShowCompleted !== false && completed.length ? `<button type="button" class="planner-completed-head" id="planner-completed">Выполнено · ${completed.length} <span>${completedOpen ? "⌃" : "⌄"}</span></button><div class="planner-completed ${completedOpen ? "is-open" : ""}">${completedOpen ? completed.map(row).join("") : ""}</div>` : ""}</div>`;
  }
  function layout(blocks) {
    const sorted = blocks
      .slice()
      .sort((a, b) => a.start - b.start || b.end - a.end);
    let group = [],
      groupEnd = -1;
    const groups = [];
    for (const block of sorted) {
      if (block.start >= groupEnd && group.length) {
        groups.push(group);
        group = [];
        groupEnd = -1;
      }
      group.push(block);
      groupEnd = Math.max(groupEnd, block.end);
    }
    if (group.length) groups.push(group);
    for (const items of groups) {
      const ends = [];
      for (const block of items) {
        let column = ends.findIndex((end) => end <= block.start);
        if (column < 0) column = ends.length;
        ends[column] = block.end;
        block.column = column;
      }
      for (const block of items) block.columns = ends.length;
    }
    return sorted;
  }
  function schedule(w, tasks) {
    const [firstHour, lastHour] = range(w);
    const start = firstHour * 60,
      end = lastHour * 60;
    const anytime = tasks.filter(
      (task) => task.type === "anytime" && !task.completed,
    );
    const timed = tasks.filter(
      (task) => task.type !== "anytime" && !task.completed,
    );
    const outside = timed.filter(
      (task) =>
        timeMinutes(task.type === "range" ? task.endTime : task.time) <=
          start ||
        timeMinutes(task.type === "range" ? task.startTime : task.time) >= end,
    );
    const blocks = layout(
      timed
        .filter((task) => !outside.includes(task))
        .map((task) => ({
          task,
          start: Math.max(
            start,
            timeMinutes(task.type === "range" ? task.startTime : task.time),
          ),
          end: Math.min(
            end,
            timeMinutes(task.type === "range" ? task.endTime : task.time) +
              (task.type === "time" ? 30 : 0),
          ),
        })),
    );
    const gridStep = w.plannerGridStep || 30;
    const ticks = [];
    for (let minute = start; minute <= end; minute += gridStep)
      ticks.push(
        `<div class="planner-tick ${minute % 60 === 0 ? "is-hour" : ""}" style="top:${(minute - start) * pxPerMinute}px">${minute % 60 === 0 ? `<span>${clock(minute)}</span>` : ""}</div>`,
      );
    const now = new Date();
    const current = now.getHours() * 60 + now.getMinutes();
    const nowLine =
      selected === today() && current >= start && current <= end
        ? `<div class="planner-now" style="top:${(current - start) * pxPerMinute}px"><i></i></div>`
        : "";
    const completed = tasks.filter((task) => task.completed);
    return `<div class="planner-day-body"><div class="planner-all-day"><span>На день</span><div>${anytime.length ? anytime.map(row).join("") : '<span class="planner-muted">Свободно</span>'}</div></div>${outside.length ? `<div class="planner-outside"><span>Вне шкалы</span>${outside.map(row).join("")}</div>` : ""}${w.plannerShowCompleted !== false && completed.length ? `<div class="planner-day-completed"><button type="button" class="planner-completed-head" id="planner-completed">Выполнено · ${completed.length} <span>${completedOpen ? "⌃" : "⌄"}</span></button>${completedOpen ? completed.map(row).join("") : ""}</div>` : ""}<div class="planner-timeline planner-scroll" id="planner-timeline"><div class="planner-grid planner-interactive" id="planner-grid" style="height:${(end - start) * pxPerMinute}px" data-start="${start}" data-end="${end}">${ticks.join("")}${blocks
      .map((block) => {
        const task = block.task;
        const top = (block.start - start) * pxPerMinute;
        const height = Math.max(22, (block.end - block.start) * pxPerMinute);
        const width = 100 / block.columns;
        return `<div class="planner-block planner-interactive planner-color-${task.color} ${task.type === "time" ? "is-point" : ""} ${overdue(task) ? "is-overdue" : ""}" data-planner-block="${esc(task.id)}" title="${esc(task.title)} · ${esc(taskTime(task))}" style="top:${top}px;height:${height}px;left:calc(48px + (100% - 48px) * ${block.column / block.columns});width:calc((100% - 48px) * ${width / 100} - 3px)"><input type="checkbox" data-planner-toggle="${esc(task.id)}" aria-label="Выполнить ${esc(task.title)}"><span class="planner-block-title">${esc(task.title)}</span><span class="planner-block-time">${esc(taskTime(task))}</span>${task.type === "range" ? '<span class="planner-resize planner-interactive" data-planner-resize="true" aria-label="Изменить окончание"></span>' : ""}</div>`;
      })
      .join(
        "",
      )}${nowLine}<div class="planner-drag-selection" id="planner-selection" hidden></div><div class="planner-drag-tip" id="planner-drag-tip" hidden></div></div></div></div>`;
  }
  function form(w) {
    if (!editor) return "";
    const editing = !!editor.taskId;
    const input = (key, type, label) =>
      `<label>${label}<input data-planner-field="${key}" type="${type}" value="${esc(editor[key] || "")}" ${key === "title" ? 'id="planner-title" maxlength="300" autocomplete="off" placeholder="Название задачи"' : ""}></label>`;
    return `<form class="planner-form planner-interactive" id="planner-form"><div class="planner-form-head"><strong>${editing ? "Задача" : "Новая задача"}</strong><button type="button" id="planner-close" aria-label="Закрыть">×</button></div>${input("title", "text", "Название")}<div class="planner-types">${[
      ["anytime", "Без времени"],
      ["time", "Время"],
      ["range", "Промежуток"],
    ]
      .map(
        ([value, label]) =>
          `<button type="button" data-planner-type="${value}" class="${editor.type === value ? "is-active" : ""}">${label}</button>`,
      )
      .join(
        "",
      )}</div><div class="planner-form-fields">${editing ? input("date", "date", "Дата") : ""}${editor.type === "time" ? input("time", "time", "Время") : editor.type === "range" ? `${input("startTime", "time", "Начало")}${input("endTime", "time", "Конец")}` : ""}</div><div class="planner-colors" aria-label="Цвет">${palette.map((color) => `<button type="button" data-planner-color="${color}" class="planner-color-${color} ${editor.color === color ? "is-selected" : ""}" aria-label="${color}"></button>`).join("")}</div>${editing ? `<label class="planner-form-check"><input data-planner-field="completed" type="checkbox" ${editor.completed ? "checked" : ""}> Выполнено</label>` : ""}<div class="planner-form-actions"><button type="submit">Сохранить</button>${editing ? '<button type="button" id="planner-delete">Удалить</button>' : ""}</div></form>`;
  }
  function render(w) {
    if (!initialized) {
      initialized = true;
      selected = today();
      lastToday = selected;
      expanded = w.plannerStartMode === "day";
      if (w.plannerDraft) editor = { ...w.plannerDraft };
    }
    timelineScroll =
      document.querySelector("#planner-timeline")?.scrollTop || timelineScroll;
    const tasks = tasksFor(w);
    const completed = tasks.filter((task) => task.completed).length;
    const date = new Date(selected + "T12:00:00");
    const dateText = date.toLocaleDateString("ru-RU", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    return `<div class="widget-content planner-content ${expanded ? "is-day" : ""}"><div class="planner-head planner-interactive"><button id="planner-prev" aria-label="Предыдущий день">‹</button><button id="planner-date" aria-label="Выбрать день">${esc(dateText)}</button><button id="planner-next" aria-label="Следующий день">›</button><button id="planner-mode" aria-label="${expanded ? "Компактный режим" : "Режим День"}" title="${expanded ? "Список" : "День"}">${expanded ? "≡" : "▦"}</button></div><div class="planner-subhead">${selected !== today() ? '<button id="planner-today">Сегодня</button>' : "<span></span>"}${w.plannerShowProgress !== false && !expanded ? `<span>${completed} из ${tasks.length}</span>` : ""}</div>${calendarOpen ? `<input class="planner-date-input planner-interactive" id="planner-date-input" type="date" value="${selected}">` : ""}${expanded ? schedule(w, tasks) : compact(w, tasks)}<div class="planner-footer"><button class="planner-add planner-interactive" id="planner-add">＋ Добавить задачу</button>${!editor && (suspendedDraft || w.plannerDraft) ? '<button class="planner-resume planner-interactive" id="planner-resume">Черновик</button>' : ""}</div>${form(w)}</div>`;
  }
  function rerender() {
    renderWidget();
  }
  function persistDraft(saveNow = false) {
    if (!editor) return pendingDraft;
    const draft = { ...editor };
    pendingDraft = pendingDraft
      .catch(() => {})
      .then(() =>
        api.patch(id, {
          plannerDraft: draft,
          ...(saveNow ? { saveNow: true } : {}),
        }),
      );
    pendingDraft.catch((error) => toast(error.message));
    return pendingDraft;
  }
  function shiftDay(delta) {
    const value = new Date(selected + "T12:00:00");
    value.setDate(value.getDate() + delta);
    selected = dateKey(value);
    if (editor) {
      suspendedDraft = { ...editor };
      persistDraft(true);
      editor = null;
    }
    calendarOpen = false;
    autoScroll = true;
    rerender();
  }
  async function openForm(w, draft) {
    composing = false;
    suspendedDraft = null;
    editor = {
      taskId: draft?.taskId || draft?.id || null,
      title: draft?.title || "",
      date: draft?.date || selected,
      type: draft?.type || "anytime",
      time: draft?.time || "09:00",
      startTime: draft?.startTime || "09:00",
      endTime: draft?.endTime || "09:30",
      color: draft?.color || "violet",
      completed: draft?.completed || false,
    };
    rerender();
    await act(() => persistDraft());
    await act(() => api.focusInput());
    document.querySelector("#planner-title")?.focus();
  }
  async function saveForm() {
    if (!editor || composing) return;
    const draft = { ...editor };
    const action = draft.taskId
      ? { type: "update", id: draft.taskId, task: draft }
      : { type: "add", task: draft };
    editor = null;
    try {
      await pendingDraft;
      await api.patch(id, { plannerAction: action });
      suspendedDraft = null;
      rerender();
    } catch (error) {
      editor = draft;
      rerender();
      toast(
        error.message.replace(
          /^Error invoking remote method '[^']+': Error: /,
          "",
        ),
      );
    }
  }
  function bindPointer(w) {
    const grid = document.querySelector("#planner-grid");
    if (!grid) return;
    let gesture = null;
    const slot = (event) => {
      const y = event.clientY - grid.getBoundingClientRect().top;
      return Math.max(
        Number(grid.dataset.start),
        Math.min(
          Number(grid.dataset.end) - 30,
          Number(grid.dataset.start) + Math.floor(y / (pxPerMinute * 30)) * 30,
        ),
      );
    };
    grid.onpointerdown = (event) => {
      if (event.button !== 0) return;
      if (event.target.closest('input[type="checkbox"]')) return;
      const block = event.target.closest("[data-planner-block]");
      const task =
        block &&
        w.plannerTasks.find((item) => item.id === block.dataset.plannerBlock);
      gesture = {
        task,
        kind: event.target.closest("[data-planner-resize]")
          ? "resize"
          : task
            ? "move"
            : "create",
        first: slot(event),
        last: slot(event),
        y: event.clientY,
        moved: false,
      };
      event.preventDefault();
      event.stopPropagation();
      grid.setPointerCapture(event.pointerId);
    };
    grid.onpointermove = (event) => {
      if (!gesture) return;
      gesture.moved ||= Math.abs(event.clientY - gesture.y) > 4;
      if (!gesture.moved) return;
      const delta =
        Math.round((event.clientY - gesture.y) / (pxPerMinute * 30)) * 30;
      gesture.last = gesture.kind === "create" ? slot(event) : delta;
      const selection = document.querySelector("#planner-selection");
      const tip = document.querySelector("#planner-drag-tip");
      let from, to;
      if (gesture.kind === "create") {
        from = Math.min(gesture.first, gesture.last);
        to = Math.max(gesture.first, gesture.last) + 30;
      } else if (gesture.kind === "resize") {
        from = timeMinutes(gesture.task.startTime);
        to = Math.max(
          from + 30,
          Math.min(1440, timeMinutes(gesture.task.endTime) + delta),
        );
      } else {
        const duration =
          gesture.task.type === "range"
            ? timeMinutes(gesture.task.endTime) -
              timeMinutes(gesture.task.startTime)
            : 30;
        from = Math.max(
          0,
          Math.min(
            1440 - duration,
            timeMinutes(
              gesture.task.type === "range"
                ? gesture.task.startTime
                : gesture.task.time,
            ) + delta,
          ),
        );
        to = from + duration;
      }
      const start = Number(grid.dataset.start);
      selection.hidden = false;
      selection.style.top = `${Math.max(0, (from - start) * pxPerMinute)}px`;
      selection.style.height = `${Math.max(24, (to - from) * pxPerMinute)}px`;
      tip.hidden = false;
      tip.style.top = `${Math.max(0, (from - start) * pxPerMinute - 24)}px`;
      tip.textContent = `${clock(from)}–${clock(to)}`;
    };
    grid.onpointerup = (event) => {
      if (!gesture) return;
      if (grid.hasPointerCapture(event.pointerId))
        grid.releasePointerCapture(event.pointerId);
      const g = gesture;
      gesture = null;
      if (g.kind === "create") {
        const from = Math.min(g.first, g.last),
          to = Math.max(g.first, g.last) + 30;
        openForm(
          w,
          g.moved && to - from > 30
            ? {
                type: "range",
                startTime: clock(from),
                endTime: clock(to),
                date: selected,
              }
            : { type: "time", time: clock(from), date: selected },
        );
      } else if (!g.moved) openForm(w, g.task);
      else {
        const delta = g.last;
        const task = { ...g.task };
        if (g.kind === "resize")
          task.endTime = clock(
            Math.max(
              timeMinutes(task.startTime) + 30,
              Math.min(1440, timeMinutes(task.endTime) + delta),
            ),
          );
        else {
          const duration =
            task.type === "range"
              ? timeMinutes(task.endTime) - timeMinutes(task.startTime)
              : 30;
          const from = Math.max(
            0,
            Math.min(
              1440 - duration,
              timeMinutes(task.type === "range" ? task.startTime : task.time) +
                delta,
            ),
          );
          if (task.type === "range") {
            task.startTime = clock(from);
            task.endTime = clock(from + duration);
          } else task.time = clock(from);
        }
        act(() =>
          api.patch(id, {
            plannerAction: { type: "update", id: task.id, task },
          }),
        );
      }
    };
    grid.onpointercancel = () => {
      gesture = null;
    };
  }
  function mount(w) {
    if (w.type !== "day-planner") return;
    const bindClick = (selector, fn) => {
      const element = document.querySelector(selector);
      if (element) element.onclick = fn;
    };
    bindClick("#planner-prev", () => shiftDay(-1));
    bindClick("#planner-next", () => shiftDay(1));
    bindClick("#planner-today", () => {
      if (editor) {
        suspendedDraft = { ...editor };
        persistDraft(true);
        editor = null;
      }
      selected = today();
      autoScroll = true;
      rerender();
    });
    bindClick("#planner-mode", () => {
      expanded = !expanded;
      autoScroll = true;
      rerender();
    });
    bindClick("#planner-date", () => {
      calendarOpen = !calendarOpen;
      rerender();
      const picker = document.querySelector("#planner-date-input");
      picker?.focus();
      try { picker?.showPicker(); } catch {}
    });
    const dateInput = document.querySelector("#planner-date-input");
    if (dateInput)
      dateInput.onchange = () => {
        if (editor) {
          suspendedDraft = { ...editor };
          persistDraft(true);
          editor = null;
        }
        if (dateInput.value) selected = dateInput.value;
        calendarOpen = false;
        autoScroll = true;
        rerender();
      };
    bindClick("#planner-add", () => openForm(w));
    bindClick("#planner-resume", () =>
      openForm(w, suspendedDraft || w.plannerDraft),
    );
    bindClick("#planner-completed", () => {
      completedOpen = !completedOpen;
      rerender();
    });
    root
      .querySelectorAll("[data-planner-toggle]")
      .forEach(
        (input) =>
          (input.onchange = () =>
            act(() =>
              api.patch(id, {
                plannerAction: {
                  type: "toggle",
                  id: input.dataset.plannerToggle,
                },
              }),
            )),
      );
    root.querySelectorAll("[data-planner-open]").forEach(
      (button) =>
        (button.onclick = () =>
          openForm(
            w,
            w.plannerTasks.find(
              (task) => task.id === button.dataset.plannerOpen,
            ),
          )),
    );
    const timeline = document.querySelector("#planner-timeline");
    if (timeline) {
      if (autoScroll && selected === today()) {
        const now = new Date();
        timeline.scrollTop = Math.max(
          0,
          (now.getHours() * 60 + now.getMinutes() - range(w)[0] * 60) *
            pxPerMinute -
            90,
        );
      } else timeline.scrollTop = timelineScroll;
      autoScroll = false;
      timeline.onscroll = () => {
        timelineScroll = timeline.scrollTop;
      };
    }
    bindPointer(w);
    const formElement = document.querySelector("#planner-form");
    if (!formElement) return;
    formElement.onsubmit = (event) => {
      event.preventDefault();
      if (!composing) saveForm();
    };
    bindClick("#planner-close", () => {
      editor = null;
      suspendedDraft = null;
      pendingDraft = pendingDraft
        .catch(() => {})
        .then(() => api.patch(id, { plannerDraft: null }));
      act(() => pendingDraft);
      rerender();
    });
    bindClick("#planner-delete", () => {
      const taskId = editor?.taskId;
      editor = null;
      suspendedDraft = null;
      act(async () => {
        await pendingDraft;
        await api.patch(id, { plannerAction: { type: "delete", id: taskId } });
      });
    });
    root.querySelectorAll("[data-planner-type]").forEach(
      (button) =>
        (button.onclick = () => {
          editor.type = button.dataset.plannerType;
          persistDraft();
          rerender();
          document.querySelector("#planner-title")?.focus();
        }),
    );
    root.querySelectorAll("[data-planner-color]").forEach(
      (button) =>
        (button.onclick = () => {
          editor.color = button.dataset.plannerColor;
          persistDraft();
          rerender();
        }),
    );
    root.querySelectorAll("[data-planner-field]").forEach((input) => {
      const update = (event) => {
        if (event?.isComposing) return;
        editor[input.dataset.plannerField] =
          input.type === "checkbox" ? input.checked : input.value;
        persistDraft();
      };
      input.addEventListener(
        input.type === "text" ? "input" : "change",
        update,
      );
      input.addEventListener("compositionstart", () => {
        composing = true;
      });
      input.addEventListener("compositionend", () => {
        composing = false;
        update({ isComposing: false });
      });
      input.addEventListener("blur", () => {
        if (editor) persistDraft(true);
      });
      if (input.id === "planner-title")
        input.onkeydown = (event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
            event.preventDefault();
            saveForm();
          }
        };
    });
  }
  function shouldKeepEditor(before, after) {
    return (
      before?.type === "day-planner" &&
      after?.type === "day-planner" &&
      JSON.stringify({ ...before, plannerDraft: null }) ===
        JSON.stringify({ ...after, plannerDraft: null }) &&
      document.activeElement?.closest("#planner-form") &&
      editor
    );
  }
  function settings(w) {
    const option = (value, label, current) =>
      `<option value="${value}" ${value === current ? "selected" : ""}>${label}</option>`;
    return `<h2>План дня</h2><p>Задачи редактируются прямо в виджете. Здесь задаётся только вид расписания.</p><div class="form-grid"><label class="field">Часы на шкале<select data-prop="plannerRange">${option("all", "00:00–24:00", w.plannerRange)}${option("early", "06:00–24:00", w.plannerRange)}${option("work", "08:00–22:00", w.plannerRange)}${option("custom", "Свой диапазон", w.plannerRange)}</select></label><label class="field">Начало своего диапазона<input data-prop="plannerStart" type="number" min="0" max="23" value="${w.plannerStart}"></label><label class="field">Конец своего диапазона<input data-prop="plannerEnd" type="number" min="1" max="24" value="${w.plannerEnd}"></label><label class="field">Шаг сетки<select data-prop="plannerGridStep" data-number="true">${option("15", "15 минут", String(w.plannerGridStep))}${option("30", "30 минут", String(w.plannerGridStep))}${option("60", "60 минут", String(w.plannerGridStep))}</select></label><label class="field">Режим при запуске<select data-prop="plannerStartMode">${option("compact", "Список", w.plannerStartMode)}${option("day", "День", w.plannerStartMode)}</select></label></div><label class="check"><input data-prop="plannerShowCompleted" type="checkbox" ${w.plannerShowCompleted ? "checked" : ""}>Показывать выполненные</label><label class="check"><input data-prop="plannerShowProgress" type="checkbox" ${w.plannerShowProgress ? "checked" : ""}>Показывать прогресс дня</label>`;
  }
  function tick() {
    const currentToday = today();
    const dayRolled = selected === lastToday && currentToday !== lastToday;
    if (dayRolled) {
      selected = currentToday;
      autoScroll = true;
    }
    lastToday = currentToday;
    if (!expanded && !dayRolled) return;
    const w = state?.widgets.find((item) => item.id === id);
    if (w?.type === "day-planner" && !editor) rerender();
  }
  return { render, mount, shouldKeepEditor, settings, tick };
})();
