const fs = require("node:fs"),
  path = require("node:path");
const { createWidget } = require("./model");
module.exports = async ({
  app,
  manager,
  store,
  windows,
  widgetWindow,
  save,
  state,
  failures,
  desktop,
  setUpdate,
}) => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = path.join(__dirname, "../test-output");
  fs.mkdirSync(out, { recursive: true });
  const checks = [];
  const testDate = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-15`;
  try {
    await wait(2500);
    if (!store.data.widgets.length) {
      await manager.webContents.executeJavaScript(
        'document.querySelector("[data-add=note]").click()',
      );
      await wait(700);
    } else {
      checks.push({
        name: "restore after process restart",
        ok:
          store.data.widgets.some((w) => w.text === "Заметка сохранена ✓") &&
          windows.size === store.data.widgets.length,
      });
    }
    checks.push({
      name: "add through catalog",
      ok: store.data.widgets.length > 0,
    });
    for (const type of ["clock", "weather", "photo", "calendar", "quote", "day-planner"])
      if (!store.data.widgets.find((w) => w.type === type)) {
        const w = createWidget(type);
        if (type === "calendar") w.events["2026-09-13"] = "Тестовая запись";
        if (type === "photo")
          w.photo = require("node:url").pathToFileURL(
            path.join(__dirname, "../assets/icon.png"),
          ).href;
        store.data.widgets.push(w);
        widgetWindow(w);
      }
    save();
    await wait(4000);
    const note = store.data.widgets.find((w) => w.type === "note"),
      win = windows.get(note.id);
    await win.webContents.executeJavaScript(
      `document.querySelector('#note').value='Заметка сохранена ✓';document.querySelector('#note').dispatchEvent(new Event('input'));`,
    );
    await wait(400);
    checks.push({
      name: "note IPC and persistence",
      ok:
        JSON.parse(fs.readFileSync(store.file)).widgets.find(
          (w) => w.id === note.id,
        ).text === "Заметка сохранена ✓",
    });
    const calendar = store.data.widgets.find((w) => w.type === "calendar");
    await windows
      .get(calendar.id)
      .webContents.executeJavaScript(
        `document.querySelector('[data-date="${testDate}"]').onclick().then(()=>{document.querySelector('#event').value='Встреча в 15:00';document.querySelector('#event').dispatchEvent(new Event('input'));})`,
      );
    await wait(300);
    checks.push({
      name: "calendar date-specific note",
      ok:
        calendar.events[testDate] === "Встреча в 15:00" ||
        store.data.widgets.find((w) => w.id === calendar.id).events[
          testDate
        ] === "Встреча в 15:00",
    });
    await manager.webContents.executeJavaScript(
      `document.querySelector('[data-nav="catalog"]').click()`,
    );
    await wait(200);
    checks.push({
      name: "catalog exposes all seven widget types without a hardcoded count",
      ok: await manager.webContents.executeJavaScript(
        `document.querySelectorAll('[data-add]').length===7&&!!document.querySelector('[data-add="day-planner"]')&&[...document.querySelectorAll('.pill')].some(el=>el.textContent.trim()==='7 виджетов')`,
      ),
    });
    fs.writeFileSync(
      path.join(out, "catalog.png"),
      (await manager.webContents.capturePage()).toPNG(),
    );
    for (const w of store.data.widgets) {
      const win = windows.get(w.id);
      fs.writeFileSync(
        path.join(out, w.type + ".png"),
        (await win.webContents.capturePage()).toPNG(),
      );
      checks.push({
        name: w.type + " rendered",
        ok: await win.webContents.executeJavaScript(
          '!!document.querySelector(".widget")',
        ),
      });
      const native = desktop.inspect(win);
      checks.push({
        name: w.type + " native desktop parent",
        ok: native.attached && native.visible,
        details: native,
      });
    }
    const before = { x: note.x, y: note.y };
    await win.webContents.executeJavaScript(
      `window.widgetAPI.patch('${note.id}',{background:'#403451',width:360})`,
    );
    await wait(300);
    checks.push({
      name: "customization applies to native size",
      ok:
        store.data.widgets.find((w) => w.id === note.id).width === 360 &&
        desktop.inspect(win).rect.right - desktop.inspect(win).rect.left >= 360,
    });
    await win.webContents.executeJavaScript(
      `window.widgetAPI.patch('${note.id}',{background:'#202839',width:300})`,
    );
    await require("../tests/appearance-smoke.cjs")({
      manager,
      store,
      windows,
      checks,
      out,
    });
    await require("../tests/widget-design-smoke.cjs")({
      manager,
      store,
      windows,
      desktop,
      checks,
      out,
      save,
    });
    await require("../tests/widget-editing-smoke.cjs")({
      manager,
      store,
      windows,
      desktop,
      checks,
      out,
      save,
    });
    await require("../tests/native-pointer-smoke.cjs")({ desktop, checks });
    await require("../tests/input-smoke.cjs")({
      manager,
      store,
      windows,
      desktop,
      checks,
      save,
    });
    setUpdate({
      status: "available",
      required: true,
      version: "1.1.0",
      notes: "Тест обязательного обновления",
    });
    await wait(200);
    checks.push({
      name: "mandatory update blocks catalog",
      ok: await manager.webContents.executeJavaScript(
        '!!document.querySelector(".update-overlay")',
      ),
    });
    checks.push({
      name: "mandatory update blocks widget editing",
      ok: await win.webContents.executeJavaScript(
        '!document.querySelector("#note") && !!document.querySelector("#widget-open-update")',
      ),
    });
    const denied = await manager.webContents.executeJavaScript(
      `window.widgetAPI.add('note').then(()=>false,()=>true)`,
    );
    checks.push({
      name: "mandatory update enforced in main process",
      ok: denied,
    });
    fs.writeFileSync(
      path.join(out, "update.png"),
      (await manager.webContents.capturePage()).toPNG(),
    );
    setUpdate({ status: "current" });
    const photo = store.data.widgets.find((w) => w.type === "photo");
    const { dialog } = require("electron");
    const originalDialog = dialog.showOpenDialog;
    try {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [path.join(__dirname, "../assets/icon.png")],
      });
      await windows
        .get(photo.id)
        .webContents.executeJavaScript(`window.widgetAPI.photo('${photo.id}')`);
      checks.push({
        name: "photo is copied into local profile",
        ok: fs.existsSync(
          path.join(app.getPath("userData"), "photos", photo.id + ".png"),
        ),
      });
    } finally {
      dialog.showOpenDialog = originalDialog;
    }
    await manager.webContents.executeJavaScript(
      `window.widgetAPI.remove('${photo.id}')`,
    );
    checks.push({
      name: "removing a photo widget removes its managed image",
      ok:
        !fs.existsSync(
          path.join(app.getPath("userData"), "photos", photo.id + ".png"),
        ) && !store.data.widgets.some((w) => w.id === photo.id),
    });
    const loginOptions = {
      path: process.execPath,
      args: ["--background"],
      name: "Widget-Validation-" + process.pid,
    };
    try {
      app.setLoginItemSettings({ ...loginOptions, openAtLogin: true });
      const login = app.getLoginItemSettings({
        path: process.execPath,
        args: ["--background"],
      });
      const reg = require("node:child_process").spawnSync(
        "reg",
        [
          "query",
          "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
          "/v",
          loginOptions.name,
        ],
        { encoding: "utf8", windowsHide: true },
      );
      checks.push({
        name: "Windows login registration",
        ok:
          login.executableWillLaunchAtLogin &&
          reg.stdout.includes("--background") &&
          reg.stdout.includes(process.execPath),
        details: login,
        registry: reg.stdout,
      });
    } finally {
      app.setLoginItemSettings({ ...loginOptions, openAtLogin: false });
    }
    manager.close();
    checks.push({
      name: "closing catalog retains widgets",
      ok: !manager.isVisible() && windows.size === store.data.widgets.length,
    });
    checks.push({
      name: "no runtime errors",
      ok: failures.length === 0,
      errors: failures,
    });
    fs.writeFileSync(
      path.join(out, "smoke.json"),
      JSON.stringify({ checks, state: state() }, null, 2),
    );
    app.exit(checks.every((c) => c.ok) ? 0 : 1);
  } catch (e) {
    fs.writeFileSync(path.join(out, "smoke-error.txt"), String(e.stack));
    app.exit(1);
  }
};
