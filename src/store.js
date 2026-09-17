const fs = require("node:fs");
const path = require("node:path");
class Store {
  constructor(directory) {
    this.directory = directory;
    fs.mkdirSync(directory, { recursive: true });
    this.file = path.join(directory, "settings.json");
    this.data = { schema: 1, autostart: true, widgets: [] };
    this.recovered = false;
    if (fs.existsSync(this.file)) {
      try {
        this.data = this.read(this.file);
      } catch {
        this.recovered = true;
        try {
          this.data = this.read(this.file + ".bak");
        } catch {
          fs.copyFileSync(this.file, this.file + ".damaged-" + Date.now());
        }
      }
    }
  }
  read(file) {
    const v = JSON.parse(fs.readFileSync(file, "utf8"));
    if (v.schema !== 1 || !Array.isArray(v.widgets))
      throw Error("Invalid settings");
    return v;
  }
  save() {
    clearTimeout(this.pendingSave);
    this.pendingSave = null;
    const tmp = this.file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    if (fs.existsSync(this.file)) {
      try {
        this.read(this.file);
        fs.copyFileSync(this.file, this.file + ".bak");
      } catch {}
    }
    fs.renameSync(tmp, this.file);
  }
  scheduleSave(delay = 350, onError = () => {}, retries = 2) {
    clearTimeout(this.pendingSave);
    this.pendingSave = setTimeout(() => {
      this.pendingSave = null;
      try {
        this.save();
      } catch (error) {
        if (retries > 0) this.scheduleSave(1000, onError, retries - 1);
        else onError(error);
      }
    }, delay);
  }
  flushPending() {
    if (this.pendingSave) this.save();
  }
}
module.exports = Store;
