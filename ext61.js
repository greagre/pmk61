/* =========================================================
   pmk61 / ext61.js
   Расширение линии МК-61: двухбайтные команды с префиксом 0xF0,
   банки регистров, межбанковый доступ и страницы программы.

   ГЛАВНОЕ ПРАВИЛО ЭТОГО ФАЙЛА
   core.js НЕ правится. Модуль создаёт обычный экземпляр ядра
   и оборачивает step()/run()/reset() снаружи. Если расширение
   не нужно — ext61.js просто не подключается, и ядро ведёт себя
   ровно как у МК-61. Правило синхронизации core.js с pmk52
   поэтому не нарушается.

   ФОРМАТ КОМАНД

   Двухбайтная команда: [0xF0][второй байт], занимает две ячейки.

   Второй байт:
     00…03   выбрать банк регистров 0…3
     04      номер текущего банка → X
     05      банк-адресат ← X        (стек не меняется)
     06      банк-адресат → X
     10      адрес этой команды → X        («K СЧ»)
     11      адрес следующей ячейки → X
     20…23   выбрать страницу программы 0…3 и начать её с нуля
     24      номер текущей страницы → X
     40…4F   x→П в банк-адресат: RGn адресата ← X        (F = R0)
     60…6F   П→x из банка-адресата: X ← RGn адресата      (F = R0)

   ЗАЧЕМ БАНК-АДРЕСАТ

   Переключение банка — глобальное состояние, и забыть вернуть
   его назад очень легко. Команды 40…/60… позволяют взять или
   положить значение в другой банк, НЕ меняя текущий, поэтому
   программа не может «потерять» банк между операциями.
   Банк-адресат — отдельная маленькая переменная, её видно
   командой 06 и она сбрасывается полным сбросом.

   БАНКИ

   Четыре банка: RG0…RGe каждого банка — обычные имена,
   различаются только номером банка. Всё, что считает и не
   думает о банках, работает в текущем банке; поэтому программы
   МК-61 в банке 0 ведут себя точно как раньше, а банки — это
   просто ещё 45 регистров, которые видно только по команде F0.

   СТРАНИЦЫ ПРОГРАММЫ

   Четыре страницы по 105 шагов: всего 420 шагов вместо 105.
   Адреса остаются ДВУЗНАЧНЫМИ и считаются внутри страницы —
   формат перехода не тронут вообще, поэтому вся арифметика
   адресов МК-61 (включая «-0»…«-4») работает как прежде.

   Команда F0 2n переключает на страницу n и начинает её с шага 00.
   Два следствия, о которых нужно знать:

   1. Если страница уже текущая, команда НИЧЕГО НЕ ДЕЛАЕТ.
      Иначе F0 2n, стоящая в начале страницы, зациклилась бы
      навсегда: переход в начало → снова она же.
   2. Переключение на ПУСТУЮ страницу — это исполнение нулей
      с шага 00. Программист отвечает за то, чтобы там было
      что исполнять (как и за любую другую программу).

   СБРОС И СТРАНИЦЫ

   Полный сброс (reset(false)) гасит регистры всех банков и сбрасывает
   банк-адресат, но ПРОГРАММУ НЕ СТИРАЕТ — ни на текущей странице,
   ни на остальных. Так же ведёт себя настоящий ПМК: «Сброс» стирает
   числа и стек, а введённая программа остаётся. После сброса
   исполнение начинается с шага 00 ТЕКУЩЕЙ страницы (ядро само
   ставит ip = 0), текущая страница и текущий банк не меняются.

   ПЕРЕПРИВЯЗКА ПОСЛЕ setProgram

   Ядро в setProgram создаёт НОВЫЙ массив ST.R (если не передан
   keepRegisters). Значит после каждой загрузки программы ссылка
   banks[cur] устаревает. Поэтому setProgram оборачивается и здесь:
   и страница, и текущий банк снова указывают на массивы ядра.

   ЧЕГО ЗДЕСЬ СОЗНАТЕЛЬНО НЕТ

   Единого адресного пространства: программа по-прежнему не может
   читать себя как данные. Архитектура остаётся гарвардской, и это
   не ограничение, а решение — см. «МК-62» в README.

   ПРАВКА v5 (25.11.2026) — набор числа и EXT-команды

   Прогон «Межбанк» дал X = 142 вместо 42: программа
      1  F0 05  4  2  F0 40
   читала как «1, потом дописать 4, потом дописать 2» — то есть
   142. Причина не в банках и не в адресации, а в наборе числа:
   любая обычная команда ядра завершает ввод (pushValue и три
   места с ST.typing = false), а stepExt сдвигал ip на следующую
   ячейку и оставлял ST.typing включённым. Поэтому цифры после
   F0 05 приписывались к уже набранному числу.

   Исправлено в одном месте — в конце stepExt: успешно исполненная
   EXT-команда завершает набор так же, как любая команда МК-61.
   Это покрывает все случаи сразу (05, 00…03, 40…4F, 20…23),
   а команды, идущие через push(), сбрасывают набор дважды —
   второй сброс безвреден.
   ========================================================= */
(function (global) {
  'use strict';

  var PREFIX = 0xF0;
  var BANKS = 4;
  var PAGES = 4;
  var DEF_REGS = 15;

  /* младшая цифра F означает R0 — как в таблице кодов МК-61 */
  var REG_F = 15;

  var NAMES = {
    0x00: 'банк 0',
    0x01: 'банк 1',
    0x02: 'банк 2',
    0x03: 'банк 3',
    0x04: 'банк → X',
    0x05: 'банк-адресат ← X',
    0x06: 'банк-адресат → X',
    0x10: 'адрес → X',
    0x11: 'следующий адрес → X',
    0x24: 'страница → X'
  };

  var REG_CHARS = '0123456789abcde';

  /* ---------- вспомогательное ---------- */

  /* точка входа — МЛАДШАЯ цифра второго байта (0…15),
     именно поэтому сюда нельзя передавать весь байт целиком */
  function regChar(lo) {
    return (lo === REG_F) ? '0' : REG_CHARS.charAt(lo & 0x0F);
  }

  /* Имя регистра в подписи пишется с буквой R: «x→П R0», «П→x R3».
     Так же подписывает команды ядро (cmdName) и листинг. */
  function describe(second) {
    var s = second & 0xFF;
    var lo = s & 0x0F;
    if (NAMES[s]) return NAMES[s];
    if (s >= 0x20 && s <= 0x23) return 'страница ' + (s & 0x03);
    if (s >= 0x40 && s <= 0x4F) return 'x→П R' + regChar(lo) + ' в банк-адресат';
    if (s >= 0x60 && s <= 0x6F) return 'П→x R' + regChar(lo) + ' из банка-адресата';
    return 'неизвестная EXT-команда';
  }

  function isExt(second) {
    var s = second & 0xFF;
    if (Object.prototype.hasOwnProperty.call(NAMES, s)) return true;
    return (s >= 0x20 && s <= 0x23) ||
           (s >= 0x40 && s <= 0x4F) ||
           (s >= 0x60 && s <= 0x6F);
  }

  /* ---------- фабрика ---------- */

  function create(options) {
    var opt = options || {};
    if (!global.MKCore) throw new Error('ext61: сначала подключи core.js');

    var core = global.MKCore.create({
      progLen: opt.progLen || 105,
      regCount: opt.regCount || DEF_REGS,
      regNames: opt.regNames,
      maxDig: opt.maxDig || 8,
      nop: opt.nop,
      hasK: opt.hasK === undefined ? true : !!opt.hasK,
      addrHigh: opt.addrHigh === undefined ? true : !!opt.addrHigh,
      addrHighFirst: opt.addrHighFirst,
      addrHighLast: opt.addrHighLast,
      angle: opt.angle,
      maxLog: opt.maxLog,
      onEvent: opt.onEvent
    });

    var maxDig = core.MAXDIG;
    var progLen = core.PROG_LEN;

    function zeroBank() {
      return new Array(core.REG_COUNT).fill(0);
    }

    function zeroPage() {
      return new Array(progLen).fill(0);
    }

    var banks = [];
    for (var i = 0; i < BANKS; i++) banks.push(zeroBank());
    /* нулевой банк — родной массив ядра, чтобы МК-61-программы
       работали с регистрами без единой переделки */
    banks[0] = core.ST.R;
    var cur = 0;
    /* банк, к которому обращаются команды 40…/60… без переключения */
    var target = 0;

    var pages = [];
    for (var p = 0; p < PAGES; p++) pages.push(zeroPage());
    /* нулевая страница — родной массив ядра */
    pages[0] = core.ST.prog;
    var curPage = 0;

    /* ---------- банки ---------- */

    function select(n) {
      if (typeof n !== 'number' || n < 0 || n >= BANKS) return false;
      if (n === cur) return true;
      banks[cur] = core.ST.R;   /* запомнить текущий */
      cur = n;
      core.ST.R = banks[cur];   /* подменить ссылку — ядро читает ST.R */
      return true;
    }

    function bank() { return cur; }
    function targetBank() { return target; }

    function bankArr(n) {
      return (n === cur) ? core.ST.R : banks[n];
    }

    /* номер регистра из младшей цифры второго байта;
       F (15) означает R0, всё за пределами профиля — ошибка */
    function regOf(second) {
      var lo = second & 0x0F;
      var r = (lo === REG_F) ? 0 : lo;
      if (r < 0 || r >= core.REG_COUNT) return -1;
      return r;
    }

    /* ---------- страницы ---------- */

    /* Переключение на ту же страницу — пустая операция, иначе команда
       в начале страницы зациклилась бы сама на себя. */
    function selectPage(n) {
      if (typeof n !== 'number' || n < 0 || n >= PAGES) return false;
      if (n === curPage) return true;
      pages[curPage] = core.ST.prog;   /* запомнить текущую */
      curPage = n;
      core.ST.prog = pages[curPage];   /* подменить ссылку — ядро читает ST.prog */
      core.ST.ip = 0;                  /* новая страница начинается с шага 00 */
      return true;
    }

    function page() { return curPage; }

    /* ---------- стек ---------- */

    /* pushValue ядра наружу не отдан, поэтому повторяем его здесь:
       тот же сдвиг T←Z←Y←X и сброс набора числа. */
    function push(v) {
      var n = global.MKCore.norm(v, maxDig);
      if (isNaN(n)) { core.ST.err = true; return false; }
      core.ST.T = core.ST.Z;
      core.ST.Z = core.ST.Y;
      core.ST.Y = core.ST.X;
      core.ST.X = n;
      core.ST.typing = false;
      core.ST.input = '';
      core.ST.exp = false;
      return true;
    }

    /* ---------- межбанковый доступ ---------- */

    /* Банк-адресат — целое 0…3. Без аргумента берётся из X (так работает
       команда F0 05), с аргументом — прямо из JavaScript (для интерфейса
       и тестов). X при установке не меняется: команда не должна портить
       вычисление. */
    function setTarget(v) {
      var x = (v === undefined) ? core.ST.X : v;
      if (typeof x !== 'number' || isNaN(x) || !isFinite(x)) return false;
      var n = Math.round(x);
      if (Math.abs(x - n) > 1e-9) return false;   /* дробный номер — ЕГГ0Г */
      if (n < 0 || n >= BANKS) return false;
      target = n;
      return true;
    }

    function storeToTarget(second) {
      var r = regOf(second);
      if (r < 0) return false;
      bankArr(target)[r] = core.ST.X;
      return true;
    }

    function loadFromTarget(second) {
      var r = regOf(second);
      if (r < 0) return false;
      return push(bankArr(target)[r]);
    }

    /* ---------- выполнение расширения ---------- */

    function handle(second, at) {
      switch (second) {
        case 0x00: case 0x01: case 0x02: case 0x03:
          return select(second);
        case 0x04:
          return push(cur);
        case 0x05:
          return setTarget();
        case 0x06:
          return push(target);
        case 0x10:
          return push(at);
        case 0x11:
          return push((at + 2) % progLen);
        case 0x20: case 0x21: case 0x22: case 0x23:
          return selectPage(second & 0x03);
        case 0x24:
          return push(curPage);
        default:
          break;
      }
      if (second >= 0x40 && second <= 0x4F) return storeToTarget(second);
      if (second >= 0x60 && second <= 0x6F) return loadFromTarget(second);
      return false;   /* резерв и мусор — ЕГГ0Г, как у ПМК */
    }

    var baseStep = core.step;

    function stepExt() {
      var ST = core.ST;
      if (ST.err) return 'error';
      if (ST.prog[ST.ip] !== PREFIX) return baseStep();

      var at = ST.ip;
      var second = ST.prog[(at + 1) % progLen];
      ST.ip = (at + 2) % progLen;

      if (!handle(second, at)) {
        ST.err = true;
        ST.run = false;
        if (typeof core.changed === 'function') core.changed();
        return 'error';
      }
      if (ST.err) { ST.run = false; return 'error'; }

      /* ПРАВКА v5: EXT-команда завершает набор числа, как любая команда
         ядра. Без этих строк «1 F0 05 4 2» даёт 142 — цифры после F0 05
         дописываются к уже набранной единице. */
      ST.typing = false;
      ST.input = '';
      ST.exp = false;

      return 'cont';
    }

    /* ---------- прогон ---------- */

    function runExt(limit) {
      var max = limit || 100000;
      var n = 0, res = 'cont';
      core.ST.err = false;
      core.ST.steps = 0;
      while (n < max) {
        res = stepExt();
        n++;
        core.ST.steps = n;
        if (res === 'stop' || res === 'error') break;
      }
      return {
        result: res,
        steps: n,
        err: core.ST.err,
        x: core.ST.X,
        overflow: (n >= max && res !== 'stop' && res !== 'error')
      };
    }

    /* ---------- подмена методов ядра ---------- */

    core.step = stepExt;
    core.run = runExt;

    /* setProgram создаёт новые массивы программы И регистров — оба
       нужно привязать к текущей странице и текущему банку, иначе
       запись уйдёт в отвязанные массивы, а регистры «исчезнут». */
    var baseSetProgram = core.setProgram;
    if (typeof baseSetProgram === 'function') {
      core.setProgram = function (prog, keepRegisters) {
        var res = baseSetProgram.call(core, prog, keepRegisters);
        pages[curPage] = core.ST.prog;
        banks[cur] = core.ST.R;
        return res;
      };
    }

    var baseReset = core.reset;
    core.reset = function (soft) {
      var r = baseReset.call(core, soft);
      if (!soft) {
        /* Регистры при сбросе стираются: ядро создало новый массив R,
           привязываем его к текущему банку, остальные банки гасим. */
        banks[cur] = core.ST.R;
        for (var k = 0; k < BANKS; k++) {
          if (k !== cur) banks[k] = zeroBank();
        }
        target = 0;

        /* Программа при сбросе НЕ стирается — так у МК-61 и так же
           должно быть у расширения. Ядро массив ST.prog сохраняет,
           поэтому страницы остаются на месте: привязываем только
           текущий массив. Обнулять остальные страницы нельзя —
           иначе сброс уничтожит программы, которых касаться не должен. */
        pages[curPage] = core.ST.prog;
      }
      return r;
    };

    /* ---------- запись EXT-команды ---------- */

    function writeExt(second) {
      var ST = core.ST;
      if (ST.ip < 0 || ST.ip > progLen - 2) {
        core.hint('Для двухбайтной команды нужно две ячейки, свободного места нет');
        return false;
      }
      ST.prog[ST.ip] = PREFIX;
      ST.prog[ST.ip + 1] = second & 0xFF;
      ST.ip = (ST.ip + 2) % progLen;
      return true;
    }

    return {
      core: core,
      ST: core.ST,
      bank: bank,
      selectBank: select,
      banksCount: function () { return BANKS; },
      targetBank: targetBank,
      setTargetBank: function (n) { return setTarget(n); },
      page: page,
      selectPage: selectPage,
      pagesCount: function () { return PAGES; },
      step: stepExt,
      run: runExt,
      writeExt: writeExt,
      extName: describe,
      PREFIX: PREFIX,
      BANKS: BANKS,
      PAGES: PAGES
    };
  }

  global.MKExt61 = {
    create: create,
    PREFIX: PREFIX,
    BANKS: BANKS,
    PAGES: PAGES,
    extName: describe,
    isExt: isExt
  };
})(typeof window !== 'undefined' ? window : this);
