/* =========================================================
   pmk61 / ext61-boot.js
   Включение расширения БЕЗ правки ui.js — через выбор модели.

   ЧТО БЫЛО СЛОМАНО

   Первая версия подменяла MKCore.create для ВСЕХ моделей и возвращала
   не ядро, а объект расширения (обёртку). ui.js в setModel() делает
       core = window.MKCore.create({ onEvent: onEvent });
   и дальше зовёт core.fmt(), core.ST, core.key(). У обёртки этого нет,
   поэтому render() падал на первой строке: клавиатура (#keys) и
   служебные кнопки (#service) не строились вовсе, а панель расширения
   показывала «декодер не подключён» — сообщение уводило не туда,
   хотя виноват был не декодер, а упавший интерфейс.

   ЧТО ТЕПЕРЬ

   1. Расширение — это модель в списке: «МК-61 (расширенный)».
      Обычный МК-61 работает ровно как раньше, без расширения.
   2. Подмена срабатывает, только если в <select id="model"> выбран
      mk-61-ext. ui.js выставляет значение до создания ядра, поэтому
      к моменту вызова create() выбор уже известен.
   3. Наружу отдаётся НАСТОЯЩЕЕ ядро (ext.core), а объект расширения
      приклеивается к нему как core.ext — этим пользуется панель ввода
      (writeExt, bank, page).

   ПОРЯДОК ПОДКЛЮЧЕНИЯ ВАЖЕН

   Файл должен идти ПОСЛЕ profiles-ui.js и ДО ui.js:
       profiles-ui.js → ext61-boot.js → ui.js
   Тогда baseCreate — это фабрика с параметрами МК-61 (105 шагов,
   15 регистров, адреса выше 99), и расширенное ядро получает их тоже.

   Если ext61.js не загрузился или MKExt61 недоступен, файл молча
   ничего не делает: эмулятор остаётся обычным МК-61.
   ========================================================= */
(function (global) {
  'use strict';

  var C = global.MKCore;
  var E = global.MKExt61;
  if (!C || !E) return;
  if (typeof C.create !== 'function' || typeof E.create !== 'function') return;

  var EXT_MODEL = 'mk-61-ext';

  /* Базовая фабрика — та, что уже обёрнута profiles-ui.js */
  var baseCreate = C.create;
  var inside = false;

  function extSelected() {
    var sel = document.getElementById('model');
    return !!(sel && sel.value === EXT_MODEL);
  }

  C.create = function (opts) {
    /* вызов изнутри ext61.js — уходим в базовую фабрику без обёртки,
       иначе получится рекурсия и переполнение стека */
    if (inside) return baseCreate.call(C, opts);
    if (!extSelected()) return baseCreate.call(C, opts);

    inside = true;
    var ext = null;
    try {
      ext = E.create(opts || {});
    } catch (err) {
      ext = null;
    } finally {
      inside = false;
    }

    var core = (ext && ext.core) ? ext.core : null;
    if (!core) return baseCreate.call(C, opts);

    /* Ядро остаётся ядром: fmt, key, step, ST — всё на месте.
       Расширение живёт рядом, отдельным объектом. */
    core.ext = ext;
    core.writeExt = function (second) { return ext.writeExt(second); };
    core.extBank = function () { return ext.bank ? ext.bank() : 0; };
    core.extPage = function () { return ext.page ? ext.page() : 0; };

    return core;
  };
})(typeof window !== 'undefined' ? window : this);
