/* =========================================================
   pmk61 / ext61-boot.js
   Включение расширения в интерфейсе — БЕЗ правки ui.js.

   ЗАЧЕМ ТАК

   ui.js создаёт ядро синхронно, в самом низу файла:
       core = window.MKCore.create({ onEvent: onEvent });
   Поэтому подменить фабрику после него уже поздно. Зато можно
   сделать это ДО: тогда ui.js получит расширенное ядро, ничего
   о расширении не зная. Этот файл подключается после core.js и
   ext61.js, но ПЕРЕД ui.js.

   ЧТО ИМЕННО ПОДМЕНЯЕТСЯ

   Только window.MKCore.create. Всё остальное — step, run, reset,
   setProgram — расширение уже переопределило само, снаружи ядра.
   ui.js вызывает core.key/step/run/reset/setProgram/snapshot и
   не заметит разницы: набор методов тот же.

   Если ext61.js не подключён или MKExt61 недоступен, файл молча
   ничего не делает и эмулятор работает как обычный МК-61.
   ========================================================= */
(function (global) {
  'use strict';

  var C = global.MKCore;
  var E = global.MKExt61;
  if (!C || !E || typeof C.create !== 'function' || typeof E.create !== 'function') return;

  var baseCreate = C.create;

  C.create = function (opts) {
    var ext = E.create(opts || {});
    var core = ext.core;

    /* Мостик для интерфейса и панели листинга: сам объект расширения
       и короткие ссылки на то, что нужно кнопкам ввода. */
    core.ext = ext;
    core.writeExt = function (second) { return ext.writeExt(second); };
    core.bank = ext.bank;
    core.page = ext.page;
    core.selectBank = ext.selectBank;
    core.selectPage = ext.selectPage;

    return core;
  };

  global.MKCore = C;
})(typeof window !== 'undefined' ? window : this);
