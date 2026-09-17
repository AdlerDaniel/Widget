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
function resizeBounds(w, dx, dy) {
  const { minSize, maxSize } = WIDGET_META[w.type];
  return {
    width: Math.round(Math.max(minSize[0], Math.min(maxSize[0], w.width + dx))),
    height: Math.round(
      Math.max(minSize[1], Math.min(maxSize[1], w.height + dy)),
    ),
  };
}
module.exports = { styles, validStyle, styleDefaults, resizeBounds };
