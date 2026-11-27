/* =========================================================
   pmk61 / prg-lcd.js  —  индикатор в режиме ПРГ
   =========================================================
   ЗАЧЕМ. ui.js рисует на индикаторе одно и то же в обоих режимах:

       function lcdText() {
         var st = core.ST;
         if (st.err) return 'ЕГГОГ';
         return core.fmt(st.X);          // ← и в АВТ, и в ПРГ
       }

   У настоящего МК-61 в режиме «Программирование» индикатор показывает
   НЕ X, а коды последних ячеек программы и адрес счётчика.

   ОТКУДА ФОРМАТ. Руководство МК-52, п. 7.1.12 (стр. 33–34):

     «В режиме "Программирование" индикатор используется для отображения
      кодов трёх последовательных команд из программной памяти и текущего
      состояния счётчика команд, т.е. адреса, по которому будет записана
      следующая команда. … 1) код 06 - текущее состояние счётчика адреса;
      2) коды 0Е, 01, 02 - три последовательные команды, расположенные
      соответственно по адресам 03, 04, 05.»

   Значит четыре пары разрядов, слева направо:

       [адрес PC-3] [адрес PC-2] [адрес PC-1] [счётчик PC]

   Порядок разрядов взят по руководству МК-52. В некоторых эмуляторах
   принят обратный (слева самая поздняя команда) — это отмечено в книге
   как известное расхождение трактовок.

   СИМВОЛЫ. Коды на индикаторе не шестнадцатеричные буквы, а знаки
   самого калькулятора (Anvarov, таблица кодов; статья Antowka):

       0x0A → «-»     0x0B → «L»     0x0C → «C»
       0x0D → «Г»     0x0E → «E»     0x0F → «?»

   Байт выводится как две тетрады: 0x62 → «62», 0x0A → «0-».

   ЧЕГО СЛОЙ НЕ ДЕЛАЕТ. В режиме АВТ он молчит полностью — там индикатор
   по-прежнему показывает X, и это правильно.

   КАК РАБОТАЕТ. MutationObserver на #lcd: ui.js записал текст, слой
   проверил режим и при необходимости заменил строку. Зацикливания нет:
   если текст уже нужный, запись не производится. Дополнительно смотрим
   #stMode и #stStep — режим и адрес меняются вместе с индикатором.

   ПОДКЛЮЧЕНИЕ. index.html: после ui.js (нужен window.MKUI.getCore).
   ========================================================= */
(function () {
  'use strict';

  /* Таблица знаков индикатора по младшей тетраде кода. */
  var SYM = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '-', 'L', 'C', 'Г', 'E', '?'];

  /* Байт команды → две позиции индикатора. 0x62 → «62», 0x0A → «0-». */
  function pair(code) {
    var b = code & 0xFF;
    return SYM[(b >> 4) & 0x0F] + SYM[b & 0x0F];
  }

  function coreRef() {
    return (window.MKUI && typeof window.MKUI.getCore === 'function')
      ? window.MKUI.getCore()
      : null;
  }

  /* Правые два разряда — адрес счётчика. Печать адреса живёт в ядре,
     чтобы индикатор и листинг не разошлись: «00»…«99» и «-0»…«-4». */
  function addrRight(core, ip) {
    if (core && typeof core.addrShow === 'function') return core.addrShow(ip);
    return (ip < 10 ? '0' : '') + ip;
  }

  /* Полная строка индикатора: три кода + счётчик.
     Пробелы между парами — только для читаемости на экране телефона,
     на железном индикаторе разделителей нет. */
  function prgText(core) {
    if (!core || !core.ST) return '';
    var st = core.ST;
    var prog = st.prog || [];
    var len = core.PROG_LEN || prog.length;
    var ip = st.ip | 0;
    var out = [];
    for (var k = 3; k >= 1; k--) {
      var a = ip - k;
      var code = (a >= 0 && a < len && prog[a] != null) ? prog[a] : null;
      out.push(code == null ? '  ' : pair(code));
    }
    out.push(addrRight(core, ip));
    return out.join(' ');
  }

  function apply() {
    var lcd = document.getElementById('lcd');
    if (!lcd) return;
    var core = coreRef();
    if (!core || !core.ST) return;

    /* В автоматическом режиме не вмешиваемся: там X — это правильно. */
    if (core.ST.mode !== 'PRG') return;

    var t = prgText(core);
    if (!t) return;
    if (lcd.textContent !== t) lcd.textContent = t;
    lcd.classList.remove('err');
  }

  function watch(node) {
    if (!node || !window.MutationObserver) return;
    new MutationObserver(function () { apply(); })
      .observe(node, { childList: true, characterData: true, subtree: true });
  }

  function start() {
    var lcd = document.getElementById('lcd');
    if (!lcd) { setTimeout(start, 100); return; }
    if (window.__pmk61PrgLcd) return;
    window.__pmk61PrgLcd = true;

    watch(lcd);
    watch(document.getElementById('stMode'));
    watch(document.getElementById('stStep'));

    apply();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  /* Наружу — для тестов: собрать строку, не трогая экран. */
  window.MKPrgLcd = { prgText: prgText, apply: apply, pair: pair };
})();
