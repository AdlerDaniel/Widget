// Run after editing changes.json: npm run release -- 1.0.1
const fs = require("node:fs"),
  { spawnSync } = require("node:child_process");
const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version || ""))
  throw Error("Укажите версию: npm run release -- 1.0.1");
function run(exe, args) {
  const r = spawnSync(exe, args, {
    stdio: "inherit",
    shell: false,
    windowsHide: true,
  });
  if (r.status !== 0) throw Error("Команда завершилась с ошибкой: " + exe);
}
const p = require("../package.json");
const cmp = (a, b) => {
  const x = a.split(".").map(Number),
    y = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
};
if (cmp(version, p.version) <= 0)
  throw Error("Новая версия должна быть выше текущей");
const dirty = spawnSync("git", ["status", "--porcelain"], {
  encoding: "utf8",
  windowsHide: true,
});
if (dirty.status !== 0 || dirty.stdout.trim())
  throw Error("Сначала сохраните изменения в git");
p.version = version;
fs.writeFileSync("package.json", JSON.stringify(p, null, 2) + "\n");
const npm = process.env.npm_execpath;
if (!npm) throw Error("Запускайте через npm run release -- НОМЕР_ВЕРСИИ");
run(process.execPath, [npm, "install", "--package-lock-only"]);
run(process.execPath, [npm, "test"]);
run(process.execPath, [npm, "run", "smoke:planner"]);
run(process.execPath, [npm, "run", "smoke"]);
run(process.execPath, [npm, "run", "dist"]);
run("git", ["add", "package.json", "package-lock.json", "changes.json"]);
run("git", ["commit", "-m", "v" + version]);
run("git", ["push"]);
run(process.execPath, ["scripts/publish.cjs"]);
