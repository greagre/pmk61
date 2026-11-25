/* =========================================================
   pmk61 / asm-editor.js
   Панель ассемблера на вкладке «Код».

   ЗАЧЕМ

   asm61.js умеет превратить текст в ячейки, но в интерфейсе это было
   недоступно: программу можно было набрать только клавишами, команда
   за командой. Панель даёт поле текста, кнопку сборки и список ошибок
   с номерами строк, а по успеху кладёт готовую память через
   MKUI.loadProgram.

   ГДЕ ЖИВЁТ

   Панель вставляется ПЕРЕД #prog, а не внутрь него: renderProgram()
   из ui.js чистит #prog через innerHTML = '', и всё, что положено внутрь,
   исчезло бы при первой же перерисовке. Тот же приём, что у панели банков
   в ext61-ui.js.

   ЧИСТАЯ ЧАСТЬ

   buildProgram, trimTrailingNop, memoryLength и errorLines не трогают DOM
   и проверяются страницей tests-editor.html — без калькулятора и без
   клавиатуры. Порядок работы у нас такой: сначала тесты, потом интерфейс.

   ДЛИНА ПАМЯТИ

   Берётся у ядра: core.PROG_LEN умножить на число страниц расширения.
   У обычной МК-61 это 105, у ext61 — 420. Своё «420» здесь не живёт:
   иначе редактор и ядро разойдутся ровно так же, как когда-то разошёлся
   адрес перехода.

   ЧЕГО ПАНЕЛЬ НЕ ДЕЛАЕТ

   Не исполняет программу и не проверяет её логику: собрала, положила
   в память, дальше «Пуск» и «Шаг» из ui.js. И не хранит ничего, кроме
   текста: сам текст в localStorage, программы — в библиотеке.

   ПРАВКА v2 (25.11.2026)

   Пример был несамодостаточным: первая команда X→П 0 брала счётчик
   из текущего X, а там после прошлых опытов оставалось что угодно
   (например −3999) — цикл F L0 уходил в 20 000 шагов и «ЕГГОГ» вместо
   ответа. Теперь пример сам кладёт 7 в X первой строкой, поэтому
   «Собрать и загрузить» → «Пуск» даёт 5040 без всякой подготовки.
   ========================================================= */
(function (global) {
  'use strict';

  var TEXT_KEY = 'pmk61/asmsrc';
  var NOP = 0x54;
  var DEFAULT_LEN = 105;

  /* ---------- чистая часть (проверяется tests-editor.html) ---------- */

  /* Настоящий объём программы: длина массива без хвоста пустых шагов.
     В памяти хвост забит NOP, и core.lastStep() его не различает,
     поэтому «занято» считаем здесь, по коду, а не по прогону. */
  function trimTrailingNop(prog, nop) {
    var empty = (typeof nop === 'number') ? (nop & 0xFF) : NOP;
    var n = Array.isArray(prog) ? prog.length : 0;
    while (n > 0 && ((prog[n - 1] & 0xFF) === empty)) n--;
    return n;
  }

  /* Ошибки из asm61 → строки для человека. Номер строки впереди,
     чтобы его можно было узнать в списке и перейти к тексту. */
  function errorLines(errors) {
    var out = [];
    if (!errors || !errors.length) return out;
    for (var i = 0; i < errors.length; i++) {
      var e = errors[i] || {};
      var head = (typeof e.line === 'number' && e.line > 0) ? ('строка ' + e.line + ': ') : '';
      out.push(head + (e.msg || 'ошибка'));
    }
    return out;
  }

  /* Сколько ячеек в памяти: PROG_LEN на число страниц расширения. */
  function memoryLength(core) {
    var len = (core && core.PROG_LEN > 0) ? core.PROG_LEN : DEFAULT_LEN;
    var pages = 1;
    if (core && core.ext && typeof core.ext.pagesCount === 'function') {
      var p = core.ext.pagesCount();
      if (p > 0) pages = p;
    }
    return len * pages;
  }

  /* Текст → программа, готовая для core.setProgram.
     Возвращает {ok, errors, cells, program, count, used, labels}.
     При ошибке program пустой: загружать его нельзя — адреса в cells
     съехали, потому что длина неверной строки неизвестна. */
  function buildProgram(text, opts) {
    var o = opts || {};
    var asm = global.MKAsm;
    var len = (o.len > 0) ? Math.round(o.len) : DEFAULT_LEN;
    var fail = { ok: false, errors: [], cells: [], program: [], count: 0, used: 0, labels: {} };

    if (!asm || typeof asm.assemble !== 'function') {
      fail.errors = ['Ассемблер asm61.js не подключён'];
      return fail;
    }

    var r = asm.assemble(text, { model: o.model, maxCells: len });
    if (!r.ok) {
      fail.errors = errorLines(r.errors);
      fail.cells = r.cells || [];
      fail.labels = r.labels || {};
      fail.count = r.count || 0;
      return fail;
    }

    var program = asm.toProgram(r.cells, { len: len });
    return {
      ok: true,
      errors: [],
      cells: r.cells,
      program: program,
      count: r.count,
      used: trimTrailingNop(program),
      labels: r.labels || {}
    };
  }

  /* ---------- встроенный пример ---------- */

  /* Счётчик кладём сами: первая строка — 7, дальше X→П 0 забирает её
     в R0. Без этой строки программа брала бы в счётчик случайное X. */
  var EXAMPLE = [
    '; 7! — программа сама кладёт 7 в счётчик R0',
    '7',
    'X→П 0',
    '1',
    'X→П 1',
    'loop:',
    'П→X 1',
    'П→X 0',
    '×',
    'X→П 1',
    'F L0 loop',
    'П→X 1',
    'С/П'
  ].join('\n');

  /* ---------- панель ---------- */

  var panel = null;
  var area = null;
  var out = null;
  var stat = null;

  function mk(tag, cls, text) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (text != null) d.textContent = text;
    return d;
  }

  function styleOnce() {
    if (document.getElementById('asmPanelStyle')) return;
    var s = document.createElement('style');
    s.id = 'asmPanelStyle';
    s.textContent = [
      '.asm-panel{margin:10px 0;padding:10px;border:1px solid rgba(127,127,127,.35);',
      'border-radius:10px;background:rgba(127,127,127,.07)}',
      '.asm-panel h3{margin:0 0 8px;font-size:14px;font-weight:600}',
      '.asm-panel textarea{width:100%;min-height:120px;box-sizing:border-box;',
      'font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;',
      'line-height:1.45;padding:8px;border-radius:8px;',
      'border:1px solid rgba(127,127,127,.4);background:rgba(0,0,0,.06);',
      'color:inherit;resize:vertical}',
      '.asm-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}',
      '.asm-row button{padding:8px 12px;border-radius:8px;',
      'border:1px solid rgba(127,127,127,.5);background:transparent;',
      'color:inherit;font-size:13px}',
      '.asm-row button.main{background:rgba(70,140,255,.18);',
      'border-color:rgba(70,140,255,.6)}',
      '.asm-stat{margin-top:8px;font-size:12px;opacity:.85}',
      '.asm-stat.ok{color:#1a8c4a}',
      '.asm-stat.err{color:#c0392b}',
      '.asm-err{font-size:12px;padding:4px 6px;margin-top:4px;',
      'border-left:3px solid #c0392b;background:rgba(192,57,43,.08);cursor:pointer}',
      '.asm-tip{font-size:11px;opacity:.6;margin-top:6px}'
    ].join('');
    document.head.appendChild(s);
  }

  function loadText() {
    try {
      var t = localStorage.getItem(TEXT_KEY);
      if (t && area) area.value = t;
    } catch (e) { /* приватный режим — просто пустое поле */ }
  }

  function saveText() {
    try {
      if (area) localStorage.setItem(TEXT_KEY, area.value);
    } catch (e) { /* не сохранилось — не беда, текст остался на экране */ }
  }

  /* Перевести курсор на строку с ошибкой: список ошибок бесполезен,
     если по нему нельзя попасть в нужное место текста. */
  function focusLine(n) {
    if (!area || !(n > 0)) return;
    var lines = area.value.split('\n');
    var start = 0;
    for (var i = 0; i < n - 1 && i < lines.length; i++) start += lines[i].length + 1;
    var end = start + (lines[n - 1] ? lines[n - 1].length : 0);
    area.focus();
    try { area.setSelectionRange(start, end); } catch (e) {}
  }

  function renderResult(res) {
    if (!out || !stat) return;
    out.innerHTML = '';

    if (res.ok) {
      var labels = Object.keys(res.labels).length;
      stat.className = 'asm-stat ok';
      stat.textContent = 'Собрано ' + res.count + ' яч. · занято ' + res.used +
        ' из ' + res.program.length + (labels ? ' · меток ' + labels : '');
      return;
    }

    stat.className = 'asm-stat err';
    stat.textContent = 'Не собрано · ошибок: ' + res.errors.length;
    res.errors.forEach(function (msg) {
      var d = mk('div', 'asm-err', msg);
      var m = /^строка (\d+)/.exec(msg);
      if (m) d.addEventListener('click', function () { focusLine(parseInt(m[1], 10)); });
      out.appendChild(d);
    });
  }

  function compile(andLoad) {
    if (!area) return null;
    var core = (global.MKUI && typeof global.MKUI.getCore === 'function') ? global.MKUI.getCore() : null;
    var res = buildProgram(area.value, { len: memoryLength(core) });
    renderResult(res);
    saveText();

    if (res.ok && andLoad && global.MKUI && typeof global.MKUI.loadProgram === 'function') {
      global.MKUI.loadProgram(res.program, null, { title: 'Из текста' });
      if (typeof global.MKUI.hint === 'function') {
        global.MKUI.hint('Собрано ' + res.count + ' яч. · программа в памяти, адрес 00. Жми «Пуск».');
      }
    }
    return res;
  }

  function mount() {
    if (panel && panel.parentNode) return true;
    if (document.getElementById('asmPanel')) return true;

    var host = document.getElementById('prog');
    if (!host || !host.parentNode) return false;

    styleOnce();

    panel = mk('div', 'asm-panel');
    panel.id = 'asmPanel';
    panel.appendChild(mk('h3', null, 'Ассемблер: текст → память'));

    area = document.createElement('textarea');
    area.id = 'asmSrc';
    area.spellcheck = false;
    area.placeholder = '7\nX→П 0\nБП 00\nС/П';
    area.addEventListener('input', saveText);
    panel.appendChild(area);

    var row = mk('div', 'asm-row');

    var bLoad = mk('button', 'main', 'Собрать и загрузить');
    bLoad.type = 'button';
    bLoad.addEventListener('click', function () { compile(true); });
    row.appendChild(bLoad);

    var bCheck = mk('button', null, 'Проверить');
    bCheck.type = 'button';
    bCheck.addEventListener('click', function () { compile(false); });
    row.appendChild(bCheck);

    var bExample = mk('button', null, 'Пример');
    bExample.type = 'button';
    bExample.addEventListener('click', function () {
      if (!area) return;
      area.value = EXAMPLE;
      saveText();
      compile(false);
    });
    row.appendChild(bExample);

    var bClear = mk('button', null, 'Очистить поле');
    bClear.type = 'button';
    bClear.addEventListener('click', function () {
      if (!area) return;
      area.value = '';
      saveText();
      if (out) out.innerHTML = '';
      if (stat) { stat.className = 'asm-stat'; stat.textContent = ''; }
      area.focus();
    });
    row.appendChild(bClear);

    panel.appendChild(row);

    stat = mk('div', 'asm-stat');
    panel.appendChild(stat);

    out = mk('div', 'asm-errs');
    panel.appendChild(out);

    panel.appendChild(mk('div', 'asm-tip',
      'Одна строка — одна команда. Метка: имя:. Адреса: 05, 100, -3. Комментарий: ; или #'));

    host.parentNode.insertBefore(panel, host);
    loadText();
    return true;
  }

  /* ui.js строит интерфейс при загрузке, поэтому ждём появления #prog.
     Если его нет вовсе (страница тестов, другое приложение) — молчим. */
  function auto() {
    if (mount()) return;
    var tries = 0;
    var t = setInterval(function () {
      if (mount() || ++tries > 40) clearInterval(t);
    }, 100);
  }

  global.MKAsmEditor = {
    buildProgram: buildProgram,
    trimTrailingNop: trimTrailingNop,
    memoryLength: memoryLength,
    errorLines: errorLines,
    mount: mount,
    compile: compile,
    example: EXAMPLE,
    NOP: NOP
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto);
    else auto();
  }
})(typeof window !== 'undefined' ? window : this);
