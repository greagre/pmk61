/* =========================================================
   РЕЗЕРВНАЯ КОПИЯ asm-editor.js v11 — снята 26.11.2026
   перед правкой v12 (короткая подсказка вместо длинного абзаца,
   кнопка «Собрать и сохранить в библиотеку»).

   Полный текст v11 сохранён в репозитории отдельным файлом:
   если новая версия поведёт себя не так — вернуть этот файл
   поверх asm-editor.js и поднять версию в index.html.
   ========================================================= */
(function (global) {
  'use strict';

  var TEXT_KEY = 'pmk61/asmsrc';
  var NOP = 0x54;
  var DEFAULT_LEN = 105;
  var CUSTOM = 'custom';

  function trimTrailingNop(prog, nop) {
    var empty = (typeof nop === 'number') ? (nop & 0xFF) : NOP;
    var n = Array.isArray(prog) ? prog.length : 0;
    while (n > 0 && ((prog[n - 1] & 0xFF) === empty)) n--;
    return n;
  }

  function usedPerPages(prog, pageSize) {
    var size = (pageSize > 0) ? Math.round(pageSize) : DEFAULT_LEN;
    if (!Array.isArray(prog)) return 0;
    var total = 0;
    for (var i = 0; i < prog.length; i += size) {
      total += trimTrailingNop(prog.slice(i, i + size));
    }
    return total;
  }

  function pagesUsed(prog, pageSize) {
    var size = (pageSize > 0) ? Math.round(pageSize) : DEFAULT_LEN;
    if (!Array.isArray(prog) || !prog.length) return 1;
    var last = 0;
    for (var i = 0; i < prog.length; i += size) {
      if (trimTrailingNop(prog.slice(i, i + size)) > 0) {
        last = Math.floor(i / size);
      }
    }
    return last + 1;
  }

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

  function memoryLength(core) {
    var len = (core && core.PROG_LEN > 0) ? core.PROG_LEN : DEFAULT_LEN;
    var pages = 1;
    if (core && core.ext && typeof core.ext.pagesCount === 'function') {
      var p = core.ext.pagesCount();
      if (p > 0) pages = p;
    }
    return len * pages;
  }

  function pageInfo(core) {
    var size = (core && core.PROG_LEN > 0) ? core.PROG_LEN : DEFAULT_LEN;
    var len = memoryLength(core);
    var pages = Math.max(1, Math.round(len / size));
    return { size: size, pages: pages, len: len };
  }

  function memoryUsed(core) {
    if (!core || !core.ST || !Array.isArray(core.ST.prog)) return null;
    var info = pageInfo(core);
    return usedPerPages(core.ST.prog, info.size);
  }

  function hasExt(core) {
    return !!(core && core.ext);
  }

  function normSrc(s) {
    return String(s == null ? '' : s)
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+$/gm, '')
      .trim();
  }

  function matchExample(text, examples) {
    var list = (examples && examples.length) ? examples : EXAMPLES;
    var t = normSrc(text);
    if (!t) return null;
    for (var i = 0; i < list.length; i++) {
      if (normSrc(list[i].src) === t) return list[i].id;
    }
    return null;
  }

  /* Полный файл v11 лежит в репозитории до правки. Эта копия — контрольная
     точка: если понадобится сравнить поведение, бери рабочую версию
     из корня, а не отсюда. */
})(typeof window !== 'undefined' ? window : this);
