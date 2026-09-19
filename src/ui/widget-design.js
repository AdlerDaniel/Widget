let widgetHoverTimer = null,
  widgetHovered = false,
  widgetControlsVisible = false,
  widgetGesture = null;
function widgetDesignPanel(w) {
  return `<section class="settings-panel"><div class="eyebrow">ФОРМА И ХАРАКТЕР</div><h2>Стиль виджета</h2><div class="widget-style-grid">${state.widgetStyles[w.type].map((s) => `<button class="widget-style-choice ${(w.style || "card") === s.id ? "chosen" : ""}" data-widget-style="${s.id}" aria-pressed="${(w.style || "card") === s.id}"><span class="style-mini style-mini-${s.id}" aria-hidden="true"><i></i><b></b></span><strong>${esc(s.name)}</strong><span>${esc(s.description)}</span></button>`).join("")}</div><label class="check"><input type="checkbox" data-prop="showTitle" ${w.showTitle !== false ? "checked" : ""}>Показывать заголовок виджета</label><label class="check"><input type="checkbox" data-prop="showBackground" ${w.showBackground !== false ? "checked" : ""}>Показывать фон и рамку</label></section>`;
}
function bindWidgetDesign() {
  root.querySelectorAll("[data-widget-style]").forEach(
    (b) =>
      (b.onclick = () =>
        act(async () => {
          await api.patch(editing, { style: b.dataset.widgetStyle });
          state = await api.state();
          renderManager();
        })),
  );
}
function revealControls() {
  root.classList.toggle("controls-visible", widgetControlsVisible);
}
function beginHover() {
  if (widgetHovered) return;
  widgetHovered = true;
  root.classList.add("widget-hovered");
  clearTimeout(widgetHoverTimer);
  widgetHoverTimer = setTimeout(() => {
    if (widgetHovered) {
      widgetControlsVisible = true;
      revealControls();
    }
  }, 2000);
}
function leaveHover() {
  widgetHovered = false;
  clearTimeout(widgetHoverTimer);
  widgetHoverTimer = null;
  widgetControlsVisible = false;
  root.classList.remove("widget-hovered");
  revealControls();
}
async function endWidgetGesture() {
  if (!widgetGesture) return;
  widgetGesture = null;
  root.classList.remove("widget-gesturing");
  await act(() => api.dragEnd());
  if (!widgetHovered) {
    widgetControlsVisible = false;
    root.classList.remove("widget-hovered");
    revealControls();
  }
  renderWidget();
}
function mountWidgetInteractions(w) {
  root.onpointerdown = (e) => {
    root.classList.remove("keyboard-navigation");
    if (
      e.button === 0 &&
      e.target.closest("textarea,input,select") &&
      !state.update.required
    ) {
      act(() => api.focusInput());
      return;
    }
    if (e.button !== 0 || w.locked || state.update.required) return;
    const resizing = !!e.target.closest("#resize-grip");
    if (
      !resizing &&
      e.target.closest("button,textarea,input,select,a,.planner-interactive")
    )
      return;
    e.preventDefault();
    root.setPointerCapture(e.pointerId);
    widgetGesture = resizing ? "resize" : "move";
    root.classList.add("widget-gesturing");
    act(() => (resizing ? api.resizeStart(id) : api.dragStart(id)));
  };
  root.onpointerup = (e) => {
    if (root.hasPointerCapture(e.pointerId))
      root.releasePointerCapture(e.pointerId);
    endWidgetGesture();
  };
  root.onpointercancel = root.onlostpointercapture = () => endWidgetGesture();
  // A desktop-parented window can lose focus as soon as Windows activates
  // Explorer. Pointer release and the native mouse-button check finish the
  // gesture; blur must not cancel a drag that has just started.
  const grip = document.querySelector("#resize-grip");
  if (grip)
    grip.onkeydown = (e) => {
      const step = e.shiftKey ? 20 : 5;
      const delta = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      }[e.key];
      if (delta) {
        e.preventDefault();
        act(() => api.resizeStep(id, ...delta));
      }
    };
}
function weatherArt(code) {
  const cloud = code > 0,
    wet = (code >= 51 && code <= 67) || (code >= 80 && code <= 82),
    snow = (code >= 71 && code <= 77) || (code >= 85 && code <= 86),
    storm = code >= 95;
  return `<svg class="weather-art" viewBox="0 0 160 120" aria-hidden="true"><g fill="none" stroke-linecap="round">${code <= 3 ? '<circle cx="67" cy="48" r="25" fill="#ffd179"/><path d="M67 7v-3M67 89v3M26 48h-4M108 48h4M38 19l-3-3M96 77l3 3M38 77l-3 3M96 19l3-3" stroke="#ffd179" stroke-width="5"/>' : ""}${cloud ? '<path d="M43 85C15 85 18 48 44 48C47 15 99 14 106 48C139 35 155 83 126 85Z" fill="#d9ebfa"/>' : ""}${wet ? '<path d="M53 96l-7 12M80 96l-7 12M107 96l-7 12" stroke="#77c5ff" stroke-width="6"/>' : ""}${snow ? '<path d="M50 97v16m-8-8h16M90 97v16m-8-8h16M126 97v16m-8-8h16" stroke="#e3f6ff" stroke-width="3"/>' : ""}${storm ? '<path d="M88 71L65 100h16l-8 18 33-32H89l13-15Z" fill="#ffcf58"/>' : ""}${code >= 45 && code <= 48 ? '<path d="M30 99h98M44 111h66" stroke="#c1d1de" stroke-width="5"/>' : ""}</g></svg>`;
}
function clockDial() {
  return `<svg class="clock-dial" viewBox="0 0 200 200" aria-label="Аналоговые часы"><circle class="dial-ring" cx="100" cy="100" r="91"/>${Array.from({ length: 12 }, (_, i) => `<line class="dial-mark" x1="100" y1="18" x2="100" y2="${i % 3 === 0 ? 30 : 24}" transform="rotate(${i * 30} 100 100)"/>`).join("")}<line id="hour-hand" class="dial-hour" x1="100" y1="105" x2="100" y2="56"/><line id="minute-hand" class="dial-minute" x1="100" y1="108" x2="100" y2="34"/><line id="second-hand" class="dial-second" x1="100" y1="116" x2="100" y2="27"/><circle cx="100" cy="100" r="5" fill="var(--accent)"/></svg>`;
}
