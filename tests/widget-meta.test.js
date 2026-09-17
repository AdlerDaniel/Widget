"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { WIDGET_META } = require("../src/widget-meta");
const { TYPES, createWidget, patchWidget } = require("../src/model");
const { styles, resizeBounds } = require("../src/widget-styles");

test("every widget type shares one source for defaults and size limits", () => {
  assert.deepEqual(Object.keys(WIDGET_META), TYPES);
  assert.deepEqual(Object.keys(styles).sort(), [...TYPES].sort());
  for (const type of TYPES) {
    const { defaultSize, minSize, maxSize } = WIDGET_META[type];
    const widget = createWidget(type);
    assert.deepEqual([widget.width, widget.height], defaultSize);
    assert.deepEqual(
      [
        patchWidget(widget, { width: -1, height: -1 }).width,
        patchWidget(widget, { width: -1, height: -1 }).height,
      ],
      minSize,
    );
    assert.deepEqual(
      [
        patchWidget(widget, { width: 99999, height: 99999 }).width,
        patchWidget(widget, { width: 99999, height: 99999 }).height,
      ],
      maxSize,
    );
    const small = resizeBounds(widget, -99999, -99999);
    const large = resizeBounds(widget, 99999, 99999);
    assert.deepEqual([small.width, small.height], minSize);
    assert.deepEqual([large.width, large.height], maxSize);
  }
});
