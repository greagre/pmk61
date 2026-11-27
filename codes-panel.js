/* =========================================================
   pmk61 / codes-panel.js  (v1, 27.11.2026)

   ПАНЕЛЬ «КОДЫ МК» — вставка программы цифрами

   ЗАЧЕМ

   Ассемблер принимает текст, но чужой листинг из журнала или книги
   записан кодами: «62 63 11 64 13 50». Перепечатывать его руками,
   подбирая команды по таблице, — работа на ровном месте. Панель
   принимает коды как есть и кладёт их в память по адресам.

   ГДЕ ЖИВЁТ

   Вставляется ПЕРЕД #prog и ждёт появления #asmPanel, чтобы встать
   ровно ПОД панелью ассемблера. Внутрь #prog не лезем: renderProgram()
   из ui.js чистит его через innerHTML = '', и всё положенное внутрь
   исчезло бы при первой перерисовке. Тот же приём, что у asm-editor.js.

   ФОРМАТЫ ВВОДА (все понимаются)

     • просто коды через пробел:   62 63 11 64 13 50
     • через запятую или с новой строки: 62,63,11 / 62\n63\n11
     • с адресами парами:          [62,0] [63,1] [11,2]
     • с адресами через двоеточие: 62:0 63:1 11:2
     • шестнадцатерично с 0x:      0x62 0x63 0x11
     • строчными буквами:          ff fe
     • с комментариями:            62 ; это П→X2

   Коды всегда шестнадцатеричные — так они и печатаются в листингах.
   «10» это 0x10 = 16, а не десять.

   ЧИСТАЯ ЧАСТЬ

   hex2, stripComments, tokens, num, parseCodes, buildFlat, toAsmText,
   memCodes не трогают DOM и проверяются страницей codes-test.html.

   ЧЕГО ПАНЕЛЬ НЕ ДЕЛАЕТ

   Не исполняет программу: положила в память — дальше «Пуск» и «Шаг».
   И не стирает память молча: коды пишутся по своим адресам, остальные
   ячейки остаются как были.
   ========================================================= */
(function (global) {
  'use strict';

  var TEXT_KEY = 'pmk61/codesrc';
  var NOP = 0x54;
  var DEFAULT_LEN = 420;

  /* ---------- чистая часть (проверяется codes-test.html) ---------- */

  function hex2(n) {
    var s = (n & 0xFF).toString(16).toUpperCase();
    return s.length < 2 ? '0' + s : s;
  }

  /* Комментарии вырезаются целиком до разбора: иначе цифры из «это П→X2»
     или из даты в комментарии попали бы в коды. */
  function stripComments(src) {
    return String(src == null ? '' : src)
      .replace(/;.*$/gm, ' ')
      .replace(/#.*$/gm, ' ')
      .replace(/\/\/.*$/gm, ' ');
  }

  /* Все числа из строки, включая 0x-форму и строчные буквы. */
  function tokens(src) {
    var out = [];
    var re = /0x[0-9a-f]+|[0-9a-f]+/gi;
    var m;
    while ((m = re.exec(String(src))) !== null) out.push(m[0]);
    return out;
  }

  /* Строка → число. Всё читается как шестнадцатеричное, потому что
     коды МК-61 шестнадцатеричные. «0x62» тоже понимается. */
  function num(tok) {
    var t = String(tok).toLowerCase();
    var v = (t.indexOf('0x') === 0) ? parseInt(t.slice(2), 16) : parseInt(t, 16);
    return isFinite(v) ? v : NaN;
  }

  /* Главный разбор.

     Возвращает {ok, errors, cells:[{code,addr}], count, len, mode}.
     mode — 'pairs' или 'flat', чтобы строка состояния могла сказать,
     как именно понят текст.

     Ошибки не роняют разбор: правильные коды всё равно попадают в cells,
     потому что из чужого листинга одна кривая строка не должна утаскивать
     остальные. Но и грузить такую программу молча нельзя — ok=false. */
  function parseCodes(text, opts) {
    var o = opts || {};
    var len = (o.len > 0) ? Math.round(o.len) : DEFAULT_LEN;
    var start = (typeof o.start === 'number' && o.start >= 0 && isFinite(o.start))
      ? Math.round(o.start) : 0;
    var raw = stripComments(text);
    var res = { ok: true, errors: [], cells: [], count: 0, len: len, mode: 'flat' };

    var pairRe = null;
    if (raw.indexOf('[') >= 0) {
      pairRe = /\[\s*(0x[0-9a-f]+|[0-9a-f]{1,2})\s*[,\s]\s*(0x[0-9a-f]+|[0-9a-f]{1,4})\s*\]/gi;
    } else if (raw.indexOf(':') >= 0) {
      pairRe = /(0x[0-9a-f]+|[0-9a-f]{1,2})\s*:\s*(0x[0-9a-f]+|[0-9a-f]{1,4})/gi;
    }

    if (pairRe) {
      var m;
      while ((m = pairRe.exec(raw)) !== null) {
        var code = num(m[1]);
        var addr = num(m[2]);
        if (!(code >= 0 && code <= 255)) {
          res.errors.push('код «' + m[1] + '» вне 00–FF');
          continue;
        }
        if (!(addr >= 0 && addr < len)) {
          res.errors.push('адрес ' + addr + ' вне 00–' + (len - 1));
          continue;
        }
        res.cells.push({ code: code, addr: addr });
      }
      if (res.cells.length) res.mode = 'pairs';
    }

    if (!res.cells.length) {
      var list = tokens(raw);
      for (var i = 0; i < list.length; i++) {
        var c = num(list[i]);
        if (!(c >= 0 && c <= 255)) {
          res.errors.push('«' + list[i] + '» не код: нужно 00–FF');
          continue;
        }
        var a = start + i;
        if (a >= len) {
          res.errors.push('адрес ' + a + ' вне 00–' + (len - 1) + ' — не влезает');
          continue;
        }
        res.cells.push({ code: c, addr: a });
      }
      res.mode = 'flat';
    }

    res.count = res.cells.length;
    res.ok = res.errors.length === 0 && res.count > 0;
    if (!res.count && !res.errors.length) res.errors.push('кодов не нашлось');
    return res;
  }

  /* Собрать полный массив памяти: берём текущее содержимое, поверх
     пишем наши коды. Так вставка в середину не затирает соседние
     страницы — этого от неё никто не просил, и это было бы сюрпризом. */
  function buildFlat(cells, len, base) {
    var n = (len > 0) ? Math.round(len) : DEFAULT_LEN;
    var out = new Array(n);
    for (var i = 0; i < n; i++) {
      var v = (base && typeof base[i] === 'number' && isFinite(base[i])) ? (base[i] & 0xFF) : NOP;
      out[i] = v;
    }
    if (Array.isArray(cells)) {
      for (var j = 0; j < cells.length; j++) {
        var c = cells[j];
        if (!c) continue;
        var a = c.addr | 0;
        if (a >= 0 && a < n) out[a] = c.code & 0xFF;
      }
    }
    return out;
  }

  /* Коды → текст ассемблера, чтобы можно было дальше править руками.
     Адреса восстанавливаются заполнением: пропуск пишется как .54
     (К НОП), иначе программа съехала бы и адреса не совпали. */
  function toAsmText(cells, opts) {
    var o = opts || {};
    var nopText = '.54';
    var out = [];
    var pos = 0;
    var list = Array.isArray(cells) ? cells.slice() : [];
    list.sort(function (a, b) { return (a.addr | 0) - (b.addr | 0); });
    for (var i = 0; i < list.length; i++) {
      var a = list[i].addr | 0;
      while (pos < a) { out.push(nopText); pos++; }
      out.push(hex2(list[i].code).toLowerCase().replace(/^/, '.'));
      pos++;
    }
    if (o.trim) {
      while (out.length && out[out.length - 1] === nopText) out.pop();
    }
    return out.join('\n');
  }

  /* Содержимое памяти без хвоста пустых шагов — то, что человек узнаёт
     как «свою программу», а не как 420 НОП. */
  function memCodes(flat) {
    if (!Array.isArray(flat)) return [];
    var n = flat.length;
    while (n > 0 && ((flat[n - 1] & 0xFF) === NOP)) n--;
    var out = [];
    for (var i = 0; i < n; i++) out.push(flat[i] & 0xFF);
    return out;
  }

  /* ---------- панель ---------- */

  var panel = null;
  var area = null;
  var stat = null;
  var addrIn = null;

  function mk(tag, cls, text) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (text != null) d.textContent = text;
    return d;
  }

  function core() {
    return (global.MKUI && typeof global.MKUI.getCore === 'function')
      ? global.MKUI.getCore() : null;
  }

  function info() {
    var c = core();
    if (global.MKAsmEditor && typeof global.MKAsmEditor.pageInfo === 'function') {
      try { return global.MKAsmEditor.pageInfo(c); } catch (e) {}
    }
    return { size: 105, pages: 4, len: DEFAULT_LEN };
  }

  function memFlat() {
    var c = core();
    if (!c || !c.ST || !Array.isArray(c.ST.prog)) return null;
    if (global.MKAsmEditor && typeof global.MKAsmEditor.toFlat === 'function') {
      try { return global.MKAsmEditor.toFlat(c.ST.prog); } catch (e) {}
    }
    return c.ST.prog.slice();
  }

  function hint(msg) {
    if (global.MKUI && typeof global.MKUI.hint === 'function') {
      try { global.MKUI.hint(msg); } catch (e) {}
    }
  }

  function toast(msg, kind) {
    if (global.MKUI && typeof global.MKUI.toast === 'function') {
      try { global.MKUI.toast(msg, kind || 'ok', 7000); } catch (e) {}
    }
  }

  function styleOnce() {
    if (document.getElementById('codesPanelStyle')) return;
    var s = document.createElement('style');
    s.id = 'codesPanelStyle';
    s.textContent = [
      '.codes-addr{display:flex;align-items:center;gap:8px;margin-top:6px;font-size:12px;opacity:.9}',
      '.codes-addr input{width:74px;box-sizing:border-box;padding:6px;border-radius:8px;',
      'border:1px solid rgba(127,127,127,.4);background:transparent;color:inherit;font-size:13px}',
      '.codes-stat{margin-top:8px;font-size:12px;opacity:.85}',
      '.codes-stat.ok{color:#1a8c4a}',
      '.codes-stat.err{color:#c0392b}'
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
    try { if (area) localStorage.setItem(TEXT_KEY, area.value); } catch (e) {}
  }

  function startAddr() {
    var v = addrIn ? parseInt(addrIn.value, 10) : 0;
    return (isFinite(v) && v >= 0) ? v : 0;
  }

  function showStat(text, kind) {
    if (!stat) return;
    stat.className = 'codes-stat' + (kind ? ' ' + kind : '');
    stat.textContent = text;
  }

  function parseNow() {
    var inf = info();
    return parseCodes(area ? area.value : '', { len: inf.len, start: startAddr() });
  }

  function describe(res) {
    if (!res.count) return res.errors.length ? 'Коды не разобраны' : 'Кодов нет';
    var first = res.cells[0].addr;
    var last = res.cells[res.cells.length - 1].addr;
    return 'Кодов ' + res.count + ' · адреса ' + first + '–' + last +
      (res.mode === 'pairs' ? ' · с адресами' : '');
  }

  function doMemory() {
    var res = parseNow();
    if (!res.count) {
      showStat('Нечего грузить: ' + (res.errors[0] || 'кодов нет'), 'err');
      hint('Коды не разобраны — память не тронута.');
      return res;
    }
    if (!res.ok) {
      showStat('Не гружу: ' + res.errors[0], 'err');
      hint('В кодах есть ошибка: ' + res.errors[0] + '. Память не тронута.');
      return res;
    }
    if (!global.MKUI || typeof global.MKUI.loadProgram !== 'function') {
      showStat('Нет доступа к памяти: MKUI.loadProgram не найден', 'err');
      return res;
    }

    var inf = info();
    var flat = buildFlat(res.cells, inf.len, memFlat());
    try {
      global.MKUI.loadProgram(flat, null, { title: 'Из кодов' });
    } catch (e) {
      showStat('Память не приняла: ' + ((e && e.message) ? e.message : 'ошибка'), 'err');
      return res;
    }
    showStat(describe(res) + ' · в памяти', 'ok');
    hint('Коды в памяти: ' + res.count + ' яч., адреса ' + res.cells[0].addr +
      '–' + res.cells[res.cells.length - 1].addr + '. Жми «Пуск».');
    return res;
  }

  function doAsmText() {
    var res = parseNow();
    if (!res.count) {
      showStat('Нечего переносить: ' + (res.errors[0] || 'кодов нет'), 'err');
      return res;
    }
    var ta = document.getElementById('asmSrc');
    if (!ta) {
      showStat('Поле ассемблера не найдено', 'err');
      return res;
    }
    ta.value = toAsmText(res.cells, { trim: false });
    try { ta.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
    showStat('Перенесено в текст ассемблера: ' + res.count + ' строк(и). Жми «Собрать и загрузить»', 'ok');
    hint('Коды развёрнуты в текст ассемблера. Проверь адреса и жми «Собрать и загрузить».');
    return res;
  }

  function doFromMemory() {
    var flat = memFlat();
    if (!flat) {
      showStat('Память недоступна — калькулятор ещё не создан', 'err');
      return;
    }
    var codes = memCodes(flat);
    if (!codes.length) {
      if (area) area.value = '';
      saveText();
      showStat('В памяти пусто (всё К НОП)', 'err');
      return;
    }
    var parts = [];
    for (var i = 0; i < codes.length; i++) parts.push(hex2(codes[i]));
    if (area) area.value = parts.join(' ');
    saveText();
    showStat('Взято из памяти: ' + codes.length + ' яч.', 'ok');
  }

  function mount() {
    if (panel && panel.parentNode) return true;
    if (document.getElementById('codesPanel')) return true;
    var host = document.getElementById('prog');
    if (!host || !host.parentNode) return false;

    styleOnce();

    panel = mk('div', 'asm-panel');
    panel.id = 'codesPanel';
    panel.appendChild(mk('h3', null, 'Коды МК: цифры → память'));

    area = document.createElement('textarea');
    area.id = 'codesSrc';
    area.spellcheck = false;
    area.placeholder = '62 63 11 64 13 50';
    area.addEventListener('input', saveText);
    panel.appendChild(area);

    var addrRow = mk('div', 'codes-addr');
    addrRow.appendChild(document.createTextNode('Начальный адрес'));
    addrIn = document.createElement('input');
    addrIn.type = 'number';
    addrIn.min = '0';
    addrIn.step = '1';
    addrIn.value = '0';
    addrIn.id = 'codesStart';
    addrRow.appendChild(addrIn);
    addrRow.appendChild(document.createTextNode('(для списка без адресов)'));
    panel.appendChild(addrRow);

    var row = mk('div', 'asm-row');

    var bMem = mk('button', 'main', 'В память');
    bMem.type = 'button';
    bMem.title = 'Разобрать коды и записать их в память калькулятора по адресам';
    bMem.addEventListener('click', function () { doMemory(); this.blur(); });
    row.appendChild(bMem);

    var bText = mk('button', null, 'В текст');
    bText.type = 'button';
    bText.title = 'Перенести коды в поле ассемблера строками .XX, чтобы можно было править';
    bText.addEventListener('click', function () { doAsmText(); this.blur(); });
    row.appendChild(bText);

    var bFrom = mk('button', null, 'Из памяти');
    bFrom.type = 'button';
    bFrom.title = 'Взять программу из памяти калькулятора и показать её кодами';
    bFrom.addEventListener('click', function () { doFromMemory(); this.blur(); });
    row.appendChild(bFrom);

    var bClear = mk('button', null, 'Очистить');
    bClear.type = 'button';
    bClear.title = 'Очистить только это поле; память останется как была';
    bClear.addEventListener('click', function () {
      if (area) area.value = '';
      saveText();
      showStat('Поле очищено. Память не тронута.', '');
      this.blur();
    });
    row.appendChild(bClear);

    panel.appendChild(row);

    panel.appendChild(mk('div', 'asm-tip',
      'Коды шестнадцатеричные: 62 63 11. С адресами: [62,0] или 62:0. ' +
      'Разделители любые. Комментарий: ;'));

    stat = mk('div', 'codes-stat');
    panel.appendChild(stat);

    host.parentNode.insertBefore(panel, host);
    loadText();
    return true;
  }

  /* Ждём панель ассемблера: она вставляет себя перед #prog, и наша
     панель должна встать уже ПОСЛЕ неё. Если ассемблера на странице
     нет — встаём перед #prog сами. */
  function auto() {
    var tries = 0;
    var t = setInterval(function () {
      tries++;
      var ready = document.getElementById('asmPanel') || document.getElementById('prog');
      if (ready && mount()) { clearInterval(t); return; }
      if (tries > 40) clearInterval(t);
    }, 100);
  }

  global.MKCodePanel = {
    hex2: hex2,
    stripComments: stripComments,
    tokens: tokens,
    num: num,
    parseCodes: parseCodes,
    buildFlat: buildFlat,
    toAsmText: toAsmText,
    memCodes: memCodes,
    mount: mount,
    NOP: NOP
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto);
    else auto();
  }
})(typeof window !== 'undefined' ? window : this);
