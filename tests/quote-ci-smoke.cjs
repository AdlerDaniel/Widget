"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { app, BrowserWindow, ipcMain } = require("electron");
const { createWidget, patchWidget } = require("../src/model");
const { quoteForDate } = require("../src/quotes");
const themes = require("../src/themes");

const output = path.join(__dirname, "../test-output");
const timeout = setTimeout(() => app.exit(1), 60000);
let widget = createWidget("quote");
const appearance = themes.appearance({ theme: "purple-dark" });
const system = { accent: "#b9a3ff", dark: true };
const state = () => ({
  widgets: [themes.resolveWidget(widget, appearance, system)],
  palette: themes.resolveAppearance(appearance, system),
  update: { status: "current" },
});

ipcMain.handle("state", state);
ipcMain.on("daily-quote", (event, date) => {
  event.returnValue = quoteForDate(date);
});

function measureQuote() {
  const widget = document.querySelector(".widget");
  const content = document.querySelector(".quote-content");
  const text = document.querySelector(".quote-text");
  const menu = document.querySelector("#widget-edit");
  const landscape = document.querySelector(".quote-landscape");
  const pixel = (color) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    return [...ctx.getImageData(0, 0, 1, 1).data.slice(0, 3)];
  };
  const luminance = (color) => {
    const channels = pixel(color).map((value) => {
      const x = value / 255;
      return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const contrast = (a, b) => {
    const x = luminance(a);
    const y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  const background = getComputedStyle(widget).getPropertyValue("--bg");
  const rect = (element) => {
    const { left, top, right, bottom, height } =
      element.getBoundingClientRect();
    return { left, top, right, bottom, height };
  };
  return {
    landscape: rect(landscape),
    widget: rect(widget),
    text: rect(text),
    menu: rect(menu),
    fontSize: parseFloat(getComputedStyle(text).fontSize),
    scrollWidth: content.scrollWidth,
    clientWidth: content.clientWidth,
    scrollHeight: content.scrollHeight,
    clientHeight: content.clientHeight,
    contrast: Object.fromEntries(
      ["far", "middle", "near"].map((name) => [
        name,
        contrast(
          getComputedStyle(document.querySelector(".quote-hill-" + name)).fill,
          background,
        ),
      ]),
    ),
  };
}

const scenarios = [
  { name: "260x190", width: 260, height: 190, theme: "purple-dark" },
  { name: "340x250", width: 340, height: 250, theme: "purple-light" },
  {
    name: "500x300-bright",
    width: 500,
    height: 300,
    theme: "custom",
    background: "#f3f6fb",
    accent: "#315f86",
  },
  { name: "900x700", width: 900, height: 700, theme: "purple-dark" },
  { name: "900x190", width: 900, height: 190, theme: "purple-light" },
  {
    name: "dark-low-contrast",
    width: 500,
    height: 300,
    theme: "custom",
    background: "#1d2331",
    accent: "#242a38",
  },
];

app
  .whenReady()
  .then(async () => {
    fs.mkdirSync(output, { recursive: true });
    const win = new BrowserWindow({
      width: 340,
      height: 250,
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
    await win.loadFile(path.join(__dirname, "../src/ui/index.html"), {
      query: { widget: widget.id },
    });
    const sizes = {};
    for (const scenario of scenarios) {
      widget = patchWidget(widget, {
        ...scenario,
        showTitle: false,
        showBackground: true,
      });
      win.setSize(scenario.width, scenario.height);
      win.webContents.send("state", state());
      await win.webContents.executeJavaScript(
        `(()=>{const text=document.querySelector('.quote-text');text.className='quote-text quote-short';text.textContent='Сила рождается в движении.';})()`,
      );
      const geometry = await win.webContents.executeJavaScript(
        `(${measureQuote.toString()})()`,
      );
      sizes[scenario.name] = geometry.fontSize;
      try {
        await new Promise((resolve) => setTimeout(resolve, 80));
        fs.writeFileSync(
          path.join(output, "quote-ci-" + scenario.name + ".png"),
          (await win.webContents.capturePage()).toPNG(),
        );
      } catch (error) {
        // Offscreen Chromium can decline a frame during resize; geometry is still checked.
        console.warn("Screenshot unavailable for", scenario.name, error);
      }
      assert.ok(geometry.landscape.height > 0, scenario.name + " landscape");
      assert.ok(
        geometry.scrollWidth <= geometry.clientWidth &&
          geometry.scrollHeight <= geometry.clientHeight,
        scenario.name + " overflow",
      );
      assert.ok(
        geometry.text.left >= geometry.widget.left &&
          geometry.text.top >= geometry.widget.top &&
          geometry.text.right <= geometry.menu.left &&
          geometry.text.bottom <= geometry.widget.bottom,
        scenario.name + " text bounds",
      );
      if (scenario.name === "dark-low-contrast") {
        assert.ok(geometry.contrast.far > 1.05, "far hill visible");
        assert.ok(
          geometry.contrast.middle > geometry.contrast.far + 0.05,
          "middle hill stronger",
        );
        assert.ok(
          geometry.contrast.near > geometry.contrast.middle + 0.05,
          "near hill strongest",
        );
      }
      console.log(scenario.name, JSON.stringify(geometry));
    }
    assert.ok(sizes["900x700"] > sizes["340x250"] * 1.8);
    assert.ok(sizes["900x190"] < sizes["900x700"] * 0.65);
    win.destroy();
    clearTimeout(timeout);
    app.quit();
  })
  .catch((error) => {
    console.error(error);
    clearTimeout(timeout);
    app.exit(1);
  });
