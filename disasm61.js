/* =========================================================
   pmk61 / disasm61.js
   Декодер листинга: массив шагов программы → строки для экрана.

   ЗАЧЕМ ОТДЕЛЬНЫЙ ФАЙЛ

   ui.js уже умеет показывать листинг, но про префикс 0xF0 он не знает:
   для него любая ячейка — одна команда. Из-за этого двухбайтные команды
   расширения разъезжаются: второй байт показывается как самостоятельная
   команда, а все адреса после него сдвигаются на единицу.

   Декодер решает только эту задачу и ничего не исполняет. Ему не нужен
   ни DOM, ни ext61.js: если расширения на странице нет, F0 всё равно
   остаётся двухбайтной строкой, просто без человеческого названия.

   ГЛАВНОЕ ПРАВИЛО

   Размер строки определяется ПЕРВЫМ байтом:
     0xF0            → 2 ячейки (префикс + второй байт)
     всё остальное   → 1 ячейка
   Адрес следующей строки = адрес текущей + размер. Поэтому нумерация
   никогда не сдвигается и команда не может «разорваться».

   ХВОСТ

   Если 0xF0 стоит в последней ячейке, второго байта в памяти нет —
   ядро берёт его по кругу с нулевого адреса (см. stepExt в ext61.js).
   Декодер делает так же, чтобы листинг не расходился с исполнением.
   ========================================================= */
(function (global) {
  'use strict';

  var PREFIX = 0xF0;

  function hex2(n) {
    var s = (n & 0xFF).toString(16).toUpperCase();
    return s.length < 2 ? '0' + s : s;
  }

  function core() {
    return global.MKCore || null;
  }

  function cmdName(code) {
    var MK = core();
    if (MK && typeof MK.cmdName === 'function') return MK.cmdName(code);
    return 'команда ' + hex2(code);
  }

  function codeStr(code) {
    var MK = core();
    if (MK && typeof MK.codeStr === 'function') return MK.codeStr(code);
    return hex2(code);
  }

  /* Название второго байта берём у ext61.js, если он подключён.
     Без него строка всё равно остаётся целой двухбайтной командой. */
  function extDescribe(second) {
    if (global.MKExt61 && typeof global.MKExt61.extName === 'function') {
      return global.MKExt61.extName(second);
    }
    return 'EXT ' + hex2(second);
  }

  function nopCode(opts) {
    if (opts && opts.nop !== undefined) return opts.nop & 0xFF;
    var MK = core();
    if (MK && MK.NOP !== undefined) return MK.NOP & 0xFF;
    return 0x00;
  }

  /* rows(prog, {length, nop}) → [{addr, len, bytes, code, text, kind, empty}]
     kind: 'ext' | 'cmd' | 'nop' */
  function rows(prog, opts) {
    var o = opts || {};
    if (!prog || typeof prog.length !== 'number') return [];
    var len = prog.length;
    if (typeof o.length === 'number' && o.length > 0 && o.length <= len) len = o.length | 0;

    var nop = nopCode(o);
    var out = [];
    var i = 0;

    while (i < len) {
      var code = prog[i] & 0xFF;

      if (code === PREFIX) {
        var second = (len > 1) ? (prog[(i + 1) % len] & 0xFF) : 0;
        out.push({
          addr: i,
          len: 2,
          bytes: [PREFIX, second],
          code: 'F0 ' + hex2(second),
          text: extDescribe(second),
          kind: 'ext',
          empty: false
        });
        i += 2;
        continue;
      }

      if (code === nop) {
        out.push({
          addr: i,
          len: 1,
          bytes: [code],
          code: '',
          text: '—',
          kind: 'nop',
          empty: true
        });
        i += 1;
        continue;
      }

      out.push({
        addr: i,
        len: 1,
        bytes: [code],
        code: codeStr(code),
        text: cmdName(code),
        kind: 'cmd',
        empty: false
      });
      i += 1;
    }

    return out;
  }

  /* Сколько ячеек занимает программа по факту: последняя непустая строка
     плюс её размер. Нужно, чтобы панель листинга не рисовала 105 пустых. */
  function used(prog, opts) {
    var list = rows(prog, opts);
    var end = 0;
    for (var i = 0; i < list.length; i++) {
      if (!list[i].empty) end = list[i].addr + list[i].len;
    }
    return end;
  }

  /* Текстовый вид всего листинга — для тестов и для копирования. */
  function text(prog, opts) {
    var list = rows(prog, opts);
    var lines = [];
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      var addr = String(r.addr);
      while (addr.length < 2) addr = '0' + addr;
      lines.push(addr + '  ' + (r.code ? r.code + '  ' : '    ') + r.text);
    }
    return lines.join('\n');
  }

  global.MKDasm = {
    rows: rows,
    used: used,
    text: text,
    hex2: hex2,
    PREFIX: PREFIX
  };
})(typeof window !== 'undefined' ? window : this);
