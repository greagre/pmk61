/* =========================================================
   pmk61 / codes-panel.js  (v3, 27.11.2026)

   ПАНЕЛЬ «КОДЫ МК» — вставка программы кодами и нажатиями

   ЗАЧЕМ

   Чужой листинг из журнала записан кодами: «62 63 11 64 13 50».
   А человек, набирающий программу на калькуляторе, думает нажатиями:
   «П→X2 П→X3 − П→X4 ÷ С/П». Это одно и то же, и панель понимает оба
   языка — а рядом показывает таблицу «адрес · код · нажатие», чтобы
   соответствие было видно, а не угадывалось.

   ЧТО НОВОГО В v3

     • Многоразрядные числа. В режиме нажатий токен из одних цифр —
       это ЧИСЛО, а не код: «1234» разворачивается в 01 02 03 04,
       «3.14» — в 03 0A 01 04, «0,5» — в 00 0A 05. Раньше двузначный
       токен молча становился кодом: «10» превращалось в «+» (0x10),
       и программа считала не то.
     • Код в режиме нажатий пишется явно: 0x62 или #62. Так можно
       смешивать коды и команды без догадок.
     • Чисто числовой текст (ни букв, ни знаков операций) по-прежнему
       читается КАК КОДЫ: вставка «62 63 11 64 13 50» из журнала
       работает как раньше.
     • Надпись после «В память» больше не теряется: статус ставится
       ДО загрузки, потом повторяется на следующем такте, дублируется
       подсказкой внизу, а любая ошибка показывается текстом.
     • «Из памяти» переключает режим на «коды», «Нажатиями» — на
       «нажатия»: обратная загрузка не превращает коды в цифры.

   ЧТО БЫЛО В v2

     • режим «нажатия»: текст разбирается по именам команд ядра
       (MKCore.cmdName) — 256 кодов, обратная таблица строится на месте;
     • склейка токенов: «П→X 2», «К 1», «С / П» понимаются как одна
       команда, хотя написаны с пробелами;
     • таблица соответствия под полем: адрес, код, нажатие;
     • переключатель режима: авто / коды / нажатия (в авто режим
       определяется по тексту).

   ГДЕ ЖИВЁТ

   Вставляется ПЕРЕД #prog и ждёт появления #asmPanel, чтобы встать
   ровно ПОД панелью ассемблера. Внутрь #prog не лезем: renderProgram()
   из ui.js чистит его через innerHTML = '', и всё положенное внутрь
   исчезло бы при первой перерисовке. Тот же приём, что у asm-editor.js.

   ПРАВИЛА РАЗБОРА (режим «нажатия»)

     «8»      → одна цифра 08
     «1234»   → 01 02 03 04 (число, разряды по одному)
     «3.14»   → 03 0A 01 04 (0A — десятичная точка)
     «0x62»   → код 62 (x→П 2)
     «#62»    → то же самое
     «.54»    → код 54 (К НОП, как пишет «В текст»)
     «П→X2»   → по словарю имён ядра

   ЧИСТАЯ ЧАСТЬ

   hex2, stripComments, tokens, num, dotCode, expandNumber,
   parseCodes, buildFlat, toAsmText, memCodes, normalizeName,
   detectMode, parseKeys, parseMixed
   не трогают DOM и проверяются codes-test.html и codes-keys-test.html.
   ========================================================= */
(function (global) {
  'use strict';

  var TEXT_KEY = 'pmk61/codesrc';
  var MODE_KEY = 'pmk61/codesmode';
  var NOP = 0x54;
  var DEFAULT_LEN = 420;
  var nameCache = null;
  var dotCache;

  /* ---------- чистая часть (проверяется страницами тестов) ---------- */

  function hex2(n) {
    var s = (n & 0xFF).toString(16).toUpperCase();
    return s.length < 2 ? '0' + s : s;
  }

  function stripComments(src) {
    return String(src == null ? '' : src)
      .replace(/;.*$/gm, ' ')
      .replace(/#.*$/gm, ' ')
      .replace(/\/\/.*$/gm, ' ');
  }

  function tokens(src) {
    var out = [];
    var re = /0x[0-9a-f]+|[0-9a-f]+/gi;
    var m;
    while ((m = re.exec(String(src))) !== null) out.push(m[0]);
    return out;
  }

  function num(tok) {
    var t = String(tok).toLowerCase();
    var v = (t.indexOf('0x') === 0) ? parseInt(t.slice(2), 16) : parseInt(t, 16);
    return isFinite(v) ? v : NaN;
  }

  /* Код десятичной точки. Берём у ядра, чтобы не разойтись с ним:
     где-то это «•», где-то «.». Если имени не нашлось — 0x0A, как
     в линии МК-61: 00…09 цифры, 0A точка. */
  function dotCode() {
    if (dotCache !== undefined) return dotCache;
    dotCache = -1;
    var MK = global.MKCore;
    if (MK && typeof MK.cmdName === 'function') {
      for (var c = 0; c < 256; c++) {
        var nm = '';
        try { nm = String(MK.cmdName(c) || '').trim(); } catch (e) { nm = ''; }
        if (nm === '.' || nm === '•' || nm === ',') { dotCache = c; break; }
      }
    }
    if (dotCache < 0) dotCache = 0x0A;
    return dotCache;
  }

  /* Число → последовательность цифровых команд.
     «1234» → [1,2,3,4]; «3.14» → [3, 0x0A, 1, 4]; «0,5» → [0, 0x0A, 5].
     Возвращает null, если токен не похож на число. */
  function expandNumber(tok) {
    var t = String(tok == null ? '' : tok);
    if (!/^(\d+([.,]\d*)?|[.,]\d+)$/.test(t)) return null;
    var out = [];
    for (var i = 0; i < t.length; i++) {
      var ch = t.charAt(i);
      if (ch >= '0' && ch <= '9') out.push(ch.charCodeAt(0) - 48);
      else if (ch === '.' || ch === ',') out.push(dotCode());
    }
    return out.length ? out : null;
  }

  /* Латинские буквы, похожие на русские: человек пишет «Пx2» или «PX2»,
     а ядро печатает «П→X2». Приводим обе стороны к одному виду. */
  var LIKELY = {
    p: 'п', x: 'х', c: 'с', b: 'в', k: 'к', a: 'а',
    e: 'е', o: 'о', t: 'т', m: 'м', h: 'н', y: 'у'
  };

  /* Имя команды → вид, пригодный для сравнения: без пробелов,
     с едиными стрелкой и знаками операций. */
  function normalizeName(s) {
    var t = String(s == null ? '' : s).toLowerCase();
    t = t.replace(/->|=>|—>|–>/g, '→');
    t = t.replace(/\*/g, '×');
    t = t.replace(/\//g, '÷');
    t = t.replace(/[−–—-]/g, '−');
    t = t.replace(/[pxcbkaeotmhy]/g, function (ch) { return LIKELY[ch] || ch; });
    t = t.replace(/\s+/g, '');
    t = t.replace(/\./g, '');
    return t;
  }

  /* Обратная таблица «имя → код» из самого ядра: один источник истины
     с декодером и подсказками. Строится один раз, потом кэш. */
  function nameIndex(force) {
    if (nameCache && !force) return nameCache;
    var map = {};
    var MK = global.MKCore;
    if (MK && typeof MK.cmdName === 'function') {
      for (var c = 0; c < 256; c++) {
        var nm = null;
        try { nm = MK.cmdName(c); } catch (e) { nm = null; }
        if (!nm) continue;
        var k = normalizeName(nm);
        if (!k) continue;
        if (map[k] === undefined) map[k] = c;
      }
    }
    nameCache = map;
    return map;
  }

  /* Режим по тексту: буквы или знаки операций — значит нажатия.
     Комментарии вырезаются заранее, иначе «это П→X2» включило бы режим. */
  function detectMode(text) {
    var raw = stripComments(text);
    if (/[a-zа-яё]/i.test(raw)) return 'keys';
    if (/[+×÷↑→^*√−]/.test(raw)) return 'keys';
    return 'codes';
  }

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

  /* Разбор НАЖАТИЙ: «П→X2 П→X3 − П→X4 ÷ С/П».

     Токены режутся по пробелам и запятым, затем склеиваются обратно:
     «П→X 2» — два токена, а команда одна. Пробуем склейки до трёх
     токенов, потому что «К x≠0 7» тоже пишут с пробелами.

     Числа и коды различаются так:
       • в тексте есть команды (буквы/знаки) — цифровые токены это
         ЧИСЛА и разворачиваются по разрядам, а код пишется 0x62/#62;
       • текст из одних hex-пар — это КОДЫ, как в журнале. */
  function parseKeys(text, opts) {
    var o = opts || {};
    var len = (o.len > 0) ? Math.round(o.len) : DEFAULT_LEN;
    var start = (typeof o.start === 'number' && o.start >= 0 && isFinite(o.start))
      ? Math.round(o.start) : 0;
    var raw = stripComments(text);
    /* «3,14» — десятичное число, а не два: запятая между цифрами
       становится точкой, разделителем остаётся запятая с пробелом. */
    raw = String(raw).replace(/(\d),(\d)/g, '$1.$2');
    var parts = String(raw).split(/[\s,]+/).filter(function (t) { return t.length > 0; });
    var hasWord = /[a-zа-яё]/i.test(raw) || /[+×÷↑→^*√−]/.test(raw);
    var map = nameIndex();
    var res = { ok: true, errors: [], cells: [], count: 0, len: len, mode: 'keys', numbers: hasWord };
    var addr = start;
    var i = 0;

    while (i < parts.length) {
      var hit = null;
      var used = 0;

      for (var take = 3; take >= 1; take--) {
        if (i + take > parts.length) continue;
        var joined = parts.slice(i, i + take).join('');
        var key = normalizeName(joined);
        if (key && map[key] !== undefined) {
          hit = { code: map[key], text: joined };
          used = take;
          break;
        }
      }

      var tok = parts[i];
      var bare = String(tok).replace(/^\./, '');

      if (!hit) {
        if (/^\.[0-9a-f]{1,2}$/i.test(tok)) {
          /* «.54» — так пишет кнопка «В текст»: код без догадок */
          hit = { code: num(tok.slice(1)), text: tok };
          used = 1;
        } else if (/^(0x|#)/i.test(tok)) {
          /* «0x62» или «#62» — явный код даже в режиме нажатий */
          var cv = num(tok.replace(/^#/, '0x'));
          if (cv >= 0 && cv <= 255) {
            hit = { code: cv, text: tok };
            used = 1;
          } else {
            res.errors.push('«' + tok + '» не код: нужно 0x00–0xFF');
            i += 1;
            continue;
          }
        } else if (hasWord) {
          /* В тексте есть команды — значит цифры это ЧИСЛО. */
          var nums = expandNumber(bare);
          if (nums) {
            if (addr + nums.length > len) {
              res.errors.push('число «' + tok + '» не влезает: нужно ' + nums.length +
                ' ячеек, а до конца памяти ' + (len - addr));
            } else {
              for (var q = 0; q < nums.length; q++) {
                res.cells.push({ code: nums[q], addr: addr + q, text: 'цифра' });
              }
              addr += nums.length;
            }
            i += 1;
            continue;
          }
        } else if (/^[0-9a-f]{1,2}$/i.test(bare)) {
          hit = { code: num(bare), text: tok };
          used = 1;
        }
      }

      if (!hit) {
        res.errors.push('не знаю команду «' + parts[i] + '»');
        i += 1;
        continue;
      }

      if (hit.code >= 0 && hit.code <= 255) {
        if (addr >= len) {
          res.errors.push('адрес ' + addr + ' вне 00–' + (len - 1) + ' — не влезает');
        } else {
          res.cells.push({ code: hit.code, addr: addr, text: hit.text });
          addr += 1;
        }
      } else {
        res.errors.push('«' + hit.text + '» не код');
      }
      i += used;
    }

    res.count = res.cells.length;
    res.ok = res.errors.length === 0 && res.count > 0;
    if (!res.count && !res.errors.length) res.errors.push('команд не нашлось');
    return res;
  }

  /* Одна дверь для панели: режим авто выбирается по тексту. */
  function parseMixed(text, opts) {
    var o = opts || {};
    var mode = o.mode || 'auto';
    if (mode === 'auto') mode = detectMode(text);
    var res = (mode === 'keys') ? parseKeys(text, o) : parseCodes(text, o);
    res.chosen = mode;
    return res;
  }

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
      out.push('.' + hex2(list[i].code).toLowerCase());
      pos++;
    }
    if (o.trim) {
      while (out.length && out[out.length - 1] === nopText) out.pop();
    }
    return out.join('\n');
  }

  function memCodes(flat) {
    if (!Array.isArray(flat)) return [];
    var n = flat.length;
    while (n > 0 && ((flat[n - 1] & 0xFF) === NOP)) n--;
    var out = [];
    for (var i = 0; i < n; i++) out.push(flat[i] & 0xFF);
    return out;
  }

  /* Строки «адрес · код · нажатие» для таблицы под полем.
     Группировку делает декодер: переходы у него три ячейки, F0 — две,
     поэтому таблица совпадает с листингом, а не разъезжается. */
  function previewRows(cells, len, base, limit) {
    var lim = (limit > 0) ? limit : 60;
    var flat = buildFlat(cells, len, base);
    var out = [];
    var MK = global.MKDasm;

    if (MK && typeof MK.rows === 'function') {
      var rows = [];
      try { rows = MK.rows(flat, { length: len }) || []; } catch (e) { rows = []; }
      for (var i = 0; i < rows.length && out.length < lim; i++) {
        var r = rows[i];
        if (!r || r.empty) continue;
        out.push({
          addr: r.addr,
          code: r.code || hex2(r.bytes[0]),
          text: r.text || '',
          size: r.len || 1
        });
      }
      return out;
    }

    var MK2 = global.MKCore;
    var n = (len > 0) ? Math.round(len) : DEFAULT_LEN;
    for (var a = 0; a < n && out.length < lim; a++) {
      var code = flat[a] & 0xFF;
      if (code === NOP) continue;
      var nm = '';
      if (MK2 && typeof MK2.cmdName === 'function') {
        try { nm = MK2.cmdName(code) || ''; } catch (e) { nm = ''; }
      }
      out.push({ addr: a, code: hex2(code), text: nm, size: 1 });
    }
    return out;
  }

  /* ---------- панель ---------- */

  var panel = null;
  var area = null;
  var stat = null;
  var addrIn = null;
  var modeSel = null;
  var listBox = null;

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
      '.codes-addr{display:flex;align-items:center;gap:8px;margin-top:6px;font-size:12px;opacity:.9;flex-wrap:wrap}',
      '.codes-addr input,.codes-addr select{box-sizing:border-box;padding:6px;border-radius:8px;',
      'border:1px solid rgba(127,127,127,.4);background:transparent;color:inherit;font-size:13px}',
      '.codes-addr input{width:74px}',
      '.codes-stat{margin-top:8px;font-size:12px;opacity:.85}',
      '.codes-stat.ok{color:#1a8c4a}',
      '.codes-stat.err{color:#c0392b}',
      '.codes-list{margin-top:8px;padding:8px 10px;border-radius:10px;',
      'background:rgba(127,127,127,.10);font-family:ui-monospace,Menlo,Consolas,monospace;',
      'font-size:12px;line-height:1.5;max-height:260px;overflow:auto;white-space:pre}',
      '.codes-list .ca{opacity:.6}',
      '.codes-list .cc{display:inline-block;min-width:3.2em}'
    ].join('');
    document.head.appendChild(s);
  }

  function loadText() {
    try {
      var t = localStorage.getItem(TEXT_KEY);
      if (t && area) area.value = t;
      var m = localStorage.getItem(MODE_KEY);
      if (m && modeSel && (m === 'auto' || m === 'codes' || m === 'keys')) modeSel.value = m;
    } catch (e) { /* приватный режим — просто пустое поле */ }
  }

  function saveText() {
    try { if (area) localStorage.setItem(TEXT_KEY, area.value); } catch (e) {}
  }

  function saveMode() {
    try { if (modeSel) localStorage.setItem(MODE_KEY, modeSel.value); } catch (e) {}
  }

  function startAddr() {
    var v = addrIn ? parseInt(addrIn.value, 10) : 0;
    return (isFinite(v) && v >= 0) ? v : 0;
  }

  function chosenMode() {
    return modeSel ? modeSel.value : 'auto';
  }

  function setModeSel(value) {
    if (!modeSel) return;
    if (modeSel.value === value) return;
    modeSel.value = value;
    saveMode();
  }

  function showStat(text, kind) {
    if (!stat) return;
    stat.className = 'codes-stat' + (kind ? ' ' + kind : '');
    stat.textContent = text;
  }

  function parseNow() {
    var inf = info();
    return parseMixed(area ? area.value : '', {
      len: inf.len,
      start: startAddr(),
      mode: chosenMode()
    });
  }

  function describe(res) {
    var word = (res.chosen === 'keys') ? 'нажатий' : 'кодов';
    if (!res.count) return res.errors.length ? 'Не разобрано' : 'Пусто';
    var first = res.cells[0].addr;
    var last = res.cells[res.cells.length - 1].addr;
    return word.charAt(0).toUpperCase() + word.slice(1) + ' ' + res.count +
      ' · адреса ' + first + '–' + last +
      (res.mode === 'pairs' ? ' · с адресами' : '');
  }

  /* Таблица соответствия: код и нажатие в одной строке. */
  function paintList(res) {
    if (!listBox) return;
    listBox.textContent = '';
    if (!res || !res.count) {
      listBox.hidden = true;
      return;
    }
    var inf = info();
    var rows = previewRows(res.cells, inf.len, memFlat(), 60);
    if (!rows.length) {
      listBox.hidden = true;
      return;
    }
    var lines = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var a = r.addr < 10 ? '0' + r.addr : String(r.addr);
      lines.push(a + '  ' + r.code + (r.code.length < 5 ? '    ' : ' ') + r.text);
    }
    if (rows.length >= 60) lines.push('…');
    listBox.textContent = lines.join('\n');
    listBox.hidden = false;
  }

  function doParse() {
    var res = parseNow();
    paintList(res);
    if (!res.count) {
      showStat('Не разобрано: ' + (res.errors[0] || 'пусто'), 'err');
      return res;
    }
    var extra = res.errors.length ? ' · замечаний ' + res.errors.length : '';
    showStat(describe(res) + extra +
      (res.chosen === 'keys' ? ' · режим нажатий' : ' · режим кодов'),
      res.errors.length ? 'err' : 'ok');
    return res;
  }

  function doMemory() {
    try {
      showStat('Гружу в память…', '');
      var res = parseNow();
      paintList(res);
      if (!res.count) {
        showStat('Нечего грузить: ' + (res.errors[0] || 'пусто'), 'err');
        hint('Не разобрано — память не тронута.');
        return res;
      }
      if (!res.ok) {
        showStat('Не гружу: ' + res.errors[0], 'err');
        hint('В программе есть ошибка: ' + res.errors[0] + '. Память не тронута.');
        return res;
      }
      if (!global.MKUI || typeof global.MKUI.loadProgram !== 'function') {
        showStat('Нет доступа к памяти: MKUI.loadProgram не найден', 'err');
        hint('Мост MKUI.loadProgram не найден. Обнови страницу.');
        return res;
      }

      var inf = info();
      var flat = buildFlat(res.cells, inf.len, memFlat());
      global.MKUI.loadProgram(flat, null, {
        title: res.chosen === 'keys' ? 'Из нажатий' : 'Из кодов'
      });

      var msg = describe(res) + ' · в памяти';
      showStat(msg, 'ok');
      /* Калькулятор перерисовывается внутри loadProgram. Если панель
         пересоберётся, повторим надпись на следующем такте — она
         не должна пропадать из-за чужой отрисовки. */
      setTimeout(function () { showStat(msg, 'ok'); }, 0);
      hint('Загружено: ' + res.count + ' яч., адреса ' + res.cells[0].addr +
        '–' + res.cells[res.cells.length - 1].addr + '. Счётчик на 00 — жми «Пуск».');
      toast(msg, 'ok');
      return res;
    } catch (e) {
      showStat('Сбой панели: ' + ((e && e.message) ? e.message : String(e)), 'err');
      return null;
    }
  }

  function doAsmText() {
    var res = parseNow();
    paintList(res);
    if (!res.count) {
      showStat('Нечего переносить: ' + (res.errors[0] || 'пусто'), 'err');
      return res;
    }
    var ta = document.getElementById('asmSrc');
    if (!ta) {
      showStat('Поле ассемблера не найдено', 'err');
      return res;
    }
    ta.value = toAsmText(res.cells, { trim: false });
    try { ta.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
    showStat('Перенесено в текст ассемблера: ' + res.count + ' строк. Жми «Собрать и загрузить»', 'ok');
    hint('Развёрнуто в текст ассемблера. Проверь адреса и жми «Собрать и загрузить».');
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
      paintList(null);
      showStat('В памяти пусто (всё К НОП)', 'err');
      return;
    }
    var parts = [];
    var cells = [];
    for (var i = 0; i < codes.length; i++) {
      parts.push(hex2(codes[i]));
      cells.push({ code: codes[i], addr: i });
    }
    /* Панель отдаёт КОДЫ — и режим переводим в «коды», иначе повторное
       «В память» прочитало бы «62» как число 6 и 2. */
    setModeSel('codes');
    if (area) area.value = parts.join(' ');
    saveText();
    paintList({ cells: cells, count: cells.length, chosen: 'codes' });
    showStat('Взято из памяти: ' + codes.length + ' яч. · кодами', 'ok');
  }

  /* Показать память нажатиями — то, что человек набирал бы руками. */
  function doFromMemoryKeys() {
    var flat = memFlat();
    if (!flat) {
      showStat('Память недоступна — калькулятор ещё не создан', 'err');
      return;
    }
    var codes = memCodes(flat);
    if (!codes.length) {
      showStat('В памяти пусто (всё К НОП)', 'err');
      return;
    }
    var MK = global.MKCore;
    var words = [];
    var cells = [];
    for (var i = 0; i < codes.length; i++) {
      var c = codes[i];
      var nm = '';
      if (MK && typeof MK.cmdName === 'function') {
        try { nm = MK.cmdName(c) || ''; } catch (e) { nm = ''; }
      }
      if (!nm || normalizeName(nm) === '') nm = '0x' + hex2(c);
      words.push(nm);
      cells.push({ code: c, addr: i });
    }
    setModeSel('keys');
    if (area) area.value = words.join(' ');
    saveText();
    paintList({ cells: cells, count: cells.length, chosen: 'keys' });
    showStat('Взято из памяти: ' + codes.length + ' яч. · нажатиями', 'ok');
    hint('Программа показана нажатиями. Жми «В память», чтобы положить её обратно.');
  }

  function mount() {
    if (panel && panel.parentNode) return true;
    if (document.getElementById('codesPanel')) return true;
    var host = document.getElementById('prog');
    if (!host || !host.parentNode) return false;

    styleOnce();

    panel = mk('div', 'asm-panel');
    panel.id = 'codesPanel';
    panel.appendChild(mk('h3', null, 'Коды и нажатия: текст → память'));

    area = document.createElement('textarea');
    area.id = 'codesSrc';
    area.spellcheck = false;
    area.placeholder = '62 63 11 64 13 50\nили: П→X2 П→X3 − П→X4 ÷ С/П\nили числом: 1234 X→П2 С/П';
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

    addrRow.appendChild(document.createTextNode('Режим'));
    modeSel = document.createElement('select');
    modeSel.id = 'codesMode';
    modeSel.title = 'Как читать текст: коды 00–FF, нажатия на клавиши или определить по тексту';
    var optAuto = mk('option', null, 'авто');
    optAuto.value = 'auto';
    var optCodes = mk('option', null, 'коды');
    optCodes.value = 'codes';
    var optKeys = mk('option', null, 'нажатия');
    optKeys.value = 'keys';
    modeSel.appendChild(optAuto);
    modeSel.appendChild(optCodes);
    modeSel.appendChild(optKeys);
    modeSel.addEventListener('change', function () { saveMode(); doParse(); });
    addrRow.appendChild(modeSel);
    panel.appendChild(addrRow);

    var row = mk('div', 'asm-row');

    var bParse = mk('button', null, 'Разобрать');
    bParse.type = 'button';
    bParse.title = 'Показать таблицу «адрес · код · нажатие», не трогая память';
    bParse.addEventListener('click', function () { doParse(); this.blur(); });
    row.appendChild(bParse);

    var bMem = mk('button', null, 'В память');
    bMem.type = 'button';
    bMem.title = 'Записать программу в память калькулятора по адресам';
    bMem.addEventListener('click', function () { doMemory(); this.blur(); });
    row.appendChild(bMem);

    var bText = mk('button', null, 'В текст');
    bText.type = 'button';
    bText.title = 'Перенести программу в поле ассемблера строками .XX, чтобы можно было править';
    bText.addEventListener('click', function () { doAsmText(); this.blur(); });
    row.appendChild(bText);

    var bFrom = mk('button', null, 'Из памяти');
    bFrom.type = 'button';
    bFrom.title = 'Взять программу из памяти калькулятора и показать её кодами';
    bFrom.addEventListener('click', function () { doFromMemory(); this.blur(); });
    row.appendChild(bFrom);

    var bKeys = mk('button', null, 'Нажатиями');
    bKeys.type = 'button';
    bKeys.title = 'Показать программу из памяти так, как её набирают на клавишах';
    bKeys.addEventListener('click', function () { doFromMemoryKeys(); this.blur(); });
    row.appendChild(bKeys);

    var bClear = mk('button', null, 'Очистить');
    bClear.type = 'button';
    bClear.title = 'Очистить только это поле; память останется как была';
    bClear.addEventListener('click', function () {
      if (area) area.value = '';
      saveText();
      paintList(null);
      showStat('Поле очищено. Память не тронута.', '');
      this.blur();
    });
    row.appendChild(bClear);

    panel.appendChild(row);

    panel.appendChild(mk('div', 'asm-tip',
      'Коды: 62 63 11. Нажатия: П→X2 П→X3 − С/П. Числа: 10 → 1 и 0, ' +
      '1234 → 1 2 3 4, 3.14 → 3 ⋅ 1 4. Код среди нажатий: 0x62 или #62. ' +
      'Адреса: [62,0] или 62:0. Комментарий: ;'));

    listBox = mk('pre', 'codes-list');
    listBox.id = 'codesList';
    listBox.hidden = true;
    panel.appendChild(listBox);

    stat = mk('div', 'codes-stat');
    panel.appendChild(stat);

    host.parentNode.insertBefore(panel, host);
    loadText();

    /* Если в поле уже что-то есть — сразу показать разбор. */
    if (area && area.value.trim()) {
      try { doParse(); } catch (e) {}
    }
    return true;
  }

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
    dotCode: dotCode,
    expandNumber: expandNumber,
    parseCodes: parseCodes,
    parseKeys: parseKeys,
    parseMixed: parseMixed,
    normalizeName: normalizeName,
    detectMode: detectMode,
    nameIndex: nameIndex,
    previewRows: previewRows,
    buildFlat: buildFlat,
    toAsmText: toAsmText,
    memCodes: memCodes,
    mount: mount,
    resetNames: function () { nameCache = null; dotCache = undefined; },
    NOP: NOP
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto);
    else auto();
  }
})(typeof window !== 'undefined' ? window : this);
