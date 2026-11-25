/* =========================================================
   pmk61 / ext61-boot.js
   Включение расширения в интерфейсе — БЕЗ правки ui.js.

   ЗАЧЕМ ТАК

   ui.js создаёт ядро синхронно, в самом низу файла:
       core = window.MKCore.create({ onEvent: onEvent });
   Поэтому подменить фабрику после него уже поздно. Зато можно
   сделать это ДО: тогда ui.js получит расширенное ядро, ничего
   о расширении не зная.

   ЛОВУШКА, НА КОТОРОЙ МЫ УЖЕ ПАДАЛИ

   ext61.js внутри своего create() сам вызывает global.MKCore.create().
   Если просто заменить MKCore.create на обёртку, получится рекурсия:
       boot → MKExt61.create → MKCore.create (уже обёртка) → boot → …
   Стек переполняется, ui.js падает на создании ядра, клавиатура и
   кнопки не строятся, а в панели появляется ложное «декодер не
   подключён» (на самом деле нет ядра, а не декодера).

   Поэтому вызов изнутри помечается флагом inside и уходит в базовую
   фабрику напрямую. Флаг снимается в finally — исключение в ext61
   не должно оставить подмену в «залипшем» состоянии.

   ЧТО ИМЕННО ПОДМЕНЯЕТСЯ

   Только window.MKCore.create. Всё остальное — step, run, reset,
   setProgram — расширение переопределяет само, снаружи ядра.

   Если ext61.js не подключён или MKExt61 недоступен, файл молча
   ничего не делает и эмулятор работает как обычный МК-61.
   ========================================================= */
(function (global) {
  'use strict';

  var C = global.MKCore;
  var E = global.MKExt61;
  if (!C || !E || typeof C.create !== 'function' || typeof E.create !== 'function') return;

  var baseCreate = C.create;
  var inside = false;

  C.create = function (opts) {
    /* вызов изнутри ext61.js — идём в базовую фабрику без обёртки */
    if (inside) return baseCreate(opts);

    inside = true;
    var ext;
    try {
      ext = E.create(opts || {});
    } finally {
      inside = false;
    }

    var core = (ext && ext.core) ? ext.core : null;
    if (!core) return baseCreate(opts);

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
