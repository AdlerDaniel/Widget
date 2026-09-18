"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createWidget, patchWidget } = require("../src/model");
const { validDate } = require("../src/day-planner");
const Store = require("../src/store");

const add = (widget, task) =>
  patchWidget(widget, { plannerAction: { type: "add", task } });
const base = {
  title: "Созвон",
  date: "2026-09-18",
  type: "time",
  time: "14:00",
};

test("day planner creates three task types with separate stable IDs", () => {
  let widget = createWidget("day-planner");
  assert.deepEqual(
    [widget.width, widget.height, widget.style],
    [360, 440, "day-planner"],
  );
  widget = add(widget, { title: "Покупки", date: base.date, type: "anytime" });
  widget = add(widget, base);
  widget = add(widget, {
    title: "Работа",
    date: base.date,
    type: "range",
    startTime: "14:00",
    endTime: "16:30",
  });
  assert.equal(new Set(widget.plannerTasks.map((task) => task.id)).size, 3);
  assert.deepEqual(
    widget.plannerTasks.map((task) => task.type),
    ["anytime", "time", "range"],
  );
  const ids = widget.plannerTasks.map((task) => task.id);
  widget = patchWidget(widget, {
    plannerAction: {
      type: "update",
      id: ids[1],
      task: { ...base, id: "changed", title: "Новый созвон", time: "15:30" },
    },
  });
  assert.deepEqual(
    widget.plannerTasks.map((task) => task.id),
    ids,
  );
  assert.equal(widget.plannerTasks[1].title, "Новый созвон");
  assert.equal(widget.plannerTasks[0].title, "Покупки");
  widget = patchWidget(widget, {
    plannerAction: { type: "toggle", id: ids[1] },
  });
  assert.equal(widget.plannerTasks[1].completed, true);
  assert.ok(widget.plannerTasks[1].completedAt);
  widget = patchWidget(widget, {
    plannerAction: { type: "toggle", id: ids[1] },
  });
  assert.equal(widget.plannerTasks[1].completedAt, null);
  widget = patchWidget(widget, {
    plannerAction: { type: "delete", id: ids[1] },
  });
  assert.deepEqual(
    widget.plannerTasks.map((task) => task.id),
    [ids[0], ids[2]],
  );
});

test("planner validates dates, times, length and capacity", () => {
  assert.equal(validDate("2026-02-29"), false);
  assert.equal(validDate("2028-02-29"), true);
  const widget = createWidget("day-planner");
  for (const task of [
    { ...base, date: "2026-02-29" },
    { ...base, time: "25:00" },
    { ...base, title: "x".repeat(301) },
    { ...base, type: "range", startTime: "16:00", endTime: "16:00" },
    { ...base, type: "range", startTime: "23:30", endTime: "24:30" },
  ])
    assert.throws(() => add(widget, task));
  assert.equal(
    add(widget, {
      ...base,
      type: "range",
      startTime: "23:30",
      endTime: "24:00",
    }).plannerTasks.length,
    1,
  );
  assert.throws(
    () => add({ ...widget, plannerTasks: Array(300).fill({}) }, base),
    /300/,
  );
});

test("tasks and unfinished draft survive settings changes and restart", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "planner-test-"));
  try {
    let widget = add(createWidget("day-planner"), base);
    widget = patchWidget(widget, {
      plannerDraft: {
        title: "Последний ввод",
        date: base.date,
        type: "anytime",
      },
    });
    widget = patchWidget(widget, {
      background: "#eef2f8",
      opacity: 70,
      style: "glass",
      plannerRange: "custom",
      plannerStart: 6,
      plannerEnd: 24,
    });
    const store = new Store(directory);
    store.data.widgets.push(widget);
    store.save();
    const restored = new Store(directory).data.widgets[0];
    assert.equal(restored.plannerTasks[0].title, "Созвон");
    assert.equal(restored.plannerDraft.title, "Последний ввод");
    assert.equal(restored.plannerRange, "custom");
    assert.equal(restored.style, "glass");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
