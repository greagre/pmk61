/* =========================================================
   pmk61 / profiles-ui.js
   Раскладка клавиш МК-61 для корпуса (ui.js).

   Этот файл НЕ трогает ни ядро (core.js), ни таблицу кодов
   (profiles.js). Он только описывает, какие кнопки в каком
   ряду и какой код команды дают.

   Подключать ПЕРЕД ui.js. Если файла нет — ui.js берёт
   данные из MKProfiles, как в mk-emulator.

   Отличия от Б3-34:
   - 105 шагов программы, 15 регистров (R0…Re);
   - угол по умолчанию Г;
   - в слое K появляются K-функции (°→′, |x|, ЗН, [x], {x},
     max, AND, OR, XOR, ИНВ, СЧ, Y→X) и восемь косвенных
     команд (К БП, К ПП, К x→П, К П→X, К x≠0, К x≥0, К x<0, К x=0).
   ========================================================= */
(function (global) {
  'use strict';

  /* Основной слой — как у Б3-34: клавиатура 61-й повторяет 34-ю. */
  var MK61_MAIN = [
    { t: 'f',    a: 'pref-f', cls: 'pref' },
    { t: 'k',    a: 'pref-k', cls: 'pref' },
    { t: 'x→П',  a: 'stox' },
    { t: 'П→X',  a: 'loadx' },
    { t: '↔',    a: 'code', c: 0x14, cls: 'dark' },
    { t: 'В↑',   a: 'code', c: 0x0E, cls: 'dark' },

    { t: 'С/П',  a: 'sp', cls: 'red' },
    { t: 'ПП',   a: 'pp', cls: 'dark' },
    { t: 'БП',   a: 'bp', cls: 'dark' },
    { t: 'В/О',  a: 'vo', cls: 'dark' },
    { t: 'Cx',   a: 'code', c: 0x0D, cls: 'red' },
    { t: '/-/',  a: 'code', c: 0x0B, cls: 'dark' },

    { t: '7',    a: 'digit', d: 7, cls: 'dark' },
    { t: '8',    a: 'digit', d: 8, cls: 'dark' },
    { t: '9',    a: 'digit', d: 9, cls: 'dark' },
    { t: '÷',    a: 'code', c: 0x13, cls: 'blue' },
    { t: 'ВП',   a: 'code', c: 0x0C },
    { t: 'F◯',   a: 'code', c: 0x25 },

    { t: '4',    a: 'digit', d: 4, cls: 'dark' },
    { t: '5',    a: 'digit', d: 5, cls: 'dark' },
    { t: '6',    a: 'digit', d: 6, cls: 'dark' },
    { t: '×',    a: 'code', c: 0x12, cls: 'blue' },
    { t: 'π',    a: 'code', c: 0x20 },
    { t: '√',    a: 'code', c: 0x21 },

    { t: '1',    a: 'digit', d: 1, cls: 'dark' },
    { t: '2',    a: 'digit', d: 2, cls: 'dark' },
    { t: '3',    a: 'digit', d: 3, cls: 'dark' },
    { t: '−',    a: 'code', c: 0x11, cls: 'blue' },
    { t: 'x²',   a: 'code', c: 0x22 },
    { t: '1/x',  a: 'code', c: 0x23 },

    { t: '0',    a: 'digit', d: 0, cls: 'dark' },
    { t: '•',    a: 'dot', cls: 'dark' },
    { t: '+',    a: 'code', c: 0x10, cls: 'blue' },
    { t: 'x^y',  a: 'code', c: 0x24 },
    { t: 'e^x',  a: 'code', c: 0x16 },
    { t: 'ln',   a: 'code', c: 0x18 }
  ];

  /* Слой F */
  var MK61_F = [
    { t: 'sin',    a: 'layer-cmd', c: 0x1C, cls: 'dark' },
    { t: 'cos',    a: 'layer-cmd', c: 0x1D, cls: 'dark' },
    { t: 'tg',     a: 'layer-cmd', c: 0x1E, cls: 'dark' },
    { t: 'sin⁻¹',  a: 'layer-cmd', c: 0x19, cls: 'dark' },
    { t: 'cos⁻¹',  a: 'layer-cmd', c: 0x1A, cls: 'dark' },
    { t: 'tg⁻¹',   a: 'layer-cmd', c: 0x1B, cls: 'dark' },

    { t: 'lg',     a: 'layer-cmd', c: 0x17, cls: 'dark' },
    { t: '10^x',   a: 'layer-cmd', c: 0x15, cls: 'dark' },
    { t: 'e^x',    a: 'layer-cmd', c: 0x16, cls: 'dark' },
    { t: 'x^y',    a: 'layer-cmd', c: 0x24, cls: 'dark' },
    { t: 'π',      a: 'layer-cmd', c: 0x20, cls: 'dark' },
    { t: '√',      a: 'layer-cmd', c: 0x21, cls: 'dark' },

    { t: 'x²',     a: 'layer-cmd', c: 0x22, cls: 'dark' },
    { t: '1/x',    a: 'layer-cmd', c: 0x23, cls: 'dark' },
    { t: 'F↔',     a: 'layer-cmd', c: 0x25, cls: 'dark' },
    { t: 'F Вx',   a: 'layer-cmd', c: 0x0F, cls: 'dark' },
    { t: 'Cx',     a: 'layer-cmd', c: 0x0D, cls: 'dark' },
    { t: 'CF',     a: 'cf', cls: 'dark' },

    { t: 'ПРГ',    a: 'prg', cls: 'blue' },
    { t: 'АВТ',    a: 'aut', cls: 'blue' },
    { t: 'x<0',    a: 'layer-cmd', c: 0x5C, jump: 1, cls: 'dark' },
    { t: 'x=0',    a: 'layer-cmd', c: 0x5E, jump: 1, cls: 'dark' },
    { t: 'x≥0',    a: 'layer-cmd', c: 0x59, jump: 1, cls: 'dark' },
    { t: 'x≠0',    a: 'layer-cmd', c: 0x57, jump: 1, cls: 'dark' },

    { t: 'L0',     a: 'layer-cmd', c: 0x5D, jump: 1, cls: 'dark' },
    { t: 'L1',     a: 'layer-cmd', c: 0x5B, jump: 1, cls: 'dark' },
    { t: 'L2',     a: 'layer-cmd', c: 0x58, jump: 1, cls: 'dark' },
    { t: 'L3',     a: 'layer-cmd', c: 0x5A, jump: 1, cls: 'dark' },
    { t: 'В↑',     a: 'layer-cmd', c: 0x0E, cls: 'dark' },
    { t: '↔',      a: 'layer-cmd', c: 0x14, cls: 'dark' },

    { t: 'ln',     a: 'layer-cmd', c: 0x18, cls: 'dark' },
    { t: 'К НОП',  a: 'layer-cmd', c: 0x54, cls: 'dark' },
    { t: 'К 1',    a: 'layer-cmd', c: 0x55, cls: 'dark' },
    { t: 'К 2',    a: 'layer-cmd', c: 0x56, cls: 'dark' },
    { t: 'Y→X',    a: 'layer-cmd', c: 0x3E, cls: 'dark' },
    { t: 'K °→′',  a: 'layer-cmd', c: 0x26, cls: 'dark' }
  ];

  /* Слой K: K-функции МК-61 и косвенные команды. */
  var MK61_K = [
    { t: 'НОП',    a: 'layer-cmd', c: 0x54, cls: 'dark' },
    { t: '°→′',    a: 'layer-cmd', c: 0x26, cls: 'dark' },
    { t: '°←′',    a: 'layer-cmd', c: 0x33, cls: 'dark' },
    { t: '°→′″',   a: 'layer-cmd', c: 0x2A, cls: 'dark' },
    { t: '°←′″',   a: 'layer-cmd', c: 0x30, cls: 'dark' },
    { t: '|x|',    a: 'layer-cmd', c: 0x31, cls: 'dark' },

    { t: 'ЗН',     a: 'layer-cmd', c: 0x32, cls: 'dark' },
    { t: '[x]',    a: 'layer-cmd', c: 0x34, cls: 'dark' },
    { t: '{x}',    a: 'layer-cmd', c: 0x35, cls: 'dark' },
    { t: 'max',    a: 'layer-cmd', c: 0x36, cls: 'dark' },
    { t: 'AND',    a: 'layer-cmd', c: 0x37, cls: 'dark' },
    { t: 'OR',     a: 'layer-cmd', c: 0x38, cls: 'dark' },

    { t: 'XOR',    a: 'layer-cmd', c: 0x39, cls: 'dark' },
    { t: 'ИНВ',    a: 'layer-cmd', c: 0x3A, cls: 'dark' },
    { t: 'СЧ',     a: 'layer-cmd', c: 0x3B, cls: 'dark' },
    { t: 'Y→X',    a: 'layer-cmd', c: 0x3E, cls: 'dark' },
    { t: 'К 1',    a: 'layer-cmd', c: 0x55, cls: 'dark' },
    { t: 'К 2',    a: 'layer-cmd', c: 0x56, cls: 'dark' },

    { t: 'БП R',   a: 'kcmd', k: 0x80, cls: 'dark' },
    { t: 'ПП R',   a: 'kcmd', k: 0xA0, cls: 'dark' },
    { t: 'x→П R',  a: 'kcmd', k: 0xB0, cls: 'dark' },
    { t: 'П→X R',  a: 'kcmd', k: 0xD0, cls: 'dark' },
    { t: 'x≠0 R',  a: 'kcmd', k: 0x70, cls: 'dark' },
    { t: 'x≥0 R',  a: 'kcmd', k: 0x90, cls: 'dark' },

    { t: 'x<0 R',  a: 'kcmd', k: 0xC0, cls: 'dark' },
    { t: 'x=0 R',  a: 'kcmd', k: 0xE0, cls: 'dark' }
  ];

  global.MKUI_MODELS = {
    'mk-61': {
      id: 'mk-61',
      title: 'ЭЛЕКТРОНИКА',
      model: 'МК-61',
      registers: 15,
      progLen: 105,
      hasK: true,
      angle: 'Г',
      layers: { main: MK61_MAIN, f: MK61_F, k: MK61_K },
      notes: '105 шагов, 15 регистров (R0…Re), K-функции, косвенная адресация, адреса -0…-4.'
    }
  };
})(typeof window !== 'undefined' ? window : this);
