const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  removeWidgetPhoto,
  cleanupOrphanPhotos,
} = require("../src/photo-files");

test("removing a photo widget deletes only its owned image", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "widget-photos-"));
  const dir = path.join(root, "photos");
  const id = "11111111-1111-4111-8111-111111111111";
  try {
    fs.mkdirSync(dir);
    const original = path.join(root, "original.png");
    fs.writeFileSync(original, "original");
    fs.writeFileSync(path.join(dir, id + ".png"), "photo");
    fs.writeFileSync(path.join(dir, "keep.txt"), "unrelated");
    assert.equal(
      removeWidgetPhoto(dir, { type: "photo", id, photo: original }),
      true,
    );
    assert.equal(fs.existsSync(path.join(dir, id + ".png")), false);
    assert.equal(fs.existsSync(original), true);
    assert.equal(fs.existsSync(path.join(dir, "keep.txt")), true);
    assert.equal(removeWidgetPhoto(dir, { type: "photo", id }), false);
    assert.equal(
      removeWidgetPhoto(dir, { type: "photo", id: "..\\keep" }),
      false,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("startup cleanup removes only orphaned UUID-named photos", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "widget-photos-"));
  const live = "22222222-2222-4222-8222-222222222222";
  const orphan = "33333333-3333-4333-8333-333333333333";
  try {
    for (const name of [live + ".png", orphan + ".png", "other.png"])
      fs.writeFileSync(path.join(dir, name), name);
    assert.deepEqual(cleanupOrphanPhotos(dir, [{ type: "photo", id: live }]), [
      orphan + ".png",
    ]);
    assert.equal(fs.existsSync(path.join(dir, live + ".png")), true);
    assert.equal(fs.existsSync(path.join(dir, "other.png")), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
