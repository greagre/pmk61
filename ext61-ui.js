/* =========================================================
   pmk61 / ext61-ui.js
   Панель «Листинг расширения» + ввод EXT-команд.

   ЗАЧЕМ ОТДЕЛЬНЫМ ФАЙЛОМ

   Штатный листинг строит ui.js, и он про префикс 0xF0 ничего не знает:
   для него каждая ячейка — одна команда. Править ui.js ради этого не
   нужно и рискованно, поэтому панель живёт рядом: ui.js перерисовывает
   свою программу в #prog, а мы показываем свою — в блоке, который
   вставлен сразу после него и не пересекается с чужим рендером.

   КАК ОБНОВЛЯЕТСЯ

   MutationObserver на #prog: каждый render() в ui.js пересобирает
   содержимое этого узла, значит наблюдатель срабатывает ровно тогда,
   когда программа или её состояние изменились. Никаких таймеров.

   ВВОД КОМАНД

   Выбираешь команду в списке и жмёшь «Записать» — она ложится в
   программу по текущему адресу, ровно как обычный набор в ПРГ.
   Пишется через writeExt(): две ячейки, префикс и второй байт,
   адрес сдвигается на две. Поэтому F0 21 не может превратиться
   в две самостоятельные команды.
   ========================================================= */
(function (global) {
  'use strict';

  var MIN_ROWS = 12;
  var box = null;
  var body = null;
  var info = null;
  var inp = null;
  var sel = null;
  var atLabel = null;
  var observer = null;
  var scheduled = false;

  var REG_CHARS = '0123456789abcde';

  function pad2(n) {
    var s = String(n | 0);
    return s.length < 2 ? '0' + s : s;
  }

  function hex2(n) {
    var s = (n & 0xFF).toString(16).toUpperCase();
    return s.length < 2 ? '0' + s : s;
  }

  function getCore() {
    return (global.MKUI && typeof global.MKUI.getCore === 'function')
      ? global.MKUI.getCore()
      : null;
  }

  /* ---------- список команд ---------- */

  function commandList() {
    var list = [
      [0x00, 'банк 0'], [0x01, 'банк 1'], [0x02, 'банк 2'], [0x03, 'банк 3'],
      [0x04, 'банк → X'], [0x05, 'банк-адресат ← X'], [0x06, 'банк-адресат → X'],
      [0x10, 'адрес → X'], [0x11, 'следующий адрес → X'],
      [0x20, 'страница 0'], [0x21, 'страница 1'], [0x22, 'страница 2'], [0x23, 'страница 3'],
      [0x24, 'страница → X']
    ];
    var i;
    for (i = 0; i < REG_CHARS.length; i++) {
      list.push([0x40 + i, 'x→П R' + REG_CHARS.charAt(i) + ' в банк-адресат']);
    }
    for (i = 0; i < REG_CHARS.length; i++) {
      list.push([0x60 + i, 'П→x R' + REG_CHARS.charAt(i) + ' из банка-адресата']);
    }
    return list;
  }

  /* ---------- запись ---------- */

  function writeSelected() {
    var core = getCore();
    if (!core || !sel) return;

    var ext = core.ext;
    if (!ext || typeof ext.writeExt !== 'function') {
      if (info) info.textContent = 'ядро без расширения — проверь порядок скриптов';
      return;
    }

    var second = parseInt(sel.value, 10);
    var at = core.ST.ip | 0;
    if (!ext.writeExt(second)) return;

    if (typeof core.changed === 'function') core.changed();
    if (global.MKUI && typeof global.MKUI.hint === 'function') {
      global.MKUI.hint('Записано F0 ' + hex2(second) + ' по адресу ' + pad2(at) +
        ' (две ячейки: ' + pad2(at) + ' и ' + pad2((at + 1) % core.PROG_LEN) + ')');
    }
    schedule();
  }

  /* ---------- построение панели ---------- */

  function buildInput() {
    inp = document.createElement('div');
    inp.className = 'ext-input';
    inp.style.display = 'flex';
    inp.style.gap = '6px';
    inp.style.alignItems = 'center';
    inp.style.flexWrap = 'wrap';
    inp.style.padding = '6px 8px 8px';

    atLabel = document.createElement('span');
    atLabel.style.fontSize = '0.85em';
    atLabel.style.opacity = '0.75';

    sel = document.createElement('select');
    sel.setAttribute('aria-label', 'Команда расширения');
    sel.style.flex = '1 1 200px';
    sel.style.minWidth = '0';

    commandList().forEach(function (o) {
      var opt = document.createElement('option');
      opt.value = String(o[0]);
      opt.textContent = 'F0 ' + hex2(o[0]) + ' — ' + o[1];
      sel.appendChild(opt);
    });

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Записать';
    btn.addEventListener('click', writeSelected);

    inp.appendChild(sel);
    inp.appendChild(btn);
    inp.appendChild(atLabel);
  }

  function ensureBox() {
    if (box && box.parentNode) return true;
    var prog = document.getElementById('prog');
    if (!prog || !prog.parentNode) return false;

    box = document.createElement('div');
    box.className = 'prog ext-listing';
    box.id = 'extProg';

    var head = document.createElement('div');
    head.className = 'prog-head';

    var left = document.createElement('span');
    left.textContent = 'Листинг расширения';

    info = document.createElement('span');
    info.className = 'ext-info';

    head.appendChild(left);
    head.appendChild(info);

    body = document.createElement('div');

    box.appendChild(head);
    box.appendChild(body);

    buildInput();
    box.appendChild(inp);

    prog.parentNode.insertBefore(box, prog.nextSibling);
    return true;
  }

  function render() {
    scheduled = false;
    if (!ensureBox()) return;

    var core = getCore();
    if (!core || !core.ST || !global.MKDasm) {
      body.innerHTML = '';
      info.textContent = 'декодер не подключён';
      return;
    }

    var prog = core.ST.prog;
    if (!prog) return;

    var total = prog.length;
    var used = global.MKDasm.used(prog);
    var end = Math.max(used, MIN_ROWS);
    if (end > total) end = total;

    var rows = global.MKDasm.rows(prog, { length: end });
    var ip = core.ST.ip | 0;
    var extCount = 0;

    var frag = document.createDocumentFragment();

    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (r.kind === 'ext') extCount++;

      var row = document.createElement('div');
      row.className = 'prow'
        + (r.empty ? ' empty' : '')
        + (r.addr === ip ? ' cur' : '')
        + (r.kind === 'ext' ? ' ext' : '');

      var a = document.createElement('span');
      a.className = 'paddr';
      a.textContent = pad2(r.addr);

      var t = document.createElement('span');
      t.className = 'plabel';
      t.textContent = r.text;

      var c = document.createElement('span');
      c.className = 'pcode';
      c.textContent = r.code;

      row.appendChild(a);
      row.appendChild(t);
      row.appendChild(c);

      frag.appendChild(row);
    }

    body.innerHTML = '';
    body.appendChild(frag);

    var bank = (typeof core.bank === 'function') ? core.bank() : 0;
    var page = (typeof core.page === 'function') ? core.page() : 0;
    info.textContent = 'F0: ' + extCount + ' · занято ' + used + ' из ' + total +
      ' · банк ' + bank + ' · страница ' + page;
    if (atLabel) atLabel.textContent = '→ адрес ' + pad2(ip);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    if (global.requestAnimationFrame) {
      global.requestAnimationFrame(render);
    } else {
      setTimeout(render, 30);
    }
  }

  function attach() {
    var prog = document.getElementById('prog');
    if (!prog) return false;
    if (!observer && global.MutationObserver) {
      observer = new MutationObserver(function () { schedule(); });
      observer.observe(prog, { childList: true, characterData: true, subtree: true });
    }
    return true;
  }

  function boot() {
    if (!attach()) {
      /* ui.js строит панели не сразу — подождём один такт */
      setTimeout(boot, 60);
      return;
    }
    ensureBox();
    render();

    /* переключение вкладок и любые нажатия — повод пересчитать листинг */
    document.addEventListener('click', function () { schedule(); }, true);
    document.addEventListener('change', function () { schedule(); }, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  global.MKExtUI = {
    refresh: schedule,
    render: render,
    write: writeSelected
  };
})(typeof window !== 'undefined' ? window : this);
