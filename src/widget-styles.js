const { WIDGET_META } = require("./widget-meta");

const common = [
  {
    id: "card",
    name: "Карточка",
    description: "Привычное окно с цветным фоном",
  },
  {
    id: "bare",
    name: "Без фона",
    description: "Цветные элементы прямо на рабочем столе",
  },
  {
    id: "glass",
    name: "Полупрозрачный",
    description: "Лёгкая панель с мягким градиентом",
  },
];
const extra = {
  photo: [
    {
      id: "photo-edge",
      name: "Только фото",
      description: "Изображение от края до края, без рамки",
    },
    { id: "photo-round", name: "Круг", description: "Круглый кадр без фона" },
    {
      id: "photo-print",
      name: "Фотокарточка",
      description: "Бумажная рамка с широким нижним полем",
    },
  ],
  weather: [
    {
      id: "weather-sky",
      name: "Атмосфера",
      description: "Небо и иллюстрация текущей погоды",
    },
    {
      id: "weather-orbit",
      name: "Орбита",
      description: "Температура в центре цветного кольца",
    },
    {
      id: "weather-compact",
      name: "Лаконично",
      description: "Крупная температура и значок без панели",
    },
  ],
  clock: [
    {
      id: "clock-digital",
      name: "Цифровой",
      description: "Крупные цветные цифры без панели",
    },
    {
      id: "clock-dial",
      name: "Циферблат",
      description: "Стрелки, часовые отметки и дата",
    },
  ],
  note: [
    {
      id: "note-paper",
      name: "Блокнот",
      description: "Лист с линейками и полем для записей",
    },
    {
      id: "note-sticky",
      name: "Стикер",
      description: "Цветная записка с загнутым уголком",
    },
  ],
  calendar: [
    {
      id: "calendar-planner",
      name: "Планер",
      description: "Выделенный месяц и заметка дня",
    },
  ],
  quote: [
    {
      id: "quote-landscape",
      name: "Пейзаж",
      description: "Большая цитата и мягкий силуэт пейзажа",
    },
  ],
  "day-planner": [
    {
      id: "day-planner",
      name: "Ежедневник",
      description: "Спокойный список и тонкая временная шкала",
    },
  ],
};
const styles = Object.fromEntries(
  Object.keys(extra).map((type) => [type, [...common, ...extra[type]]]),
);
function validStyle(type, style) {
  return styles[type]?.some((s) => s.id === style) || false;
}
function styleDefaults(style) {
  return {
    showBackground: ![
      "bare",
      "photo-edge",
      "photo-round",
      "clock-digital",
      "weather-compact",
    ].includes(style),
    showTitle: ![
      "photo-edge",
      "photo-round",
      "photo-print",
      "clock-digital",
      "clock-dial",
      "weather-orbit",
      "weather-compact",
      "quote-landscape",
    ].includes(style),
  };
}
function photoInsets(w) {
  if (["photo-edge", "photo-round"].includes(w.style)) return [0, 0];
  if (w.style === "photo-print")
    return w.showBackground === false ? [0, 0] : [26, 54];
  if (w.showTitle === false && w.showBackground === false) return [0, 0];
  const border = w.showBackground === false ? 0 : 2;
  return [36 + border, 36 + border + (w.showTitle === false ? 0 : 37)];
}
function resizeBounds(w, dx, dy) {
  const { minSize, maxSize } = WIDGET_META[w.type];
  if (
    w.type === "photo" &&
    w.fit === "contain" &&
    w.style !== "photo-round" &&
    Number.isFinite(w.photoAspect) &&
    w.photoAspect >= 0.24 &&
    w.photoAspect <= 5
  ) {
    const [horizontal, vertical] = photoInsets(w);
    const contentWidth = Math.max(1, w.width - horizontal);
    const contentHeight = Math.max(1, w.height - vertical);
    const useWidth =
      Math.abs(dx / contentWidth) >= Math.abs(dy / contentHeight);
    const requestedWidth = useWidth
      ? contentWidth + dx
      : (contentHeight + dy) * w.photoAspect;
    const minWidth = Math.max(
      1,
      minSize[0] - horizontal,
      (minSize[1] - vertical) * w.photoAspect,
    );
    const maxWidth = Math.min(
      maxSize[0] - horizontal,
      (maxSize[1] - vertical) * w.photoAspect,
    );
    const width = Math.max(minWidth, Math.min(maxWidth, requestedWidth));
    return {
      width: Math.round(width + horizontal),
      height: Math.round(width / w.photoAspect + vertical),
    };
  }
  return {
    width: Math.round(Math.max(minSize[0], Math.min(maxSize[0], w.width + dx))),
    height: Math.round(
      Math.max(minSize[1], Math.min(maxSize[1], w.height + dy)),
    ),
  };
}
module.exports = { styles, validStyle, styleDefaults, resizeBounds };
