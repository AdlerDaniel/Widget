const fs = require("node:fs");
module.exports = async ({ manager, store, windows, desktop, checks, save }) => {
  const { screen } = require("electron"),
    koffi = require("koffi"),
    u = koffi.load("user32.dll");
  const Rect = koffi.struct("InputTestRect", {
    left: "long",
    top: "long",
    right: "long",
    bottom: "long",
  });
  const Info = koffi.struct("InputTestInfo", {
    cbSize: "uint32",
    flags: "uint32",
    active: "void *",
    focus: "void *",
    capture: "void *",
    menu: "void *",
    move: "void *",
    caret: "void *",
    rect: Rect,
  });
  const gui = u.func(
      "bool __stdcall GetGUIThreadInfo(uint32 thread, _Inout_ InputTestInfo * info)",
    ),
    child = u.func("bool __stdcall IsChild(void * parent, void * child)"),
    send = u.func(
      "uint32 __stdcall SendInput(uint32 count, void * inputs, int size)",
    );
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)),
    original = JSON.parse(JSON.stringify(store.data));
  try {
    manager.hide();
    for (const type of ["note", "calendar"]) {
      const w = store.data.widgets.find((w) => w.type === type),
        win = windows.get(w.id),
        selector = type === "note" ? "#note" : "#event",
        js = (s) => win.webContents.executeJavaScript(s);
      await js(
        `document.querySelector('${selector}').focus();document.querySelector('${selector}').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0}));window.liveEditor=document.querySelector('${selector}');`,
      );
      await wait(200);
      const info = { cbSize: koffi.sizeof(Info) },
        h = win.getNativeWindowHandle().readBigUInt64LE();
      gui(0, info);
      const focused = info.focus === h || (info.focus && child(h, info.focus));
      checks.push({
        name: type + " receives real Windows keyboard focus without manager",
        ok: !!focused,
        details: {
          focus: String(info.focus),
          window: String(h),
          dom: await js("document.hasFocus()"),
        },
      });
      if (focused) {
        const beforeText = await js(
          `document.querySelector('${selector}').value`,
        );
        const inputs = Buffer.alloc(80);
        for (let i = 0; i < 2; i++) {
          inputs.writeUInt32LE(1, i * 40);
          inputs.writeUInt16LE("Ж".charCodeAt(0), i * 40 + 10);
          inputs.writeUInt32LE(i ? 6 : 4, i * 40 + 12);
        }
        send(2, inputs, 40);
        await wait(200);
        checks.push({
          name: type + " accepts actual keyboard text",
          ok: await js(
            `document.querySelector('${selector}').value.includes('Ж')`,
          ),
        });
        win.webContents.sendInputEvent({
          type: "keyDown",
          keyCode: "Z",
          modifiers: ["control"],
        });
        win.webContents.sendInputEvent({
          type: "keyUp",
          keyCode: "Z",
          modifiers: ["control"],
        });
        await wait(100);
        checks.push({
          name: type + " keeps native undo history after autosave",
          ok: await js(
            `document.querySelector('${selector}').value===${JSON.stringify(beforeText)}`,
          ),
        });
      }
      await js(
        `document.querySelector('${selector}').focus();document.querySelector('${selector}').value='Прямая запись';document.querySelector('${selector}').setSelectionRange(5,5);document.querySelector('${selector}').dispatchEvent(new InputEvent('input',{bubbles:true}));`,
      );
      await wait(150);
      checks.push({
        name: type + " retains input node caret and focus after autosave",
        ok: await js(
          `window.liveEditor===document.querySelector('${selector}')&&document.activeElement===liveEditor&&liveEditor.selectionStart===5`,
        ),
      });
      const other = store.data.widgets.find((v) => v.id !== w.id);
      await manager.webContents.executeJavaScript(
        `window.widgetAPI.patch('${other.id}',{title:'Обновление другого виджета'})`,
      );
      await wait(100);
      checks.push({
        name: type + " ignores unrelated widget redraws during typing",
        ok: await js(
          `window.liveEditor===document.querySelector('${selector}')&&document.activeElement===liveEditor`,
        ),
      });
      // Saving must not replace the editor during composition.
      await js(
        `liveEditor.dispatchEvent(new CompositionEvent('compositionstart'));liveEditor.value='Составной ввод';liveEditor.dispatchEvent(new InputEvent('input',{isComposing:true}));`,
      );
      await wait(100);
      checks.push({
        name: type + " does not save unfinished composition",
        ok: await js(
          `window.widgetAPI.state().then(s=>{const w=s.widgets.find(w=>w.id==='${w.id}');return ${type === "note" ? "w.text" : "w.events[selectedDate]"}==='Прямая запись';})`,
        ),
      });
      await js(
        `liveEditor.dispatchEvent(new CompositionEvent('compositionend'))`,
      );
      await wait(100);
      checks.push({
        name: type + " saves completed composition",
        ok: await js(
          `window.widgetAPI.state().then(s=>{const w=s.widgets.find(w=>w.id==='${w.id}');return ${type === "note" ? "w.text" : "w.events[selectedDate]"}==='Составной ввод';})`,
        ),
      });
      if (type === "note") {
        await js(`document.querySelector('#note-add').click()`);
        await wait(150);
        checks.push({
          name: "new note is immediately ready for typing",
          ok: await js(
            `document.activeElement===document.querySelector('#note')&&document.querySelector('#note').value===''`,
          ),
        });
      } else {
        const nextDate = await js(
          `[...document.querySelectorAll('[data-date]')].find(b=>b.dataset.date!==selectedDate).dataset.date`,
        );
        await js(
          `window.widgetAPI.patch('${w.id}',{event:{date:'${nextDate}',text:'Другой день'}})`,
        );
        await js(`document.querySelector('[data-date="${nextDate}"]').click()`);
        await wait(150);
        checks.push({
          name: "switching a date while editing restores its own text and keyboard focus",
          ok: await js(
            `document.querySelector('#event').value==='Другой день'&&document.activeElement===document.querySelector('#event')`,
          ),
        });
        await js(
          `document.querySelector('#event').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}))`,
        );
        checks.push({
          name: "Enter finishes calendar input and removes the caret",
          ok: await js(
            `document.activeElement!==document.querySelector('#event')`,
          ),
        });
        checks.push({
          name: "calendar input placeholder follows the readable widget text",
          ok: await js(
            `getComputedStyle(document.querySelector('#event'),'::placeholder').color===getComputedStyle(document.querySelector('.widget')).color`,
          ),
        });
      }
      await js("document.activeElement.blur()");
    }
  } finally {
    store.data = original;
    save();
    manager.show();
  }
};
