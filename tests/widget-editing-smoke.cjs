const fs = require("node:fs"),
  path = require("node:path");
module.exports = async ({
  manager,
  store,
  windows,
  desktop,
  checks,
  out,
  save,
}) => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)),
    original = JSON.parse(JSON.stringify(store.data));
  const note = store.data.widgets.find((w) => w.type === "note"),
    win = windows.get(note.id),
    js = async (s) => {
      try {
        return await win.webContents.executeJavaScript(s);
      } catch (error) {
        throw Error(`Widget editing script failed: ${s}`, { cause: error });
      }
    },
    oldTarget = desktop.pointerTarget;
  const click = async (selector) => {
    await js(`document.querySelector(${JSON.stringify(selector)}).click()`);
    await wait(150);
  };
  try {
    // Drive the same native-presence channel as the Windows hit test.
    let target = note.id;
    desktop.pointerTarget = () => target;
    await js(`window.widgetAPI.patch('${note.id}',{radius:40})`);
    await wait(2400);
    checks.push({
      name: "Lucide gear is centered and clear of maximum rounded corners",
      ok: await js(
        `(()=>{const b=document.querySelector('#widget-edit'),i=b.querySelector('.gear-icon'),r=b.getBoundingClientRect(),a=i.getBoundingClientRect();return getComputedStyle(b).opacity==='1'&&r.top>=12&&innerWidth-r.right>=12&&Math.abs((a.left+a.right)-(r.left+r.right))<1&&Math.abs((a.top+a.bottom)-(r.top+r.bottom))<1&&getComputedStyle(i).maskImage.includes('settings.svg');})()`,
      ),
    });
    fs.writeFileSync(
      path.join(out, "gear-max-radius.png"),
      (await win.webContents.capturePage()).toPNG(),
    );
    checks.push({
      name: "rounded resize grip stays visible and can receive pointer input",
      ok: await js(
        `(()=>{const g=document.querySelector('#resize-grip').getBoundingClientRect(),w=document.querySelector('.widget').getBoundingClientRect();return g.right<=w.right-12&&g.bottom<=w.bottom-12&&!!document.elementFromPoint((g.left+g.right)/2,(g.top+g.bottom)/2)?.closest('#resize-grip');})()`,
      ),
    });
    await js(`window.widgetAPI.patch('${note.id}',{showTitle:false})`);
    checks.push({
      name: "hidden heading keeps add note clear of gear",
      ok: await js(
        `document.querySelector('#note-add').getBoundingClientRect().right<document.querySelector('#widget-edit').getBoundingClientRect().left`,
      ),
    });
    await js(`document.querySelector('#widget-edit').focus()`);
    target = null;
    await wait(300);
    checks.push({
      name: "gear hides on native exit even if the button retained focus",
      ok: await js(
        `getComputedStyle(document.querySelector('#widget-edit')).opacity==='0'`,
      ),
    });
    const first = store.data.widgets.find((w) => w.id === note.id).activeNoteId,
      firstText = await js(`document.querySelector('#note').value`);
    await click("#note-add");
    const second = store.data.widgets.find(
      (w) => w.id === note.id,
    ).activeNoteId;
    await js(
      `document.querySelector('#note-title').value='Идеи';document.querySelector('#note-title').dispatchEvent(new Event('input'))`,
    );
    await wait(100);
    await js(
      `document.querySelector('#note').value='Сделать подборку фотографий';document.querySelector('#note').dispatchEvent(new Event('input'))`,
    );
    await wait(100);
    await click("#note-save");
    checks.push({
      name: "new note is named edited and explicitly saved inside widget",
      ok:
        second !== first &&
        (await js(
          `document.querySelector('#note-status').textContent==='Сохранено ✓'`,
        )),
    });
    await click("#notes-list-toggle");
    fs.writeFileSync(
      path.join(out, "notes-list.png"),
      (await win.webContents.capturePage()).toPNG(),
    );
    checks.push({
      name: "widget list contains both records",
      ok: await js(
        `document.querySelectorAll('[data-note-id]').length===2&&document.querySelector('.notes-list').textContent.includes('Идеи')`,
      ),
    });
    await click(`[data-note-id="${first}"]`);
    checks.push({
      name: "switching notes restores original text without replacing it",
      ok: await js(
        `document.querySelector('#note').value===${JSON.stringify(firstText)}`,
      ),
    });
    await click("#notes-list-toggle");
    await click(`[data-note-id="${second}"]`);
    checks.push({
      name: "switching back restores title and body",
      ok: await js(
        `document.querySelector('#note-title').value==='Идеи'&&document.querySelector('#note').value==='Сделать подборку фотографий'`,
      ),
    });
    fs.writeFileSync(
      path.join(out, "notes-editor.png"),
      (await win.webContents.capturePage()).toPNG(),
    );
    const disk = JSON.parse(fs.readFileSync(store.file)).widgets.find(
      (w) => w.id === note.id,
    );
    checks.push({
      name: "multiple notes and selected record are persisted",
      ok:
        disk.notes.length === 2 &&
        disk.activeNoteId === second &&
        disk.notes.find((n) => n.id === second).text ===
          "Сделать подборку фотографий",
    });
    await js(
      `document.querySelector('#note').value='Последний ввод';document.querySelector('#note').dispatchEvent(new Event('input'))`,
    );
    await click("#notes-list-toggle");
    checks.push({
      name: "switching away flushes the last note edit without waiting for debounce",
      ok:
        JSON.parse(fs.readFileSync(store.file))
          .widgets.find((w) => w.id === note.id)
          .notes.find((n) => n.id === second).text === "Последний ввод",
    });
    await click(`[data-note-id="${second}"]`);
    await js(
      `document.querySelector('#note').value='Сделать подборку фотографий';document.querySelector('#note').dispatchEvent(new Event('input'))`,
    );
    await click("#note-save");
    await click("#note-delete");
    await click("#note-delete");
    checks.push({
      name: "deleting a note leaves the other record intact",
      ok:
        store.data.widgets.find((w) => w.id === note.id).notes.length === 1 &&
        (await js(
          `document.querySelector('#note').value===${JSON.stringify(firstText)}`,
        )),
    });
    const cal = store.data.widgets.find((w) => w.type === "calendar"),
      cw = windows.get(cal.id),
      cj = (s) => cw.webContents.executeJavaScript(s);
    await cj(`window.widgetAPI.patch('${cal.id}',{showTitle:false})`);
    checks.push({
      name: "hidden heading keeps calendar navigation clear of gear",
      ok: await cj(
        `document.querySelector('#next-month').getBoundingClientRect().right<document.querySelector('#widget-edit').getBoundingClientRect().left`,
      ),
    });
    for (const [day, style, color] of [
      [15, "dot", "#ffa344"],
      [16, "ring", "#4dd8b4"],
      [17, "text", "#ff739a"],
    ]) {
      await cj(
        `document.querySelectorAll('[data-date]')[${day - 1}].onclick()`,
      );
      await cj(
        `document.querySelector('#event').value='План на день';document.querySelector('#event').dispatchEvent(new Event('input'))`,
      );
      await wait(100);
      const date = await cj(
        `document.querySelectorAll('[data-date]')[${day - 1}].dataset.date`,
      );
      await manager.webContents.executeJavaScript(
        `view='mine';editing='${cal.id}';calendarMarkerDates[editing]='${date}';renderManager()`,
      );
      await manager.webContents.executeJavaScript(
        `document.querySelector('#event-marker-style').value='${style}';document.querySelector('#event-marker-style').dispatchEvent(new Event('change'))`,
      );
      await wait(100);
      await manager.webContents.executeJavaScript(
        `document.querySelector('#event-marker-color').value='${color}';document.querySelector('#event-marker-color').dispatchEvent(new Event('change'))`,
      );
      await wait(100);
      checks.push({
        name: "calendar " + style + " marking renders with selected color",
        ok: await cj(
          `(()=>{const d=document.querySelectorAll('[data-date]')[${day - 1}];return d.classList.contains('marker-${style}')&&getComputedStyle(d).getPropertyValue('--marker').trim()==='${color}';})()`,
        ),
      });
    }
    await manager.webContents.executeJavaScript(
      `document.querySelector('#apply-marker-style-all').click();document.querySelector('#event-marker-style').value='ring';document.querySelector('#event-marker-style').dispatchEvent(new Event('change'));document.querySelector('#apply-marker-color-all').click();document.querySelector('#event-marker-color').value='#7654dc';document.querySelector('#event-marker-color').dispatchEvent(new Event('change'))`,
    );
    await wait(150);
    const markedCalendar = store.data.widgets.find((w) => w.id === cal.id);
    checks.push({
      name: "calendar style and color apply to every marking",
      ok: Object.keys(markedCalendar.events).every(
        (date) =>
          markedCalendar.eventMarkers[date]?.style === "ring" &&
          markedCalendar.eventMarkers[date]?.color === "#7654dc",
      ),
    });
    const expiredDate = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`;
    await manager.webContents.executeJavaScript(
      `window.widgetAPI.patch('${cal.id}',{event:{date:'${expiredDate}',text:'Старая заметка'},markerAutoDeleteDays:1})`,
    );
    await wait(150);
    const expiringCalendar = store.data.widgets.find((w) => w.id === cal.id);
    checks.push({
      name: "expired calendar marking hides without deleting its note",
      ok:
        expiringCalendar.events[expiredDate] === "Старая заметка" &&
        (await cj(
          `!document.querySelector('[data-date="${expiredDate}"]').classList.contains('has-event')`,
        )),
    });
    checks.push({
      name: "calendar formatting controls live only in manager",
      ok: await cj(
        `!document.querySelector('#event-marker-style')&&!document.querySelector('#event-marker-color')`,
      ),
    });
    await manager.webContents.executeJavaScript(
      `window.widgetAPI.patch('${cal.id}',{markerAutoDeleteDays:0})`,
    );
    await wait(100);
    await cj(`document.querySelectorAll('[data-date]')[15].click()`);
    checks.push({
      name: "selected ring date has no rectangle",
      ok: await cj(
        `(()=>{const d=document.querySelectorAll('[data-date]')[15],s=getComputedStyle(d);return s.backgroundColor==='rgba(0, 0, 0, 0)'&&s.outlineStyle==='none';})()`,
      ),
    });
    await manager.webContents.executeJavaScript(
      `document.querySelector('#event-marker-style').scrollIntoView({block:'center'})`,
    );
    fs.writeFileSync(
      path.join(out, "calendar-marker-settings.png"),
      (await manager.webContents.capturePage()).toPNG(),
    );
    fs.writeFileSync(
      path.join(out, "calendar-markers.png"),
      (await cw.webContents.capturePage()).toPNG(),
    );
    const weather = store.data.widgets.find((w) => w.type === "weather");
    const photo = store.data.widgets.find((w) => w.type === "photo"),
      pw = windows.get(photo.id);
    await pw.webContents.executeJavaScript(
      `window.widgetAPI.patch('${photo.id}',{style:'photo-round',radius:40})`,
    );
    target = photo.id;
    await wait(200);
    checks.push({
      name: "round photo resize grip fits entirely inside the circular image",
      ok: await pw.webContents.executeJavaScript(
        `(()=>{const g=document.querySelector('#resize-grip').getBoundingClientRect(),p=document.querySelector('.photo-image').getBoundingClientRect(),cx=(p.left+p.right)/2,cy=(p.top+p.bottom)/2;return [[g.left,g.top],[g.right,g.top],[g.left,g.bottom],[g.right,g.bottom]].every(([x,y])=>Math.hypot(x-cx,y-cy)<p.width/2);})()`,
      ),
    });
    fs.writeFileSync(
      path.join(out, "round-photo-resize.png"),
      (await pw.webContents.capturePage()).toPNG(),
    );
    checks.push({
      name: "weather widget has no provider footer label",
      ok: await windows
        .get(weather.id)
        .webContents.executeJavaScript(
          `!document.body.textContent.includes('Open-Meteo')`,
        ),
    });
    checks.push({
      name: "weather widget has no update timestamp",
      ok: await windows
        .get(weather.id)
        .webContents.executeJavaScript(
          `!document.body.textContent.includes('Обновлено')&&!document.body.textContent.includes('Добавлено')`,
        ),
    });
    checks.push({
      name: "notes widget has no autosave caption",
      ok: await windows
        .get(store.data.widgets.find((w) => w.type === "note").id)
        .webContents.executeJavaScript(
          `!document.body.textContent.includes('Автосохранение')`,
        ),
    });
  } finally {
    desktop.pointerTarget = oldTarget;
    store.data = original;
    save();
    await js(`noteListOpen=false;renderWidget()`);
  }
};
