"use strict";

const maxSize = Object.freeze([900, 1000]);
const WIDGET_META = Object.freeze({
  weather: Object.freeze({
    defaultSize: Object.freeze([300, 235]),
    minSize: Object.freeze([240, 220]),
    maxSize,
  }),
  clock: Object.freeze({
    defaultSize: Object.freeze([320, 230]),
    minSize: Object.freeze([240, 180]),
    maxSize,
  }),
  note: Object.freeze({
    defaultSize: Object.freeze([300, 300]),
    minSize: Object.freeze([240, 180]),
    maxSize,
  }),
  photo: Object.freeze({
    defaultSize: Object.freeze([300, 340]),
    minSize: Object.freeze([240, 180]),
    maxSize,
  }),
  calendar: Object.freeze({
    defaultSize: Object.freeze([350, 440]),
    minSize: Object.freeze([300, 400]),
    maxSize,
  }),
  quote: Object.freeze({
    defaultSize: Object.freeze([340, 250]),
    minSize: Object.freeze([260, 190]),
    maxSize,
  }),
});

module.exports = { WIDGET_META };
