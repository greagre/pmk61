/* =========================================================
   pmk61 / shelf.js — библиотека программ МК-61

   Перенесено из mk-emulator/shelf.js (эталон 34-й) с правками:
   • ключи памяти pmk61/library и pmk61/bridge
   • формат файла: app "pmk61", model "mk-61", имя mk61-programs.json
   • встроенные примеры оставлены — общие команды линии 34 в 61-й
     имеют те же коды, поэтому листинги исполняются тем же ядром;
     достоверность каждой проверяется кнопкой «Проверить»

   • встроенные примеры, сквозная нумерация 01, 02, 03 …
   • сохранение текущей программы, загрузка в корпус одним нажатием
   • проверка: прогон с данными из описания и сверка с эталоном
   • выгрузка и загрузка .json (единый формат programs[] v2)
   • мост из языка «МК-Алго» (algo.html → index.html)

   ФОРМАТ ФАЙЛА (один и тот же у корпуса и у Алго):
     {
       app: "pmk61",
       format: "programs",
       version: 2,
       model: "mk-61",
       saved: "…",
       programs: [ { id, name, prog: [...], data: {0:7}, layout: {n:0},
                     inputs: ["n"], src: "…", asm: "…", savedAt } ]
     }
   Понимается и старый одиночный файл { prog, data, layout, src }.

   Ничего не считает само: вычисления в core.js, запуск — через
   мост window.MKUI из ui.js.

   ПРАВКА v2 (26.11.2026) — ТЕКСТ АССЕМБЛЕРА ЖИВЁТ В БИБЛИОТЕКЕ

   До этой правки коды сохранялись, а текст из поля ассемблера — нет.
   Получалось так: собрал программу, сохранил в библиотеку, а вернуться
   к правке текста нельзя — в записи только коды. Приходилось набирать
   заново.

   Что изменилось: в запись добавлено необязательное поле asm.
   Ставится оно ровно в трёх местах, коды и регистры не тронуты:

   • saveCurrent() — берёт текст из pmk61/asmsrc, то есть ровно то,
     что лежит в поле редактора. Пустое поле — поля asm в записи нет
     вовсе (не пустая строка), чтобы не путать «текста нет» с «текст
     пустой»;
   • importLib() — поле asm из файла больше не отбрасывается: раньше
     нормализация entry собирала запись заново и теряла всё, чего
     не было в списке полей;
   • applyProgram() — шестой довод asmText возвращает текст в поле
     #asmSrc и заодно пишет его в pmk61/asmsrc. В ключ — обязательно:
     asm-editor.js пишет туда только по кнопкам (compile, пример,
     очистка), на обычный input — тоже, но не при загрузке из
     библиотеки. Без записи в ключ текст исчез бы после перезагрузки
     страницы.

   Старые записи без asm читаются как есть: перезагрузка такой записи
   поле редактора не трогает. Именно поэтому флаг has не вводился —
   отсутствие поля asm и есть честный признак «текста нет».

   ПРАВКА v3 (26.11.2026) — МЕТКА ЗАПИСИ, СВЯЗКА КОДЫ↔ТЕКСТ

   Было: парная запись искалась по имени. Имена совпадают случайно
   и меняются при сохранении, поэтому нельзя было сказать наверняка,
   к каким кодам относится текст.

   Стало: у каждой записи есть id (строка вида p-<время>-<счётчик>).
   Связка идёт по нему, имя остаётся подписью.

   • newId() — метка при сохранении; ensureIds() проставляет метку
     старым записям при чтении, не ломая формат: в файл она попадает
     при следующей записи библиотеки;
   • saveCurrent() — ставит id; если у записи с тем же id уже есть
     текст asm, а новая программа пришла без него, старый текст
     не затирается;
   • importLib() — берёт id из файла, иначе выдаёт новый;
   • renderShelf() — пара строк по id: сверху коды с кнопкой
     «Загрузить», снизу «↳ тот же файл, asm» с кнопкой
     «В редактор» — текст встаёт в поле, память не трогается;
   • loadAsmOnly() — та самая кнопка «В редактор».
   ========================================================= */
(function () {
  'use strict';

  var LIB_KEY = 'pmk61/library';
  var BRIDGE_KEY = 'pmk61/bridge';
  var ASM_KEY = 'pmk61/asmsrc';

  var NOP = 0x54;

  /* --- встроенные примеры ---
     prog — готовые коды ячеек. Важно про data: перед прогоном ui.js
     обнуляет X/Y/Z/T и кладёт числа только в регистры, поэтому
     программа не должна начинаться с «X→П r» по входному регистру —
     иначе затрёт его нулём.

     Про переходы: в core.js условие истинно — значит выполняется
     СЛЕДУЮЩАЯ команда, переход по адресу — при ЛОЖНОМ условии. */
  var BUILTIN = [
    {
      id: 'fact',
      title: 'n! — факториал',
      note: 'n берётся из R0, счётчик — R0, произведение копится в R1',
      input: 'R0 = n (целое ≥ 1)',
      check: 'n = 7 → 5040',
      expect: 5040,
      data: { 0: 7 },
      /* 00 1 · 01 X→П 1 · 02 П→X 1 · 03 П→X 0 · 04 × · 05 X→П 1
         06 F L0 → 02 · 09 П→X 1 · 10 С/П   (7 итераций, 39 шагов) */
      prog: [0x01, 0x41, 0x61, 0x60, 0x12, 0x41, 0x5D, 0x00, 0x02, 0x61, 0x50]
    },
    {
      id: 'sum',
      title: 'Сумма 1…N',
      note: 'S = N(N+1)/2 — без цикла, прямо по формуле',
      input: 'R0 = N (целое ≥ 1)',
      check: 'N = 10 → 55',
      expect: 55,
      data: { 0: 10 },
      prog: [0x60, 0x60, 0x01, 0x10, 0x12, 0x02, 0x13, 0x50]
    },
    {
      id: 'seg',
      title: 'Длина отрезка',
      note: '√((x₂−x₁)² + (y₂−y₁)²)',
      input: 'R1 = x₂, R2 = x₁, R3 = y₂, R4 = y₁',
      check: '(1;2) и (8;4) → 7.2801099',
      expect: 7.2801099,
      data: { 1: 8, 2: 1, 3: 4, 4: 2 },
      prog: [0x61, 0x62, 0x11, 0x22, 0x63, 0x64, 0x11, 0x22, 0x10, 0x21, 0x50]
    },
    {
      id: 'circle',
      title: 'Площадь круга',
      note: 'S = πr²',
      input: 'R1 = r',
      check: 'r = 2 → 12.566371',
      expect: 12.566371,
      data: { 1: 2 },
      prog: [0x61, 0x22, 0x20, 0x12, 0x50]
    },
    {
      id: 'hyp',
      title: 'Гипотенуза',
      note: 'c = √(a² + b²)',
      input: 'R1 = a, R2 = b',
      check: '3 и 4 → 5',
      expect: 5,
      data: { 1: 3, 2: 4 },
      prog: [0x61, 0x12, 0x62, 0x12, 0x10, 0x21, 0x50]
    }
  ];

  /* запомненные результаты проверки: ключ — 'b:fact' или 'm:<id>' */
  var builtinLast = {};
  var toastTimer = 0;

  /* ---------- мелкие помощники ---------- */
  function pool(n, msg) {
    for (var i = 0; i < n; i++) {
      if (!window.MKSHELF_USED) window.MKSHELF_USED = {};
      var id = 'p-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
      if (!window.MKSHELF_USED[id]) { window.MKSHELF_USED[id] = 1; return id; }
    }
    return 'p-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
  }

  /* ---------- метка записи ---------- */
  /* v3: id — постоянная метка программы. По ней связываются коды
     и текст asm, поэтому имя может меняться, а пара остаётся. */
  var idSeq = 0;
  function newId() {
    idSeq++;
    return 'p-' + Date.now().toString(36) + '-' + idSeq.toString(36);
  }

  /* Старые записи без id получают его при чтении. В файл метка
     попадёт при следующей записи библиотеки — формат не ломается. */
  function ensureIds(arr) {
    var changed = false;
    arr.forEach(function (p) {
      if (p && typeof p === 'object' && !p.id) {
        p.id = newId();
        changed = true;
      }
    });
    if (changed) saveLib(arr);
    return arr;
  }

  function toast(text, kind, ms) {
    var old = document.getElementById('mk-toast');
    if (old && old.parentNode) old.parentNode.removeChild(old);

    var d = document.createElement('div');
    d.id = 'mk-toast';
    var bg = kind === 'bad' ? '#b23b3b' : (kind === 'warn' ? '#8a6d1f' : 'rgba(28,32,38,.94)');
    d.style.cssText =
      'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:9999;' +
      'max-width:92vw;padding:12px 16px;border-radius:12px;background:' + bg + ';color:#fff;' +
      'font:600 14px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;' +
      'box-shadow:0 8px 24px rgba(0,0,0,.28);text-align:center;white-space:pre-line;pointer-events:none';

    document.body.appendChild(d);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      if (d.parentNode) d.parentNode.removeChild(d);
    }, ms || 5000);
  }

  /* ---------- время ---------- */
  function fmtWhen(v) {
    if (!v) return '';
    var d = (v instanceof Date) ? v : new Date(v);
    if (isNaN(d.getTime())) return '';
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear() +
           ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function fmtShort(v) {
    if (!v) return '';
    var d = (v instanceof Date) ? v : new Date(v);
    if (isNaN(d.getTime())) return '';
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return p(d.getDate()) + '.' + p(d.getMonth() + 1) +
           ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /* ---------- текст ассемблера ----------
     Один и тот же ключ, что у asm-editor.js (TEXT_KEY там). Читаем
     и пишем через try: в приватном режиме localStorage может ругнуться,
     а падать из-за этого библиотеке незачем. */
  function readAsm() {
    try {
      var t = localStorage.getItem(ASM_KEY);
      return (t === null) ? '' : String(t);
    } catch (e) { return ''; }
  }

  function writeAsm(text) {
    try { localStorage.setItem(ASM_KEY, String(text == null ? '' : text)); } catch (e) {}
  }

  /* Поле редактора ищем по id, который создаёт asm-editor.js. Если
     панель ещё не смонтирована (например, открыт другой экран),
     просто молчим: текст уже лежит в ключе и подхватится при сборке
     панели через loadText(). */
  function putAsmToField(text) {
    var area = document.getElementById('asmSrc');
    if (!area) return false;
    area.value = String(text == null ? '' : text);
    /* input не будим: он зовёт saveText и renderDirty, а сборки не было.
       Ручную строку состояния ставит сам редактор при следующей сборке. */
    return true;
  }

  /* ---------- мои программы ---------- */
  function loadLib() {
    try {
      var raw = localStorage.getItem(LIB_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? ensureIds(arr) : [];
    } catch (e) { return []; }
  }

  function saveLib(arr) {
    try { localStorage.setItem(LIB_KEY, JSON.stringify(arr)); } catch (e) {}
  }

  function sameProg(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  function freeName(arr, base) {
    var name = base, s = 2;
    while (arr.some(function (x) { return x.name === name; })) {
      name = base + ' (' + s + ')';
      s++;
    }
    return name;
  }

  function byId(arr, id) {
    if (!id) return null;
    for (var i = 0; i < arr.length; i++) if (arr[i] && arr[i].id === id) return arr[i];
    return null;
  }

  /* ---------- панель ---------- */
  var ui = null;

  function nodes() {
    if (ui) return ui;
    ui = {
      shelf: document.getElementById('shelf'),
      list: document.getElementById('shelfList'),
      close: document.getElementById('shelfClose'),
      save: document.getElementById('shelfSave'),
      exp: document.getElementById('shelfExport'),
      imp: document.getElementById('shelfImport'),
      file: document.getElementById('shelfFile'),
      open: document.getElementById('shelfOpen')
    };
    return ui;
  }

  function pad2(n) {
    var s = String(n | 0);
    return s.length < 2 ? '0' + s : s;
  }

  function openShelf() {
    nodes();
    if (!ui.shelf) return;
    ui.shelf.hidden = false;
    document.body.classList.add('shelf-open');
    renderShelf();
  }

  function closeShelf() {
    nodes();
    if (!ui.shelf) return;
    ui.shelf.hidden = true;
    document.body.classList.remove('shelf-open');
  }

  function el(tag, cls, text) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (text !== undefined) d.textContent = text;
    return d;
  }

  function renderShelf() {
    nodes();
    if (!ui.list) return;
    var mine = loadLib();
    ui.list.innerHTML = '';

    var num = 0;

    ui.list.appendChild(el('div', 'shelf-cat', 'Встроенные · ' + BUILTIN.length));

    BUILTIN.forEach(function (p) {
      num++;
      var n = num;
      ui.list.appendChild(row(n, p.title, p.check, p.input, {
        onLoad: function () { applyProgram(p.prog, p.data, p.title, n); },
        onCheck: function () { checkProgram(p, 'b:' + p.id, n); },
        last: builtinLast['b:' + p.id]
      }));
    });

    ui.list.appendChild(el('div', 'shelf-cat', 'Мои · ' + mine.length));

    if (!mine.length) {
      ui.list.appendChild(el('div', 'shelf-empty',
        'Пока пусто. Набери программу в режиме ПРГ и нажми «Сохранить текущую» — появится здесь с номером.'));
    }

    mine.forEach(function (p) {
      num++;
      var n = num;

      var meta = [];
      if (p.savedAt) meta.push('сохранено ' + fmtWhen(p.savedAt));
      else if (p.saved) meta.push('файл от ' + fmtWhen(p.saved));
      if (p.src) meta.push('из МК-Алго');
      if (p.layout) {
        var keys = Object.keys(p.layout);
        if (keys.length) meta.push('переменные: ' + keys.join(', '));
      }
      if (p.id) meta.push('метка ' + p.id);

      var acts = {
        onLoad: function () { applyProgram(p.prog, p.data || {}, p.name, n, false, p.asm); },
        onCheck: function () { checkProgram(p, 'm:' + p.id, n); },
        onDelete: function () {
          var arr = loadLib().filter(function (x) { return x.id !== p.id; });
          saveLib(arr);
          renderShelf();
        },
        last: builtinLast['m:' + p.id]
      };

      /* v3: если у записи есть текст asm — под ней вторая строка,
         связанная по тому же id. Кнопка «В редактор» кладёт текст
         в поле и НЕ трогает память калькулятора. */
      if (p.asm) acts.onEdit = function () { loadAsmOnly(p); };

      ui.list.appendChild(row(n, p.name, p.check || '', p.input || '', acts, true, meta.join(' · '),
        p.asm ? { text: 'тот же файл, asm', lines: p.asm.split(/\r?\n/).length } : null));
    });
  }

  /* row(): строка списка. asmInfo необязателен — если передан,
     под мета-строкой появляется вложенная строка «↳ тот же файл, asm»
     с кнопкой «В редактор». */
  function row(num, title, check, input, acts, removable, meta, asmInfo) {
    var d = el('div', 'srow');

    var n = el('div', 'snum', pad2(num));
    var body = el('div', 'sbody');
    body.appendChild(el('div', 'stitle', title));
    var sub = [];
    if (check) sub.push(check);
    if (input) sub.push(input);
    if (sub.length) body.appendChild(el('div', 'ssub', sub.join(' · ')));

    if (meta) {
      var m = el('div', 'smeta', meta);
      m.style.cssText = 'font:12px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;' +
                        'opacity:.72;margin-top:3px;';
      body.appendChild(m);
    }

    if (acts.last) {
      var st = el('div', 'sres ' + (acts.last.ok ? 'ok' : 'bad'),
        (acts.last.ok ? '✓ ' : '✗ ') + acts.last.text);
      body.appendChild(st);
    }

    var btns = el('div', 'sbtns');
    var bLoad = el('button', 'sb', 'Загрузить');
    bLoad.type = 'button';
    bLoad.addEventListener('click', function () { acts.onLoad(); closeShelf(); });
    btns.appendChild(bLoad);

    var bChk = el('button', 'sb', 'Проверить');
    bChk.type = 'button';
    bChk.addEventListener('click', function () { acts.onCheck(); });
    btns.appendChild(bChk);

    if (removable) {
      var bDel = el('button', 'sb danger', 'Удалить');
      bDel.type = 'button';
      bDel.addEventListener('click', function () { acts.onDelete(); });
      btns.appendChild(bDel);
    }

    body.appendChild(btns);

    /* v3: вложенная строка с текстом ассемблера */
    if (asmInfo && acts.onEdit) {
      var subRow = el('div', 'sasm');
      subRow.style.cssText = 'margin-top:8px;padding:7px 9px;border-radius:9px;' +
        'background:rgba(127,127,127,.10);display:flex;gap:8px;align-items:center;flex-wrap:wrap;';

      var tag = el('div', 'sasmtag', '↳ ' + asmInfo.text);
      tag.style.cssText = 'flex:1 1 auto;font:600 12.5px/1.3 system-ui,-apple-system,' +
        '"Segoe UI",Roboto,sans-serif;opacity:.85;';
      subRow.appendChild(tag);

      var bEdit = el('button', 'sb', 'В редактор');
      bEdit.type = 'button';
      bEdit.style.cssText = 'flex:0 0 auto;';
      bEdit.addEventListener('click', function () { acts.onEdit(); });
      subRow.appendChild(bEdit);

      body.appendChild(subRow);
    }

    d.appendChild(n);
    d.appendChild(body);
    return d;
  }

  /* ---------- загрузка в корпус ---------- */
  function switchTab(name) {
    var b = document.querySelector('#tabs button[data-tab="' + name + '"]');
    if (b) b.click();
  }

  function regsText(data) {
    var keys = [];
    Object.keys(data || {}).forEach(function (k) {
      var v = data[k];
      if (v !== '' && v !== null && typeof v !== 'undefined' && isFinite(v)) keys.push(k);
    });
    if (!keys.length) return 'регистры пустые';
    keys.sort(function (a, b) { return (+a) - (+b); });
    var head = keys.slice(0, 4).map(function (k) {
      return 'R' + window.MKCore.REG_NAMES[+k] + ' = ' + window.MKUI.fmt(data[k]);
    }).join(', ');
    return head + (keys.length > 4 ? ' …' : '');
  }

  /* asmText — необязательный шестой довод (v2). Старые вызовы без него
     работают ровно как раньше: поле редактора и ключ pmk61/asmsrc
     не трогаются. */
  function applyProgram(prog, data, title, num, silent, asmText) {
    if (!window.MKUI) return;
    window.MKUI.loadProgram(prog, data, { num: num || null, title: title });

    switchTab('code');

    var withAsm = (typeof asmText === 'string' && asmText.length > 0);
    if (withAsm) {
      writeAsm(asmText);
      putAsmToField(asmText);
    }

    if (!silent) {
      var tail = withAsm ? ' Текст возвращён в поле ассемблера.' : '';
      window.MKUI.hint('Загружено «' + title + '». Данные в регистрах, нажми Пуск.' + tail);
      toast('Загружено «' + title + '»\n' + prog.length + ' ячеек · ' + regsText(data) +
            (withAsm ? '\nс текстом asm' : ''));
    }
  }

  /* v3: кнопка «В редактор» — только текст.
     Память калькулятора не трогается вообще: ни loadProgram, ни
     регистры. Дальше пользователь сам решает — править или собрать
     уже имеющейся кнопкой «Собрать и загрузить». */
  function loadAsmOnly(p) {
    if (!p || typeof p.asm !== 'string' || !p.asm.trim()) {
      toast('У этой записи нет текста ассемблера', 'warn');
      return;
    }
    writeAsm(p.asm);
    switchTab('code');
    var ok = putAsmToField(p.asm);
    closeShelf();

    if (window.MKUI && window.MKUI.hint) {
      window.MKUI.hint('Текст «' + p.name + '» в поле редактора. Память не тронута — ' +
        'собери кнопкой «Собрать и загрузить».');
    }
    toast('Текст «' + p.name + '» в редакторе\n' + p.asm.split(/\r?\n/).length +
          ' строк · память не тронута', 'ok', 6000);
    if (!ok && window.MKUI && window.MKUI.hint) {
      window.MKUI.hint('Панель редактора закрыта — текст сохранён и появится в поле, ' +
        'когда откроешь вкладку «Код».');
    }
  }

  /* ---------- мост из языка МК-Алго ---------- */
  function takeBridge() {
    var raw = null;
    try { raw = localStorage.getItem(BRIDGE_KEY); } catch (e) { return; }
    if (!raw) return;

    var obj = null;
    try { obj = JSON.parse(raw); } catch (e) { obj = null; }
    try { localStorage.removeItem(BRIDGE_KEY); } catch (e) {}

    if (!obj || !Array.isArray(obj.prog) || !obj.prog.length) return;
    if (!window.MKUI || !window.MKUI.loadProgram) return;

    var title = obj.from || 'МК-Алго';
    window.MKUI.loadProgram(obj.prog, obj.data || {}, { num: null, title: title });
    switchTab('code');

    /* Если у записи моста есть текст — возвращаем и его тем же путём. */
    if (typeof obj.asm === 'string' && obj.asm.length) {
      writeAsm(obj.asm);
      putAsmToField(obj.asm);
    }

    window.MKUI.hint('Загружено из «' + title + '»: ' + obj.prog.length +
      ' ячеек, ' + regsText(obj.data) + '. Нажми «Шаг» или «Авто».');
    toast('Из «' + title + '»: ' + obj.prog.length + ' ячеек\n' + regsText(obj.data));
  }

  /* ---------- проверка ---------- */
  function checkProgram(p, key, num) {
    if (!window.MKUI) return;
    window.MKUI.loadProgram(p.prog, p.data || {}, { num: num || null, title: p.title });
    var r = window.MKUI.runForCheck(20000);
    var got = r.X;
    var exp = p.expect;
    var ok = (r.result === 'stop');
    if (ok && typeof exp === 'number') {
      ok = Math.abs(got - exp) <= Math.abs(exp) * 1e-6 + 1e-9;
    }

    builtinLast[key] = {
      ok: ok,
      text: window.MKUI.fmt(got) + (typeof exp === 'number' ? ' (ждали ' + exp + ')' : '') + ' · ' + r.steps + ' шагов'
    };

    window.MKUI.hint(ok
      ? 'Проверка «' + p.title + '»: совпало — ' + window.MKUI.fmt(got) + ', шагов ' + r.steps
      : 'Проверка «' + p.title + '»: получено ' + window.MKUI.fmt(got) +
        (typeof exp === 'number' ? ', ожидалось ' + exp : '') +
        ' · ' + (r.result === 'stop' ? 'С/П достигнуто' : r.result === 'error' ? 'ошибка' : 'лимит шагов'));

    toast(ok ? '✓ «' + p.title + '»: ' + window.MKUI.fmt(got) + ', шагов ' + r.steps
             : '✗ «' + p.title + '»: получено ' + window.MKUI.fmt(got), ok ? 'ok' : 'bad');
    renderShelf();
  }

  /* ---------- сохранить текущую ---------- */
  function saveCurrent() {
    if (!window.MKUI) return;
    var core = window.MKUI.getCore();
    var last = core.lastStep();
    if (last < 0) {
      window.MKUI.hint('В памяти нет программы: набери её в режиме ПРГ или загрузи пример.');
      toast('Нечего сохранять: программы в памяти нет', 'warn');
      return;
    }

    var prog = core.ST.prog.slice(0, Math.min(last + 1, core.ST.prog.length));
    var regs = {};
    for (var i = 0; i < window.MKCore.REG_COUNT; i++) {
      if (core.ST.R[i]) regs[i] = core.ST.R[i];
    }

    var arr = loadLib();

    var defName = 'Моя программа';
    var sameName = null;
    for (var j = 0; j < arr.length; j++) if (arr[j].name === defName) sameName = arr[j];
    if (sameName && !sameProg(sameName.prog, prog)) {
      var stampNow = fmtShort(Date.now());
      defName = freeName(arr, defName + (stampNow ? ' · ' + stampNow : ''));
    }

    /* v3: если программа в памяти пришла из библиотеки, у неё уже есть
       метка — предупреждаем, какую запись перезапишем. */
    var cur = (window.MKUI.getProgMeta && window.MKUI.getProgMeta()) || null;
    var curId = cur && cur.id ? cur.id : null;

    var name = window.prompt('Название программы', (cur && cur.title) || defName);
    if (!name) return;
    name = String(name).trim() || 'Моя программа';

    /* v2: текст из поля редактора. Раньше он терялся — в записи были
       только коды, и вернуться к правке текста после сохранения было
       нельзя. Пустое поле — поля asm в записи нет вовсе. */
    var asmText = readAsm();

    var entry = { id: null, name: name, prog: prog, data: regs, savedAt: Date.now() };
    if (asmText.trim()) entry.asm = asmText;

    /* v3: ищем запись по метке, если она известна; иначе по имени.
       По метке надёжнее: имя могли поменять, а программа та же. */
    var idx = -1;
    if (curId) {
      for (var a = 0; a < arr.length; a++) if (arr[a].id === curId) { idx = a; break; }
    }
    if (idx < 0) {
      for (var k = 0; k < arr.length; k++) if (arr[k].name === name) { idx = k; break; }
    }

    var note = '';
    if (idx < 0) {
      entry.id = newId();
      arr.push(entry);
    } else if (sameProg(arr[idx].prog, entry.prog)) {
      /* та же программа — обновляем запись, метку сохраняем;
         старый текст asm не затираем пустым полем */
      entry.id = arr[idx].id;
      if (!entry.asm && arr[idx].asm) entry.asm = arr[idx].asm;
      arr[idx] = entry;
    } else {
      /* программа другая — новая запись со своей меткой */
      entry.id = newId();
      var alt = freeName(arr, name + ' · ' + fmtShort(entry.savedAt));
      entry.name = alt;
      arr.push(entry);
      note = '\nсохранено как «' + alt + '» — имя было занято';
      name = alt;
    }
    saveLib(arr);

    var pos = arr.map(function (x) { return x.name; }).indexOf(name);
    var num = BUILTIN.length + pos + 1;
    window.MKUI.setProgMeta({ num: num, title: name, id: entry.id });

    window.MKUI.hint('Сохранено «' + name + '» под номером ' + pad2(num) +
      ': ' + prog.length + ' ячеек, регистров ' + Object.keys(regs).length +
      (entry.asm ? ', текст asm — ' + entry.asm.split('\n').length + ' строк' : ', текста asm нет'));
    toast('Сохранено «' + name + '» · ' + pad2(num) + '\n' +
      prog.length + ' ячеек · ' + regsText(regs) + '\n' +
      (entry.asm ? 'с текстом asm' : 'без текста asm') + ' · ' +
      fmtWhen(entry.savedAt) + note, 'ok', 8000);
    renderShelf();
  }

  /* ---------- единый формат файла ---------- */
  function guessName(src) {
    var lines = String(src || '').split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var t = lines[i].trim().replace(/^#+\s*/, '').trim();
      if (!t) continue;
      var cut = t.indexOf(':');
      if (cut > 0) t = t.slice(0, cut).trim();
      if (t) return t.length > 32 ? t.slice(0, 32) + '…' : t;
    }
    return 'Из МК-Алго';
  }

  function progListFrom(obj) {
    var list = [];
    if (!obj) return list;
    if (Array.isArray(obj)) list = obj.slice();
    else if (Array.isArray(obj.programs)) list = obj.programs.slice();
    else if (Array.isArray(obj.prog)) list = [obj];
    return list.filter(function (p) {
      return p && Array.isArray(p.prog) && p.prog.length;
    });
  }

  function exportLib() {
    var list = loadLib();
    if (!list.length) {
      toast('В библиотеке нет твоих программ — нечего выгружать', 'warn');
      return;
    }
    var data = {
      app: 'pmk61',
      format: 'programs',
      version: 3,
      model: 'mk-61',
      saved: new Date().toISOString(),
      programs: list
    };
    var text = JSON.stringify(data, null, 2);
    var blob = new Blob([text], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'mk61-programs.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
    toast('Выгружено программ: ' + list.length + '\nmk61-programs.json');
  }

  function importLib(file) {
    if (!file) return;
    toast('Читаю файл: ' + file.name, 'ok', 1800);

    var reader = new FileReader();
    reader.onerror = function () { toast('Не смог прочитать файл', 'bad'); };
    reader.onload = function () {
      var obj;
      try {
        obj = JSON.parse(String(reader.result));
      } catch (e) {
        toast('Это не JSON: ' + e.message, 'bad', 7000);
        return;
      }

      var incoming = progListFrom(obj);
      if (!incoming.length) {
        toast('В файле не нашёл программ (ждал programs[] или prog[])', 'bad', 7000);
        return;
      }

      var fileSaved = obj && obj.saved ? obj.saved : null;

      var arr = loadLib();
      var added = 0, replaced = 0;
      var normalized = [];
      var renamed = [];

      incoming.forEach(function (p) {
        var name = String(p.name || p.title || guessName(p.src)).trim() || 'Без названия';
        var stamp = p.savedAt || (fileSaved ? Date.parse(fileSaved) : 0) || Date.now();

        var entry = {
          id: (typeof p.id === 'string' && p.id) ? p.id : newId(),
          name: name,
          prog: p.prog.slice(),
          data: (p.data && typeof p.data === 'object') ? p.data : {},
          savedAt: stamp
        };
        if (p.layout) entry.layout = p.layout;
        if (p.inputs) entry.inputs = p.inputs;
        if (p.src) entry.src = p.src;
        if (fileSaved) entry.saved = fileSaved;
        /* v2: текст ассемблера из файла. Нормализация собирает запись
           заново, и без этой строки поле asm молча терялось бы. */
        if (typeof p.asm === 'string' && p.asm.trim()) entry.asm = p.asm;

        /* v3: ищем по метке, затем по имени */
        var idx = -1;
        var hit = byId(arr, entry.id);
        if (hit) idx = arr.indexOf(hit);
        if (idx < 0) {
          for (var k = 0; k < arr.length; k++) if (arr[k].name === name) { idx = k; break; }
        }

        if (idx < 0) {
          arr.push(entry);
          added++;
        } else if (JSON.stringify(arr[idx].prog) === JSON.stringify(entry.prog)) {
          if (!entry.asm && arr[idx].asm) entry.asm = arr[idx].asm;
          arr[idx] = entry;
          replaced++;
        } else {
          entry.id = newId();
          var alt = name + ' · ' + fmtShort(stamp);
          var base = alt, s = 2;
          while (arr.some(function (x) { return x.name === alt; })) {
            alt = base + ' (' + s + ')';
            s++;
          }
          entry.name = alt;
          arr.push(entry);
          added++;
          renamed.push(alt);
        }

        normalized.push(entry);
      });

      saveLib(arr);

      var first = normalized[0];
      applyProgram(first.prog, first.data, first.name, null, true, first.asm);

      var regLine = regsText(first.data);
      var when = fmtWhen(first.savedAt || fileSaved);
      var libLine = 'список: +' + added + (replaced ? ' · обновлено ' + replaced : '');

      var msg = 'Загружено в корпус: «' + first.name + '»\n' +
                first.prog.length + ' ячеек · ' + regLine + '\n' +
                (when ? 'файл от ' + when : 'дата в файле не указана') + '\n' +
                libLine;
      if (first.asm) msg += '\nс текстом asm';
      if (renamed.length) msg += '\nсохранено как: ' + renamed.join(', ');

      var hasRegs = Object.keys(first.data || {}).length > 0;
      toast(msg, hasRegs ? 'ok' : 'warn', 9000);

      renderShelf();
    };
    reader.readAsText(file);
  }

  /* ---------- подключение ---------- */
  function init() {
    nodes();
    if (ui.open) ui.open.addEventListener('click', openShelf);
    if (ui.close) ui.close.addEventListener('click', closeShelf);
    if (ui.save) ui.save.addEventListener('click', saveCurrent);
    if (ui.exp) ui.exp.addEventListener('click', exportLib);
    if (ui.imp) ui.imp.addEventListener('click', function () { if (ui.file) ui.file.click(); });
    if (ui.file) {
      ui.file.addEventListener('change', function () {
        importLib(ui.file.files && ui.file.files[0]);
        ui.file.value = '';
      });
    }
    if (ui.shelf) {
      ui.shelf.addEventListener('click', function (e) {
        if (e.target === ui.shelf) closeShelf();
      });
    }

    setTimeout(takeBridge, 80);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.MKSHELF = {
    init: init,
    open: openShelf,
    close: closeShelf,
    builtin: BUILTIN,
    takeBridge: takeBridge,
    toast: toast,
    fmtWhen: fmtWhen,
    readAsm: readAsm,
    writeAsm: writeAsm,
    putAsmToField: function (t) { return putAsmToField(t); },
    newId: newId,
    loadAsmOnly: loadAsmOnly,
    saveAsm: function (name, asm, prog, data, id) {
      /* v3: запись только-текста (без кодов в памяти).
         Кладёт в ту же библиотеку, коды необязательны. */
      var arr = loadLib();
      asm = String(asm == null ? '' : asm);
      if (!asm.trim()) return null;

      var entry = {
        id: (typeof id === 'string' && id) ? id : newId(),
        name: String(name || 'Программа').trim() || 'Программа',
        prog: Array.isArray(prog) ? prog.slice() : [],
        data: (data && typeof data === 'object') ? data : {},
        asm: asm,
        savedAt: Date.now()
      };

      var idx = -1;
      var hit = byId(arr, entry.id);
      if (hit) idx = arr.indexOf(hit);
      if (idx < 0) {
        for (var k = 0; k < arr.length; k++) if (arr[k].name === entry.name) { idx = k; break; }
      }

      if (idx < 0) arr.push(entry);
      else {
        entry.id = arr[idx].id;
        if (!entry.prog.length && arr[idx].prog) entry.prog = arr[idx].prog;
        arr[idx] = entry;
      }
      saveLib(arr);
      if (window.MKSHELF_RENDER) window.MKSHELF_RENDER();
      return entry;
    },
    formatFile: function (list) {
      return {
        app: 'pmk61',
        format: 'programs',
        version: 3,
        model: 'mk-61',
        saved: new Date().toISOString(),
        programs: list || loadLib()
      };
    }
  };

  window.MKSHELF_RENDER = renderShelf;
})();
