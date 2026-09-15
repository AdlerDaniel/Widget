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
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const original = JSON.parse(JSON.stringify(store.data));
  const note = store.data.widgets.find((w) => w.type === "note"),
    win = windows.get(note.id),
    js = (s) => win.webContents.executeJavaScript(s);
  const { screen, nativeImage } = require("electron");
  const nativeTarget = desktop.pointerTarget;
  let target = null;
  desktop.pointerTarget = () => target;
  try {
    target = note.id;
    await wait(1400);
    checks.push({
      name: "settings menu remains hidden before two seconds",
      ok: await js(
        `getComputedStyle(document.querySelector('#widget-edit')).opacity==='0'`,
      ),
    });
    await js(`window.widgetAPI.patch('${note.id}',{showTitle:false})`);
    await wait(1100);
    checks.push({
      name: "settings menu appears after dwell even across rerender",
      ok: await js(
        `getComputedStyle(document.querySelector('#widget-edit')).opacity==='1'`,
      ),
    });
    target = null;
    await wait(300);
    checks.push({
      name: "settings menu hides on leave",
      ok: await js(
        `getComputedStyle(document.querySelector('#widget-edit')).opacity==='0'`,
      ),
    });
    target = note.id;
    await wait(900);
    target = null;
    await wait(200);
    target = note.id;
    await wait(1200);
    checks.push({
      name: "brief visits do not accumulate dwell time",
      ok: await js(
        `getComputedStyle(document.querySelector('#widget-edit')).opacity==='0'`,
      ),
    });
    target = null;
    await wait(200);
    const oldCursor = screen.getCursorScreenPoint;
    let cursor = { x: 100, y: 100 };
    screen.getCursorScreenPoint = () => ({ ...cursor });
    try {
      await js(`window.widgetAPI.resizeStart('${note.id}')`);
      cursor = { x: 175, y: 144 };
      await wait(90);
      await js("window.widgetAPI.dragEnd()");
      let n = store.data.widgets.find((w) => w.id === note.id);
      const rect = desktop.inspect(win).rect;
      checks.push({
        name: "drag resize changes actual native window and saves bounds",
        ok:
          n.width === note.width + 75 &&
          n.height === note.height + 44 &&
          n.x === note.x &&
          n.y === note.y &&
          rect.right - rect.left >= n.width &&
          JSON.parse(fs.readFileSync(store.file)).widgets.find(
            (w) => w.id === note.id,
          ).width === n.width,
      });
      await js(`window.widgetAPI.patch('${note.id}',{locked:true})`);
      const before = store.data.widgets.find((w) => w.id === note.id).width;
      await js(`window.widgetAPI.resizeStart('${note.id}')`);
      cursor = { x: 300, y: 300 };
      await wait(80);
      await js("window.widgetAPI.dragEnd()");
      checks.push({
        name: "locked widgets cannot resize",
        ok: store.data.widgets.find((w) => w.id === note.id).width === before,
      });
      await js(`window.widgetAPI.patch('${note.id}',{locked:false})`);
      const beforeKey = store.data.widgets.find((w) => w.id === note.id).width;
      await js(
        `document.querySelector('#resize-grip').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',shiftKey:true,bubbles:true}))`,
      );
      await wait(100);
      checks.push({
        name: "resize grip supports keyboard",
        ok:
          store.data.widgets.find((w) => w.id === note.id).width ===
          beforeKey + 20,
      });
    } finally {
      screen.getCursorScreenPoint = oldCursor;
    }
    const photo = store.data.widgets.find((w) => w.type === "photo"),
      pwin = windows.get(photo.id),
      pixels = Buffer.alloc(360 * 300 * 4);
    for (let y = 0; y < 300; y++)
      for (let x = 0; x < 360; x++) {
        const i = (y * 360 + x) * 4;
        const near = y > 210 - Math.abs(x - 110) * 0.45,
          far = y > 160 - Math.abs(x - 255) * 0.65;
        const rgb = near
          ? [48, 93, 85]
          : far
            ? [97, 135, 129]
            : [180 - y * 0.12, 208 - y * 0.08, 218 - y * 0.05];
        pixels[i] = rgb[2];
        pixels[i + 1] = rgb[1];
        pixels[i + 2] = rgb[0];
        pixels[i + 3] = 255;
      }
    const landscape = path.join(out, "landscape.png");
    fs.writeFileSync(
      landscape,
      nativeImage.createFromBitmap(pixels, { width: 360, height: 300 }).toPNG(),
    );
    photo.photo = require("node:url").pathToFileURL(landscape).href;
    save();
    const { styles } = require("../src/widget-styles");
    for (const [type, options] of Object.entries(styles)) {
      const w = store.data.widgets.find((w) => w.type === type),
        v = windows.get(w.id);
      for (const s of options) {
        await manager.webContents.executeJavaScript(
          `window.widgetAPI.patch('${w.id}',{style:'${s.id}',width:${type === "calendar" ? 350 : 320},height:${type === "calendar" ? 440 : 340}})`,
        );
        await wait(90);
        checks.push({
          name: type + " style " + s.id + " renders",
          ok: await v.webContents.executeJavaScript(
            `!!document.querySelector('.widget-style-${s.id}')`,
          ),
        });
        if (s.id !== "card" && s.id !== "glass")
          fs.writeFileSync(
            path.join(out, type + "-" + s.id + ".png"),
            (await v.webContents.capturePage()).toPNG(),
          );
      }
    }
    const quote = store.data.widgets.find((w) => w.type === "quote"),
      qwin = windows.get(quote.id),
      quoteFontSizes = {},
      quoteScenarios = [
        {
          name: "minimum-dark",
          patch: {
            width: 260,
            height: 190,
            theme: "purple-dark",
            showTitle: false,
            showBackground: true,
          },
          checkTextLandscapeGap: true,
        },
        {
          name: "medium-light-transparent-title",
          patch: {
            width: 340,
            height: 250,
            theme: "purple-light",
            showTitle: true,
            showBackground: false,
          },
        },
        {
          name: "large-custom",
          patch: {
            width: 520,
            height: 360,
            theme: "custom",
            background: "#edf2f7",
            accent: "#315f86",
            showTitle: false,
            showBackground: true,
          },
        },
        {
          name: "dark-low-contrast-accent",
          patch: {
            width: 500,
            height: 300,
            theme: "custom",
            background: "#1d2331",
            accent: "#242a38",
            showTitle: false,
            showBackground: true,
          },
          checkLandscapeContrast: true,
        },
        {
          name: "size-260x190",
          patch: {
            width: 260,
            height: 190,
            theme: "purple-dark",
            showTitle: false,
            showBackground: true,
          },
          shortText: "Сила рождается в движении.",
        },
        {
          name: "size-340x250",
          patch: {
            width: 340,
            height: 250,
            theme: "purple-light",
            showTitle: false,
            showBackground: true,
          },
          shortText: "Сила рождается в движении.",
        },
        {
          name: "size-500x300-bright-accent",
          patch: {
            width: 500,
            height: 300,
            theme: "custom",
            background: "#f3f6fb",
            accent: "#315f86",
            showTitle: false,
            showBackground: true,
          },
          shortText: "Сила рождается в движении.",
        },
        {
          name: "size-900x700",
          patch: {
            width: 900,
            height: 700,
            theme: "purple-dark",
            showTitle: false,
            showBackground: true,
          },
          shortText: "Сила рождается в движении.",
        },
        {
          name: "size-900x190",
          patch: {
            width: 900,
            height: 190,
            theme: "purple-light",
            showTitle: false,
            showBackground: true,
          },
          shortText: "Сила рождается в движении.",
        },
      ];
    for (const scenario of quoteScenarios) {
      await manager.webContents.executeJavaScript(
        `window.widgetAPI.patch('${quote.id}',${JSON.stringify(scenario.patch)})`,
      );
      await wait(120);
      if (scenario.shortText)
        await qwin.webContents.executeJavaScript(
          `(()=>{const text=document.querySelector('.quote-text');text.className='quote-text quote-short';text.textContent=${JSON.stringify(scenario.shortText)};})()`,
        );
      const quoteGeometry = await qwin.webContents.executeJavaScript(
        `(()=>{const widget=document.querySelector('.widget'),content=document.querySelector('.quote-content'),text=document.querySelector('.quote-text'),menu=document.querySelector('#widget-edit'),landscape=document.querySelector('.quote-landscape'),wr=widget.getBoundingClientRect(),tr=text.getBoundingClientRect(),mr=menu.getBoundingClientRect(),lr=landscape.getBoundingClientRect(),pixel=color=>{const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');canvas.width=canvas.height=1;ctx.fillStyle='#000';ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data.slice(0,3)]},luminance=rgb=>{const c=rgb.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});return .2126*c[0]+.7152*c[1]+.0722*c[2]},contrast=(a,b)=>{const x=luminance(pixel(a)),y=luminance(pixel(b));return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)},bg=getComputedStyle(widget).getPropertyValue('--bg').trim(),fills={far:getComputedStyle(document.querySelector('.quote-hill-far')).fill,middle:getComputedStyle(document.querySelector('.quote-hill-middle')).fill,near:getComputedStyle(document.querySelector('.quote-hill-near')).fill};return {hasLandscape:!!landscape,scrollWidth:content.scrollWidth,clientWidth:content.clientWidth,scrollHeight:content.scrollHeight,clientHeight:content.clientHeight,fontSize:parseFloat(getComputedStyle(text).fontSize),widget:{left:wr.left,top:wr.top,right:wr.right,bottom:wr.bottom},text:{left:tr.left,top:tr.top,right:tr.right,bottom:tr.bottom},menu:{left:mr.left,top:mr.top,right:mr.right,bottom:mr.bottom},landscape:{left:lr.left,top:lr.top,right:lr.right,bottom:lr.bottom,height:lr.height},fills,landscapeContrast:{far:contrast(fills.far,bg),middle:contrast(fills.middle,bg),near:contrast(fills.near,bg)}};})()`,
      );
      quoteFontSizes[scenario.name] = quoteGeometry.fontSize;
      checks.push({
        name:
          "quote " + scenario.name + " stays inside its card and clear of gear",
        ok:
          quoteGeometry.hasLandscape &&
          quoteGeometry.landscape.height > 0 &&
          quoteGeometry.scrollWidth <= quoteGeometry.clientWidth &&
          quoteGeometry.scrollHeight <= quoteGeometry.clientHeight &&
          quoteGeometry.text.left >= quoteGeometry.widget.left &&
          quoteGeometry.text.right <= quoteGeometry.menu.left &&
          quoteGeometry.text.top >= quoteGeometry.widget.top &&
          quoteGeometry.text.bottom <= quoteGeometry.widget.bottom,
        details: quoteGeometry,
      });
      if (scenario.checkLandscapeContrast)
        checks.push({
          name:
            "quote " +
            scenario.name +
            " keeps progressively visible hills against its background",
          ok:
            quoteGeometry.landscapeContrast.far > 1.05 &&
            quoteGeometry.landscapeContrast.middle >
              quoteGeometry.landscapeContrast.far + 0.05 &&
            quoteGeometry.landscapeContrast.near >
              quoteGeometry.landscapeContrast.middle + 0.05,
          details: {
            fills: quoteGeometry.fills,
            contrast: quoteGeometry.landscapeContrast,
          },
        });
      if (scenario.checkTextLandscapeGap)
        checks.push({
          name:
            "quote " +
            scenario.name +
            " keeps its last text line clear of the visible landscape",
          ok:
            quoteGeometry.text.bottom + 4 <=
            quoteGeometry.landscape.top +
              quoteGeometry.landscape.height * 0.28,
          details: {
            textBottom: quoteGeometry.text.bottom,
            landscapeFadeEnd:
              quoteGeometry.landscape.top +
              quoteGeometry.landscape.height * 0.28,
          },
        });
      fs.writeFileSync(
        path.join(out, "quote-" + scenario.name + ".png"),
        (await qwin.webContents.capturePage()).toPNG(),
      );
    }
    checks.push({
      name: "quote short text grows substantially in a large tall widget",
      ok:
        quoteFontSizes["size-900x700"] >
        quoteFontSizes["size-340x250"] * 1.8,
      details: quoteFontSizes,
    });
    checks.push({
      name: "quote short text respects limited height in a wide short widget",
      ok:
        quoteFontSizes["size-900x190"] <
        quoteFontSizes["size-900x700"] * 0.65,
      details: quoteFontSizes,
    });
    const calendar = store.data.widgets.find((w) => w.type === "calendar");
    checks.push({
      name: "calendar still uses its explicit calendar renderer",
      ok: await windows
        .get(calendar.id)
        .webContents.executeJavaScript(
          `!!document.querySelector('.days')&&!!document.querySelector('#event')&&!document.querySelector('.quote-content')`,
        ),
    });
    await manager.webContents.executeJavaScript(
      `window.widgetAPI.patch('${photo.id}',{style:'photo-round'})`,
    );
    await wait(120);
    checks.push({
      name: "round photo remains a circle in a rectangular window",
      ok: await pwin.webContents.executeJavaScript(
        `(()=>{const img=document.querySelector('.photo-image'),r=img.getBoundingClientRect();return getComputedStyle(img).borderRadius==='50%'&&Math.abs(r.width-r.height)<1;})()`,
      ),
    });
    for (const style of ["note-paper", "note-sticky"]) {
      await manager.webContents.executeJavaScript(
        `window.widgetAPI.patch('${note.id}',{style:'${style}',showBackground:true})`,
      );
      checks.push({
        name: style + " has readable dark text on paper",
        ok: await js(
          `['rgb(48, 43, 54)','rgb(32, 37, 44)'].includes(getComputedStyle(document.querySelector('.note-area')).color)`,
        ),
      });
    }
    await manager.webContents.executeJavaScript(
      `window.widgetAPI.patch('${photo.id}',{style:'photo-edge',radius:0})`,
    );
    await wait(120);
    checks.push({
      name: "photo is truly edge to edge with no heading or frame",
      ok: await pwin.webContents.executeJavaScript(
        `(()=>{const w=document.querySelector('.widget'),img=document.querySelector('.photo-image'),s=getComputedStyle(w);return getComputedStyle(document.querySelector('.widget-header')).display==='none'&&s.borderTopWidth==='0px'&&s.paddingTop==='0px'&&Math.abs(img.getBoundingClientRect().width-innerWidth)<1;})()`,
      ),
    });
    const clock = store.data.widgets.find((w) => w.type === "clock");
    await manager.webContents.executeJavaScript(
      `window.widgetAPI.patch('${clock.id}',{style:'bare',showTitle:false})`,
    );
    checks.push({
      name: "clock retains time and date when caption is removed",
      ok: await windows
        .get(clock.id)
        .webContents.executeJavaScript(
          `document.querySelector('#time').textContent.length>0&&document.querySelector('#date').textContent.length>0&&getComputedStyle(document.querySelector('.widget-header')).display==='none'`,
        ),
    });
    await manager.webContents.executeJavaScript(
      `document.querySelector('[data-nav="mine"]').click();document.querySelector('[data-edit="${photo.id}"]').click()`,
    );
    await wait(100);
    fs.writeFileSync(
      path.join(out, "style-picker.png"),
      (await manager.webContents.capturePage()).toPNG(),
    );
    checks.push({
      name: "widget styles and flags persist on disk",
      ok:
        JSON.parse(fs.readFileSync(store.file)).widgets.find(
          (w) => w.id === photo.id,
        ).style === "photo-edge",
    });
    store.data = original;
    save();
    for (const w of store.data.widgets)
      desktop.move(windows.get(w.id), w, screen);
    await manager.webContents.executeJavaScript(
      `document.querySelector('[data-nav="catalog"]').click()`,
    );
  } finally {
    desktop.pointerTarget = nativeTarget;
  }
};
