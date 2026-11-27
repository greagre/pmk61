/* =========================================================
   pmk61 / err-fix.js
   Ревизия 10 — поведение ЕГГ0Г как возобновляемой ловушки.

   Что было в core.js: при ошибке setErr() ставит ST.err = true,
   step() возвращает 'error' и ST.run = false, но:
     - ST.ip остаётся на самой команде, вызвавшей ошибку;
     - ST.X1 не заполняется.

   Что должно быть (MK-Pro, 03-command-reference.md, раздел
   «When ЕГГОГ appears»; то же в «Еггогологии»):
     - ошибочное значение остаётся в X;
     - оно же копируется в X1;
     - счётчик команд ставится на АДРЕС + 2 — то есть ячейка,
       стоящая сразу после ловушки, при продолжении пропускается;
     - выполнение останавливается.

   Продолжение: ST.err сбрасывается в начале run(), поэтому
   после нажатия С/П прогон начинается уже с ip = адрес + 2,
   и пропущенная ячейка не исполняется.

   Отдельный случай — ошибка адреса перехода (badAddress): там
   команда занимает три ячейки, и сдвиг на +2 был бы неверным.
   Поэтому ловушка применяется только к НЕпереходам; проверка
   идёт через MKCore.isJumpCmd.

   Место подключения: строго после nop-fix.js и ДО ui.js —
   ui.js забирает ядро через create один раз, и обёртка должна
   успеть встать раньше. Снимается удалением одной строки.
   ========================================================= */
(function (global) {
  'use strict';
  if (!global.MKCore || typeof global.MKCore.create !== 'function') return;

  var origCreate = global.MKCore.create;

  global.MKCore.create = function (options) {
    var core = origCreate.apply(this, arguments);
    var ST = core.ST;
    var LEN = core.PROG_LEN;
    var isJump = global.MKCore.isJumpCmd || function () { return false; };

    /* Ошибка перехода адресуется по-другому: команда + две ячейки
       адреса. Её не трогаем — core уже поставил подсказку и оставил ip. */
    function trapApplies(ip) {
      var c = ST.prog[ip];
      return typeof c === 'number' && !isJump(c);
    }

    function skipTrap() {
      ST.X1 = ST.X;
      ST.ip = ((ST.ip + 2) % LEN + LEN) % LEN;
      ST.run = false;
    }

    var rawStep = core.step;
    core.step = function () {
      var ip0 = ST.ip;
      var was = ST.err;
      var res = rawStep.apply(this, arguments);
      if (!was && ST.err && res === 'error' && trapApplies(ip0)) {
        ST.ip = ip0;
        skipTrap();
      }
      return res;
    };

    /* run() внутри ядра крутит собственную step, поэтому
       перехвата step для автопрогона недостаточно: после возврата
       из run поправляем то, что он оставил. */
    var rawRun = core.run;
    core.run = function () {
      var res = rawRun.apply(this, arguments);
      if (ST.err && trapApplies(ST.ip)) skipTrap();
      return res;
    };

    /* Ручное нажатие в режиме АВТ идёт через exec() мимо step.
       Пошаговый ПП — это шаг программы, там ловушка работает;
       обычная клавиша — это ручной счёт, ip двигать не нужно,
       но X1 по документам всё равно получает X. */
    var rawKey = core.key;
    core.key = function (k) {
      var ip0 = ST.ip;
      var was = ST.err;
      var res = rawKey.apply(this, arguments);
      if (!was && ST.err) {
        if (k && k.a === 'pp' && ST.mode === 'AUT' && trapApplies(ip0)) {
          ST.ip = ip0;
          skipTrap();
        } else {
          ST.X1 = ST.X;
        }
      }
      return res;
    };

    return core;
  };
})(typeof window !== 'undefined' ? window : this);
