const fs = require("node:fs"),
  path = require("node:path");
module.exports = async ({ manager, store, windows, checks, out }) => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)),
    js = (s) => manager.webContents.executeJavaScript(s);
  const note = store.data.widgets.find((w) => w.type === "note"),
    win = windows.get(note.id),
    clock = store.data.widgets.find((w) => w.type === "clock"),
    clockWindow = windows.get(clock.id);
  const original = JSON.parse(JSON.stringify(store.data));
  await js(`window.widgetAPI.patch('${note.id}',{theme:'app'})`);
  await js(`document.querySelector('[data-nav="settings"]').click()`);
  checks.push({
    name: "automatic contrast is fixed on and manual program controls are absent",
    ok:
      store.data.appearance.autoTextContrast === true &&
      (await js(
        `!document.querySelector('[data-text-auto]')&&!document.querySelector('[data-text-color]')`,
      )) &&
      (await js(
        `getComputedStyle(document.documentElement).getPropertyValue('--ui-icon').trim()!==''`,
      )),
  });
  for (const id of Object.keys(require("../src/themes").themes)) {
    await js(`document.querySelector('[data-theme="${id}"]').click()`);
    await wait(130);
    const expected = require("../src/themes").themes[id];
    checks.push({
      name: "theme " + id + " in app and widget",
      ok:
        store.data.appearance.theme === id &&
        (await win.webContents.executeJavaScript(
          `getComputedStyle(document.querySelector('.widget')).getPropertyValue('--accent').trim()==='${expected.accent}'`,
        )),
    });
  }
  manager.setSize(1140, 1020);
  await js(`document.querySelector('[data-theme="purple-dark"]').click()`);
  await wait(150);
  fs.writeFileSync(
    path.join(out, "themes-dark.png"),
    (await manager.webContents.capturePage()).toPNG(),
  );
  await js(`document.querySelector('[data-theme="brown-light"]').click()`);
  await wait(150);
  fs.writeFileSync(
    path.join(out, "themes-light.png"),
    (await manager.webContents.capturePage()).toPNG(),
  );
  await js(
    `{const el=document.querySelector('[data-range="transparency"]');el.focus();window.testSlider=el;el.value=32;el.dispatchEvent(new Event('input'));}`,
  );
  await wait(150);
  checks.push({
    name: "window opacity applies natively and slider retains focus",
    ok:
      Math.abs(manager.getOpacity() - 0.68) < 0.02 &&
      (await js(
        "window.testSlider===document.activeElement && window.testSlider.isConnected",
      )),
  });
  await js(`window.widgetAPI.appearance({opacity:100})`);
  await js(`document.querySelector('[data-nav="mine"]').onclick()`);
  await js(`document.querySelector('[data-edit="${note.id}"]').click()`);
  checks.push({
    name: "manual widget text controls are absent and theme stays attached",
    ok:
      store.data.widgets.find((w) => w.id === note.id).theme === "app" &&
      store.data.widgets.find((w) => w.id === note.id).autoTextContrast ===
        true &&
      (await js(
        `!document.querySelector('[data-text-auto]')&&!document.querySelector('[data-text-color]')&&!document.querySelector('[data-prop="foreground"]')`,
      )),
  });
  for (const [key, val] of [
    ["width", 410],
    ["height", 355],
    ["fontSize", 22],
    ["radius", 12],
    ["transparency", 44],
    ["widgetTransparency", 28],
  ]) {
    await js(
      `{const el=document.querySelector('[data-range="${key}"]');el.focus();el.value=${val};el.dispatchEvent(new Event('input'));}`,
    );
    await wait(110);
  }
  const updated = store.data.widgets.find((w) => w.id === note.id);
  checks.push({
    name: "all widget sliders persist precise final values",
    ok:
      updated.width === 410 &&
      updated.height === 355 &&
      updated.fontSize === 22 &&
      updated.radius === 12 &&
      updated.opacity === 56 &&
      updated.widgetOpacity === 72,
  });
  checks.push({
    name: "whole widget transparency includes contents",
    ok: await win.webContents.executeJavaScript(
      `getComputedStyle(document.querySelector('.widget')).opacity==='0.72'`,
    ),
  });
  await js(`document.activeElement.blur()`);
  fs.writeFileSync(
    path.join(out, "widget-settings.png"),
    (await manager.webContents.capturePage()).toPNG(),
  );
  await js(`document.querySelector('[data-theme="red-light"]').click()`);
  await wait(130);
  await js(`window.widgetAPI.appearance({theme:'green-dark'})`);
  checks.push({
    name: "widget theme independent of program",
    ok: await win.webContents.executeJavaScript(
      `getComputedStyle(document.querySelector('.widget')).getPropertyValue('--accent').trim()==='#b13555'`,
    ),
  });
  await js(
    `window.widgetAPI.patch('${note.id}',{theme:'system'});window.widgetAPI.appearance({theme:'system'})`,
  );
  await wait(130);
  const { systemPreferences, nativeTheme } = require("electron"),
    originalGet = systemPreferences.getAccentColor;
  try {
    systemPreferences.getAccentColor = () => "050507ff";
    nativeTheme.themeSource = "dark";
    systemPreferences.emit("accent-color-changed", {}, "050507ff");
    await wait(130);
    checks.push({
      name: "dark Windows accent is lightened wherever it is used as text",
      ok:
        (await js(
          `getComputedStyle(document.documentElement).getPropertyValue('--ui-accentText').trim()!=='#050507'`,
        )) &&
        (await clockWindow.webContents.executeJavaScript(
          `getComputedStyle(document.querySelector('.widget')).getPropertyValue('--accent-text').trim()!=='#050507'`,
        )),
    });
    systemPreferences.getAccentColor = () => "ed782aff";
    systemPreferences.emit("accent-color-changed", {}, "ed782aff");
    await wait(130);
    checks.push({
      name: "Windows accent event updates both surfaces live",
      ok:
        (await js(
          `getComputedStyle(document.documentElement).getPropertyValue('--ui-accent').trim()==='#ed782a'`,
        )) &&
        (await win.webContents.executeJavaScript(
          `getComputedStyle(document.querySelector('.widget')).getPropertyValue('--accent').trim()==='#ed782a'`,
        )),
    });
    nativeTheme.themeSource = "light";
    await wait(130);
    checks.push({
      name: "Windows light mode event updates palette",
      ok: await js(`document.documentElement.style.colorScheme==='light'`),
    });
  } finally {
    systemPreferences.getAccentColor = originalGet;
    nativeTheme.themeSource = "system";
    systemPreferences.emit("accent-color-changed");
  }
  await js(`window.widgetAPI.themeAll()`);
  checks.push({
    name: "apply to all preserves notes and opacity",
    ok:
      store.data.widgets.every((w) => w.theme === "app") &&
      store.data.widgets.find((w) => w.id === note.id).text === note.text &&
      store.data.widgets.find((w) => w.id === note.id).opacity === 56,
  });
  const persisted = JSON.parse(fs.readFileSync(store.file));
  checks.push({
    name: "appearance settings written to disk",
    ok:
      persisted.appearance.theme === "system" &&
      persisted.widgets.every((w) => w.theme === "app"),
  });
  const quote = store.data.widgets.find((w) => w.type === "quote");
  await js(`document.querySelector('[data-nav="mine"]').onclick()`);
  await js(`document.querySelector('[data-edit="${quote.id}"]').click()`);
  checks.push({
    name: "quote size sliders use the model minimums",
    ok: await js(
      `document.querySelector('[data-range="width"]').min==='260'&&document.querySelector('[data-range="height"]').min==='190'`,
    ),
  });
  for (const [index, width, height] of [
    [0, 289, 213],
    [1, 340, 250],
    [2, 442, 325],
  ]) {
    await js(`document.querySelector('[data-size="${index}"]').click()`);
    await wait(120);
    const actual = store.data.widgets.find((w) => w.id === quote.id);
    checks.push({
      name: "quote quick size " + index + " applies without error",
      ok: actual.width === width && actual.height === height,
    });
  }
  const calendar = store.data.widgets.find((w) => w.type === "calendar");
  await js(`document.querySelector('[data-nav="mine"]').onclick()`);
  await js(`document.querySelector('[data-edit="${calendar.id}"]').click()`);
  checks.push({
    name: "calendar labels its reversible marker expiry as auto-hide",
    ok: await js(
      `document.querySelector('.main').textContent.includes('Автоскрытие отметок')&&!document.querySelector('.main').textContent.includes('Автоудаление отметок')`,
    ),
  });
  store.data = original;
  store.save();
  await js(
    `window.widgetAPI.appearance(${JSON.stringify(original.appearance)})`,
  );
  manager.setSize(1140, 820);
  await js(`document.querySelector('[data-nav="catalog"]').click()`);
};
