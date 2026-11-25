/* =========================================================
   pmk61 / ext61-regs-click.js
   Кликабельные регистры на вкладке «Регистры».

   Зачем: обычно запись требует набрать x→П и цифру. На телефоне
   это лишние движения, поэтому клик по ячейке сразу пишет X
   в этот регистр текущего банка.

   Правила:
     • режим выбора (после x→П / П→X) не перехватываем —
       там работает родной обработчик ui.js;
     • никаких текстов в интерфейс не добавляем: правило
       «клик пишет X» живёт в документации, а не на экране;
     • ui.js не трогаем: работаем через MutationObserver
       на #tabRegs, ячейки пересоздаются при каждой отрисовке.
   ========================================================= */
(function () {
  'use strict';

  var MK = window.MKCore || {};
  var box = document.getElementById('tabRegs');
  if (!box) return;

  function core() {
    return (window.MKUI && window.MKUI.getCore) ? window.MKUI.getCore() : null;
  }

  function hint(text) {
    if (window.MKUI && window.MKUI.hint) window.MKUI.hint(text);
  }

  function isPicking() {
    return document.body.classList.contains('picking');
  }

  function nameToIdx(name) {
    var names = MK.REG_NAMES || [];
    var n = String(name || '').trim().toLowerCase();
    for (var i = 0; i < names.length; i++) {
      if (String(names[i]).toLowerCase() === n) return i;
    }
    return -1;
  }

  function bind() {
    var cells = box.querySelectorAll('.reg');
    Array.prototype.forEach.call(cells, function (cell) {
      if (cell.dataset.clickBound === '1') return;
      cell.dataset.clickBound = '1';
      cell.style.cursor = 'pointer';
      cell.addEventListener('click', function (ev) {
        /* идёт выбор регистра — не мешаем родному обработчику */
        if (isPicking()) return;

        var c = core();
        if (!c || !c.key) return;

        var letter = cell.querySelector('b');
        var idx = nameToIdx(letter ? letter.textContent : '');
        if (idx < 0) return;

        ev.preventDefault();

        /* штатный путь: x→П, затем выбор регистра — те же вызовы, что у ui.js */
        c.key({ t: 'x→П', a: 'stox' });
        c.key({ a: 'reg', r: idx, mode: 'sto' });

        var names = MK.REG_NAMES || [];
        var name = names[idx] !== undefined ? names[idx] : String(idx);
        var val = (c.fmt ? c.fmt(c.ST.R[idx]) : c.ST.R[idx]);
        hint('Регистр ' + name + ' = ' + val);
      });
    });
  }

  var obs = new MutationObserver(function () { bind(); });
  obs.observe(box, { childList: true });

  /* подстраховка: после переключения вкладок и смены модели */
  document.addEventListener('click', function () { setTimeout(bind, 0); }, true);
  window.addEventListener('mk-model-change', function () { setTimeout(bind, 0); });

  bind();
})();
