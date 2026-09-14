const { test } = require("node:test");
const assert = require("node:assert/strict");
const { QUOTES, quoteForDate } = require("../src/quotes");

test("the same date always returns the same local quote", () => {
  assert.equal(quoteForDate("2026-09-14"), quoteForDate("2026-09-14"));
});

test("neighboring dates return different quotes", () => {
  assert.notEqual(quoteForDate("2026-09-14"), quoteForDate("2026-09-15"));
});

test("daily result belongs to the immutable quote collection", () => {
  assert.ok(QUOTES.includes(quoteForDate("2026-01-01")));
  assert.ok(Object.isFrozen(QUOTES));
});

test("quote collection is substantial and contains only concise phrases", () => {
  assert.ok(QUOTES.length >= 150);
  assert.ok(QUOTES.every((quote) => typeof quote === "string" && quote.trim()));
  assert.ok(QUOTES.every((quote) => quote.length <= 110));
});

test("invalid date keys are rejected", () => {
  for (const value of [undefined, null, "", "14-09-2026", "2026-2-03"])
    assert.throws(() => quoteForDate(value), TypeError);
  for (const value of ["2026-02-29", "2026-13-01", "2026-04-31"])
    assert.throws(() => quoteForDate(value), RangeError);
});
