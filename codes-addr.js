/* =========================================================
   pmk61 / codes-addr.js  v3
   Разбор записи кодов, где адрес перехода записан ОДНИМ числом
   (как в журналах), хотя в памяти он занимает ДВЕ ячейки.

   ПОЧЕМУ ЭТО НУЖНО

   В «Науке и жизни» программа печатается так:

       08. FL0   09. 07

   Здесь 09 и 07 — не две команды, а десятки и единицы адреса 07
   для команды FL0. FL0 занимает ТРИ ячейки: 5E, 00, 07.

   Если набрать «5E 07», парсер честно прочитает два байта — и
   адрес съест следующую команду. Программа поедет на ячейку.

   ДВА РЕЖИМА (важно, иначе получается угадывание)

   fixAddr: true (по умолчанию) — ЖУРНАЛЬНЫЙ.
     После кода перехода РОВНО ОДИН токен считается адресом,
     записанным числом. Дальше идут обычные команды.

         «5E 03 01 02»  → 5E 00 03 01 02   адрес 03, затем 01, 02
         «5D 30»        → 5D 03 00         адрес 30
         «5D -3»        → 5D 0A 03         адрес -3
         «5D 0A 03»     → 5D 0A 03         полубайт с буквой

   fixAddr: false — СТРОГИЙ, прежнее поведение.
     Каждый байт сам по себе, адрес пишется двумя ячейками:
     «5D 00 03».

   ПОЧЕМУ НЕЛЬЗЯ СДЕЛАТЬ «УМНО»

   Запись «5D 03 01» неоднозначна по своей природе:
     • адрес 03, потом команда 01;
     • или адрес 31 (десятки 03, единицы 01).
   Никакой разборщик этого не различит — информации в тексте нет.
   Поэтому режим выбирает человек, а не догадка программы.

   ЧЕСТНОЕ ОГРАНИЧЕНИЕ

   Все развёрнутые адреса попадают в fixes, чтобы интерфейс показал
   их списком. Молча ничего не меняется.
   ========================================================= */
(function (global) {
  'use strict';

  /* Трёхбайтные команды — ровно те коды, по которым ядро считает
     переход (MKCore.isJumpCmd). Список короткий и явный; тест
     tests-addr.html покажет, если ядро поменяется. */
  var JUMP = [0x51, 0x53, 0x57, 0x58, 0x59, 0x5A, 0x5B, 0x5C, 0x5D, 0x5E];

  function isJump(code) {
    return JUMP.indexOf(code) >= 0;
  }

  function isByte(tok) {
    return /^[0-9A-Fa-f]{1,2}$/.test(tok);
  }

  function hasLetter(tok) {
    return /[A-Fa-f]/.test(tok);
  }

  function hex2(n) {
    n = (Number(n) | 0) & 0xFF;
    return (n < 16 ? '0' : '') + n.toString(16).toUpperCase();
  }

  function addrText(a, b) {
    if (a === 0x0A) return '-' + b;
    return hex2(a) + ' ' + hex2(b);
  }

  /* Журнальный адрес: ровно один токен как число.
     Исключение — токен с буквой («0A», «A3»): это уже готовый
     полубайт, и соседний числовой токен считается единицами. */
  function readAddr(toks, i) {
    var t = toks[i];
    if (!t) return null;

    var m = /^-(\d)$/.exec(t);
    if (m) {
      return { a: 0x0A, b: parseInt(m[1], 10), next: i + 1, expanded: false, raw: t };
    }

    if (isByte(t) && hasLetter(t)) {
      var a1 = parseInt(t, 16);
      var n2 = toks[i + 1];
      if (n2 && /^\d{1,2}$/.test(n2)) {
        return { a: a1, b: parseInt(n2, 10) % 10, next: i + 2, expanded: false, raw: t + ' ' + n2 };
      }
      return { a: a1, b: 0, next: i + 1, expanded: false, raw: t };
    }

    if (!/^\d{1,2}$/.test(t)) return null;

    var v = parseInt(t, 10);
    return { a: Math.floor(v / 10), b: v % 10, next: i + 1, expanded: true, raw: t };
  }

  /* parse(text, opts) →
     {
       bytes: [...],   байты для памяти калькулятора
       bad:   [...],   что не распознано (не HEX)
       fixes: [...],   развёрнутые адреса: {addr, raw, to}
       mode:  'journal' | 'strict'
     } */
  function parse(text, opts) {
    var o = opts || {};
    var fix = o.fixAddr !== false;
    var toks = String(text == null ? '' : text).trim().split(/[\s,;]+/);

    var out = [];
    var bad = [];
    var fixes = [];
    var i = 0;

    while (i < toks.length) {
      var t = toks[i];
      if (!t) { i++; continue; }

      var neg = /^-(\d)$/.exec(t);
      if (neg) {
        out.push(0x0A, parseInt(neg[1], 10));
        i++;
        continue;
      }

      if (!isByte(t)) {
        bad.push(t);
        i++;
        continue;
      }

      var code = parseInt(t, 16);
      var at = out.length;
      out.push(code);

      if (fix && isJump(code)) {
        var r = readAddr(toks, i + 1);
        if (r) {
          out.push(r.a, r.b);
          if (r.expanded) fixes.push({ addr: at, raw: r.raw, to: addrText(r.a, r.b) });
          i = r.next;
          continue;
        }
      }

      i++;
    }

    return { bytes: out, bad: bad, fixes: fixes, mode: fix ? 'journal' : 'strict' };
  }

  function textOf(bytes) {
    var parts = [];
    for (var i = 0; i < bytes.length; i++) parts.push(hex2(bytes[i]));
    return parts.join(' ');
  }

  global.MKCodeAddr = {
    parse: parse,
    textOf: textOf,
    readAddr: readAddr,
    isJump: isJump,
    JUMP: JUMP.slice(),
    hex2: hex2,
    addrText: addrText
  };
})(typeof window !== 'undefined' ? window : this);
