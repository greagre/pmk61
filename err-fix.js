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

   Ревизия 2 (27.11.2026): ловушка срабатывала ДВАЖДЫ, и счётчик
   уходил на адрес + 4. Причина — обёртка create навешивалась
   повторно (файл подключён дважды либо стоит поверх другого слоя,
   который тоже подменяет create). Тогда внешняя обёртка видела
   уже сдвинутый внутренней ip и добавляла свои два.
   Две страховки:
     1) core.__errFix — второй раз тот же экземпляр не оборачиваем;
     2) сдвиг применяется только если ip с момента ошибки НЕ менялся
        (ST.ip === ip0). Если его уже сдвинул другой слой — не трогаем.

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

    /* Страховка 1: этот экземпляр уже обёрнут — второй раз не трогаем.
       Иначе два слоя складывают по +2, и ip уходит на адрес + 4. */
    if (core.__errFix) return core;
    core.__errFix = true;

    var ST = core.ST;
    var LEN = core.PROG_LEN;
    var isJump = global.MKCore.isJumpCmd || function () { return false; };

    /* Ошибка перехода адресуется по-другому: команда + две ячейки
       адреса. Её не трогаем — core уже поставил подсказку и оставил ip. */
    function trapApplies(ip) {
      var c = ST.prog[ip];
      return typeof c === 'number' && !isJump(c);
    }

    function trap(ip0) {
      ST.X1 = ST.X;
      ST.ip = ((ip0 + 2) % LEN + LEN) % LEN;
      ST.run = false;
    }

    var rawStep = core.step;
    core.step = function () {
      var ip0 = ST.ip;
      var was = ST.err;
      var res = rawStep.apply(this, arguments);
      /* Страховка 2: сдвигаем, только если счётчик всё ещё на месте ошибки. */
      if (!was && ST.err && res === 'error' && ST.ip === ip0 && trapApplies(ip0)) {
        trap(ip0);
      }
      return res;
    };

    /* run() внутри ядра крутит собственную step, поэтому
       перехвата step для автопрогона недостаточно: после возврата
       из run поправляем то, что он оставил. */
    var rawRun = core.run;
    core.run = function () {
      var ip0 = ST.ip;
      var res = rawRun.apply(this, arguments);
      if (ST.err && ST.ip === ip0 && trapApplies(ip0)) trap(ip0);
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
        if (k && k.a === 'pp' && ST.mode === 'AUT' && ST.ip === ip0 && trapApplies(ip0)) {
          trap(ip0);
        } else {
          ST.X1 = ST.X;
        }
      }
      return res;
    };

    return core;
  };
})(typeof window !== 'undefined' ? window : this);
