"use strict";
const crypto = require("node:crypto");
const TYPES = ["weather", "clock", "note", "photo", "calendar"];
const sizes = {
  weather: [300, 280],
  clock: [320, 230],
  note: [300, 300],
  photo: [300, 340],
  calendar: [350, 440],
};
function createWidget(type, offset = 0) {
  if (!TYPES.includes(type)) throw Error("Неизвестный виджет");
  return {
    id: crypto.randomUUID(),
    type,
    x: 80 + offset * 28,
    y: 80 + offset * 28,
    width: sizes[type][0],
    height: sizes[type][1],
    background: "#202839",
    foreground: "#f4f6fc",
    accent: "#b9a3ff",
    opacity: 96,
    fontSize: 16,
    radius: 24,
    title: "",
    text: "",
    photo: "",
    fit: "cover",
    city: "Москва",
    latitude: 55.7522,
    longitude: 37.6156,
    units: "celsius",
    hour12: false,
    seconds: true,
    locked: false,
    events: {},
  };
}
function patchWidget(widget, patch) {
  const out = { ...widget };
  for (const key of ["title", "text", "city"])
    if (typeof patch[key] === "string")
      out[key] = patch[key].slice(0, key === "text" ? 100000 : 150);
  for (const key of ["background", "foreground", "accent"])
    if (/^#[0-9a-f]{6}$/i.test(patch[key] || "")) out[key] = patch[key];
  for (const [key, min, max] of [
    ["width", 240, 900],
    ["height", 180, 1000],
    ["opacity", 25, 100],
    ["fontSize", 12, 30],
    ["radius", 0, 40],
    ["latitude", -90, 90],
    ["longitude", -180, 180],
  ])
    if (Number.isFinite(patch[key]))
      out[key] = Math.min(max, Math.max(min, patch[key]));
  for (const key of ["locked", "seconds", "hour12"])
    if (typeof patch[key] === "boolean") out[key] = patch[key];
  if (["cover", "contain"].includes(patch.fit)) out.fit = patch.fit;
  if (["celsius", "fahrenheit"].includes(patch.units)) out.units = patch.units;
  if (
    patch.event &&
    /^\d{4}-\d{2}-\d{2}$/.test(patch.event.date) &&
    typeof patch.event.text === "string"
  ) {
    out.events = { ...out.events };
    if (patch.event.text.trim())
      out.events[patch.event.date] = patch.event.text.slice(0, 10000);
    else delete out.events[patch.event.date];
  }
  if (out.type === "calendar") {
    out.width = Math.max(300, out.width);
    out.height = Math.max(400, out.height);
  }
  if (out.type === "weather") out.height = Math.max(260, out.height);
  return out;
}
function clampBounds(w, displays) {
  const d =
    displays.find(
      (d) =>
        w.x + w.width > d.x + 30 &&
        w.x < d.x + d.width - 30 &&
        w.y + w.height > d.y + 30 &&
        w.y < d.y + d.height - 30,
    ) || displays[0];
  return {
    ...w,
    x: Math.round(Math.max(d.x, Math.min(w.x, d.x + d.width - w.width))),
    y: Math.round(Math.max(d.y, Math.min(w.y, d.y + d.height - w.height))),
  };
}
module.exports = { TYPES, createWidget, patchWidget, clampBounds };
