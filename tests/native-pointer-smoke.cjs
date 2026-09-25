module.exports = async ({ desktop, checks }) => {
  const { BrowserWindow, screen } = require("electron"),
    koffi = require("koffi");
    const user32 = koffi.load("user32.dll"),
      setCursor = user32.func(
        "bool __stdcall SetCursorPos(int x, int y)",
      ),
      foregroundWindow = user32.func(
        "void * __stdcall GetForegroundWindow()",
      ),
      getWindowThreadProcessId = user32.func(
        "uint32 __stdcall GetWindowThreadProcessId(void * window, _Out_ uint32 * processId)",
      );
  const before = screen.dipToScreenPoint(screen.getCursorScreenPoint()),
    area = screen.getPrimaryDisplay().workArea;
  const win = new BrowserWindow({
    x: area.x + area.width - 260,
    y: area.y + 80,
    width: 240,
    height: 180,
    frame: false,
    transparent: true,
    show: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    await win.loadURL(
      'data:text/html,<body style="margin:0;background:%23202839;height:100vh"><header style="height:50px">My Widget</header><textarea></textarea></body>',
    );
      win.showInactive();
      await wait(300);
    for (const [name, y] of [
      ["top edge", 4],
      ["heading", 25],
      ["content", 100],
    ]) {
        const p = screen.dipToScreenPoint({
          x: win.getBounds().x + 120,
          y: win.getBounds().y + y,
        });
        setCursor(p.x, p.y);
        let target = null;
        for (let attempt = 0; attempt < 10; attempt++) {
          await wait(40);
          target = desktop.pointerTarget(new Map([["test", win]]), screen);
          if (target === "test") break;
        }
        const foreground = foregroundWindow(),
          foregroundProcess = Buffer.alloc(4);
        if (foreground)
          getWindowThreadProcessId(foreground, foregroundProcess);
        const foregroundProcessId = foregroundProcess.readUInt32LE(0),
          interceptedByExternalWindow =
            target !== "test" &&
            foregroundProcessId !== 0 &&
            foregroundProcessId !== process.pid;
        checks.push({
          name: "Windows detects cursor over " + name,
          ok: target === "test" || interceptedByExternalWindow,
          skipped: interceptedByExternalWindow,
          details: {
            x: p.x,
            y: p.y,
            target,
            foregroundProcess: foregroundProcessId,
            window: desktop.inspect(win),
          },
        });
    }
    setCursor(before.x, before.y);
  } finally {
    setCursor(before.x, before.y);
    win.destroy();
  }
};
