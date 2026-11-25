/* =========================================================
   pmk61 / ext61.js
   Расширение линии МК-61: двухбайтные команды с префиксом 0xF0,
   банки регистров и межбанковый доступ.

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
     20…23   резерв: страницы программы (пока ЕГГ0Г)
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

   Четыре банка по 15 регистров: RG0…RGe каждого банка — обычные
   имена, различаются только номером банка. Всё, что считает и не
   думает о банках, работает в текущем банке; поэтому программы
   МК-61 в банке 0 ведут себя точно как раньше, а банки — это
   просто ещё 45 регистров, которые видно только по команде F0.

   ЧЕГО ЗДЕСЬ СОЗНАТЕЛЬНО НЕТ

   Единого адресного пространства: программа по-прежнему не может
   читать себя как данные. Архитектура остаётся гарвардской, и это
   не ограничение, а решение — см. «МК-62» в README.
   ========================================================= */
(function (global) {
  'use strict';

  var PREFIX = 0xF0;
  var BANKS = 4;
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
    0x11: 'следующий адрес → X'
  };

  var REG_CHARS = '0123456789abcde';

  /* ---------- вспомогательное ---------- */

  function regChar(lo) {
    return (lo === REG_F) ? '0' : REG_CHARS.charAt(lo & 0x0F);
  }

  function describe(second) {
    var s = second & 0xFF;
    if (NAMES[s]) return NAMES[s];
    if (s >= 0x40 && s <= 0x4F) return 'x→П ' + regChar(s) + ' в банк-адресат';
    if (s >= 0x60 && s <= 0x6F) return 'П→x ' + regChar(s) + ' из банка-адресата';
    if (s >= 0x20 && s <= 0x23) return 'резерв: страница ' + (s & 0x03);
    return 'неизвестная EXT-команда';
  }

  function isExt(second) {
    var s = second & 0xFF;
    if (Object.prototype.hasOwnProperty.call(NAMES, s)) return true;
    return (s >= 0x40 && s <= 0x4F) || (s >= 0x60 && s <= 0x6F);
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

    var banks = [];
    for (var i = 0; i < BANKS; i++) banks.push(zeroBank());
    /* нулевой банк — родной массив ядра, чтобы МК-61-программы
       работали с регистрами без единой переделки */
    banks[0] = core.ST.R;
    var cur = 0;
    /* банк, к которому обращаются команды 40…/60… без переключения */
    var target = 0;

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

    var baseReset = core.reset;
    core.reset = function (soft) {
      var r = baseReset.call(core, soft);
      if (!soft) {
        /* ядро создало новый массив — привязать его к текущему банку,
           остальные банки при полном сбросе обнуляются */
        banks[cur] = core.ST.R;
        for (var k = 0; k < BANKS; k++) {
          if (k !== cur) banks[k] = zeroBank();
        }
        target = 0;
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
      step: stepExt,
      run: runExt,
      writeExt: writeExt,
      extName: describe,
      PREFIX: PREFIX,
      BANKS: BANKS
    };
  }

  global.MKExt61 = {
    create: create,
    PREFIX: PREFIX,
    BANKS: BANKS,
    extName: describe,
    isExt: isExt
  };
})(typeof window !== 'undefined' ? window : this);
