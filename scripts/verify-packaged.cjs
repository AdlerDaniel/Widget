// Runs a packaged app in an isolated profile without installing over the user's app.
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  { spawn } = require("node:child_process");
const root = path.resolve(__dirname, ".."),
  version = require("../package.json").version,
  profile = path.join(root, "test-output", "migration-" + Date.now());
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function connect() {
  for (let n = 0; n < 60; n++) {
    try {
      const pages = await (await fetch("http://127.0.0.1:19332/json")).json();
      const page = pages.find(
        (p) => p.type === "page" && !p.url.includes("widget="),
      );
      if (page) {
        const ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((r, j) => {
          ws.onopen = r;
          ws.onerror = j;
        });
        let seq = 0;
        const pending = new Map();
        ws.onmessage = (e) => {
          const m = JSON.parse(e.data);
          if (m.id && pending.has(m.id)) {
            const p = pending.get(m.id);
            pending.delete(m.id);
            m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result);
          }
        };
        return {
          ws,
          eval: async (expression) => {
            const id = ++seq;
            const r = await new Promise((resolve, reject) => {
              pending.set(id, { resolve, reject });
              ws.send(
                JSON.stringify({
                  id,
                  method: "Runtime.evaluate",
                  params: {
                    expression,
                    awaitPromise: true,
                    returnByValue: true,
                  },
                }),
              );
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
  throw Error("No packaged UI");
}
(async () => {
  fs.mkdirSync(profile, { recursive: true });
  const { createWidget } = require("../src/model");
  const fixtures = ["note", "calendar", "photo"].map((t, i) => {
    const w = createWidget(t, i);
    delete w.theme;
    delete w.widgetOpacity;
    delete w.notes;
    delete w.activeNoteId;
    return {
      ...w,
      background: "#453322",
      opacity: 77,
      text: t === "note" ? "Старая заметка v1.0.0" : "",
      events: t === "calendar" ? { "2026-10-01": "Сохранить запись" } : {},
    };
  });
  const photo = path.join(profile, "photo.png");
  fs.copyFileSync(path.join(root, "assets/icon.png"), photo);
  fixtures[2].photo = require("node:url").pathToFileURL(photo).href;
  fs.writeFileSync(
    path.join(profile, "settings.json"),
    JSON.stringify({
      schema: 1,
      autostart: false,
      widgets: fixtures,
      pendingUpdate: { version, notes: "Already installed" },
    }),
  );
  const checks = [];
  async function launch() {
    const child = spawn(
      path.join(root, "dist/win-unpacked/Widget.exe"),
      ["--remote-debugging-port=19332"],
      {
        windowsHide: true,
        stdio: "ignore",
        env: { ...process.env, WIDGET_TEST_PROFILE: profile },
      },
    );
    let client;
    try {
      client = await connect();
      await wait(1000);
      return { client, child };
    } catch (e) {
      child.kill();
      throw e;
    }
  }
  async function close({ client, child }) {
    await Promise.race([
      client.eval("window.widgetAPI.quit()").catch(() => {}),
      wait(1500),
    ]);
    client.ws.close();
    await wait(600);
    if (child.exitCode === null) child.kill();
  }
  let run = await launch();
  try {
    const s = await run.client.eval("window.widgetAPI.state()");
    checks.push({ name: "packaged version", ok: s.version === version });
    checks.push({
      name: "new name and completed update gate",
      ok:
        !s.update.required &&
        (await run.client.eval(
          `document.title==='My Widget' && document.querySelector('.brand').textContent.trim()==='My Widget'`,
        )),
    });
    checks.push({
      name: "v1.0 migration preserves notes, calendar, photo and colors",
      ok: s.widgets.every(
        (w, i) =>
          w.background === fixtures[i].background &&
          w.opacity === 77 &&
          w.theme === "custom" &&
          w.text === fixtures[i].text &&
          w.photo === fixtures[i].photo &&
          JSON.stringify(w.events) === JSON.stringify(fixtures[i].events),
      ),
    });
    await run.client.eval(
      `window.widgetAPI.appearance({theme:'yellow-light',opacity:82})`,
    );
    await run.client.eval(
      `window.widgetAPI.patch('${fixtures[0].id}',{theme:'system',widgetOpacity:61})`,
    );
    checks.push({
      name: "packaged settings UI has sliders and themes",
      ok: await run.client.eval(
        `document.querySelector('[data-nav="settings"]').click();document.querySelectorAll('[data-theme]').length===13&&!!document.querySelector('input[type=range]')`,
      ),
    });
    await run.client.eval(`(async()=>{
      const a=await window.widgetAPI.patch('${fixtures[0].id}',{noteAction:{type:'add'}});
      await window.widgetAPI.patch('${fixtures[0].id}',{noteAction:{type:'update',id:a.activeNoteId,title:'Новая запись',text:'Сохранить после перезапуска'}});
      await window.widgetAPI.patch('${fixtures[0].id}',{noteAction:{type:'select',id:a.notes[0].id}});
      await window.widgetAPI.patch('${fixtures[1].id}',{event:{date:'2026-10-01',markerStyle:'ring',markerColor:'#33aaee'}});
    })()`);
  } finally {
    await close(run);
  }
  run = await launch();
  try {
    const s = await run.client.eval("window.widgetAPI.state()");
    checks.push({
      name: "multiple notes and calendar marker survive packaged restart",
      ok:
        s.widgets[0].notes.length === 2 &&
        s.widgets[0].notes[1].title === "Новая запись" &&
        s.widgets[0].notes[1].text === "Сохранить после перезапуска" &&
        s.widgets[1].eventMarkers["2026-10-01"].color === "#33aaee" &&
        s.widgets[1].eventMarkers["2026-10-01"].style === "ring",
    });
    checks.push({
      name: "themes and transparency survive restart",
      ok:
        s.appearance.theme === "yellow-light" &&
        s.appearance.opacity === 82 &&
        s.widgets[0].theme === "system" &&
        s.widgets[0].widgetOpacity === 61 &&
        s.widgets[0].text === fixtures[0].text,
    });
  } finally {
    await close(run);
  }
  const installer = fs.readFileSync(
    path.join(
      root,
      "dist",
      require("../package.json")
        .build.artifactName.replace("${version}", version)
        .replace("${ext}", "exe"),
    ),
  );
  const yml = fs.readFileSync(path.join(root, "dist/latest.yml"), "utf8");
  checks.push({
    name: "installer and update manifest integrity",
    ok: yml.includes(
      crypto.createHash("sha512").update(installer).digest("base64"),
    ),
  });
  fs.writeFileSync(
    path.join(root, "test-output/packaged.json"),
    JSON.stringify({ checks, bytes: installer.length }, null, 2),
  );
  console.log(JSON.stringify(checks, null, 2));
  if (checks.some((c) => !c.ok)) process.exitCode = 1;
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
