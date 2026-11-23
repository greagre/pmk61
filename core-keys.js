/* =========================================================
   pmk61 / core-keys.js   —   ревизия 1
   СЛОЙ ВВОДА: клавиатура поверх ядра.

   Зачем этот файл появился:
     ядро core.js — один цельный файл на ~1100 строк, и любая правка
     ввода означала перепечатать его целиком. Здесь собирается всё,
     что относится к нажатиям: нормализация клавиш и правила
     завершения набора числа. Дальше правки ввода идут сюда,
     а не в ядро.

   Что уже делает:
     1) Нормализация клавиши. Можно задавать клавишу коротко — {c: 0x21}
        вместо {a:'code', c:0x21}. Ядро таких объектов не понимает,
        поэтому приводим к его формату до вызова.
     2) Закрытие набора после записи в регистр (третий долг):
        ветка ядра key -> {a:'reg', mode:'sto'} пишет число в регистр,
        но оставляет ST.typing = true. Из-за этого
          5, X→П, R1, 7  ->  57
        а у настоящего ПМК получается 7: запись в регистр завершает
        ввод числа, следующая цифра начинает новое.
        Здесь после записи делаем ST.typing = false, ST.input = '',
        ST.exp = false.

   Чего НЕ делает:
     не переписывает ядро и не меняет его арифметику. Подключать
     строго ПОСЛЕ core.js.

   Режим ПРГ не затрагивается: там нажатие пишет код в память команд,
   а не число в регистр.

   Заменяет sto-fix.js (тот файл остаётся в репозитории как архивный).
   ========================================================= */
(function (global) {
  'use strict';

  var MK = global.MKCore;
  if (!MK || typeof MK.create !== 'function') return;

  var origCreate = MK.create;

  /* набор числа закрыт: следующая цифра начнёт новое число */
  function endTyping(ST) {
    if (!ST) return;
    ST.typing = false;
    ST.input = '';
    ST.exp = false;
  }

  /* короткая запись клавиши -> формат ядра */
  function normalize(k) {
    if (!k || typeof k !== 'object') return k;
    if (!k.a && typeof k.c === 'number') k.a = 'code';
    if (k.a === 'code' && typeof k.jump === 'undefined') k.jump = false;
    return k;
  }

  MK.create = function (options) {
    var core = origCreate(options);
    var key0 = core.key;

    core.key = function (k) {
      k = normalize(k);

      /* именно запись числа в регистр: клавиша X→П + выбранный регистр */
      var isSto = !!(k && k.a === 'reg' && k.mode === 'sto');

      var res = key0(k);

      if (isSto && core.ST && core.ST.mode !== 'PRG') {
        endTyping(core.ST);
        core.changed();
      }
      return res;
    };

    return core;
  };

  /* наружу — для отладки и для других надстроек */
  global.MKKeys = {
    version: 1,
    endTyping: endTyping,
    normalize: normalize
  };
})(typeof window !== 'undefined' ? window : this);
