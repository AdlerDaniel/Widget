module.exports = async ({ desktop, checks }) => {
  const { BrowserWindow, screen } = require("electron"),
    koffi = require("koffi");
  const setCursor = koffi
    .load("user32.dll")
    .func("bool __stdcall SetCursorPos(int x, int y)");
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
    await wait(150);
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
      await wait(50);
      checks.push({
        name: "Windows detects cursor over " + name,
        ok: desktop.pointerTarget(new Map([["test", win]]), screen) === "test",
      });
    }
    setCursor(before.x, before.y);
  } finally {
    setCursor(before.x, before.y);
    win.destroy();
  }
};
