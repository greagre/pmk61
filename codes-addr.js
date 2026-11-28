/* =========================================================
   pmk61 / codes-addr.js  v1
   Разбор записи кодов, где адрес перехода может быть записан
   ОДНИМ числом (как в журналах), а в памяти занимает ДВЕ ячейки.

   ПОЧЕМУ ЭТО НУЖНО

   В «Науке и жизни» программа печатается так:

       08. FL0   09. 07

   Здесь 09 и 07 — не две команды, а десятки и единицы адреса 07
   для команды FL0. То есть FL0 занимает ТРИ ячейки: 5E, 00, 07.

   Если набрать в панели «5E 07», парсер честно прочитает два
   байта — и адрес съест следующую команду. Программа поедет на
   ячейку, и найти ошибку глазами почти невозможно.

   ЭТОТ МОДУЛЬ читает текст как ТОКЕНЫ (по пробелам), а не как
   сплошную ленту HEX, поэтому видит границу между «03» одним
   числом и «00 03» двумя полубайтами.

   ПРАВИЛО РАЗБОРА АДРЕСА после кода перехода:

     «5D 03»     → 5D 00 03   адрес одним числом, развернуть
     «5D 00 03»  → 5D 00 03   уже разложен, не трогать
     «5D 30»     → 5D 03 00   адрес больше 9, развернуть
     «5D -3»     → 5D 0A 03   адрес «-3» — это A3
     «5D 0A 03»  → 5D 0A 03   полубайт с буквой, не трогать

   ЧЕСТНОЕ ОГРАНИЧЕНИЕ

   Запись «5D 03 01» неоднозначна по своей природе: это может быть
   адрес 03 и команда 01, а может — адрес 31. Модуль выбирает
   второй вариант (два маленьких байта = десятки и единицы) и НЕ
   угадывает молча: все развёрнутые адреса возвращаются в fixes,
   чтобы интерфейс показал их человеку.
   ========================================================= */
(function (global) {
  'use strict';

  /* Трёхбайтные команды. Ровно те коды, по которым ядро считает
     переход (MKCore.isJumpCmd). Список намеренно короткий и явный:
     если ядро поменяется, тест tests-addr.html это покажет. */
  var JUMP = [0x51, 0x53, 0x57, 0x58, 0x59, 0x5A, 0x5B, 0x5C, 0x5D, 0x5E];

  function isJump(code) {
    return JUMP.indexOf(code) >= 0;
  }

  function isByte(tok) {
    return /^[0-9A-Fa-f]{1,2}$/.test(tok);
  }

  function isDigit(tok) {
    return /^\d$/.test(tok);
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
    return String(a) + String(b);
  }

  /* Читает адрес начиная с toks[i].
     Возвращает {a, b, next, expanded, raw} или null. */
  function readAddr(toks, i) {
    var t = toks[i];
    if (!t) return null;

    var m = /^-(\d)$/.exec(t);
    if (m) {
      return { a: 0x0A, b: parseInt(m[1], 10), next: i + 1, expanded: false, raw: t };
    }

    if (isByte(t) && hasLetter(t)) {
      var a1 = parseInt(t, 16);
      var t2 = toks[i + 1];
      if (t2 && isDigit(t2)) {
        return { a: a1, b: parseInt(t2, 10), next: i + 2, expanded: false, raw: t + ' ' + t2 };
      }
      return { a: a1, b: 0, next: i + 1, expanded: false, raw: t };
    }

    if (!/^\d{1,2}$/.test(t)) return null;

    var v = parseInt(t, 10);
    var n2 = toks[i + 1];
    var v2 = (n2 && isDigit(n2)) ? parseInt(n2, 10) : null;

    /* Два маленьких байта подряд — это уже десятки и единицы. */
    if (v <= 9 && v2 !== null) {
      return { a: v, b: v2, next: i + 2, expanded: false, raw: t + ' ' + n2 };
    }

    if (v > 9) {
      return { a: Math.floor(v / 10), b: v % 10, next: i + 1, expanded: true, raw: t };
    }

    return { a: 0, b: v, next: i + 1, expanded: true, raw: t };
  }

  /* parse(text, opts) →
     {
       bytes: [...],   байты для памяти калькулятора
       bad:   [...],   что не распознано (не HEX)
       fixes: [...],   какие адреса развёрнуты: {addr, raw, to}
     }
     opts.fixAddr === false — не разворачивать адреса (старое поведение). */
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
          if (r.expanded) {
            fixes.push({ addr: at, raw: r.raw, to: addrText(r.a, r.b) });
          }
          i = r.next;
          continue;
        }
      }

      i++;
    }

    return { bytes: out, bad: bad, fixes: fixes };
  }

  /* Массив байтов → строка «5D 00 03» (для показа и тестов). */
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
