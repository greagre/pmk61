/* =========================================================
   pmk61 / vo-fix.js
   Ревизия 8 отдельным слоем — ядро core.js не переписывается.

   Что исправляется
   ----------------
   Руководство (раздел «Команды переходов», про В/О):
     «Стек обратных адресов подпрограмм из 5 ячеек, вначале нулевых.
      При возврате берётся значение верхней ячейки + 1... Поэтому
      сразу после включения ПМК команда В/О эквивалентна БП 01.»

   core.js делает иначе:
     if (code === 0x52) { ST.ip = ST.sub.length ? ST.sub.pop() : 0; ... }
   то есть на пустом стеке адрес 00, а не 01. Программа на адресе 00
   с командой В/О зацикливается и упирается в лимит шагов.

   Как исправляется
   ----------------
   Слой ставится ПОСЛЕ core.js и оборачивает create():
     - core.step — свой шаг: после настоящего шага, если исполнялась
       команда 0x52 при пустом стеке и ip стал 0, подставляется 1;
     - core.run  — свой цикл прогона, чтобы обёрнутый шаг работал и там
       (внутри core.run вызывается замыкание, а не экспортированный step).

   Поведение остальных команд не меняется: обёртка только смотрит
   на код 0x52 и на глубину стека возврата.

   Зачем отдельным файлом
   ----------------------
   core.js синхронизируется с greagre/pmk52. Правка двух символов внутри
   ядра должна попасть в оба репозитория одновременно, иначе версии
   расходятся. Отдельный слой живёт в pmk61, ничего не ломает и снимается
   одной строкой, когда правка ядра будет внесена в обоих проектах.
   ========================================================= */
(function (global) {
  'use strict';

  var MK = global.MKCore;
  if (!MK || MK.__voFix) return;

  var VO = 0x52;          /* В/О */
  var VO_EMPTY_ADDR = 1;  /* куда уходит В/О на пустом стеке по руководству */

  var origCreate = MK.create;

  /* Пригодится тестам: создать ядро без слоя, чтобы сравнить поведение. */
  MK.__origCreate = origCreate;

  MK.create = function (options) {
    var core = origCreate(options);
    var ST = core.ST;
    var PROG_LEN = core.PROG_LEN;
    var origStep = core.step;

    function stepFixed() {
      var prevIp = ST.ip;
      var depth = ST.sub.length;
      var code = ST.prog[prevIp];
      var res = origStep();

      if (code === VO && depth === 0 && ST.ip === 0) {
        ST.ip = VO_EMPTY_ADDR % PROG_LEN;
        res = 'jump';
      }
      return res;
    }

    core.step = stepFixed;

    /* Свой прогон: повторяет поведение core.run, но зовёт stepFixed. */
    core.run = function (limit) {
      var max = limit || 100000;
      var n = 0, res = 'cont';
      ST.err = false;
      ST.steps = 0;
      while (n < max) {
        res = stepFixed();
        n++;
        ST.steps = n;
        if (res === 'stop' || res === 'error') break;
      }
      return {
        result: res,
        steps: n,
        err: ST.err,
        x: ST.X,
        overflow: (n >= max && res !== 'stop' && res !== 'error')
      };
    };

    return core;
  };

  MK.__voFix = true;
  MK.VO_EMPTY_ADDR = VO_EMPTY_ADDR;
})(typeof window !== 'undefined' ? window : this);
