const fs = require("node:fs"),
  path = require("node:path"),
  { spawn } = require("node:child_process");
const root = path.resolve(__dirname, ".."),
  version = require("../package.json").version,
  report = path.join(root, "test-output/install.json"),
  installDir = path.join(root, "test-output/installed");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function run(exe, args, extra = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(exe, args, {
      windowsHide: true,
      stdio: "ignore",
      ...extra,
    });
    p.on("error", reject);
    p.on("exit", (code) =>
      code === 0 ? resolve() : reject(Error(exe + " exited " + code)),
    );
  });
}
async function connect() {
  for (let n = 0; n < 50; n++) {
    try {
      const pages = await (await fetch("http://127.0.0.1:19331/json")).json();
      const page = pages.find(
        (p) => p.type === "page" && !p.url.includes("widget="),
      );
      if (page) {
        const ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((r, j) => {
          ws.onopen = r;
          ws.onerror = j;
        });
        let id = 0;
        const pending = new Map();
        ws.onmessage = (e) => {
          const m = JSON.parse(e.data);
          if (m.id) {
            const p = pending.get(m.id);
            pending.delete(m.id);
            m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result);
          }
        };
        return {
          ws,
          eval: async (expression) => {
            const result = await new Promise((resolve, reject) => {
              const seq = ++id;
              pending.set(seq, { resolve, reject });
              ws.send(
                JSON.stringify({
                  id: seq,
                  method: "Runtime.evaluate",
                  params: {
                    expression,
                    awaitPromise: true,
                    returnByValue: true,
                  },
                }),
              );
            });
            if (result.exceptionDetails)
              throw Error(JSON.stringify(result.exceptionDetails));
            return result.result.value;
          },
        };
      }
    } catch {}
    await wait(300);
  }
  throw Error("Application did not start");
}
(async () => {
  const checks = [];
  await run(path.join(root, `dist/Widget-Setup-${version}.exe`), [
    "/S",
    "/D=" + installDir,
  ]);
  checks.push({
    name: "installer exit and executable",
    ok: fs.existsSync(path.join(installDir, "Widget.exe")),
  });
  const child = spawn(
    path.join(installDir, "Widget.exe"),
    ["--remote-debugging-port=19331"],
    {
      windowsHide: true,
      stdio: "ignore",
      env: {
        ...process.env,
        WIDGET_TEST_PROFILE: path.join(root, "test-output/installed-profile"),
      },
    },
  );
  let client;
  try {
    client = await connect();
    await wait(2000);
    const initial = await client.eval("window.widgetAPI.state()");
    checks.push({ name: "installed version", ok: initial.version === version });
    checks.push({
      name: "installed catalog",
      ok: await client.eval(
        'document.querySelectorAll("[data-add]").length===5',
      ),
    });
    const id = await client.eval('window.widgetAPI.add("note")');
    await client.eval(
      `window.widgetAPI.patch('${id}',{text:'Проверка установленного приложения',background:'#31483b'})`,
    );
    const saved = await client.eval("window.widgetAPI.state()");
    checks.push({
      name: "installed IPC and native widget",
      ok: saved.widgets.some(
        (w) => w.id === id && w.text === "Проверка установленного приложения",
      ),
    });
    checks.push({ name: "update connection", status: saved.update.status });
    fs.writeFileSync(report, JSON.stringify({ checks }, null, 2));
    console.log(JSON.stringify(checks, null, 2));
    await Promise.race([
      client.eval("window.widgetAPI.quit()").catch(() => {}),
      wait(1500),
    ]);
    client.ws.close();
    await wait(1000);
  } finally {
    client?.ws.close();
    if (child.exitCode === null) child.kill();
  }
  if (checks.some((c) => c.ok === false)) process.exitCode = 1;
})().catch((e) => {
  fs.writeFileSync(report, JSON.stringify({ error: String(e.stack) }, null, 2));
  console.error(e);
  process.exitCode = 1;
});
