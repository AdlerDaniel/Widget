"use strict";
const fs = require("node:fs");
const path = require("node:path");

const photoName =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$/i;

function ownedPhotoName(widget) {
  const name = widget?.type === "photo" ? widget.id + ".png" : "";
  return photoName.test(name) ? name : null;
}

function removeWidgetPhoto(directory, widget) {
  const name = ownedPhotoName(widget);
  if (!name) return false;
  try {
    fs.unlinkSync(path.join(directory, name));
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function cleanupOrphanPhotos(directory, widgets) {
  if (!fs.existsSync(directory)) return [];
  const live = new Set(widgets.map(ownedPhotoName).filter(Boolean));
  const removed = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !photoName.test(entry.name) || live.has(entry.name))
      continue;
    fs.unlinkSync(path.join(directory, entry.name));
    removed.push(entry.name);
  }
  return removed;
}

module.exports = { removeWidgetPhoto, cleanupOrphanPhotos };
