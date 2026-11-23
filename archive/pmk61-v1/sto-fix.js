/* =========================================================
   pmk61 / archive/pmk61-v1/sto-fix.js
   АРХИВНАЯ КОПИЯ этапа v1 (закрытие третьего долга: «X→П не завершает набор числа»).
   Точная копия ../sto-fix.js на момент архивации. Не редактировать.

   Что не так в ядре (core.js, ревизия 6):
     ветка key -> {a:'reg', mode:'sto'} пишет число в регистр, но
     оставляет ST.typing = true и ST.input как есть. Поэтому следующая
     цифра дописывается к уже набранному числу:
       5, X→П, R1, 7  ->  на индикаторе 57 (у настоящего ПМК было бы 7).

   Что делает этот файл:
     оборачивает core.key и после успешной записи в регистр закрывает
     набор — ST.typing = false, ST.input = '', ST.exp = false.

   Режим ПРГ не затрагивается.
   ========================================================= */
(function (global) {
  'use strict';

  var MK = global.MKCore;
  if (!MK || typeof MK.create !== 'function') return;

  var origCreate = MK.create;

  function endTyping(ST) {
    if (!ST) return;
    ST.typing = false;
    ST.input = '';
    ST.exp = false;
  }

  MK.create = function (options) {
    var core = origCreate(options);
    var key0 = core.key;

    core.key = function (k) {
      /* запись именно в регистр: клавиша X→П + выбранный регистр */
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
})(typeof window !== 'undefined' ? window : this);
