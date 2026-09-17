const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const Store = require("../src/store");

test("text edits coalesce disk writes and flush immediately when requested", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "widget-store-"));
  try {
    const store = new Store(dir);
    const save = store.save.bind(store);
    let writes = 0;
    store.save = () => {
      writes++;
      save();
    };
    store.data.widgets.push({ id: "note", text: "first" });
    store.scheduleSave(40);
    store.data.widgets[0].text = "second";
    store.scheduleSave(40);
    await new Promise((resolve) => setTimeout(resolve, 90));
    assert.equal(writes, 1);
    assert.equal(store.read(store.file).widgets[0].text, "second");
    store.data.widgets[0].text = "final";
    store.scheduleSave(200);
    store.flushPending();
    assert.equal(writes, 2);
    assert.equal(store.read(store.file).widgets[0].text, "final");
    await new Promise((resolve) => setTimeout(resolve, 230));
    assert.equal(writes, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
