/* =========================================================
   pmk61 / nop-fix.js   v1, 27.11.2026

   Ревизия 9: К 1 (0x55) и К 2 (0x56) — пустые операторы.

   Что было: core.js отдавал на эти коды ЕГГ0Г, в шапке ядра так и
   записано — «0x55, 0x56  К 1, К 2 — назначение не установлено».

   Что установлено теперь. Три независимых источника сходятся:
     - таблица команд (Anvarov, «Команды ПМК МК-61»):
         55  К 1 — «Nothing, empty operator»
         56  К 2 — «Nothing, empty operator»
     - документация MK-Pro, docs/03-command-reference:
         «55 К 1 — No-op, empty operator», «56 К 2 — No-op»
     - «Еггогология» (Википедия): «коды 55 и 56 — ничего не делает,
         равнозначна команде КНОП».
   То есть на МК-61 это заполнители, а не неизвестные функции.
   Их смысл — оставить пустую ячейку, которую позже перепишут.

   Почему слоем, а не правкой core.js:
     core.js — 40 035 знаков, github_write_file пишет файл целиком.
     Правка одной строки означала бы перепечатать всё ядро, и одна
     опечатка ломает клавиатуру, вкладки и библиотеку сразу.
     Тот же приём уже применён в vo-fix.js и sto-fix.js.

   Что делает слой:
     step()  — если текущая команда 0x55 или 0x56, сдвигает счётчик
               на единицу и возвращает 'cont', ровно как на К НОП (0x54).
               Стек, X1, регистры и X не трогаются: команда пустая.
     run()   — прогон идёт через тот же перехваченный step, поэтому
               программа не спотыкается на пустышке в автоматическом режиме.
     key()   — ручное нажатие К1/К2 в режиме АВТ ничего не делает
               (ядро уводило его во внутренний exec и давало ЕГГ0Г).

   Что слой НЕ трогает:
     - запись в память в режиме ПРГ: коды 55 и 56 кладутся как есть,
       счётчик идёт дальше — там ничего менять не нужно;
     - подписи cmdName: 0x55 и 0x56 в ядре уже названы «К 1» и «К 2»;
     - блок 0x37…0x3A (К AND, К OR, К XOR, К ИНВ) — он по-прежнему
       ЕГГ0Г, это следующий заход.

   Подключение (index.html): после ext61-boot.js и vo-fix.js, до ui.js.
   ========================================================= */
(function (global) {
  'use strict';

  var CORE = global.MKCore;
  if (!CORE || typeof CORE.create !== 'function') return;

  /* Коды пустых операторов. 0x54 (К НОП) ядро обрабатывает само. */
  var IS_NOOP = { 0x55: true, 0x56: true };

  function isNoop(code) {
    return IS_NOOP[(code & 255) & 255] === true;
  }

  var origCreate = CORE.create;

  CORE.create = function (options) {
    var core = origCreate(options);
    if (!core || typeof core.step !== 'function') return core;

    /* ---- шаг программы ---- */
    var origStep = core.step;
    core.step = function () {
      var ST = core.ST;
      if (ST && !ST.err) {
        var code = ST.prog[ST.ip] & 255;
        if (IS_NOOP[code]) {
          ST.ip = (ST.ip + 1) % core.PROG_LEN;
          return 'cont';
        }
      }
      return origStep.apply(core, arguments);
    };

    /* ---- прогон: тот же контракт, что у ядра, но через наш step ---- */
    if (typeof core.run === 'function') {
      core.run = function (limit) {
        var ST = core.ST;
        var max = limit || 100000;
        var n = 0, res = 'cont';
        ST.err = false;
        ST.steps = 0;
        while (n < max) {
          res = core.step();
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
    }

    /* ---- ручное нажатие К1/К2 в режиме АВТ ---- */
    if (typeof core.key === 'function') {
      var origKey = core.key;
      core.key = function (k) {
        var ST = core.ST;
        if (k && k.a === 'code' && IS_NOOP[k.c & 255] && ST && ST.mode !== 'PRG') {
          core.hint('К ' + (k.c === 0x56 ? '2' : '1') + ' — пустая команда, ничего не делает');
          return;
        }
        return origKey.apply(core, arguments);
      };
    }

    return core;
  };
})(typeof window !== 'undefined' ? window : this);
