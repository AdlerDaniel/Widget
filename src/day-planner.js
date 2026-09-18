"use strict";

const { randomUUID } = require("node:crypto");

const COLORS = Object.freeze([
  "violet",
  "blue",
  "teal",
  "green",
  "amber",
  "coral",
  "pink",
]);
const TYPES = ["anytime", "time", "range"];
const MAX_TASKS = 300;

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);
  return (
    year >= 1900 &&
    year <= 9999 &&
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day
  );
}

function minutes(value, allowEnd = false) {
  if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) return null;
  const hour = Number(value.slice(0, 2));
  const minute = Number(value.slice(3));
  if (hour === 24 && minute === 0 && allowEnd) return 1440;
  return hour < 24 && minute < 60 ? hour * 60 + minute : null;
}

function taskFields(input, previous) {
  if (!input || typeof input !== "object") throw Error("Некорректная задача");
  const title =
    typeof input.title === "string" ? input.title.trim() : previous?.title;
  const date = input.date ?? previous?.date;
  const type = input.type ?? previous?.type ?? "anytime";
  if (!title || title.length > 300)
    throw Error("Название задачи: от 1 до 300 символов");
  if (!validDate(date)) throw Error("Некорректная дата задачи");
  if (!TYPES.includes(type)) throw Error("Некорректный тип задачи");
  const time = type === "time" ? (input.time ?? previous?.time) : null;
  const startTime =
    type === "range" ? (input.startTime ?? previous?.startTime) : null;
  const endTime =
    type === "range" ? (input.endTime ?? previous?.endTime) : null;
  if (type === "time" && minutes(time) === null)
    throw Error("Некорректное время задачи");
  if (
    type === "range" &&
    (minutes(startTime) === null ||
      minutes(endTime, true) === null ||
      minutes(endTime, true) <= minutes(startTime))
  )
    throw Error("Конец задачи должен быть позже начала");
  const color = COLORS.includes(input.color)
    ? input.color
    : previous?.color || "violet";
  const completed =
    typeof input.completed === "boolean"
      ? input.completed
      : previous?.completed || false;
  return { title, date, type, time, startTime, endTime, color, completed };
}

function normalizePlanner(widget) {
  if (widget.type !== "day-planner") return widget;
  return {
    ...widget,
    plannerTasks: Array.isArray(widget.plannerTasks) ? widget.plannerTasks : [],
    plannerDraft:
      widget.plannerDraft && typeof widget.plannerDraft === "object"
        ? widget.plannerDraft
        : null,
    plannerRange: ["all", "early", "work", "custom"].includes(
      widget.plannerRange,
    )
      ? widget.plannerRange
      : "work",
    plannerStart: Number.isInteger(widget.plannerStart)
      ? widget.plannerStart
      : 8,
    plannerEnd: Number.isInteger(widget.plannerEnd) ? widget.plannerEnd : 22,
    plannerGridStep: [15, 30, 60].includes(widget.plannerGridStep)
      ? widget.plannerGridStep
      : 30,
    plannerShowCompleted: widget.plannerShowCompleted !== false,
    plannerShowProgress: widget.plannerShowProgress !== false,
    plannerStartMode: widget.plannerStartMode === "day" ? "day" : "compact",
  };
}

function patchPlanner(widget, patch) {
  if (widget.type !== "day-planner") return widget;
  const out = normalizePlanner(widget);
  if (typeof patch.plannerShowCompleted === "boolean")
    out.plannerShowCompleted = patch.plannerShowCompleted;
  if (typeof patch.plannerShowProgress === "boolean")
    out.plannerShowProgress = patch.plannerShowProgress;
  if (["all", "early", "work", "custom"].includes(patch.plannerRange))
    out.plannerRange = patch.plannerRange;
  if ([15, 30, 60].includes(patch.plannerGridStep))
    out.plannerGridStep = patch.plannerGridStep;
  if (["compact", "day"].includes(patch.plannerStartMode))
    out.plannerStartMode = patch.plannerStartMode;
  if (
    Number.isInteger(patch.plannerStart) &&
    patch.plannerStart >= 0 &&
    patch.plannerStart <= 23 &&
    patch.plannerStart < out.plannerEnd
  )
    out.plannerStart = patch.plannerStart;
  if (
    Number.isInteger(patch.plannerEnd) &&
    patch.plannerEnd >= 1 &&
    patch.plannerEnd <= 24 &&
    patch.plannerEnd > out.plannerStart
  )
    out.plannerEnd = patch.plannerEnd;
  if (Object.hasOwn(patch, "plannerDraft")) {
    const draft = patch.plannerDraft;
    if (draft === null) out.plannerDraft = null;
    else if (draft && typeof draft === "object") {
      const taskId =
        typeof draft.taskId === "string" &&
        out.plannerTasks.some((t) => t.id === draft.taskId)
          ? draft.taskId
          : null;
      out.plannerDraft = {
        taskId,
        title: String(draft.title ?? "").slice(0, 300),
        date: validDate(draft.date)
          ? draft.date
          : new Date().toLocaleDateString("sv-SE"),
        type: TYPES.includes(draft.type) ? draft.type : "anytime",
        time: minutes(draft.time) === null ? "09:00" : draft.time,
        startTime:
          minutes(draft.startTime) === null ? "09:00" : draft.startTime,
        endTime:
          minutes(draft.endTime, true) === null ? "09:30" : draft.endTime,
        color: COLORS.includes(draft.color) ? draft.color : "violet",
        completed: draft.completed === true,
      };
    }
  }
  const action = patch.plannerAction;
  if (!action || typeof action !== "object") return out;
  const tasks = out.plannerTasks.slice();
  if (action.type === "add") {
    if (tasks.length >= MAX_TASKS)
      throw Error("В одном виджете можно хранить до 300 задач");
    const fields = taskFields(action.task);
    const now = new Date().toISOString();
    tasks.push({
      id: randomUUID(),
      ...fields,
      completedAt: fields.completed ? now : null,
      createdAt: now,
    });
  } else {
    const index = tasks.findIndex((task) => task.id === action.id);
    if (index < 0) throw Error("Задача не найдена");
    if (action.type === "delete") tasks.splice(index, 1);
    else if (action.type === "update") {
      const old = tasks[index];
      const fields = taskFields(action.task, old);
      tasks[index] = {
        ...old,
        ...fields,
        completedAt: fields.completed
          ? old.completedAt || new Date().toISOString()
          : null,
      };
    } else if (action.type === "toggle") {
      const old = tasks[index];
      tasks[index] = {
        ...old,
        completed: !old.completed,
        completedAt: old.completed ? null : new Date().toISOString(),
      };
    } else throw Error("Неизвестное действие с задачей");
  }
  out.plannerTasks = tasks;
  if (
    out.plannerDraft &&
    (action.type === "add" || out.plannerDraft.taskId === action.id)
  )
    out.plannerDraft = null;
  return out;
}

module.exports = { COLORS, validDate, minutes, normalizePlanner, patchPlanner };
