function rangeControl(
  label,
  key,
  value,
  min,
  max,
  unit = "",
  scope = "widget",
) {
  return `<label class="range-field"><span>${label}<output data-value="${scope}-${key}">${value}${unit}</output></span><input type="range" data-range="${key}" data-scope="${scope}" data-unit="${unit}" min="${min}" max="${max}" step="1" value="${value}"><span class="range-limits"><span>${min}${unit}</span><span>${max}${unit}</span></span></label>`;
}
function themeChoices(value, scope) {
  const presets = state.themes.filter((t) => t.id !== "system");
  const render = (t) =>
    `<button type="button" class="theme-choice ${value === t.id ? "chosen" : ""}" data-theme="${t.id}" data-theme-scope="${scope}" aria-pressed="${value === t.id}" title="${esc(t.name)}"><span class="theme-swatch" style="background:${t.bg};border-color:${t.border}"><i style="background:${t.panel}"></i><b style="background:${t.accent}"></b><em style="background:${t.text}"></em></span><span>${esc(t.name)}</span></button>`;
  return `<div class="theme-options">${scope === "widget" ? `<button class="theme-mode ${value === "app" ? "chosen" : ""}" data-theme="app" data-theme-scope="widget" aria-pressed="${value === "app"}">↗ Как у программы</button><button class="theme-mode ${value === "custom" ? "chosen" : ""}" data-theme="custom" data-theme-scope="widget" aria-pressed="${value === "custom"}">◉ Свои цвета</button>` : ""}<button class="theme-mode ${value === "system" ? "chosen" : ""}" data-theme="system" data-theme-scope="${scope}" aria-pressed="${value === "system"}"><i style="background:${state.system.accent}"></i>Акцент Windows</button></div><p class="hint">Системная тема использует акцент Windows и автоматически следует светлому или тёмному режиму.</p><div class="theme-label">Тёмные</div><div class="theme-grid">${presets
    .filter((t) => t.mode === "dark")
    .map(render)
    .join(
      "",
    )}</div><div class="theme-label">Светлые</div><div class="theme-grid">${presets
    .filter((t) => t.mode === "light")
    .map(render)
    .join("")}</div>`;
}
function appAppearancePanel() {
  return `<section class="settings-panel appearance-panel"><div class="eyebrow">ЦВЕТ И НАСТРОЕНИЕ</div><h2>Оформление программы</h2>${themeChoices(state.appearance.theme, "app")}<div class="appearance-divider"></div>${rangeControl("Прозрачность окна", "transparency", 100 - state.appearance.opacity, 0, 65, "%", "app")}<p class="hint">Прозрачность применяется ко всему окну программы. Виджеты настраиваются отдельно.</p><div class="actions"><button class="secondary" id="theme-all">Применить тему ко всем виджетам</button><button class="secondary" id="app-opaque">Сделать окно непрозрачным</button></div><p class="hint">Общая тема не меняет положение, размер, прозрачность и записи виджетов.</p></section>`;
}
function widgetAppearancePanel(w) {
  return `<section class="settings-panel appearance-panel"><h2>Тема виджета</h2>${themeChoices(w.theme || "custom", "widget")}</section>`;
}
function widgetSliders(w) {
  const minWidth = w.type === "calendar" ? 300 : 240,
    minHeight = w.type === "calendar" ? 400 : w.type === "weather" ? 260 : 180;
  return `<div class="wide preset-row"><span class="hint">Быстрый размер</span>${["Компактный", "Обычный", "Крупный"].map((n, i) => `<button class="secondary" data-size="${i}">${n}</button>`).join("")}</div>${rangeControl("Ширина", "width", w.width, minWidth, 900, " px")}${rangeControl("Высота", "height", w.height, minHeight, 1000, " px")}${rangeControl("Прозрачность всего виджета", "widgetTransparency", 100 - (w.widgetOpacity ?? 100), 0, 75, "%")}
${rangeControl("Прозрачность фона", "transparency", 100 - w.opacity, 0, 75, "%")}${rangeControl("Размер текста", "fontSize", w.fontSize, 12, 30, " px")}${rangeControl("Скругление углов", "radius", w.radius, 0, 40, " px")}<div class="wide hint">Ползунки работают сразу. Для точной настройки используйте стрелки ← и → на клавиатуре. Прозрачность фона не затрагивает текст и фото; прозрачность всего виджета применяется ко всем элементам.</div>`;
}
function applyAppPalette() {
  if (!state) return;
  const p = state.palette;
  for (const [key, value] of Object.entries(p))
    if (/^#[a-f0-9]{6}$/i.test(value))
      document.documentElement.style.setProperty("--ui-" + key, value);
  document.documentElement.style.colorScheme = p.mode;
}
function bindAppearance() {
  root.querySelectorAll("[data-theme]").forEach(
    (button) =>
      (button.onclick = () =>
        act(async () => {
          if (button.dataset.themeScope === "app")
            await api.appearance({ theme: button.dataset.theme });
          else {
            const w = state.widgets.find((w) => w.id === editing);
            const p = { theme: button.dataset.theme };
            if (p.theme === "custom")
              Object.assign(p, {
                background: w.background,
                foreground: w.foreground,
                accent: w.accent,
              });
            await api.patch(editing, p);
          }
          state = await api.state();
          renderManager();
        })),
  );
  root.querySelectorAll("[data-range]").forEach((el) => {
    // Keep the input node alive during a drag, and coalesce IPC without losing the final value.
    let sending = false,
      pending = null;
    const widgetId = editing;
    const drain = async () => {
      if (sending) return;
      sending = true;
      try {
        while (pending !== null) {
          const value = pending;
          pending = null;
          const key =
            el.dataset.range === "widgetTransparency"
              ? "widgetOpacity"
              : el.dataset.range === "transparency"
                ? "opacity"
                : el.dataset.range;
          const patch = {
            [key]: ["transparency", "widgetTransparency"].includes(
              el.dataset.range,
            )
              ? 100 - value
              : value,
          };
          await (el.dataset.scope === "app"
            ? api.appearance(patch)
            : api.patch(widgetId, patch));
        }
      } catch (e) {
        toast(e.message);
      } finally {
        sending = false;
      }
    };
    el.oninput = () => {
      const value = Number(el.value);
      root.querySelector(
        `[data-value="${el.dataset.scope}-${el.dataset.range}"]`,
      ).textContent = value + el.dataset.unit;
      pending = value;
      drain();
    };
  });
  root.querySelectorAll("[data-size]").forEach(
    (el) =>
      (el.onclick = () =>
        act(async () => {
          const w = state.widgets.find((w) => w.id === editing);
          const base = {
            weather: [300, 280],
            clock: [320, 230],
            note: [300, 300],
            photo: [300, 340],
            calendar: [350, 440],
          }[w.type];
          const factor = [0.85, 1, 1.3][Number(el.dataset.size)];
          await api.patch(editing, {
            width: Math.round(base[0] * factor),
            height: Math.round(base[1] * factor),
          });
          state = await api.state();
          renderManager();
        })),
  );
  bind("#theme-all", async () => {
    await api.themeAll();
    toast("Все виджеты используют тему программы");
  });
  bind("#app-opaque", async () => {
    await api.appearance({ opacity: 100 });
    state = await api.state();
    renderManager();
  });
}
