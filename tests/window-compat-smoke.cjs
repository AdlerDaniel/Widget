"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { app, BrowserWindow, screen } = require("electron");

app
  .whenReady()
  .then(async () => {
    const desktop = require("../src/desktop");
    const bounds = { x: 80, y: 80, width: 300, height: 235 };
    const win = new BrowserWindow({
      ...bounds,
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        offscreen: true,
      },
    });
    win.setBackgroundColor("#00000000");
    await win.loadURL(
      "data:text/html,<style>html,body{margin:0;background:transparent}article{height:100vh;border-radius:24px;background:%23202839}</style><article></article>",
    );
    win.showInactive();
    assert.equal(desktop.attach(win), true);
    desktop.move(win, bounds, screen);
    desktop.shape(win, bounds, 24, screen, true);
    const native = desktop.inspect(win);
    assert.ok(
      native.regionType >= 2,
      "native rounded window region is installed",
    );
    assert.equal(
      native.region.right - native.region.left,
      Math.round(bounds.width * screen.getPrimaryDisplay().scaleFactor),
    );
    desktop.shape(win, bounds, 0, screen, false);
    assert.equal(
      desktop.inspect(win).regionType,
      0,
      "rectangular region can be restored",
    );
    win.destroy();
    console.log("transparent corners and native window region passed", native);
    app.quit();
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
