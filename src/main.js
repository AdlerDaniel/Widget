"use strict";
const {
  app,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
  dialog,
  screen,
  net,
  systemPreferences,
  nativeTheme,
} = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const Store = require("./store");
const { styles, resizeBounds } = require("./widget-styles");
const { normalizeNotes } = require("./notes");
const { normalizePlanner } = require("./day-planner");
const { newer } = require("./version");
const { quoteForDate } = require("./quotes");
const themeTools = require("./themes");
function systemColors() {
  return {
    accent: "#" + systemPreferences.getAccentColor().slice(0, 6),
    dark: nativeTheme.shouldUseDarkColors,
  };
}
const { TYPES, createWidget, patchWidget, clampBounds } = require("./model");
const { WIDGET_META } = require("./widget-meta");
const { removeWidgetPhoto, cleanupOrphanPhotos } = require("./photo-files");
app.setPath("userData", path.join(app.getPath("appData"), "Widget"));
app.setName("My Widget");
const smoke = process.argv.includes("--smoke");
const qaProfile = process.env.WIDGET_TEST_PROFILE;
if (qaProfile) app.setPath("userData", path.resolve(qaProfile));
if (smoke)
  app.setPath("userData", path.join(__dirname, "../test-output/profile"));
let store,
  manager,
  tray,
  desktop,
  quitting = false,
  drag = null,
  update = { status: "idle" },
  checking = false;
const windows = new Map();
const failures = [];
function log(e) {
  const message = String(e?.stack || e);
  failures.push(message);
  try {
    fs.appendFileSync(
      path.join(app.getPath("userData"), "app.log"),
      new Date().toISOString() + " " + message + "\n",
    );
  } catch {}
}
function broadcast() {
  for (const w of BrowserWindow.getAllWindows())
    if (!w.isDestroyed()) w.webContents.send("state", state());
}
function state() {
  const appearance = themeTools.appearance(store.data.appearance),
    system = systemColors();
  return {
    ...store.data,
    widgetStyles: styles,
    widgetMeta: WIDGET_META,
    appearance,
    system,
    palette: themeTools.resolveAppearance(appearance, system),
    themes: [
      ...Object.values(themeTools.themes),
      themeTools.resolveTheme("system", system),
    ],
    widgets: store.data.widgets.map((w) =>
      themeTools.resolveWidget(w, appearance, system),
    ),
    version: app.getVersion(),
    changes: require("../changes.json"),
    update,
    recovered: store.recovered,
  };
}
function save() {
  store.save();
  broadcast();
}
function safeWindow(options) {
  const w = new BrowserWindow({
    ...options,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  w.setMenuBarVisibility(false);
  w.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  w.webContents.on("will-navigate", (e) => e.preventDefault());
  w.webContents.on("render-process-gone", (_, details) => log(details.reason));
  w.webContents.on("console-message", (_e, level, message) => {
    if (level === 3) log(message);
  });
  return w;
}
function openManager() {
  if (manager && !manager.isDestroyed()) {
    manager.show();
    manager.focus();
    checkUpdates();
    return;
  }
  manager = safeWindow({
    width: 1140,
    height: 820,
    minWidth: 850,
    minHeight: 650,
    backgroundColor: "#10131b",
    title: "My Widget",
    show: false,
    icon: path.join(__dirname, "../assets/icon.png"),
  });
  manager.loadFile(path.join(__dirname, "ui/index.html"));
  manager.setOpacity(
    themeTools.appearance(store.data.appearance).opacity / 100,
  );
  manager.once("ready-to-show", () => manager.show());
  manager.on("close", (e) => {
    store.flushPending();
    if (!quitting) {
      e.preventDefault();
      manager.hide();
    }
  });
  checkUpdates();
}
function bounds(w) {
  return { x: w.x, y: w.y, width: w.width, height: w.height };
}
function nativeRadius(w) {
  if (w.style === "photo-round") return Math.min(w.width, w.height) / 2;
  if (w.style === "photo-print") return 3;
  if (w.style === "note-paper" || w.style === "note-sticky") return 4;
  return w.radius;
}
function place(w, win) {
  try {
    if (desktop.attach(win)) {
      desktop.move(win, bounds(w), screen);
      desktop.shape(win, bounds(w), nativeRadius(w), screen);
      return;
    }
  } catch (e) {
    log(e);
  }
  win.setBounds(bounds(w));
}
function widgetWindow(w) {
  const win = safeWindow({
    ...bounds(w),
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    show: false,
    title: "My Widget — " + w.type,
  });
  win.setBackgroundColor("#00000000");
  windows.set(w.id, win);
  win.loadFile(path.join(__dirname, "ui/index.html"), {
    query: { widget: w.id },
  });
  win.once("ready-to-show", () => {
    win.showInactive();
    place(w, win);
  });
  win.on("closed", () => {
    windows.delete(w.id);
    store?.flushPending();
  });
  return win;
}
function selected(event, id) {
  const widget = store.data.widgets.find((w) => w.id === id);
  if (!widget) throw Error("Виджет не найден");
  const sender = BrowserWindow.fromWebContents(event.sender);
  if (sender !== manager && sender !== windows.get(id))
    throw Error("Нет доступа");
  return widget;
}
function requireManager(e) {
  if (BrowserWindow.fromWebContents(e.sender) !== manager)
    throw Error("Нет доступа");
}
function requireUnlocked() {
  if (update.required) throw Error("Установите обязательное обновление");
}
function configureUpdates() {
  const { autoUpdater } = require("electron-updater");
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowDowngrade = false;
  autoUpdater.on("update-available", (info) => {
    const notes =
      (Array.isArray(info.releaseNotes)
        ? info.releaseNotes.map((n) => n.note).join("\n")
        : info.releaseNotes) || "Улучшения и исправления.";
    update = {
      status: "available",
      required: true,
      version: info.version,
      notes: String(notes).replace(/<[^>]*>/g, ""),
    };
    store.data.pendingUpdate = { version: update.version, notes: update.notes };
    save();
  });
  autoUpdater.on("update-not-available", () => {
    update = { status: "current" };
    delete store.data.pendingUpdate;
    save();
  });
  autoUpdater.on("download-progress", (p) => {
    update = {
      ...update,
      status: "downloading",
      percent: Math.round(p.percent),
    };
    broadcast();
  });
  autoUpdater.on("update-downloaded", () => {
    update = { ...update, status: "downloaded" };
    broadcast();
  });
  autoUpdater.on("error", (e) => {
    log(e);
    update = {
      ...update,
      status: "error",
      message:
        "Не удалось связаться с сервером обновлений. Проверьте интернет и повторите.",
    };
    broadcast();
  });
  return autoUpdater;
}
let updater;
async function checkUpdates() {
  if (!app.isPackaged || smoke) {
    update = { status: "current" };
    broadcast();
    return;
  }
  if (checking || ["downloading", "downloaded"].includes(update.status)) return;
  checking = true;
  update = { ...update, status: "checking" };
  broadcast();
  try {
    await updater.checkForUpdates();
  } catch (e) {
    log(e);
  } finally {
    checking = false;
  }
}
const weatherCache = new Map();
async function json(url) {
  const r = await net.fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw Error("Сервис временно недоступен");
  return r.json();
}
function registerIPC() {
  ipcMain.on("daily-quote", (event, date) => {
    event.returnValue = quoteForDate(date);
  });
  ipcMain.handle("focus-input", (e) => {
    requireUnlocked();
    const win = BrowserWindow.fromWebContents(e.sender);
    if (![...windows.values()].includes(win)) throw Error("Нет доступа");
    desktop.focusInput(win);
  });
  ipcMain.handle("state", () => state());
  ipcMain.handle("appearance", (e, patch) => {
    requireManager(e);
    requireUnlocked();
    store.data.appearance = themeTools.appearance({
      ...themeTools.appearance(store.data.appearance),
      ...patch,
    });
    manager.setOpacity(store.data.appearance.opacity / 100);
    save();
  });
  ipcMain.handle("theme-all", (e) => {
    requireManager(e);
    requireUnlocked();
    store.data.widgets = store.data.widgets.map((w) => ({
      ...w,
      theme: "app",
    }));
    save();
  });
  ipcMain.handle("add", (e, type) => {
    requireManager(e);
    requireUnlocked();
    if (store.data.widgets.length >= 30)
      throw Error("Можно добавить не более 30 виджетов");
    const w = clampBounds(
      createWidget(type, store.data.widgets.length % 10),
      screen.getAllDisplays().map((d) => d.workArea),
    );
    store.data.widgets.push(w);
    save();
    widgetWindow(w);
    return w.id;
  });
  ipcMain.handle("patch", (e, id, patch) => {
    requireUnlocked();
    const old = selected(e, id),
      w = patchWidget(old, patch);
    if (
      ["background", "accent"].some((key) =>
        /^#[a-f0-9]{6}$/i.test(patch[key] || ""),
      )
    ) {
      const current = themeTools.resolveWidget(
        old,
        themeTools.appearance(store.data.appearance),
        systemColors(),
      );
      for (const key of ["background", "accent"])
        if (!/^#[a-f0-9]{6}$/i.test(patch[key] || "")) w[key] = current[key];
    }
    store.data.widgets[store.data.widgets.indexOf(old)] = w;
    const typing =
      (w.type === "note" &&
        (typeof patch.text === "string" ||
          patch.noteAction?.type === "update")) ||
      (w.type === "calendar" && typeof patch.event?.text === "string") ||
      (w.type === "day-planner" && Object.hasOwn(patch, "plannerDraft"));
    if (typing && patch.saveNow !== true) {
      store.scheduleSave(350, log);
      broadcast();
    } else save();
    if (
      ["width", "height", "radius", "style"].some((key) => w[key] !== old[key])
    )
      place(w, windows.get(id));
    return w;
  });
  ipcMain.handle("remove", (e, id) => {
    requireManager(e);
    requireUnlocked();
    const removed = selected(e, id);
    store.data.widgets = store.data.widgets.filter((w) => w.id !== id);
    windows.get(id)?.destroy();
    save();
    const photoDirectory = path.join(app.getPath("userData"), "photos");
    try {
      removeWidgetPhoto(photoDirectory, removed);
    } catch (error) {
      if (["EPERM", "EBUSY"].includes(error.code))
        setTimeout(() => {
          try {
            removeWidgetPhoto(photoDirectory, removed);
          } catch (retryError) {
            log(retryError);
          }
        }, 500).unref();
      else log(error);
    }
  });
  ipcMain.handle("edit", (e, id) => {
    selected(e, id);
    openManager();
    if (manager.webContents.isLoadingMainFrame())
      manager.webContents.once("did-finish-load", () =>
        manager.webContents.send("edit", id),
      );
    else manager.webContents.send("edit", id);
  });
  ipcMain.handle("photo", async (e, id) => {
    requireUnlocked();
    selected(e, id);
    if (!manager || manager.isDestroyed()) openManager();
    const result = await dialog.showOpenDialog(manager, {
      title: "Выберите фотографию",
      properties: ["openFile"],
      filters: [
        { name: "Изображения", extensions: ["jpg", "jpeg", "png", "webp"] },
      ],
    });
    if (result.canceled) return;
    requireUnlocked();
    const w = selected(e, id);
    const source = result.filePaths[0];
    if (fs.statSync(source).size > 30 * 1024 * 1024)
      throw Error("Выберите фото размером до 30 МБ");
    const im = nativeImage.createFromPath(source);
    if (im.isEmpty()) throw Error("Не удалось открыть фото");
    const dir = path.join(app.getPath("userData"), "photos");
    fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, id + ".png");
    const size = im.getSize();
    fs.writeFileSync(
      dest,
      (Math.max(size.width, size.height) > 4096
        ? im.resize(
            size.width > size.height
              ? { width: 4096, quality: "best" }
              : { height: 4096, quality: "best" },
          )
        : im
      ).toPNG(),
    );
    w.photo = pathToFileURL(dest).href + "?v=" + Date.now();
    save();
  });
  ipcMain.handle("autostart", (e, value) => {
    requireManager(e);
    store.data.autostart = Boolean(value);
    if (app.isPackaged && !smoke && !qaProfile)
      app.setLoginItemSettings({
        name: "My Widget",
        openAtLogin: store.data.autostart,
        path: process.execPath,
        args: ["--background"],
      });
    save();
  });
  ipcMain.handle("cities", async (e, name) => {
    requireManager(e);
    if (typeof name !== "string" || name.trim().length < 2) return [];
    return (
      (
        await json(
          "https://geocoding-api.open-meteo.com/v1/search?name=" +
            encodeURIComponent(name.slice(0, 100)) +
            "&count=8&language=ru&format=json",
        )
      ).results || []
    );
  });
  ipcMain.handle("weather", async (e, id) => {
    const w = selected(e, id),
      key = [w.latitude, w.longitude, w.units].join(",");
    const cached = weatherCache.get(key);
    if (cached && Date.now() - cached.time < 600000) return cached;
    try {
      const data = await json(
        `https://api.open-meteo.com/v1/forecast?latitude=${w.latitude}&longitude=${w.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&temperature_unit=${w.units}&timezone=auto&forecast_days=1`,
      );
      const result = { ...data, time: Date.now() };
      weatherCache.set(key, result);
      return result;
    } catch (error) {
      if (cached) return { ...cached, stale: true };
      throw Error("Нет данных о погоде. Проверьте подключение.");
    }
  });
  ipcMain.handle("drag-start", (e, id) => {
    requireUnlocked();
    const w = selected(e, id);
    if (w.locked) return;
    drag = {
      id,
      mode: "move",
      buttonSeen: false,
      start: screen.getCursorScreenPoint(),
      x: w.x,
      y: w.y,
    };
  });
  ipcMain.handle("resize-start", (e, id) => {
    requireUnlocked();
    const w = selected(e, id);
    if (w.locked) return;
    drag = {
      id,
      mode: "resize",
      buttonSeen: false,
      start: screen.getCursorScreenPoint(),
      width: w.width,
      height: w.height,
    };
  });
  ipcMain.handle("resize-step", (e, id, dx, dy) => {
    requireUnlocked();
    const w = selected(e, id);
    if (w.locked) return;
    if (
      !Number.isFinite(dx) ||
      !Number.isFinite(dy) ||
      Math.abs(dx) > 40 ||
      Math.abs(dy) > 40
    )
      throw Error("Некорректный размер");
    Object.assign(w, resizeBounds(w, dx, dy));
    place(w, windows.get(id));
    save();
  });
  ipcMain.handle("drag-end", (e) => {
    if (
      drag &&
      BrowserWindow.fromWebContents(e.sender) === windows.get(drag.id)
    ) {
      drag = null;
      save();
    }
  });
  ipcMain.handle("check-updates", () => checkUpdates());
  ipcMain.handle("download-update", async () => {
    if (update.required && update.status !== "downloading") {
      try {
        if (!updater.updateInfoAndProvider) await updater.checkForUpdates();
        await updater.downloadUpdate();
      } catch (e) {
        log(e);
        update = {
          ...update,
          status: "error",
          message: "Не удалось загрузить обновление. Повторите попытку.",
        };
        broadcast();
      }
    }
  });
  ipcMain.handle("install-update", () => {
    if (update.status === "downloaded") {
      store.save();
      quitting = true;
      updater.quitAndInstall(false, true);
    }
  });
  ipcMain.handle("quit", () => {
    quitting = true;
    app.quit();
  });
}
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => openManager());
  app.on("window-all-closed", () => {});
  app.on("before-quit", () => {
    quitting = true;
    if (store) store.save();
  });
  app
    .whenReady()
    .then(async () => {
      store = new Store(app.getPath("userData"));
      store.data.appearance = themeTools.appearance(store.data.appearance);
      systemPreferences.on("accent-color-changed", () => broadcast());
      nativeTheme.on("updated", () => broadcast());
      desktop = require("./desktop");
      updater = configureUpdates();
      if (
        store.data.pendingUpdate &&
        newer(store.data.pendingUpdate.version, app.getVersion())
      )
        update = {
          ...store.data.pendingUpdate,
          status: "available",
          required: true,
        };
      else delete store.data.pendingUpdate;
      registerIPC();
      app.setAppUserModelId("com.adler.widget");
      if (app.isPackaged && !smoke && !qaProfile)
        app.setLoginItemSettings({ name: "Widget", openAtLogin: false });
      if (app.isPackaged && !smoke && !qaProfile)
        app.setLoginItemSettings({
          name: "My Widget",
          openAtLogin: store.data.autostart,
          path: process.execPath,
          args: ["--background"],
        });
      const icon = nativeImage.createFromPath(
        path.join(__dirname, "../assets/icon.png"),
      );
      tray = new Tray(icon.resize({ width: 32, height: 32 }));
      tray.setToolTip("My Widget — виджеты рабочего стола");
      tray.setContextMenu(
        Menu.buildFromTemplate([
          { label: "Открыть My Widget", click: openManager },
          {
            label: "Вернуть виджеты на экран",
            click: () => {
              for (let i = 0; i < store.data.widgets.length; i++) {
                const w = store.data.widgets[i],
                  area = screen.getPrimaryDisplay().workArea;
                w.x = area.x + 40 + (i % 8) * 30;
                w.y = area.y + 40 + (i % 8) * 30;
                place(w, windows.get(w.id));
              }
              save();
            },
          },
          { type: "separator" },
          {
            label: "Завершить работу",
            click: () => {
              quitting = true;
              app.quit();
            },
          },
        ]),
      );
      tray.on("double-click", openManager);
      store.data.widgets = store.data.widgets
        .filter((w) => TYPES.includes(w.type))
        .map((w) =>
          clampBounds(
            normalizePlanner(normalizeNotes(w)),
            screen.getAllDisplays().map((d) => d.workArea),
          ),
        );
      if (!store.recovered)
        try {
          cleanupOrphanPhotos(
            path.join(app.getPath("userData"), "photos"),
            store.data.widgets,
          );
        } catch (error) {
          log(error);
        }
      for (const w of store.data.widgets) widgetWindow(w);
      const pointerStates = new Map();
      setInterval(() => {
        const target = desktop.pointerTarget(windows, screen);
        for (const [id, win] of windows) {
          if (win.isDestroyed() || win.webContents.isLoadingMainFrame())
            continue;
          const over = id === target;
          if (pointerStates.get(id) !== over) {
            pointerStates.set(id, over);
            win.webContents.send("pointer-presence", over);
          }
        }
        for (const id of pointerStates.keys())
          if (!windows.has(id)) pointerStates.delete(id);
      }, 100).unref();
      if (!process.argv.includes("--background")) openManager();
      else checkUpdates();
      setInterval(() => {
        if (!drag) return;
        if (desktop.leftButtonDown()) drag.buttonSeen = true;
        else if (drag.buttonSeen) {
          drag = null;
          save();
          return;
        }
        const w = store.data.widgets.find((w) => w.id === drag.id);
        if (!w) return;
        const p = screen.getCursorScreenPoint();
        if (w.locked || update.required) {
          drag = null;
          save();
          return;
        }
        if (drag.mode === "resize")
          Object.assign(
            w,
            resizeBounds(
              { ...w, width: drag.width, height: drag.height },
              p.x - drag.start.x,
              p.y - drag.start.y,
            ),
          );
        else {
          w.x = drag.x + p.x - drag.start.x;
          w.y = drag.y + p.y - drag.start.y;
        }
        place(w, windows.get(w.id));
      }, 25).unref();
      setInterval(() => {
        for (const w of store.data.widgets) {
          const win = windows.get(w.id);
          if (win && !win.isDestroyed()) place(w, win);
          else widgetWindow(w);
        }
      }, 7000).unref();
      screen.on("display-removed", () => {
        store.data.widgets = store.data.widgets.map((w) =>
          clampBounds(
            w,
            screen.getAllDisplays().map((d) => d.workArea),
          ),
        );
        for (const w of store.data.widgets) place(w, windows.get(w.id));
        save();
      });
      if (smoke)
        require("./smoke")({
          app,
          manager,
          store,
          windows,
          widgetWindow,
          save,
          state,
          failures,
          desktop,
          setUpdate: (value) => {
            update = value;
            broadcast();
          },
        });
    })
    .catch((e) => {
      log(e);
      dialog.showErrorBox("My Widget", String(e));
      app.quit();
    });
}
