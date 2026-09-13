const fs = require("node:fs"),
  path = require("node:path"),
  { spawn } = require("node:child_process");
const root = path.resolve(__dirname, ".."),
  version = require("../package.json").version,
  wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function connect() {
  for (let i = 0; i < 80; i++) {
    try {
      const targets = await (await fetch("http://127.0.0.1:19334/json")).json();
      const page = targets.find(
        (p) => p.type === "page" && !p.url.includes("widget="),
      );
      if (page) {
        const ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((r, j) => {
          ws.onopen = r;
          ws.onerror = j;
        });
        let seq = 0;
        const requests = new Map();
        ws.onmessage = (e) => {
          const m = JSON.parse(e.data);
          if (requests.has(m.id)) {
            const p = requests.get(m.id);
            requests.delete(m.id);
            m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result);
          }
        };
        const send = (method, params) =>
          new Promise((resolve, reject) => {
            const id = ++seq;
            requests.set(id, { resolve, reject });
            ws.send(JSON.stringify({ id, method, params }));
          });
        return {
          ws,
          send,
          eval: async (expression) => {
            const r = await send("Runtime.evaluate", {
              expression,
              awaitPromise: true,
              returnByValue: true,
            });
            if (r.exceptionDetails)
              throw Error(JSON.stringify(r.exceptionDetails));
            return r.result.value;
          },
        };
      }
    } catch {}
    await wait(250);
  }
  throw Error("No test UI");
}
async function until(client, statuses, timeout = 120000) {
  const start = Date.now();
  let previous;
  while (Date.now() - start < timeout) {
    const s = await client.eval(
      "window.widgetAPI ? window.widgetAPI.state() : null",
    );
    if (!s) {
      await wait(250);
      continue;
    }
    if (s.update.status !== previous) {
      console.log("Update status: " + s.update.status);
      previous = s.update.status;
    }
    if (statuses.includes(s.update.status)) return s;
    if (s.update.status === "error") throw Error(s.update.message);
    await wait(500);
  }
  throw Error("Update timeout");
}
async function session(exe, profile, action) {
  const child = spawn(exe, ["--remote-debugging-port=19334"], {
    windowsHide: true,
    stdio: "ignore",
    env: { ...process.env, WIDGET_TEST_PROFILE: profile },
  });
  let client;
  try {
    client = await connect();
    await action(client);
  } finally {
    if (client) {
      await Promise.race([
        client.eval("window.widgetAPI.quit()").catch(() => {}),
        wait(1500),
      ]);
      client.ws.close();
    }
    await wait(700);
    if (child.exitCode === null) child.kill();
  }
}
(async () => {
  const checks = [];
  await session(
    path.join(root, "test-output/legacy-110/Widget.exe"),
    path.join(root, "test-output/live-legacy-" + Date.now()),
    async (client) => {
      const available = await until(client, ["available"]);
      checks.push({
        name: "v1.1 discovers public release without account credentials",
        ok:
          available.version === "1.1.0" &&
          available.update.version === version &&
          available.update.required,
      });
      checks.push({
        name: "release notes supplied by published manifest",
        ok: require("../changes.json").every((note) =>
          available.update.notes.includes(note),
        ),
      });
      checks.push({
        name: "mandatory update enforced",
        ok: await client.eval(
          `window.widgetAPI.add('note').then(()=>false,()=>true)`,
        ),
      });
      await client.eval(`document.querySelector('#download-update').click()`);
      const downloaded = await until(client, ["downloaded"], 300000);
      checks.push({
        name: "real GitHub installer downloaded and verified by updater",
        ok: downloaded.update.required && downloaded.update.version === version,
      });
      const png = await client.send("Page.captureScreenshot", {
        format: "png",
      });
      fs.writeFileSync(
        path.join(root, "test-output/live-update.png"),
        Buffer.from(png.data, "base64"),
      );
    },
  );
  await session(
    path.join(root, "dist/win-unpacked/Widget.exe"),
    path.join(root, "test-output/live-current-" + Date.now()),
    async (client) => {
      const s = await until(client, ["current"]);
      checks.push({
        name: "My Widget recognizes its current published version",
        ok:
          s.version === version &&
          !s.update.required &&
          (await client.eval(`document.title==='My Widget'`)),
      });
    },
  );
  fs.writeFileSync(
    path.join(root, "test-output/live-update.json"),
    JSON.stringify({ checks }, null, 2),
  );
  console.log(JSON.stringify(checks, null, 2));
  if (checks.some((c) => !c.ok)) process.exitCode = 1;
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
