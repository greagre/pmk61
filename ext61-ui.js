/* =========================================================
   pmk61 / ext61-ui.js
   Панель «Листинг расширения» в интерфейсе эмулятора.

   ЗАЧЕМ ОНА ОТДЕЛЬНЫМ ФАЙЛОМ

   Штатный листинг строит ui.js, и он про префикс 0xF0 ничего не знает:
   для него каждая ячейка — одна команда. Править ui.js ради этого не
   нужно и рискованно, поэтому панель живёт рядом: ui.js перерисовывает
   свою программу в #prog, а мы показываем свою — в блоке, который
   вставлен сразу после него и не пересекается с чужим рендером.

   КАК ОБНОВЛЯЕТСЯ

   MutationObserver на #prog: каждый render() в ui.js пересобирает
   содержимое этого узла, значит наблюдатель срабатывает ровно тогда,
   когда программа или её состояние изменились. Никаких таймеров.

   ЧТО ПОКАЗЫВАЕТ

   Адрес, код и человеческое название для каждой строки, включая
   двухбайтные команды расширения. Пустые ячейки в конце не рисуются:
   показывается занятая часть плюс небольшой запас.

   ВАЖНО

   Панель только ЧИТАЕТ программу. Она ничего не исполняет и не меняет
   поведение калькулятора: эмулятор по-прежнему работает на ядре core.js,
   а ext61 подключается отдельно, когда появятся кнопки ввода F0.
   ========================================================= */
(function (global) {
  'use strict';

  var MIN_ROWS = 12;
  var box = null;
  var body = null;
  var info = null;
  var observer = null;
  var scheduled = false;

  function pad2(n) {
    var s = String(n | 0);
    return s.length < 2 ? '0' + s : s;
  }

  function getCore() {
    return (global.MKUI && typeof global.MKUI.getCore === 'function')
      ? global.MKUI.getCore()
      : null;
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

    info.textContent = 'F0: ' + extCount + ' · занято ' + used + ' из ' + total;
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
    render: render
  };
})(typeof window !== 'undefined' ? window : this);
