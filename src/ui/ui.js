"use strict";
const api = window.widgetAPI,
  root = document.querySelector("#app");
const id = new URLSearchParams(location.search).get("widget");
const names = {
  weather: "Погода",
  clock: "Время и дата",
  note: "Заметки",
  photo: "Моё фото",
  calendar: "Календарь",
};
const descriptions = {
  weather: "Температура и погода в вашем городе.",
  clock: "Ваш ритм. Время, дата и день недели.",
  note: "Идеи и важное — всегда перед глазами.",
  photo: "Любимые моменты на рабочем столе.",
  calendar: "Планы и заметки для каждого дня.",
};
let state,
  view = "catalog",
  editing = null,
  month = new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  selectedDate = dateKey(new Date()),
  weather = null,
  weatherKey = "",
  weatherError = "",
  weatherBusy = false,
  toastTimer;
let renderedCalendarDate = null;
function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function esc(x) {
  return String(x ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
function icon(type) {
  const p = {
    catalog: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
    mine: "M3 4h18v13H3z M8 21h8 M12 17v4",
    settings:
      "M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8 M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M19 5l-2 2 M7 17l-2 2",
    plus: "M12 3v18 M3 12h18",
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${p[type] || p.catalog}"/></svg>`;
}
function toast(s) {
  const t = document.querySelector("#toast");
  t.textContent = s;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 4000);
}
async function act(fn) {
  try {
    return await fn();
  } catch (e) {
    toast(
      e.message.replace(/^Error invoking remote method '[^']+': Error: /, ""),
    );
  }
}
function preview(t) {
  return {
    weather:
      '<span class="small">Москва</span><strong>18°</strong><span class="sun">☀</span><span class="small">Ясно · ощущается как 17°</span>',
    clock: "<strong>10:24</strong><p>Воскресенье, 13 сентября</p>",
    note: '<span class="small">НА СЕГОДНЯ</span><p>Замедлиться.<br>Записать новую идею.<br>Сделать что-то для себя.</p>',
    photo: "",
    calendar:
      '<span class="small">Сентябрь</span><div class="mini-days">П В С Ч П С В<br>7 8 9 10 11 12 13<br>14 15 16 17 18 19 20</div>',
  }[t];
}
function catalog() {
  return `<div class="eyebrow">ВАШЕ ЛИЧНОЕ ПРОСТРАНСТВО</div><div class="intro"><div><h1>Рабочий стол. По-вашему.</h1><p>Маленькие виджеты для того, что важно.</p></div><span class="pill">5 виджетов</span></div><div class="hero"><div><h2>Всё нужное — рядом</h2><p>Добавьте виджет, выберите свой стиль и перетащите<br>его в удобное место на рабочем столе.</p></div><div class="hero-mark" aria-hidden="true"><span></span><span></span><span></span></div></div><div class="section-title"><h2>Коллекция виджетов</h2><span class="muted small">Можно добавить несколько одинаковых</span></div><div class="grid">${Object.keys(
    names,
  )
    .map(
      (t) =>
        `<article class="card"><div class="preview ${t}" aria-hidden="true">${preview(t)}</div><div class="card-body"><h3>${names[t]}</h3><p>${descriptions[t]}</p><button class="add" data-add="${t}">＋ Добавить</button></div></article>`,
    )
    .join(
      "",
    )}<article class="card future">${icon("plus")}<h3>Место для нового</h3><p class="small">Коллекция будет расти<br>вместе с вами.</p></article></div><p class="hint" style="margin-top:20px">Виджеты останутся на рабочем столе после закрытия этого окна. Открыть My Widget снова можно через значок в трее.</p>`;
}
function mine() {
  return `<div class="eyebrow">НА РАБОЧЕМ СТОЛЕ</div><div class="intro"><div><h1>Мои виджеты</h1><p>Каждый со своим характером.</p></div><span class="pill">${state.widgets.length} из 30</span></div>${state.widgets.length ? state.widgets.map((w) => `<div class="list-item row spread"><div><h3>${esc(w.title || names[w.type])}</h3><span class="muted small">${names[w.type]} · ${w.width} × ${w.height}${w.locked ? " · Положение закреплено" : ""}</span></div><button class="secondary" data-edit="${w.id}">Настроить</button></div>`).join("") : '<div class="empty"><h2>Пока здесь тихо</h2><p class="muted">Добавьте первый виджет из коллекции.</p><button class="primary" data-nav="catalog">Открыть коллекцию</button></div>'}`;
}
function settings() {
  const u = state.update;
  return `<div class="eyebrow">ПАРАМЕТРЫ</div><h1>Удобно каждый день</h1>${appAppearancePanel()}<div class="settings-panel" style="margin-top:25px"><h2>Запуск вместе с Windows</h2><p>Ваши виджеты появятся автоматически после входа в систему. Окно каталога открываться не будет.</p><label class="check"><input id="autostart" type="checkbox" ${state.autostart ? "checked" : ""}>Включать виджеты при входе в Windows</label></div><div class="settings-panel"><div class="row spread"><h2>Версия ${esc(state.version)}</h2><span class="pill">${u.status === "checking" ? "Проверяем…" : u.status === "current" ? "Установлена актуальная версия" : "Обновления"}</span></div><p>${(state.changes || []).map(esc).join("<br>")}</p>${u.status === "error" ? `<p class="status-error">${esc(u.message)}</p>` : ""}<button class="secondary" id="check-update">Проверить обновления</button></div><div class="settings-panel"><h2>Как управлять виджетами</h2><p>Шестерёнка настроек появляется через 2 секунды наведения. Потяните за нижний правый угол, чтобы изменить размер. Перемещайте виджет за заголовок или свободное место. Записи сохраняются автоматически. Пункт «Вернуть виджеты на экран» в трее поможет после смены монитора.</p><p class="small">Погода: Open-Meteo · CC BY 4.0. Фотографии и заметки хранятся на вашем компьютере.</p></div>`;
}
function field(label, input, wide = false) {
  if (label === "Цвет текста") return "";
  return `<label class="field${wide ? " wide" : ""}">${label}${input}</label>`;
}
function editPanel() {
  const w = state.widgets.find((w) => w.id === editing);
  if (!w) {
    editing = null;
    return mine();
  }
  const input = (key, type = "text", extra = "") =>
    `<input data-prop="${key}" type="${type}" value="${esc(w[key])}" ${extra}>`;
  return `<button class="back" id="back">← Мои виджеты</button><div class="intro"><div><div class="eyebrow">ИНДИВИДУАЛЬНЫЙ СТИЛЬ</div><h1>${names[w.type]}</h1><p>Изменения сразу появятся на рабочем столе.</p></div></div>${widgetDesignPanel(w)}${widgetAppearancePanel(w)}<div class="settings-panel"><div class="editor-preview" id="editor-preview" style="background:${w.background};color:${w.foreground};border-radius:${w.radius}px"><strong>${esc(w.title || names[w.type])}</strong><span style="color:${w.accent}">Aa · 123</span></div><div class="form-grid">${field("Название", input("title", "text", `placeholder="${names[w.type]}"`), true)}${field("Цвет фона", input("background", "color"))}${field("Цвет текста", input("foreground", "color"))}${field("Акцент", input("accent", "color"))}${widgetSliders(w)}</div><label class="check"><input data-prop="locked" type="checkbox" ${w.locked ? "checked" : ""}>Закрепить положение</label></div><div class="settings-panel">${w.type === "weather" ? `<h2>Ваш город</h2><p class="small">Сейчас: <span id="current-city">${esc(w.city)}</span></p><div class="row"><input id="city-search" placeholder="Название города" style="flex:1"><button class="secondary" id="search-city">Найти</button></div><div class="city-results" id="city-results"></div><label class="field" style="margin-top:18px">Единицы температуры<select data-prop="units"><option value="celsius" ${w.units === "celsius" ? "selected" : ""}>Градусы Цельсия · °C</option><option value="fahrenheit" ${w.units === "fahrenheit" ? "selected" : ""}>Градусы Фаренгейта · °F</option></select></label>` : w.type === "clock" ? `<h2>Отображение времени</h2><label class="check"><input data-prop="seconds" type="checkbox" ${w.seconds ? "checked" : ""}>Показывать секунды</label><label class="check"><input data-prop="hour12" type="checkbox" ${w.hour12 ? "checked" : ""}>12-часовой формат</label>` : w.type === "photo" ? `<h2>Любимый кадр</h2><p class="small">PNG, JPG или WebP, до 30 МБ. Копия фото сохраняется в приложении.</p><button class="primary" id="choose-photo">Выбрать фотографию</button><label class="field" style="margin-top:18px">Размещение<select data-prop="fit"><option value="cover" ${w.fit === "cover" ? "selected" : ""}>Заполнить виджет</option><option value="contain" ${w.fit === "contain" ? "selected" : ""}>Показать фото целиком</option></select></label>` : w.type === "note" ? `<h2>Текст заметки</h2><textarea data-prop="text" rows="7" style="width:100%" placeholder="Запишите важное…">${esc(w.text)}</textarea><p class="hint">Также можно писать прямо в виджете.</p>` : `<h2>Планы на каждый день</h2><p>Выберите день в календаре на рабочем столе и напишите заметку под ним.</p>${calendarMarkerPanel(w)}`}</div><button class="danger" id="remove-widget">Удалить виджет</button><span class="hint" style="margin-left:15px">Будут удалены и его записи</span>`;
}
function updateOverlay() {
  const u = state.update;
  if (!u.required) return "";
  return `<div class="update-overlay"><section class="update-box"><div class="eyebrow">ДОСТУПНА НОВАЯ ВЕРСИЯ</div><h2>My Widget ${esc(u.version)}</h2><p class="muted">Чтобы продолжить работу, установите обновление.</p><pre>${esc(u.notes)}</pre>${u.status === "downloading" ? `<progress max="100" value="${u.percent || 0}"></progress><p>Загрузка: ${u.percent || 0}%</p>` : ""}${u.status === "error" ? `<p class="status-error">${esc(u.message)}</p>` : ""}<div class="row">${u.status === "downloaded" ? '<button class="primary" id="install-update">Установить и перезапустить</button>' : `<button class="primary" id="download-update" ${["checking", "downloading"].includes(u.status) ? "disabled" : ""}>${u.status === "downloading" ? "Загружаем…" : "Обновить сейчас"}</button>`}<button class="secondary" id="quit">Выйти</button></div></section></div>`;
}
function renderManager() {
  applyAppPalette();
  root.innerHTML = `<div class="shell"><aside class="sidebar"><div class="brand"><span class="brand-icon"><i></i><i></i><i></i><i></i></span>My Widget</div><nav class="nav">${[
    ["catalog", "Коллекция"],
    ["mine", "Мои виджеты"],
    ["settings", "Настройки"],
  ]
    .map(
      ([v, n]) =>
        `<button data-nav="${v}" class="${view === v ? "active" : ""}">${icon(v)}${n}</button>`,
    )
    .join(
      "",
    )}</nav><div class="sidebar-bottom"><p class="small muted"><span class="live-dot"></span>Ваш рабочий стол</p><span class="small muted">My Widget · ${esc(state.version)}</span></div></aside><main class="main">${editing ? editPanel() : view === "mine" ? mine() : view === "settings" ? settings() : catalog()}</main></div>${updateOverlay()}`;
  const editorPreview = document.querySelector("#editor-preview");
  const editingWidget = state.widgets.find((w) => w.id === editing);
  if (editorPreview && editingWidget)
    editorPreview.lastElementChild.style.color = editingWidget.accentText;
  bindManager();
  bindAppearance();
  bindWidgetDesign();
  bindCalendarMarkers();
}
function bindManager() {
  root.querySelectorAll("[data-nav]").forEach(
    (b) =>
      (b.onclick = () => {
        view = b.dataset.nav;
        editing = null;
        renderManager();
      }),
  );
  root.querySelectorAll("[data-add]").forEach(
    (b) =>
      (b.onclick = () =>
        act(async () => {
          b.disabled = true;
          const added = await api.add(b.dataset.add);
          state = await api.state();
          editing = added;
          view = "mine";
          renderManager();
          toast("Виджет добавлен на рабочий стол");
        })),
  );
  root.querySelectorAll("[data-edit]").forEach(
    (b) =>
      (b.onclick = () => {
        editing = b.dataset.edit;
        renderManager();
      }),
  );
  bind("#back", () => {
    editing = null;
    view = "mine";
    renderManager();
  });
  bind("#check-update", () => api.checkUpdates());
  bind("#choose-photo", () => api.photo(editing));
  bind("#remove-widget", () => {
    const btn = document.querySelector("#remove-widget");
    if (btn.dataset.confirm !== "yes") {
      btn.dataset.confirm = "yes";
      btn.textContent = "Нажмите ещё раз для удаления";
      return;
    }
    return act(async () => {
      await api.remove(editing);
      editing = null;
      state = await api.state();
      renderManager();
    });
  });
  const auto = document.querySelector("#autostart");
  if (auto) auto.onchange = () => act(() => api.autostart(auto.checked));
  root.querySelectorAll("[data-prop]").forEach((el) => {
    const change = () => {
      const value =
        el.type === "checkbox"
          ? el.checked
          : el.type === "number" || el.dataset.number === "true"
            ? Number(el.value)
            : el.value;
      act(() => api.patch(editing, { [el.dataset.prop]: value }));
    };
    el.addEventListener(el.tagName === "TEXTAREA" ? "input" : "change", change);
  });
  bind("#search-city", searchCity);
  document.querySelector("#city-search")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") searchCity();
  });
  bind("#download-update", () => api.downloadUpdate());
  bind("#install-update", () => api.installUpdate());
  bind("#quit", () => api.quit());
}
function bind(sel, fn) {
  const el = document.querySelector(sel);
  if (el) el.onclick = () => act(fn);
}
async function searchCity() {
  const list = document.querySelector("#city-results");
  list.textContent = "Ищем…";
  try {
    const cities = await api.cities(
      document.querySelector("#city-search").value,
    );
    list.innerHTML = cities.length
      ? cities
          .map(
            (c, i) =>
              `<button data-city="${i}">${esc([c.name, c.admin1, c.country].filter(Boolean).join(", "))}</button>`,
          )
          .join("")
      : "Город не найден. Попробуйте другое название.";
    list.querySelectorAll("button").forEach(
      (b) =>
        (b.onclick = () =>
          act(async () => {
            const c = cities[Number(b.dataset.city)];
            await api.patch(editing, {
              city: c.name,
              latitude: c.latitude,
              longitude: c.longitude,
            });
            document.querySelector("#current-city").textContent = c.name;
            list.innerHTML = "";
          })),
    );
  } catch {
    list.textContent = "Не удалось выполнить поиск. Проверьте интернет.";
  }
}
function weatherDescription(code) {
  if (code === 0) return ["☀", "Ясно"];
  if (code <= 3) return ["☁", "Облачно"];
  if (code <= 48) return ["≋", "Туман"];
  if (code <= 67) return ["☂", "Дождь"];
  if (code <= 77) return ["❄", "Снег"];
  if (code <= 82) return ["☂", "Ливень"];
  if (code <= 86) return ["❄", "Снегопад"];
  return ["ϟ", "Гроза"];
}
function calendarMarkerExpired(w, key) {
  if (!w.markerAutoDeleteDays) return false;
  const expires = new Date(key + "T23:59:59");
  expires.setDate(expires.getDate() + w.markerAutoDeleteDays);
  return new Date() > expires;
}
async function fetchWeather(w, force = false) {
  const key = [w.latitude, w.longitude, w.units].join(",");
  if (weatherBusy || (!force && weatherKey === key)) return;
  if (key !== weatherKey) {
    weather = null;
    weatherError = "";
  }
  weatherBusy = true;
  weatherKey = key;
  try {
    weather = await api.weather(w.id);
    weatherError = "";
  } catch (e) {
    weatherError = "Не удалось загрузить погоду. Проверьте интернет.";
  } finally {
    weatherBusy = false;
    renderWidget();
  }
}
function widgetContent(w) {
  if (w.type === "clock")
    return `<div class="widget-content clock-content">${w.style === "clock-dial" ? clockDial() : ""}<div class="clock-time" id="time"></div><div class="clock-date" id="date"></div><div class="clock-weekday" id="weekday"></div></div>`;
  if (w.type === "note") return notesContent(w);
  if (w.type === "photo")
    return `<div class="widget-content">${w.photo ? `<img draggable="false" class="photo-image" src="${esc(w.photo)}" style="object-fit:${w.fit}" alt="Ваше фото">` : '<button class="photo-placeholder" id="widget-photo"><span>＋</span>Добавить своё фото</button>'}</div>`;
  if (w.type === "weather") {
    const current = weather?.current;
    const [symbol, desc] = weatherDescription(current?.weather_code);
    return `<div class="widget-content">${current ? `<div class="row spread weather-main"><span class="weather-temp">${Math.round(current.temperature_2m)}°</span><span class="weather-symbol">${["weather-sky", "weather-orbit"].includes(w.style) ? weatherArt(current.weather_code) : symbol}</span></div><div class="weather-desc">${desc}</div><div class="weather-detail"><span>Ощущается ${Math.round(current.apparent_temperature)}°</span><span>${current.relative_humidity_2m}%</span></div><div class="weather-detail" style="border:0"><span>Ветер ${Math.round(current.wind_speed_10m)} км/ч</span><span>${w.units === "fahrenheit" ? "°F" : "°C"}</span></div>` : `<div class="weather-error">${weatherError || "Загружаем погоду…"}${weatherError ? '<button class="secondary" id="retry-weather" style="margin-top:10px">Повторить</button>' : ""}</div>`}</div>`;
  }
  const year = month.getFullYear(),
    m = month.getMonth(),
    count = new Date(year, m + 1, 0).getDate(),
    start = (new Date(year, m, 1).getDay() + 6) % 7;
  return `<div class="widget-content"><div class="calendar-nav"><button id="prev-month" aria-label="Предыдущий месяц">‹</button><span>${esc(month.toLocaleDateString("ru-RU", { month: "long", year: "numeric" }))}</span><button id="next-month" aria-label="Следующий месяц">›</button></div><div class="weekdays">${["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "ВС"].map((d) => `<span>${d}</span>`).join("")}</div><div class="days">${"<span></span>".repeat(start)}${Array.from(
    { length: count },
    (_, i) => {
      const key = dateKey(new Date(year, m, i + 1));
      const marker = w.eventMarkers?.[key] || {};
      const visibleMarker = w.events[key] && !calendarMarkerExpired(w, key);
      return `<button data-date="${key}" class="day ${key === dateKey(new Date()) ? "today" : ""} ${key === selectedDate ? "selected" : ""} ${visibleMarker ? "has-event marker-" + (marker.style || "dot") : ""}" style="--marker:${esc(marker.color || w.accent)}" aria-label="${key}${w.events[key] ? ", есть заметка" : ""}">${i + 1}</button>`;
    },
  ).join(
    "",
  )}</div><div class="calendar-note"><label for="event">${esc(new Date(selectedDate + "T12:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "long" }))} · заметка</label><textarea id="event" placeholder="Что запланируем?">${esc(w.events[selectedDate] || "")}</textarea></div></div>`;
}
function renderWidget() {
  const w = state.widgets.find((w) => w.id === id);
  if (!w || widgetGesture) return;
  document.body.classList.add("widget-body");
  const active = document.activeElement,
    focusId = active?.id,
    selection = active?.selectionStart,
    selectionEnd = active?.selectionEnd,
    scroll = active?.scrollTop,
    typing =
      active?.tagName === "TEXTAREA" || active?.id === "note-title"
        ? active.value
        : null;
  root.innerHTML = `<article class="widget widget-type-${w.type} widget-style-${w.style || "card"} ${w.showTitle === false ? "no-title" : ""} ${w.showBackground === false ? "no-background" : ""} ${w.locked ? "is-locked" : ""} ${w.autoTextContrast !== false ? "auto-text" : "manual-text"}" style="opacity:${(w.widgetOpacity ?? 100) / 100};--bg:${w.background}${Math.round(
    w.opacity * 2.55,
  )
    .toString(16)
    .padStart(
      2,
      "0",
    )};--fg:${w.foreground};--accent:${w.accent};--accent-text:${w.accentText};--on-accent:${w.accentForeground};--radius:${w.radius}px;--font-size:${w.fontSize}px"><header class="widget-header" id="drag"><span class="widget-title">${esc(w.title || (w.type === "weather" ? w.city : names[w.type]))}${w.locked ? " · ⌁" : ""}</span></header><div class="widget-drag-strip" aria-hidden="true"></div><button class="widget-menu" id="widget-edit" aria-label="Настройки виджета" title="Настройки"><span class="gear-icon" aria-hidden="true"></span></button>${!w.locked ? '<button id="resize-grip" class="resize-grip" aria-label="Изменить размер виджета" title="Потяните для изменения размера. Стрелки — 5 px, Shift + стрелки — 20 px"></button>' : ""}${state.update.required ? '<div class="widget-update">Доступна новая версия<br><button id="widget-open-update">Обновить My Widget</button></div>' : widgetContent(w)}</article>`;
  bind("#widget-edit", () => api.edit(id));
  bind("#widget-open-update", () => api.edit(id));
  bind("#widget-photo", () => api.photo(id));
  bind("#retry-weather", () => fetchWeather(w, true));
  mountWidgetInteractions(w);
  bindNotes(w);
  const event = document.querySelector("#event");
  if (event)
    event.oninput = (e) =>
      !e.isComposing &&
      act(() =>
        api.patch(id, { event: { date: selectedDate, text: event.value } }),
      );
  if (event)
    event.addEventListener("compositionend", () =>
      event.oninput({ isComposing: false }),
    );
  if (event)
    event.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        event.blur();
      }
    });
  bind("#prev-month", () => {
    month = new Date(month.getFullYear(), month.getMonth() - 1, 1);
    selectedDate = dateKey(month);
    renderWidget();
  });
  bind("#next-month", () => {
    month = new Date(month.getFullYear(), month.getMonth() + 1, 1);
    selectedDate = dateKey(month);
    renderWidget();
  });
  root.querySelectorAll("[data-date]").forEach(
    (b) =>
      (b.onclick = () =>
        act(async () => {
          selectedDate = b.dataset.date;
          renderWidget();
          await api.focusInput();
          document.querySelector("#event")?.focus();
        })),
  );
  const replacement = focusId && document.getElementById(focusId);
  if (
    replacement &&
    ["TEXTAREA", "INPUT"].includes(replacement.tagName) &&
    (w.type !== "note" || renderedNoteId === w.activeNoteId) &&
    (w.type !== "calendar" || renderedCalendarDate === selectedDate)
  ) {
    if (typing !== null) replacement.value = typing;
    replacement.focus();
    if (typeof selection === "number")
      replacement.setSelectionRange(selection, selectionEnd);
    replacement.scrollTop = scroll;
  }
  renderedNoteId = w.activeNoteId;
  renderedCalendarDate = selectedDate;
  if (w.type === "clock") tick();
  if (w.type === "weather" && !state.update.required) fetchWeather(w);
}
function tick() {
  const w = state?.widgets.find((w) => w.id === id),
    time = document.querySelector("#time");
  if (!time || !w) return;
  const d = new Date();
  for (const [key, angle] of [
    ["hour", (d.getHours() % 12) * 30 + d.getMinutes() / 2],
    ["minute", d.getMinutes() * 6 + d.getSeconds() / 10],
    ["second", d.getSeconds() * 6],
  ]) {
    const hand = document.querySelector("#" + key + "-hand");
    if (hand) {
      hand.setAttribute("transform", "rotate(" + angle + " 100 100)");
      if (key === "second") hand.style.display = w.seconds ? "" : "none";
    }
  }
  time.textContent = d.toLocaleTimeString(w.hour12 ? "en-US" : "ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    ...(w.seconds ? { second: "2-digit" } : {}),
    hour12: w.hour12,
  });
  time.style.fontSize = w.hour12 ? "2.35em" : w.seconds ? "2.65em" : "3.2em";
  document.querySelector("#date").textContent = d.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
  });
  document.querySelector("#weekday").textContent = d.toLocaleDateString(
    "ru-RU",
    { weekday: "long", year: "numeric" },
  );
}
api.onPointer((over) => {
  if (id) over ? beginHover() : leaveHover();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Tab") root.classList.add("keyboard-navigation");
});
api.onState((s) => {
  const previous = state;
  state = s;
  applyAppPalette();
  const sliding = document.activeElement?.matches("[data-range]");
  if (id) {
    const before = previous?.widgets.find((w) => w.id === id),
      after = s.widgets.find((w) => w.id === id);
    if (before && after && previous?.update.required === s.update.required) {
      if (JSON.stringify(before) === JSON.stringify(after)) return;
      const editor = document.activeElement;
      if (
        editor?.matches("#note,#note-title,#event") &&
        before.activeNoteId === after.activeNoteId
      ) {
        const layout = (w) => {
          const { text, notes, events, ...rest } = w;
          return { ...rest, eventMarkers: w.eventMarkers || {} };
        };
        if (JSON.stringify(layout(before)) === JSON.stringify(layout(after))) {
          // Keep the live editor: replacing it loses native focus, IME, undo and selection.
          if (after.type === "calendar")
            root.querySelectorAll("[data-date]").forEach((b) => {
              b.classList.toggle(
                "has-event",
                !!after.events[b.dataset.date] &&
                  !calendarMarkerExpired(after, b.dataset.date),
              );
              if (
                after.events[b.dataset.date] &&
                ![...b.classList].some((c) => c.startsWith("marker-"))
              )
                b.classList.add("marker-dot");
            });
          return;
        }
      }
    }
    renderWidget();
  } else if (
    (!editing && !sliding) ||
    previous?.update.status !== s.update.status ||
    s.update.required
  ) {
    renderManager();
  } else {
    const w = state.widgets.find((w) => w.id === editing),
      preview = document.querySelector("#editor-preview");
    if (w && preview) {
      preview.style.background = w.background;
      preview.style.color = w.foreground;
      preview.style.borderRadius = w.radius + "px";
      preview.firstElementChild.textContent = w.title || names[w.type];
      preview.lastElementChild.style.color = w.accentText;
      root.querySelectorAll("[data-prop]").forEach((el) => {
        if (
          ["background", "foreground", "accent"].includes(el.dataset.prop) &&
          el !== document.activeElement
        )
          el.value = w[el.dataset.prop];
      });
      root.querySelectorAll('[data-theme-scope="widget"]').forEach((el) => {
        const chosen = el.dataset.theme === w.theme;
        el.classList.toggle("chosen", chosen);
        el.setAttribute("aria-pressed", String(chosen));
      });
    }
  }
});
api.onEdit((widgetId) => {
  editing = widgetId;
  view = "mine";
  if (state) renderManager();
});
api.state().then((s) => {
  state = s;
  id ? renderWidget() : renderManager();
  if (s.recovered && !id)
    toast("Настройки восстановлены. Проверьте свои виджеты.");
});
setInterval(tick, 1000);
if (id)
  setInterval(() => {
    const w = state?.widgets.find((w) => w.id === id);
    if (w?.type === "weather") fetchWeather(w, true);
  }, 600000);
