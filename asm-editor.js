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

   ПРАВКА v3 (25.11.2026)

   Один пример стал списком: факториал, номер страницы, следующий адрес,
   раздельность банков и межбанковый доступ. Каждый пример несёт строку
   «ожидается …» — она видна под кнопками, чтобы результат было с чем
   сравнить, а не гадать, что должно было выйти. Пример сразу грузится
   в память: от выбора до «Пуск» одно нажатие. Программы с F0 работают
   только в режиме расширения; на обычной МК-61 ядро справедливо ругнётся
   на префикс, и панель заранее пишет «нужен режим расширения».

   ПРАВКА v4 (25.11.2026)

   Две поправки в примерах, обе вылезли на живых прогонах.

   Первая: межбанковый пример писал «42» одной строкой, а ассемблер
   той версии понимал только одиночные цифры — сборка падала с
   «Неизвестная команда: 42». В asm61 v4 такая строка разворачивается
   в две команды-цифры, но пример всё равно переписан на «4» и «2»
   отдельными строками: так он собирается и на старой версии ассемблера,
   и адреса видно глазами — две ячейки на число.

   Вторая: у примера «следующий адрес» ожидание было «X = 2» — неверно.
   F0 11 кладёт адрес, идущий ЗА командой, а команда стоит на 02 и
   занимает две ячейки (02 и 03). Значит ответ 4, а Y = 0 — это адрес
   самой F0 10 на 00. Прогон дал именно X = 4, Y = 0, то есть эмулятор
   был прав, а строка «ожидается» врала.

   ПРАВКА v5 (25.11.2026)

   Примеры страниц. Ассемблер v5 понимает «.page N», и стало можно
   проверить главное, что до сих пор не проверялось: что код, собранный
   на страницу 1, реально оттуда исполняется. Прежние пять примеров
   оставлены как есть — набор только дополняется, чтобы в конце прогнать
   всё подряд и не потерять уже закрытые случаи.

   Панель теперь передаёт ассемблеру размер страницы и их число от ядра,
   а не свои числа: у обычной МК-61 страница одна, у ext61 — четыре,
   и расходиться этим значениям нельзя.
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

  /* Размер одной страницы и их число — тоже от ядра, а не свои. */
  function pageInfo(core) {
    var size = (core && core.PROG_LEN > 0) ? core.PROG_LEN : DEFAULT_LEN;
    var len = memoryLength(core);
    var pages = Math.max(1, Math.round(len / size));
    return { size: size, pages: pages, len: len };
  }

  /* Есть ли у текущего ядра расширение: по нему выбираются примеры с F0. */
  function hasExt(core) {
    return !!(core && core.ext);
  }

  /* Текст → программа, готовая для core.setProgram.
     Возвращает {ok, errors, cells, program, count, used, labels, pages}.
     При ошибке program пустой: загружать его нельзя — адреса в cells
     съехали, потому что длина неверной строки неизвестна. */
  function buildProgram(text, opts) {
    var o = opts || {};
    var asm = global.MKAsm;
    var info = pageInfo(o.core);
    var len = (o.len > 0) ? Math.round(o.len) : info.len;
    var pageSize = (o.pageSize > 0) ? Math.round(o.pageSize) : info.size;
    var pages = (o.pages > 0) ? Math.round(o.pages) : Math.max(1, Math.round(len / pageSize));

    var fail = {
      ok: false, errors: [], cells: [], program: [],
      count: 0, used: 0, labels: {}, pages: pages, pageSize: pageSize
    };

    if (!asm || typeof asm.assemble !== 'function') {
      fail.errors = ['Ассемблер asm61.js не подключён'];
      return fail;
    }

    var r = asm.assemble(text, {
      model: o.model,
      maxCells: len,
      pageSize: pageSize,
      pages: pages
    });
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
      labels: r.labels || {},
      pages: pages,
      pageSize: pageSize
    };
  }

  /* ---------- примеры ---------- */

  /* Первый пример — факториал: он проверяет ассемблер, память, переход
     F L0 и стек сразу, без всякого расширения. Остальные — по одной
     возможности ext61, чтобы сбой сразу показывал, что именно не так.
     Комментарии ассемблер вырезает, поэтому строка «ожидается» в тексте
     ни на сборку, ни на адреса не влияет.

     Набор только дополняется: пять нижних примеров уже проверены живыми
     прогонами, их не трогаем — чтобы в конце прогнать всё подряд. */
  var EXAMPLES = [
    {
      id: 'fact',
      name: '7! — факториал',
      expect: 'X = 5040',
      ext: false,
      src: [
        '; 7! — программа сама кладёт 7 в счётчик R0',
        '; ожидается X = 5040 после С/П',
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
      ].join('\n')
    },
    {
      id: 'page',
      name: 'F0 24 — номер страницы',
      expect: 'X = 0',
      ext: true,
      src: [
        '; «страница → X»: доказательство, что ядро исполняет F0,',
        '; а не проглатывает префикс как НОП',
        '; ожидается X = 0 (текущая страница — нулевая)',
        'F0 24',
        'С/П'
      ].join('\n')
    },
    {
      id: 'addr',
      name: 'F0 11 — следующий адрес',
      expect: 'X = 4, Y = 0',
      ext: true,
      src: [
        '; F0 10 — «адрес этой команды → X», F0 11 — «адрес следующей»',
        '; F0 10 стоит на 00 и даёт 0; F0 11 стоит на 02 и занимает 02-03,',
        '; поэтому следующий адрес — 04',
        '; ожидается X = 4, Y = 0',
        'F0 10',
        'F0 11',
        'С/П'
      ].join('\n')
    },
    {
      id: 'banks',
      name: 'Банки — раздельность',
      expect: 'X = 7',
      ext: true,
      src: [
        '; банк 0: R0 = 7, банк 1: R0 = 8, потом назад в банк 0',
        '; если банки не раздельны, выйдет 8',
        '; ожидается X = 7',
        '7',
        'X→П 0',
        'F0 01',
        '8',
        'X→П 0',
        'F0 00',
        'П→X 0',
        'С/П'
      ].join('\n')
    },
    {
      id: 'target',
      name: 'Межбанк — F0 40 / F0 60',
      expect: 'X = 42, R0 = 0',
      ext: true,
      src: [
        '; F0 05 берёт банк-адресат ИЗ X, поэтому 1 кладём первой',
        '; F0 40 — X→П R0 в банк-адресат, текущий банк не меняется',
        '; 42 набирается двумя строками, как двумя клавишами: 4 и 2',
        '; ожидается X = 42, R0 текущего банка = 0',
        '1',
        'F0 05',
        '4',
        '2',
        'F0 40',
        '0',
        'X→П 0',
        'F0 60',
        'С/П'
      ].join('\n')
    },
    {
      id: 'page1',
      name: 'Страница 1 — код оттуда исполняется',
      expect: 'X = 33',
      ext: true,
      src: [
        '; страница 0: 11 в R0, затем F0 21 — переход на страницу 1',
        '; страница 1: 33 в R0 и останов',
        '; если F0 21 не переключит страницу, исполнится С/П на 04',
        '; и в X останется 11 — поэтому ответ 33 однозначен',
        '; ожидается X = 33 (и R0 = 33)',
        '11',
        'X→П 0',
        'F0 21',
        'С/П',
        '.page 1',
        '33',
        'X→П 0',
        'С/П'
      ].join('\n')
    },
    {
      id: 'page2',
      name: 'Страница 2 — номер страницы в X',
      expect: 'X = 2',
      ext: true,
      src: [
        '; F0 22 уводит исполнение на страницу 2, где стоит только F0 24',
        '; F0 24 читает номер ТЕКУЩЕЙ страницы: должно выйти 2, не 0',
        '; ожидается X = 2',
        'F0 22',
        'С/П',
        '.page 2',
        'F0 24',
        'С/П'
      ].join('\n')
    }
  ];

  /* Совместимость: старое имя осталось, тесты и внешний код его знают. */
  var EXAMPLE = EXAMPLES[0].src;

  function findExample(id) {
    for (var i = 0; i < EXAMPLES.length; i++) {
      if (EXAMPLES[i].id === id) return EXAMPLES[i];
    }
    return EXAMPLES[0];
  }

  /* ---------- панель ---------- */

  var panel = null;
  var area = null;
  var out = null;
  var stat = null;
  var picker = null;
  var expectEl = null;

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
      '.asm-panel{margin:10px 0;padding:10px;border:1px solid rgba(127,127,127,.35);border-radius:10px;background:rgba(127,127,127,.07)}',
      '.asm-panel h3{margin:0 0 8px;font-size:14px;font-weight:600}',
      '.asm-panel textarea{width:100%;min-height:120px;box-sizing:border-box;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;line-height:1.45;padding:8px;border-radius:8px;border:1px solid rgba(127,127,127,.4);background:rgba(0,0,0,.06);color:inherit;resize:vertical}',
      '.asm-panel select{width:100%;box-sizing:border-box;margin-bottom:8px;padding:8px;border-radius:8px;border:1px solid rgba(127,127,127,.4);background:transparent;color:inherit;font-size:13px}',
      '.asm-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}',
      '.asm-row button{padding:8px 12px;border-radius:8px;border:1px solid rgba(127,127,127,.5);background:transparent;color:inherit;font-size:13px}',
      '.asm-row button.main{background:rgba(70,140,255,.18);border-color:rgba(70,140,255,.6)}',
      '.asm-stat{margin-top:8px;font-size:12px;opacity:.85}',
      '.asm-stat.ok{color:#1a8c4a}',
      '.asm-stat.err{color:#c0392b}',
      '.asm-expect{margin-top:6px;font-size:12px;font-weight:600}',
      '.asm-err{font-size:12px;padding:4px 6px;margin-top:4px;border-left:3px solid #c0392b;background:rgba(192,57,43,.08);cursor:pointer}',
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
        ' из ' + res.program.length + (labels ? ' · меток ' + labels : '') +
        (res.pages > 1 ? ' · страниц ' + res.pages : '');
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

  /* Строка «ожидается» под кнопками: без неё прогон превращается
     в угадывание — сошлось или нет. */
  function updateExpect() {
    if (!expectEl || !picker) return;
    var ex = findExample(picker.value);
    var core = (global.MKUI && typeof global.MKUI.getCore === 'function') ? global.MKUI.getCore() : null;
    var text = 'Ожидается: ' + ex.expect;
    if (ex.ext && core && !hasExt(core)) text += ' · нужен режим расширения';
    expectEl.textContent = text;
  }

  function compile(andLoad) {
    if (!area) return null;
    var core = (global.MKUI && typeof global.MKUI.getCore === 'function') ? global.MKUI.getCore() : null;
    var info = pageInfo(core);
    var res = buildProgram(area.value, {
      len: info.len,
      pageSize: info.size,
      pages: info.pages
    });
    renderResult(res);
    saveText();

    if (res.ok && andLoad && global.MKUI && typeof global.MKUI.loadProgram === 'function') {
      global.MKUI.loadProgram(res.program, null, { title: 'Из текста' });
      if (typeof global.MKUI.hint === 'function') {
        var where = (res.count > res.pageSize && res.pages > 1)
          ? 'страниц задействовано ' + Math.ceil(res.count / res.pageSize)
          : 'адрес 00';
        global.MKUI.hint('Собрано ' + res.count + ' яч. · программа в памяти, ' + where + '. Жми «Пуск».');
      }
    }
    return res;
  }

  /* Вставить выбранный пример, сразу собрать и положить в память:
     от выбора до результата два нажатия — пример и «Пуск». */
  function insertExample() {
    if (!area || !picker) return null;
    var ex = findExample(picker.value);
    area.value = ex.src;
    saveText();
    updateExpect();
    return compile(true);
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

    picker = document.createElement('select');
    picker.id = 'asmExample';
    for (var i = 0; i < EXAMPLES.length; i++) {
      var op = document.createElement('option');
      op.value = EXAMPLES[i].id;
      op.textContent = EXAMPLES[i].name;
      picker.appendChild(op);
    }
    picker.addEventListener('change', updateExpect);
    panel.appendChild(picker);

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
    bExample.addEventListener('click', function () { insertExample(); });
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

    expectEl = mk('div', 'asm-expect');
    panel.appendChild(expectEl);

    stat = mk('div', 'asm-stat');
    panel.appendChild(stat);

    out = mk('div', 'asm-errs');
    panel.appendChild(out);

    panel.appendChild(mk('div', 'asm-tip',
      'Одна строка — одна команда (число из цифр можно писать слитно: 42). ' +
      'Страница: .page 1. Метка: имя:. Адреса: 05, 100, -3. Комментарий: ; или #'));

    host.parentNode.insertBefore(panel, host);
    loadText();
    updateExpect();
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
    pageInfo: pageInfo,
    errorLines: errorLines,
    hasExt: hasExt,
    mount: mount,
    compile: compile,
    insertExample: insertExample,
    example: EXAMPLE,
    examples: EXAMPLES,
    NOP: NOP
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto);
    else auto();
  }
})(typeof window !== 'undefined' ? window : this);
