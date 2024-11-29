
import * as PIXI from 'pixi.js';
import { format, monthDays, addMonth, parse } from '@formkit/tempo';
import { PGlite } from "https://cdn.jsdelivr.net/npm/@electric-sql/pglite/dist/index.js";
// import { PGlite } from '@electric-sql/pglite'

const db = new PGlite('idb://my-pgdata');

const app = new PIXI.Application();
const cellWidth = 60;
const cellHeight = 40;
const objh = cellHeight / 2;
const padtoph = cellHeight / 4;
const maxtime = 24;
let maxDays = 31;
let cellHeightCount = maxDays;
let gridHeight = cellHeight * cellHeightCount;

const calendarsave = document.getElementById('calendarsave');
const taskdelete = document.getElementById('taskdelete');
const taskchange = document.getElementById('taskchange');
const tasktitle = document.getElementById('tasktitle');
const taskcolor = document.getElementById('taskcolor');
const calendar_month = document.getElementById('calendar_month');
const padcanvas = document.getElementById('padcanvas');
const leftcanvas = document.getElementById('leftcanvas');
const headcanvas = document.getElementById('headcanvas');

let createStart = { x: -1, y: -1 };
let draggingTask = false;
let resizingTask = false;

const _Graphics = '_Graph';
const _ResizeL = '_ResizeL';
const _ResizeR = '_ResizeR';
const _Distinct = '_Distinct';
const _Text = '_Text';

const tempObjLabel = 'tempObjLabel';
const tempMoveObjLabel = 'tempMoveObjLabel';
const focusGraphics = 'focusGraph';

const defaulttitle = 'Empty!';
const defaultcolor = '#ffa500';

window.onload = async () => {
  // Create Table If Not Exists
  await db.query(`
  CREATE TABLE IF NOT EXISTS task_master (
    taskid UUID PRIMARY KEY NOT NULL,
    title VARCHAR(30) NOT NULL,
    color CHAR(7) NOT NULL,
    x DECIMAL(4, 0) NOT NULL,
    y DECIMAL(4, 0) NOT NULL,
    width DECIMAL(4, 0) NOT NULL,
    yearmonth DECIMAL(6, 0) NOT NULL );`)
  const dt = new Date();
  maxDays = monthDays(dt);
  gridHeight = cellHeight * maxDays;
  calendar_month.innerText = format({ date: dt, format: 'YYYY-MM', tz: 'Asia/Tokyo', });
  // ヘッダー部の初期設定
  padcanvas.height = cellHeight / 2;
  padcanvas.width = cellWidth;
  // ヘッダーに時間を記載
  headcanvas.height = cellHeight / 2;
  headcanvas.width = cellWidth * maxtime;
  const headctx = headcanvas.getContext('2d');
  headctx.font = `15px monospace`;
  headctx.fillStyle = 'lightgray';
  let x = 0;
  for (let i = 1; i < maxtime; i++) {
    x += cellWidth
    const buffer = i < 10 ? 3 : 5;
    headctx.fillText(i, x - buffer, 15);
  }
  // カレンダー 初期設定
  await app.init({
    width: cellWidth * maxtime,
    height: gridHeight,
    backgroundAlpha: 0
  });
  app.canvas.id = 'timemaincanvas';
  app.stage.interactive = true;
  app.stage.hitArea = app.renderer.screen;
  document.getElementById('appmain').appendChild(app.canvas);
  const fmtYYYYMM = calendar_month.innerText.replaceAll('-', '');
  await calenadarView(fmtYYYYMM);
}

document.getElementById('arrowleft').addEventListener('click', async () => {
  await saveTasks();
  const prevdt = addMonth(parse({ date: calendar_month.innerText + '-01', format: 'YYYY-MM-DD', locale: 'ja', }), -1);
  maxDays = monthDays(prevdt);
  gridHeight = cellHeight * maxDays;
  calendar_month.innerText = format({ date: prevdt, format: 'YYYY-MM', tz: 'Asia/Tokyo', });

  blurTask();
  const fmtYYYYMM = calendar_month.innerText.replaceAll('-', '');
  while (app.stage.children.length > 0) {
    app.stage.children.shift().destroy({ children: true, texture: true, textureSource: true, context: true });
  }
  await calenadarView(fmtYYYYMM);
})

document.getElementById('arrowright').addEventListener('click', async () => {
  await saveTasks();
  const nextdt = addMonth(parse({ date: calendar_month.innerText + '-01', format: 'YYYY-MM-DD', locale: 'ja', }), 1);
  maxDays = monthDays(nextdt);
  gridHeight = cellHeight * maxDays;
  calendar_month.innerText = format({ date: nextdt, format: 'YYYY-MM', tz: 'Asia/Tokyo', });

  blurTask();
  const fmtYYYYMM = calendar_month.innerText.replaceAll('-', '');
  while (app.stage.children.length > 0) {
    app.stage.children.shift().destroy({ children: true, texture: true, textureSource: true, context: true });
  }
  await calenadarView(fmtYYYYMM);
})

/**
 * カレンダーを初期表示する関数
 * @param {string} strYYYYMM - 表示する年月
 */
const calenadarView = async (strYYYYMM) => {
  // 左サイドに日を記載
  leftcanvas.style.height = gridHeight + 'px';
  leftcanvas.height = gridHeight;
  leftcanvas.width = cellWidth;
  const leftctx = leftcanvas.getContext('2d');
  leftctx.font = `20px monospace`;
  leftctx.fillStyle = 'lightgray';
  let y = 0;
  for (let i = 1; i <= cellHeightCount; i++) {
    y += cellHeight
    const buffer = 10;
    const day = format({ date: strYYYYMM.substring(0, 4) + '-' + strYYYYMM.substring(4, 6) + '-' + String(i).padStart(2, '0'), format: 'DDddd', tz: 'Asia/Tokyo', })
    leftctx.fillText(day, buffer, y - buffer);
  }
  document.getElementById('timemaincanvas').style.height = gridHeight + 'px';
  // re create
  const ret = await db.query(`SELECT * from task_master WHERE yearmonth = $1;`, [Number(strYYYYMM)]);
  for (const row of ret.rows) {
    await createTask(row.taskid, Number(row.x), Number(row.y), Number(row.width), row.color, row.title);
  }
}

/**
 * TaskObjectをCreateする関数
 * @param {string} name - 一意の名前(UUID)
 * @param {number} objx - 表示位置x
 * @param {number} objy - 表示位置y
 * @param {number} objw - 表示幅w
 * @param {string} c - 表示色
 * @param {string} title - 表示文字
 */
const createTask = async (name, objx, objy, objw, c, title) => {
  const { x, y, w } = correctPosition(objx, objy, objw, objh);
  // Obj本体
  let obj = new PIXI.Graphics()
    .rect(x, y, w, objh)
    .fill(c);
  obj.label = name + _Graphics;
  obj.interactive = true;
  obj.buttonMode = true;
  // Obj Resize
  let objL = new PIXI.Graphics()
    .rect(x, y, 4, objh)
    .fill(c);
  objL.label = name + _ResizeL;
  objL.interactive = true;
  objL.buttonMode = true;
  objL.cursor = 'col-resize';
  let objR = new PIXI.Graphics()
    .rect(x + w - 4, y, 4, objh)
    .fill(c);
  objR.label = name + _ResizeR;
  objR.interactive = true;
  objR.buttonMode = true;
  objR.cursor = 'col-resize';
  // TextView作成
  const txt = title === '' ? defaulttitle : title;
  let text = new PIXI.Text({
    text: txt,
    style: new PIXI.TextStyle({
      fontFamily: 'monospace',
      fontSize: objh,
      fill: 0xffffff,
      wordWrapWidth: w,
    })
  })
  text.label = name + _Text;
  text.x = x + 4;
  text.y = y;
  text.interactive = true;
  text.buttonMode = true;
  const bounds = text.getBounds();
  if (w < bounds.width) {
    let temptext = '';
    for (let i = 0; i < w / (cellHeight / 4) - 2; i++) {
      temptext += text.text[i];
    }
    text.text = temptext
  }
  // コンテナ作成
  const container = new PIXI.Container();
  container.zIndex = 1;
  container.label = name;
  container.my_x = x;
  container.my_y = y;
  container.my_width = w;
  container.my_color = c;
  container.my_title = txt;
  container.normalobj = true;
  container.addChild(obj);
  container.addChild(objL);
  container.addChild(objR);
  container.addChild(text);
  app.stage.addChild(container);
  createdistinctTask(name); // Obj同士の重なりを確認
  focusTask(name); // 初期Focus
  obj.on('pointerover', (e) => { txthover(txt); });
  text.on('pointerover', (e) => { txthover(txt); });
  objL.on('pointerover', (e) => { txthover(txt); });
  objR.on('pointerover', (e) => { txthover(txt); });
  obj.on('pointerdown', (e) => {
    draggingTask = container;
    // rect＿topleftの距離
    const currentPos = e.data.global;
    draggingTask.my_dragx = currentPos.x - x;
    focusTask(name);
  });
  text.on('pointerdown', (e) => {
    draggingTask = container;
    // rect＿topleftの距離
    const currentPos = e.data.global;
    draggingTask.my_dragx = currentPos.x - x;
    focusTask(name);
  });
  objL.on('pointerdown', (e) => {
    resizingTask = container;
    resizingTask.my_lr = 'L';
    focusTask(name);
  });
  objR.on('pointerdown', (e) => {
    resizingTask = container;
    resizingTask.my_lr = 'R';
    focusTask(name);
  });
}
/**
 * TaskObject内のTextをHover時にTitleを表示する関数
 * @param {string} txt
 */
const txthover = (txt) => {
  document.getElementById('appmain').title = txt;
  setTimeout(() => {
    document.getElementById('appmain').title = '';
  }, 1000)
}
/**
 * TaskObjectをDistinctを表示する関数
 * @param {string} name - 一意の名前
 */
const createdistinctTask = (name) => {
  const targetcontainer = app.stage.getChildByLabel(name);
  const targetchild = targetcontainer.getChildByLabel(name + _Graphics);
  app.stage.children.forEach(container => {
    const lbl = container.label
    if (lbl != name && container.normalobj) {
      if (targetcontainer.my_y == container.my_y) {
        const a1 = targetcontainer.my_x;
        const a2 = targetcontainer.my_x + targetcontainer.my_width;
        const b1 = container.my_x;
        const b2 = container.my_x + container.my_width;
        const overlap = Math.min(a2, b2) - Math.max(a1, b1)
        if (overlap > 0) {
          let objD = app.stage.getChildByLabel(name + lbl + _Distinct);
          if (objD) {
            objD.destroy({ children: true, texture: true, textureSource: true, context: true });
          }
          objD = new PIXI.Graphics()
            .rect(Math.max(a1, b1), container.my_y - padtoph, overlap, cellHeight)
            .fill(0xff0000);
          objD.label = name + lbl + _Distinct;
          objD.my_distinct_ids = [name, lbl];
          objD.interactive = true;
          objD.buttonMode = true;
          app.stage.addChild(objD);
          objD.on('pointerover', (e) => { txthover(name + '\r\n' + lbl); });
        }
      }
    }
  })
}
/**
 * TaskObjectをDistinctを削除する関数
 * @param {string} name - 一意の名前
 */
const deletedistinctTask = (name) => {
  app.stage.children.forEach(objD => {
    if (objD.my_distinct_ids) {
      if (objD.my_distinct_ids.includes(name)) {
        if (objD) {
          objD.destroy({ children: true, texture: true, textureSource: true, context: true });
        }
      }
    }
  })
}
/**
 * TaskObjectをFocusする関数
 * @param {string} name - 一意の名前
 */
const focusTask = (name) => {
  blurTask();
  let targetcontainer = app.stage.getChildByLabel(name);
  if (targetcontainer) {
    // Obj Focus
    let objF = new PIXI.Graphics()
      .rect(targetcontainer.my_x, targetcontainer.my_y + objh, targetcontainer.my_width, 3)
      .fill(0xffff00);
    objF.my_id = name;
    const container = new PIXI.Container();
    container.zIndex = 2;
    container.label = focusGraphics;
    container.my_id = name;
    container.addChild(objF);
    app.stage.addChild(container);
    targetcontainer.zIndex = 2;
    app.stage.children.forEach(container => {
      const lbl = container.label
      if (lbl != name && lbl && container.normalobj) {
        container.zIndex = 1;
      }
    })
    // focus color&title
    taskchange.disabled = false;
    taskdelete.disabled = false;
    taskchange.dataset.taskid = name;
    taskdelete.dataset.taskid = name;
    tasktitle.disabled = false;
    taskcolor.disabled = false;
    tasktitle.value = targetcontainer.my_title;
    taskcolor.value = targetcontainer.my_color;
  }
}
/**
 * TaskObjectをBlurする関数
 */
const blurTask = () => {
  let objF = app.stage.getChildByLabel(focusGraphics);
  if (objF) {
    objF.destroy({ children: true, texture: true, textureSource: true, context: true });
    // blur color&title
    taskchange.disabled = true;
    taskdelete.disabled = true;
    taskchange.dataset.taskid = '';
    taskdelete.dataset.taskid = '';
    tasktitle.disabled = true;
    taskcolor.disabled = true;
    tasktitle.value = '';
    taskcolor.value = '#000000';
  }
}

/**
 * TaskObjectの新規追加するとき、Objectを仮表示する関数
 * @param {number} x - 位置x
 * @param {number} y - 位置y
 * @param {number} w - width
 * @param {string} c - 表示色
 */
const createtempTask = (x, y, w, c) => {
  blurTask();
  let tempObj = app.stage.getChildByLabel(tempObjLabel);
  if (tempObj) {
    tempObj.destroy({ children: true, texture: true, textureSource: true, context: true });
  }
  let obj = new PIXI.Graphics()
    .rect(x, y, w, objh)
    .stroke({ width: 1, color: c })
    .fill({ color: 0x000000, alpha: 0 });
  obj.label = tempObjLabel + _Graphics;
  obj.interactive = true;
  obj.buttonMode = true;
  // コンテナ作成
  const container = new PIXI.Container();
  container.zIndex = 5;
  container.label = tempObjLabel;
  container.my_x = x;
  container.my_y = y;
  container.my_width = w;
  container.my_color = c;
  container.addChild(obj);
  app.stage.addChild(container);
}

/**
 * TaskObjectの移動するとき、Objectを仮表示する関数
 * @param {string} cursor - 表示カーソル
 * @param {number} x - 位置x
 * @param {number} y - 位置y
 * @param {number} w - width
 * @param {string} c - 表示色
 */
const createtempMoveTask = (cursor, x, y, w, c) => {
  blurTask();
  let tempMoveObj = app.stage.getChildByLabel(tempMoveObjLabel);
  if (tempMoveObj) {
    tempMoveObj.destroy({ children: true, texture: true, textureSource: true, context: true });
  }
  let obj = new PIXI.Graphics()
    .rect(x, y, w, objh)
    .fill(c);
  obj.label = tempMoveObjLabel + _Graphics;
  obj.interactive = true;
  obj.buttonMode = true;
  obj.cursor = cursor;
  // コンテナ作成
  const container = new PIXI.Container();
  container.zIndex = 5;
  container.label = tempMoveObjLabel;
  container.my_x = x;
  container.my_y = y;
  container.my_width = w;
  container.my_color = c;
  container.addChild(obj);
  app.stage.addChild(container);
}

/**
 * TaskObjectの位置を補正する関数
 * @param {number} x - 位置x
 * @param {number} y - 位置y
 * @param {number} w - width
 * @param {number} h - height
 * @returns {{x: number, y: number, w: number}} 補正された位置情報オブジェクト。
 */
const correctPosition = (x, y, w, h) => {
  // check if the object is out of bounds (x,y)
  let objX = x < 0 ? 0 : x;
  let objY = y < 0 ? 0 : y + h > gridHeight ? gridHeight - h : y;
  // check if the object is correcting (x,y)
  objX = objX - (objX % (cellWidth / 12));
  objY = objY - (objY % cellHeight) + padtoph;
  // check if the object is out of bounds width
  let objW = w <= cellWidth / 12 ? cellWidth / 12 : x + w > cellWidth * maxtime ? cellWidth * maxtime - x : w;
  // check if the object is correcting width
  objW = objW - (objW % (cellWidth / 12));
  return { x: objX, y: objY, w: objW };
}

app.stage.on('pointerdown', (e) => {
  if (draggingTask) return; // ObjectをDrag中ならReturn
  if (resizingTask) return; // ObjectをResize中ならReturn
  createStart = { x: -1, y: -1 };
  // 新しいオブジェクトの作成開始位置をグローバル座標で保存
  const currentPos = e.data.global;
  createStart = { x: currentPos.x, y: currentPos.y };
});

app.stage.on('pointermove', (e) => {
  // ポインタの現在の位置を取得
  const currentPos = e.data.global;
  // ObjectをDrag中
  if (draggingTask) {
    let myObj = app.stage.getChildByLabel(draggingTask.label);
    if (myObj) {
      myObj.destroy({ children: true, texture: true, textureSource: true, context: true });
    }
    deletedistinctTask(draggingTask.label);
    createtempMoveTask('move', currentPos.x - draggingTask.my_dragx, currentPos.y - objh / 2, draggingTask.my_width, draggingTask.my_color);
    return;
  }
  // ObjectをResize中
  if (resizingTask) {
    let myObj = app.stage.getChildByLabel(resizingTask.label);
    if (myObj) {
      myObj.destroy({ children: true, texture: true, textureSource: true, context: true });
    }
    deletedistinctTask(resizingTask.label);
    const x = resizingTask.my_x
    const xw = resizingTask.my_x + resizingTask.my_width
    const y = resizingTask.my_y
    if (resizingTask.my_lr == 'R') {
      if (currentPos.x - x >= cellWidth / 12) {
        createtempMoveTask('col-resize', x, y, currentPos.x - x, resizingTask.my_color);
      }
    }
    if (resizingTask.my_lr == 'L') {
      if (xw - currentPos.x >= cellWidth / 12) {
        createtempMoveTask('col-resize', currentPos.x, y, xw - currentPos.x, resizingTask.my_color);
      }
    }
    return;
  }

  if (createStart.x == -1) return;

  // ObjectをCreate中
  if (currentPos.x - createStart.x > 0) {
    // =>方向にCreate
    createtempTask(createStart.x, createStart.y, currentPos.x - createStart.x, defaultcolor);
  } else {
    // <=方向にCreate
    createtempTask(currentPos.x, createStart.y, createStart.x - currentPos.x, defaultcolor);
  }

});

const pointerUp = async (e) => {
  // ObjectをDrag中
  if (draggingTask) {
    let tempMoveObj = app.stage.getChildByLabel(tempMoveObjLabel);
    if (tempMoveObj) {
      await createTask(draggingTask.label, tempMoveObj.my_x, tempMoveObj.my_y, tempMoveObj.my_width, tempMoveObj.my_color, '');
      tempMoveObj.destroy({ children: true, texture: true, textureSource: true, context: true });
    }
    draggingTask = false;
    return;
  }
  // ObjectをResize中
  if (resizingTask) {
    let tempMoveObj = app.stage.getChildByLabel(tempMoveObjLabel);
    if (tempMoveObj) {
      if (tempMoveObj.my_width >= cellWidth / 12) {
        await createTask(resizingTask.label, tempMoveObj.my_x, tempMoveObj.my_y, tempMoveObj.my_width, tempMoveObj.my_color, '');
      }
      else {
        await createTask(resizingTask.label, tempMoveObj.my_x, tempMoveObj.my_y, cellWidth / 12, tempMoveObj.my_color, '');
      }
      tempMoveObj.destroy({ children: true, texture: true, textureSource: true, context: true });
    }
    resizingTask = false;
  }

  if (createStart.x == -1) return;
  // ObjectをCreate中
  let tempObj = app.stage.getChildByLabel(tempObjLabel);
  if (tempObj) {
    if (tempObj.my_width >= cellWidth / 12) {
      await createTask(crypto.randomUUID().toString(), tempObj.my_x, tempObj.my_y, tempObj.my_width, defaultcolor, '');
    }
    tempObj.destroy({ children: true, texture: true, textureSource: true, context: true });
  }
  createStart = { x: -1, y: -1 };
}

app.stage.on('pointerup', await pointerUp);
app.stage.on('pointerupoutside', pointerUp);


taskchange.addEventListener('click', async (e) => {
  const taskId = e.target.dataset.taskid;
  if (taskId == '') return;
  const color = taskcolor.value;
  const title = tasktitle.value;
  let targetcontainer = app.stage.getChildByLabel(taskId);
  if (targetcontainer) {
    blurTask();
    targetcontainer.destroy({ children: true, texture: true, textureSource: true, context: true });
    // re create
    await createTask(taskId, targetcontainer.my_x, targetcontainer.my_y, targetcontainer.my_width, color, title);
    focusTask(taskId);
  }
});

taskdelete.addEventListener('click', async (e) => {
  const taskId = e.target.dataset.taskid;
  if (taskId == '') return;
  let targetcontainer = app.stage.getChildByLabel(taskId);
  if (targetcontainer) {
    deletedistinctTask(taskId);
    await db.query(`DELETE FROM task_master WHERE taskid = $1 ;`, [taskId]);
    targetcontainer.destroy({ children: true, texture: true, textureSource: true, context: true });
    // focus destroy
    blurTask();
  }
});

/**
 * Taskを保存する関数
 */
const saveTasks = async () => {
  let count = 0;
  const fmtYYYYMM = calendar_month.innerText.replaceAll('-', '');
  for (const child of app.stage.children) {
    if (child.my_color && child.my_title && child.my_width && child.my_x && child.my_y) {
      const ret = await db.query(`INSERT INTO task_master (taskid,title,color,x,y,width,yearmonth) 
        SELECT $1,$2,$3,$4,$5,$6,$7
        WHERE NOT EXISTS ( SELECT 1 FROM task_master WHERE taskid = $1 );`,
        [child.label, child.my_title, child.my_color, child.my_x, child.my_y, child.my_width, Number(fmtYYYYMM)]);
      count = count + ret.affectedRows;
    }
  }
  if (count > 0) {
    window.alert(`${calendar_month.innerText}のTaskを${count}件保存しました`)
  }
}

calendarsave.addEventListener('click', async (e) => {
  await saveTasks();
});
