// Windows Explorer hosts the desktop. Keep widget HWNDs in its desktop layer.
const koffi = require("koffi");
const u = koffi.load("user32.dll");
const find = u.func(
  "void * __stdcall FindWindowW(str16 className, str16 title)",
);
const next = u.func(
  "void * __stdcall FindWindowExW(void * parent, void * after, str16 className, str16 title)",
);
const send = u.func(
  "intptr_t __stdcall SendMessageTimeoutW(void * hwnd, uint32 msg, uintptr_t wParam, intptr_t lParam, uint32 flags, uint32 timeout, _Out_ uintptr_t * result)",
);
const enumProc = koffi.proto(
  "bool __stdcall DesktopEnumProc(void * hwnd, intptr_t param)",
);
const enumerate = u.func(
  "bool __stdcall EnumWindows(DesktopEnumProc * cb, intptr_t param)",
);
const parent = u.func(
  "void * __stdcall SetParent(void * child, void * parent)",
);
const getParent = u.func("void * __stdcall GetParent(void * hwnd)");
const valid = u.func("bool __stdcall IsWindow(void * hwnd)");
const visible = u.func("bool __stdcall IsWindowVisible(void * hwnd)");
const className = u.func(
  "int __stdcall GetClassNameW(void * hwnd, _Out_ uint16 * text, int count)",
);
const Rect = koffi.struct("DesktopRect", {
  left: "long",
  top: "long",
  right: "long",
  bottom: "long",
});
const getRect = u.func(
  "bool __stdcall GetWindowRect(void * hwnd, _Out_ DesktopRect * rect)",
);
const getStyle = u.func(
  "intptr_t __stdcall GetWindowLongPtrW(void * hwnd, int index)",
);
const setStyle = u.func(
  "intptr_t __stdcall SetWindowLongPtrW(void * hwnd, int index, intptr_t value)",
);
const pos = u.func(
  "bool __stdcall SetWindowPos(void * hwnd, void * after, int x, int y, int cx, int cy, uint32 flags)",
);
const Point = koffi.struct("DesktopPoint", { x: "long", y: "long" });
const windowAt = u.func("void * __stdcall WindowFromPoint(DesktopPoint point)");
const isChild = u.func("bool __stdcall IsChild(void * parent, void * child)");
function pointerTarget(windows, screen) {
  const hwnd = windowAt(screen.dipToScreenPoint(screen.getCursorScreenPoint()));
  if (!hwnd) return null;
  for (const [id, win] of windows) {
    if (win.isDestroyed() || !win.isVisible()) continue;
    const h = handle(win);
    if (
      win.getNativeWindowHandle().readBigUInt64LE() === hwnd ||
      isChild(h, hwnd)
    )
      return id;
  }
  return null;
}
const toClient = u.func(
  "bool __stdcall ScreenToClient(void * hwnd, _Inout_ DesktopPoint * point)",
);
let host = null;
function discover() {
  const prog = find("Progman", null);
  if (!prog) return null;
  send(prog, 0x052c, 0, 0, 2, 1000, [0]);
  let found = null;
  enumerate((hwnd) => {
    if (next(hwnd, null, "SHELLDLL_DefView", null)) {
      found = next(null, hwnd, "WorkerW", null);
      if (!found) found = hwnd;
    }
    return true;
  }, 0);
  return found || prog;
}
function handle(win) {
  return koffi.as(win.getNativeWindowHandle().readBigUInt64LE(), "void *");
}
function attach(win) {
  if (!host || !valid(host)) host = discover();
  if (!host) return false;
  const h = handle(win);
  if (getParent(h) === host) return true;
  const style = Number(getStyle(h, -16));
  setStyle(h, -16, ((style & ~0x80000000) | 0x40000000) >>> 0);
  parent(h, host);
  pos(h, null, 0, 0, 0, 0, 0x0027);
  return getParent(h) === host;
}
function move(win, bounds, screen) {
  const p = screen.dipToScreenPoint({ x: bounds.x, y: bounds.y });
  const d = screen.getDisplayMatching(bounds);
  const point = { x: p.x, y: p.y };
  const h = handle(win),
    par = getParent(h);
  if (par) toClient(par, point);
  pos(
    h,
    null,
    point.x,
    point.y,
    Math.round(bounds.width * d.scaleFactor),
    Math.round(bounds.height * d.scaleFactor),
    0x0014,
  );
}
function inspect(win) {
  const h = handle(win),
    p = getParent(h),
    buffer = Buffer.alloc(512),
    r = {};
  if (p) className(p, buffer, 256);
  getRect(h, r);
  return {
    attached: !!p && p === host,
    parentClass: buffer.toString("utf16le").replace(/\0.*$/s, ""),
    visible: visible(h),
    rect: r,
  };
}
module.exports = { attach, move, inspect, pointerTarget };
