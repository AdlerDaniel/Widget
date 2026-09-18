"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { app, BrowserWindow, ipcMain } = require("electron");
const { createWidget, patchWidget } = require("../src/model");
const themes = require("../src/themes");

let widget = createWidget("day-planner");
let window;
let appearance = themes.appearance({ theme: "purple-dark" });
const system = { accent: "#b9a3ff", dark: true };
const state = () => ({
  widgets: [themes.resolveWidget(widget, appearance, system)],
  palette: themes.resolveAppearance(appearance, system),
  update: { status: "current" },
});
ipcMain.handle("state", state);
ipcMain.handle("patch", (_event, id, patch) => {
  assert.equal(id, widget.id);
  widget = patchWidget(widget, patch);
  window.webContents.send("state", state());
  return widget;
});
ipcMain.handle("focus-input", () => {});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function js(source) {
  return window.webContents.executeJavaScript(source);
}

app
  .whenReady()
  .then(async () => {
    window = new BrowserWindow({
      width: 360,
      height: 440,
      frame: false,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, "../src/preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        offscreen: true,
      },
    });
    await window.loadFile(path.join(__dirname, "../src/ui/index.html"), {
      query: { widget: widget.id },
    });
    await delay(100);
    assert.ok(await js("!!document.querySelector('.planner-empty')"));
    await js(
      "document.querySelector('#planner-add').click();document.querySelector('#planner-title').value='Купить продукты';document.querySelector('#planner-title').dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#planner-title').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));",
    );
    await delay(150);
    assert.equal(widget.plannerTasks.length, 1);
    assert.equal(widget.plannerTasks[0].title, "Купить продукты");
    assert.equal(widget.plannerTasks[0].type, "anytime");
    await js("document.querySelector('#planner-mode').click()");
    assert.equal(
      await js("document.querySelectorAll('.planner-tick.is-hour').length"),
      15,
    );
    assert.equal(
      await js(
        "document.querySelector('.planner-all-day .planner-task-title').textContent",
      ),
      "Купить продукты",
    );

    // Exercise the same pointer handlers with a controlled active pointer in offscreen Chromium.
    await js(`(() => {
    const grid = document.querySelector('#planner-grid');
    grid.setPointerCapture = () => {};
    grid.hasPointerCapture = () => false;
    const y = grid.getBoundingClientRect().top + (14 * 60 - Number(grid.dataset.start)) * .8;
    grid.onpointerdown({ button: 0, target: grid, clientY: y, pointerId: 1, preventDefault() {}, stopPropagation() {} });
    grid.onpointerup({ target: grid, clientY: y, pointerId: 1 });
  })()`);
    await delay(80);
    assert.equal(
      await js("document.querySelector('[data-planner-field=time]').value"),
      "14:00",
    );
    await js(
      "document.querySelector('#planner-title').value='Созвон';document.querySelector('#planner-title').dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#planner-form').requestSubmit();",
    );
    await delay(120);
    assert.equal(
      widget.plannerTasks.find((task) => task.title === "Созвон")?.time,
      "14:00",
    );

    await js(`(() => {
    const grid = document.querySelector('#planner-grid');
    grid.setPointerCapture = () => {};
    grid.hasPointerCapture = () => false;
    const top = grid.getBoundingClientRect().top;
    const from = top + (15 * 60 - Number(grid.dataset.start)) * .8;
    const to = top + (17 * 60 - Number(grid.dataset.start)) * .8;
    grid.onpointerdown({ button: 0, target: grid, clientY: from, pointerId: 2, preventDefault() {}, stopPropagation() {} });
    grid.onpointermove({ clientY: to });
    grid.onpointerup({ target: grid, clientY: to, pointerId: 2 });
  })()`);
    await delay(80);
    assert.deepEqual(
      await js(
        "[document.querySelector('[data-planner-field=startTime]').value,document.querySelector('[data-planner-field=endTime]').value]",
      ),
      ["15:00", "17:30"],
    );
    await js(
      "document.querySelector('#planner-title').value='Работа';document.querySelector('#planner-title').dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#planner-form').requestSubmit();",
    );
    await delay(120);
    const work = widget.plannerTasks.find((task) => task.title === "Работа");
    assert.deepEqual([work.startTime, work.endTime], ["15:00", "17:30"]);
    await js(
      `window.widgetAPI.patch('${widget.id}', { plannerAction: { type: 'add', task: { title: 'Встреча', date: '${work.date}', type: 'time', time: '16:00' } } })`,
    );
    await delay(80);
    const geometry = await js(`(() => {
    const blocks = [...document.querySelectorAll('.planner-block')];
    const grid = document.querySelector('#planner-grid');
    const work = document.querySelector('[data-planner-block="${work.id}"]');
    const meeting = blocks.find((block) => block.textContent.includes('Встреча'));
    return { count: blocks.length, workLeft: work.getBoundingClientRect().left, meetingLeft: meeting.getBoundingClientRect().left, right: Math.max(...blocks.map((block) => block.getBoundingClientRect().right)), gridRight: grid.getBoundingClientRect().right, overflow: document.querySelector('.planner-content').scrollWidth > document.querySelector('.planner-content').clientWidth };
  })()`);
    assert.equal(geometry.count, 3);
    assert.ok(
      geometry.workLeft !== geometry.meetingLeft,
      "overlapping tasks have separate columns",
    );
    assert.ok(
      geometry.right <= geometry.gridRight && !geometry.overflow,
      "tasks stay inside widget",
    );

    await js(`(() => {
    const grid = document.querySelector('#planner-grid');
    grid.setPointerCapture = () => {};
    grid.hasPointerCapture = () => false;
    const block = document.querySelector('[data-planner-block="${work.id}"]');
    const y = block.getBoundingClientRect().top + 8;
    grid.onpointerdown({ button: 0, target: block, clientY: y, pointerId: 3, preventDefault() {}, stopPropagation() {} });
    grid.onpointermove({ clientY: y + 48 });
    grid.onpointerup({ target: block, clientY: y + 48, pointerId: 3 });
  })()`);
    await delay(120);
    assert.deepEqual(
      widget.plannerTasks.find((task) => task.id === work.id).startTime,
      "16:00",
    );
    assert.deepEqual(
      widget.plannerTasks.find((task) => task.id === work.id).endTime,
      "18:30",
    );
    await js(`(() => {
    const grid = document.querySelector('#planner-grid');
    grid.setPointerCapture = () => {};
    grid.hasPointerCapture = () => false;
    const handle = document.querySelector('[data-planner-block="${work.id}"] [data-planner-resize]');
    const y = handle.getBoundingClientRect().top + 2;
    grid.onpointerdown({ button: 0, target: handle, clientY: y, pointerId: 4, preventDefault() {}, stopPropagation() {} });
    grid.onpointermove({ clientY: y + 24 });
    grid.onpointerup({ target: handle, clientY: y + 24, pointerId: 4 });
  })()`);
    await delay(120);
    assert.equal(
      widget.plannerTasks.find((task) => task.id === work.id).endTime,
      "19:00",
    );
    await js(`(() => {
    const grid = document.querySelector('#planner-grid');
    grid.setPointerCapture = () => {};
    grid.hasPointerCapture = () => false;
    const block = document.querySelector('[data-planner-block="${work.id}"]');
    const y = block.getBoundingClientRect().top + 8;
    grid.onpointerdown({ button: 0, target: block, clientY: y, pointerId: 5, preventDefault() {}, stopPropagation() {} });
    grid.onpointerup({ target: block, clientY: y, pointerId: 5 });
  })()`);
    await delay(80);
    assert.ok(
      await js("!!document.querySelector('#planner-delete')"),
      "click opens editing, not creation",
    );
    await js(
      "document.querySelector('#planner-title').value='Проект';document.querySelector('#planner-title').dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#planner-form').requestSubmit();",
    );
    await delay(120);
    assert.equal(
      widget.plannerTasks.find((task) => task.id === work.id).title,
      "Проект",
    );
    await js(
      `document.querySelector('[data-planner-block="${work.id}"] input[type=checkbox]').click()`,
    );
    await delay(120);
    assert.equal(
      widget.plannerTasks.find((task) => task.id === work.id).completed,
      true,
    );
    assert.ok(await js("!!document.querySelector('#planner-completed')"));
    await js("document.querySelector('#planner-completed').click()");
    await js(
      `document.querySelector('[data-planner-open="${work.id}"]').click()`,
    );
    await delay(80);
    await js("document.querySelector('#planner-delete').click()");
    await delay(120);
    assert.ok(!widget.plannerTasks.some((task) => task.id === work.id));
    await js(
      "document.querySelector('#planner-add').click();document.querySelector('#planner-title').value='Черновик после переключения';document.querySelector('#planner-title').dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#planner-next').click();",
    );
    await delay(120);
    assert.ok(await js("!!document.querySelector('#planner-resume')"));
    await js("document.querySelector('#planner-resume').click()");
    await delay(120);
    assert.equal(
      await js("document.querySelector('#planner-title').value"),
      "Черновик после переключения",
    );
    assert.equal(widget.plannerDraft.title, "Черновик после переключения");
    await js("document.querySelector('#planner-close').click()");
    await delay(100);
    assert.equal(widget.plannerDraft, null);

    const out = path.join(__dirname, "../test-output");
    fs.mkdirSync(out, { recursive: true });
    for (const [style, theme] of [
      ["day-planner", "purple-dark"],
      ["card", "purple-light"],
      ["bare", "purple-dark"],
      ["glass", "purple-light"],
    ]) {
      appearance = themes.appearance({ theme });
      widget = patchWidget(widget, { style, width: 280, height: 300 });
      window.setSize(280, 300);
      window.webContents.send("state", state());
      await delay(70);
      const width = await js(`(() => {
      const content = document.querySelector('.planner-content');
      const grid = document.querySelector('#planner-grid');
      return { content: content.clientWidth, scroll: content.scrollWidth, grid: grid.clientWidth, blocks: [...grid.querySelectorAll('.planner-block')].every(block => block.getBoundingClientRect().right <= grid.getBoundingClientRect().right) };
    })()`);
      assert.ok(
        width.scroll <= width.content && width.blocks,
        `${style} ${theme} fits minimum size`,
      );
      fs.writeFileSync(
        path.join(out, `day-planner-${style}-${theme}.png`),
        (await window.webContents.capturePage()).toPNG(),
      );
    }
    console.log(
      "day planner renderer scenarios passed",
      JSON.stringify(geometry),
    );
    window.destroy();
    app.quit();
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
