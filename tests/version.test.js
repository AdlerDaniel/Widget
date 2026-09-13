const { test } = require("node:test");
const assert = require("node:assert/strict");
const { newer } = require("../src/version");
test("a completed upgrade clears the old mandatory update gate even offline", () => {
  assert.equal(newer("1.2.0", "1.2.0"), false);
  assert.equal(newer("1.1.0", "1.2.0"), false);
  assert.equal(newer("1.3.0", "1.2.0"), true);
  assert.equal(newer("1.10.0", "1.2.0"), true);
  assert.equal(newer(undefined, "1.2.0"), false);
});
