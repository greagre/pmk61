/* =========================================================
   pmk61 / codes-aliases.js  (v4, 27.11.2026)

   СЛОЙ: СИНОНИМЫ ИМЁН КОМАНД ИЗ ЧУЖИХ ЛИСТИНГОВ

   ЗАЧЕМ

   Одна и та же команда в разных книгах пишется по-разному:
   «П→X2», «Пx2», «ИП2», «ИП→X2». Панель кодов узнавала только
   написание нашего ядра (MKCore.cmdName) и на «ИП2», «X#0»,
   «KB», «L2» отвечала «не знаю команду».

   Здесь собран словарь вариантов: каждая строка — группа
   синонимов одной команды.

   ПРО ИСТОЧНИК

   Таблица написаний взята из файла мнемоник чужой программы
   (mMnemonics). Оттуда берётся ТОЛЬКО НАПИСАНИЕ. Нумерация кодов
   там другая: С/П = 3A, БП = 3D, В/О = 39, а у нас С/П = 50,
   БП = 51, В/О = 52. Взять оттуда индексы — значит молча уехать
   по чужим адресам.

   Код каждой группы определяется здесь, по нашей таблице: берём
   вариант, приводим к ключу, ищем в nameIndex() (он построен из
   MKCore.cmdName). Не нашлось — группа уходит в skipped.

   ЧТО БЫЛО В v2

   Аргументные команды: «ИП2» — одна команда, а не «ИП» + цифра.
   Для каждой формы и каждой цифры 0…E строится ключ, код берётся
   из нашей карты по эталону, а не арифметикой «+n».

   ЧТО БЫЛО В v3

   Добавлены слитные формы «ИП→X», «ИПX» — без них «ИП→X4» не
   давало ключа, хотя «ИП4» и «П→X4» работали.

   ЧТО НОВОГО В v4

   1. РЕШЁТКА. Проверка «X#0 = Fx≠0» падала, хотя «X!=0» работала.
      Причина не в словаре: stripComments() в панели режет «#…»
      как комментарий и превращает «X#0» в «x» — команда исчезает
      до нормализации. Теперь prepare() заранее переводит «X#0»
      в «X≠0», а комментарии с «#» в остальных местах по-прежнему
      работают. Панель получает уже подготовленный текст: обёрнуты
      parseKeys/parseCodes/parseMixed/detectMode, плюс перед нажатием
      любой кнопки в #codesPanel поле чистится в capture-фазе.

   2. ЛОГИЧЕСКИЕ К-КОМАНДЫ. Группы «К ∧»/«К ∨»/«К ⊕» находили
      не тот код (0D вместо 37/38/39), потому что наше ядро
      называет эти команды латиницей: «K AND», «K OR», «K XOR».
      В начало групп поставлены именно эти эталоны — теперь код
      берётся по имени ядра, а кириллические варианты получают
      его же.

   3. probe() — диагностика: показывает, какой код даёт карта для
      перечисленных записей. Нужна, чтобы разбирать расхождения
      без консоли.

   ЧЕГО ЗДЕСЬ СОЗНАТЕЛЬНО НЕТ

     • одиночная «П» как синоним X→П — перехватывала бы «П→X2»;
     • одиночные «F» и «FF» — мусорные имена чужой таблицы;
     • группа «F↻» — голая стрелка «→» после нормализации дала бы
       пустой ключ и совпала бы с чем угодно.

   ГДЕ СТОИТ В index.html

   После codes-panel.js и codes-names-fix.js: панель должна уже
   существовать, а имена без стрелки — уже быть в таблице.
   ========================================================= */
(function (global) {
  'use strict';

  var P = global.MKCodePanel;
  if (!P || typeof P.nameIndex !== 'function') return;
  if (P.__aliases) return;                 /* второй раз не строим */
  P.__aliases = true;

  /* ---------- группы синонимов (написание, не коды) ---------- */

  var GROUPS = [
    ['F10^x', '10ˣ', 'F10^X', '10X', 'F10X', '10**X'],
    ['KНОП', 'НОП', 'K0'],
    ['F e^x', 'Eˣ', 'FE^X', 'E^X', 'EX', 'FEX', 'FE**X', 'E**X'],
    ['F lg', 'LG'],
    ['F ln', 'LN'],
    ['KЧ→М', 'KЧM', 'ЧM', 'K3'],
    ['F sin⁻¹', 'SIN⁻¹', 'FSIN-1', 'FARCSIN', 'ARCSIN', 'SIN-1'],
    ['F cos⁻¹', 'COS⁻¹', 'FCOS-1', 'FARCCOS', 'ARCCOS', 'COS-1'],
    ['F tg⁻¹', 'TG⁻¹', 'FTG-1', 'FARCTG', 'ARCTG', 'TG-1'],
    ['K|x|', '|X|', 'K4'],
    ['K зн', 'ЗН', 'K5'],
    ['KГ→М', 'Г→М', 'KГM', 'ГM', 'K6'],
    ['F sin', 'FSIN', 'SIN'],
    ['F cos', 'FCOS', 'COS'],
    ['F tg', 'FTG', 'TG'],
    ['K[x]', '[X]', 'K7'],
    ['K{x}', '{X}', '(X)', 'K(X)', 'K8'],
    ['K max', 'KMAX', 'MAX', 'K9'],
    ['−', '–'],
    ['×', '⋅', '*'],
    ['÷', '/', ':'],
    ['F π', 'FΠ', 'ПИ', 'Π', 'FПИ'],
    ['KМ→Г', 'M→Г', 'KMГ', 'MГ', 'K+'],
    ['F √', '√', 'KBKOР', 'KOРEНЬ', 'KBKOРEНЬ', 'FKBKOР', 'FKOРEНЬ',
      'FKBKOРEНЬ', 'КОРЕНЬ'],
    ['F x²', 'FX²', 'X^2', 'X2', 'X²', 'FX^2', 'FX2'],
    ['F 1/x', 'F1/X', '1/X'],
    ['↔', '<->', 'XY', 'X↔Y', '⟷'],
    ['В↑', 'B↑', '^', 'B^', '↑'],
    ['F xʸ', 'FXʸ', 'Xʸ', 'FX^Y', 'X^Y', 'FXY'],
    ['K −', 'K–'],
    ['K ×', 'KX', 'K*'],
    ['K ÷', 'K/', 'K:'],
    ['KМ→Ч', 'M→Ч', 'KM→Ч'],
    ['F Вх', 'FBX', 'ВX'],
    ['K СЧ', 'KCЧ', 'CЧ', 'KE'],
    ['/-/', '+/-'],
    ['ВП', 'BП'],
    ['Cx', 'CX'],
    /* v4: эталон — написание ядра («K AND»), кириллица и знаки идут
       следом и получают тот же код. */
    ['K AND', 'К ∧', 'KɅ', 'КɅ', 'K^', 'K⋀', 'K∧', '∧', '⋀', 'KA', 'KΛ', 'K.'],
    ['K OR', 'К ∨', 'KV', 'Kv', 'K⋁', 'K∨', '∨', '⋁', 'KB'],
    ['K XOR', 'К ⊕', 'K(+)', 'K⊕', '(+)', '⊕', 'KBП', 'KC'],
    ['K ИНВ', 'К ИНВ', 'Kинв', 'ИНB', 'KCX', 'KD'],
    ['В/О', 'B/0', 'B/O'],
    ['С/П', 'C/П'],
    ['Fx≥0', 'X>=0', 'X≥0', 'X⩾0', 'Fx≥O', 'X>=O', 'X≥O', 'X⩾O'],
    ['Fx≠0', 'X#0', 'X!=0', 'X<>0', 'FX#0', 'FX!=0', 'FX<>0',
      'FX≠O', 'X#O', 'X!=O', 'X<>O', 'FX#O', 'FX!=O', 'FX<>O'],
    ['Fx<0', 'X<0', 'FX<O', 'X<O'],
    ['Fx=0', 'X=0', 'FX=O', 'X=O'],
    ['БП'],
    ['ПП'],
    ['F L0', 'L0', 'FLO', 'LO'],
    ['F L1', 'L1'],
    ['F L2', 'L2'],
    ['F L3', 'L3'],
    ['X→П', 'XП'],
    ['П→X', 'Пx', 'ПX', 'ИП'],
    ['Kx≠0', 'KX≠0', 'KX#0', 'KX!=0', 'KX<>0',
      'KX≠O', 'KX#O', 'KX!=O', 'KX<>O'],
    ['Kx≥0', 'KX≥0', 'KX⩾0', 'KX>=0', 'Kx≥O', 'KX≥O', 'KX⩾O', 'KX>=O'],
    ['Kx<0', 'KX<0', 'KX<O'],
    ['Kx=0', 'KX=0', 'KX=O'],
    ['KБП'],
    ['KПП'],
    ['KxП', 'KXП', 'KX→П', 'KП', 'КП'],
    ['KПx', 'KПX', 'KП→x', 'KП→X', 'KИП']
  ];

  /* ---------- аргументные команды ---------- */

  var ARG_SETS = [
    { etalon: 'П→X',
      forms: ['П→X', 'Пx', 'ПX', 'ИП', 'ИП→X', 'ИПX', 'ИПх', 'П→х'] },
    { etalon: 'X→П',
      forms: ['X→П', 'XП', 'ХП', 'ИП→П', 'Х→П'] },
    { etalon: 'Kx≠0', forms: ['Kx≠0', 'KX≠0', 'KX#0', 'KX!=0',
                              'KX<>0', 'KX≠O', 'KX#O', 'KX!=O', 'KX<>O'] },
    { etalon: 'Kx≥0', forms: ['Kx≥0', 'KX≥0', 'KX⩾0', 'KX>=0'] },
    { etalon: 'Kx<0', forms: ['Kx<0', 'KX<0'] },
    { etalon: 'Kx=0', forms: ['Kx=0', 'KX=0'] },
    { etalon: 'F L', forms: ['F L', 'FL', 'L'] }
  ];

  var HEXDIG = '0123456789ABCDE'.split('');

  /* ---------- ключи ---------- */

  /* Копия normalizeName из codes-panel.js: внутренний parseKeys считает
     ключ своей замкнутой копией и стрелку НЕ выбрасывает. */
  var LIKELY = {
    p: 'п', x: 'х', c: 'с', b: 'в', k: 'к', a: 'а',
    e: 'е', o: 'о', t: 'т', m: 'м', h: 'н', y: 'у'
  };

  function baseNorm(s) {
    var t = String(s == null ? '' : s).toLowerCase();
    t = t.replace(/->|=>|—>|–>/g, '→');
    t = t.replace(/\*/g, '×');
    t = t.replace(/\//g, '÷');
    t = t.replace(/[−–—-]/g, '−');
    t = t.replace(/[pxcbkaeotmhy]/g, function (ch) { return LIKELY[ch] || ch; });
    t = t.replace(/\s+/g, '');
    t = t.replace(/\./g, '');
    return t;
  }

  function pre(s) {
    var t = String(s == null ? '' : s);
    t = t.replace(/\*\*/g, '^');
    t = t.replace(/<->|⟷|↔|⇔/g, '\u2194');
    t = t.replace(/>=|⩾/g, '≥');
    t = t.replace(/<=|⩽/g, '≤');
    t = t.replace(/!=|<>|#/g, '≠');
    t = t.replace(/([≥≤≠=<>])[OoОо]/g, '$10');
    t = t.replace(/Π/g, 'π');
    t = t.replace(/\^2(?![0-9])/g, '²');
    t = t.replace(/\^3(?![0-9])/g, '³');
    t = t.replace(/ᐨ¹|⁻¹/g, '⁻¹');
    t = t.replace(/([a-zа-яё])[-−–]1(?![0-9])/g, '$1⁻¹');
    return t;
  }

  function normKey(s) {
    return baseNorm(pre(s));
  }

  /* ---------- подготовка текста панели (v4) ----------

     Панель режет «#…» как комментарий. Для «X#0» это губительно:
     от команды остаётся «x». Переводим только те «#», которые стоят
     внутри команды сравнения: буква, затем #, затем цифра или O.
     Остальные «#» остаются комментариями — их обрежет панель. */
  var HASH_CMD = /([XxХхKkКк])\s*#\s*([0OОо0-9A-Ea-e])/g;

  function prepare(s) {
    return String(s == null ? '' : s).replace(HASH_CMD, '$1≠$2');
  }

  function put(map, key, code, stats) {
    if (!key) return;
    if (map[key] === undefined) { map[key] = code; stats.added++; }
    else if (map[key] !== code && stats.conflicts.indexOf(key) < 0) {
      stats.conflicts.push(key);
    }
  }

  /* ---------- построение ---------- */

  var map = P.nameIndex();
  var stats = {
    groups: 0, added: 0, skipped: [], total: GROUPS.length,
    args: 0, conflicts: []
  };

  if (map) {
    for (var i = 0; i < GROUPS.length; i++) {
      var g = GROUPS[i];
      var code;
      var j, k1, k2;

      for (j = 0; j < g.length; j++) {
        k1 = baseNorm(g[j]);
        k2 = normKey(g[j]);
        if (k1 && map[k1] !== undefined) { code = map[k1]; break; }
        if (k2 && map[k2] !== undefined) { code = map[k2]; break; }
      }
      if (code === undefined) {
        stats.skipped.push(g[0]);
        continue;
      }
      stats.groups++;
      for (j = 0; j < g.length; j++) {
        k1 = baseNorm(g[j]);
        k2 = normKey(g[j]);
        put(map, k1, code, stats);
        if (k2 !== k1) put(map, k2, code, stats);
      }
    }

    for (var s = 0; s < ARG_SETS.length; s++) {
      var set = ARG_SETS[s];
      for (var d = 0; d < HEXDIG.length; d++) {
        var dig = HEXDIG[d];
        var refCode = map[baseNorm(set.etalon + dig)];
        if (refCode === undefined) continue;
        for (var f = 0; f < set.forms.length; f++) {
          var key = baseNorm(set.forms[f] + dig);
          if (key && map[key] === undefined) {
            map[key] = refCode;
            stats.added++;
            stats.args++;
          }
        }
      }
    }
  }

  /* ---------- обёртки панели ---------- */

  ['parseKeys', 'parseCodes', 'parseMixed', 'detectMode'].forEach(function (fn) {
    var orig = P[fn];
    if (typeof orig !== 'function') return;
    P[fn] = function (text) {
      var args = Array.prototype.slice.call(arguments);
      args[0] = prepare(text);
      return orig.apply(P, args);
    };
  });

  /* Перед нажатием любой кнопки панели чистим поле: кнопки читают
     его своим обработчиком, а он срабатывает после capture. */
  if (typeof document !== 'undefined') {
    document.addEventListener('click', function (ev) {
      var t = ev.target;
      var host = null;
      while (t && t !== document) {
        if (t.id === 'codesPanel') { host = t; break; }
        t = t.parentNode;
      }
      if (!host) return;
      var area = document.getElementById('codesSrc');
      if (!area || area.value.indexOf('#') < 0) return;
      var fixed = prepare(area.value);
      if (fixed !== area.value) area.value = fixed;
    }, true);
  }

  global.MKCodesAliases = {
    version: 4,
    normKey: normKey,
    baseNorm: baseNorm,
    prepare: prepare,
    groups: stats.groups,
    added: stats.added,
    args: stats.args,
    total: stats.total,
    skipped: stats.skipped,
    conflicts: stats.conflicts,
    index: function () { return P.nameIndex(); },
    /* диагностика: что карта говорит про перечисленные записи */
    probe: function (list) {
      var m = P.nameIndex();
      return (list || []).map(function (raw) {
        var k = baseNorm(prepare(raw));
        return { text: raw, key: k, code: m[k] };
      });
    }
  };
})(typeof window !== 'undefined' ? window : this);
