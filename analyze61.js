/* =========================================================
   pmk61 / analyze61.js  v2
   «Карта программы»: разбор готового листинга для школьника.

   ЗАЧЕМ

   Декодер (disasm61.js) отвечает на вопрос «что написано в каждой
   ячейке». Карта отвечает на другой вопрос: «как эта программа
   устроена» — где блоки, куда ведут переходы, где настоящий цикл,
   а где переход в никуда.

   ЧЕГО КАРТА НЕ ДЕЛАЕТ

   Она НЕ восстанавливает формулу. Из кодов нельзя узнать замысел
   автора: В↑ бывает и разделителем при вводе, и намеренной копией,
   а два разных выражения дают одинаковые коды. Карта показывает
   СТРУКТУРУ, а не смысл. Это не ограничение реализации, а свойство
   самой записи программы.

   ГЛАВНОЕ ПРАВИЛО

   Длину команды и адрес цели берём у декодера, не пересчитываем
   сами. Единственный источник истины — MKDasm.rows. Иначе карта
   разойдётся с листингом ровно так же, как раньше расходился
   ui.js: команда «разорвётся», а адреса съедут на единицу.

   ЧТО СЧИТАЕТСЯ ПЕРЕХОДОМ

   Только строки, которые декодер пометил kind === 'jump'. Это
   ровно те коды, по которым исполняет ядро (MKCore.isJumpCmd),
   плюс трёхбайтная длина. Список переходов здесь не дублируется.

   Тип перехода определяется по НАЗВАНИЮ команды, а не по коду:
   названия даёт ядро (MKCore.cmdName), поэтому отдельная таблица
   кодов не нужна и не может разойтись с ядром.

   КОСВЕННЫЙ ПЕРЕХОД

   «К БП n» и «К ПП n» берут адрес из регистра, а не из ячеек.
   Какое там число, статически неизвестно: карта честно ставит
   предупреждение и не рисует стрелку в угаданное место.

   ЧТО НОВОГО В v2 (после проверки на телефоне 15/15)

   1. Адрес, попавший ВНУТРЬ трёхбайтной команды, больше не зовётся
      просто «переход в никуда». Так бывает от невнимательности:
      написали 5E 03, а команда занимает 02–04, и прыжок просит
      встать на середину собственного адреса. Теперь в замечании
      видно, какую команду адрес разрезал и куда, скорее всего,
      метил автор: «вероятно, имелся в виду 05».
   2. Отброшенный переход виден в отчёте: раньше внизу писало
      «Замечания: 1», а в разделе «Переходы» стояло «нет».
      Теперь он там есть с пометкой «не проведён».
   3. Листинг показывает, сколько ячеек занимает команда:
      «02  F x=0 → 03  (02–04)». Пропуск в нумерации адресов
      перестаёт выглядеть ошибкой.
   4. Граф mermaid подписывает блок всеми командами с адресами:
      было «B0["0: 1"]» — одинокое «1», стало
      «B0["00–02: 1, 2, F x=0 → 03"]». Вставленный в чат граф
      теперь понятен без сверки с листингом.
   ========================================================= */
(function (global) {
  'use strict';

  function dasm() {
    if (!global.MKDasm || typeof global.MKDasm.rows !== 'function') {
      throw new Error('analyze61: сначала подключите disasm61.js');
    }
    return global.MKDasm;
  }

  function has(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function pad(n) {
    n = Number(n) | 0;
    if (n < 0) return '??';
    return n < 10 ? '0' + n : String(n);
  }

  /* Адрес цели из двух ячеек: десятки, единицы.
     0x0A в первой — «•», то есть адрес выше 99: -0…-4. */
  function targetOf(row) {
    if (!row || !row.bytes) return -1;
    var a = row.bytes[1], b = row.bytes[2];
    if (a === undefined || b === undefined) return -1;
    if (a === 0x0A) return 100 + (b & 0x0F);
    if (a > 9 || b > 9) return -1;
    return a * 10 + b;
  }

  /* «БП → 07» → «БП». Название без адреса. */
  function nameOf(row) {
    var t = String((row && row.text) || '');
    var i = t.indexOf(' → ');
    return (i >= 0 ? t.slice(0, i) : t).trim();
  }

  /* Тип перехода по названию. Неизвестное считаем условным:
     стрелку всё равно рисуем, а в отчёте видно название. */
  function kindOf(row) {
    if (!row || row.kind !== 'jump') return '';
    var n = nameOf(row);
    if (/FL[0-9A-E]/i.test(n)) return 'loop';
    if (/^К\s/i.test(n)) return 'indirect';
    if (/ПП/i.test(n)) return 'call';
    if (/БП/i.test(n)) return 'jump';
    return 'cond';
  }

  function short(text, max) {
    var t = String(text || '').replace(/\s+/g, ' ').trim();
    if (t.length <= max) return t;
    return t.slice(0, max - 1) + '…';
  }

  function esc(text) {
    return String(text || '')
      .replace(/"/g, "'")
      .replace(/[\[\]{}|]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /* Строка, ВНУТРИ которой лежит адрес. Нужна только для
     трёхбайтных команд: 5E 00 03 занимает 02–04, и адрес 3
     попадает не на команду, а в её собственный аргумент. */
  function rowCovering(rows, addr) {
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (r.len > 1 && addr > r.addr && addr < r.addr + r.len) return r;
    }
    return null;
  }

  /* Подпись блока для графа: диапазон адресов и ВСЕ команды.
     Длинную подпись mermaid на телефоне разобрать нельзя,
     поэтому тело обрезаем, но не до одной команды. */
  function blockTitle(rows, b) {
    var parts = [];
    for (var q = b.fromIndex; q <= b.toIndex; q++) {
      var r = rows[q];
      if (!r || r.kind === 'nop') continue;
      parts.push(String(r.text || '').replace(/\s+/g, ' ').trim());
    }
    var body = parts.length ? parts.join(', ') : 'пусто';
    return pad(b.start) + '–' + pad(b.end) + ': ' + short(body, 46);
  }

  /* analyze(prog, opts) →
     {
       size,            сколько ячеек занимает программа
       rows,            строки декодера (внутри size)
       blocks,          [{n, start, end, fromIndex, toIndex, label}]
       edges,           [{from, to, addr, target, name, kind, back}]
       loops,           только обратные рёбра (настоящие циклы)
       warnings,        [{kind, addr, text}]
       jumps            все переходы с разобранными адресами
       skipped,         переходы, которые НЕ проведены стрелкой,
                        с причиной (в «Переходах» отчёта видны)
     } */
  function analyze(prog, opts) {
    var D = dasm();
    var size = D.used(prog, opts);

    var o = {};
    if (opts) {
      for (var key in opts) if (has(opts, key)) o[key] = opts[key];
    }
    /* За пределами used() ничего не анализируем: там пустые шаги,
       и без этого получались бы фантомные блоки в конце памяти. */
    o.length = size;

    var rows = size > 0 ? D.rows(prog, o) : [];
    var idx = {};
    var i;

    for (i = 0; i < rows.length; i++) idx[rows[i].addr] = i;

    var jumps = [];
    var warnings = [];
    var skipped = [];
    var starts = { '0': true };

    for (i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (r.kind !== 'jump') continue;

      var j = {
        addr: r.addr,
        rowIndex: i,
        name: nameOf(r),
        kind: kindOf(r),
        target: targetOf(r),
        next: r.addr + r.len,
        text: r.text
      };
      jumps.push(j);

      starts[String(j.next)] = true;
      if (j.kind !== 'indirect' && j.target >= 0) starts[String(j.target)] = true;

      if (j.target < 0) {
        warnings.push({ kind: 'addr', addr: j.addr, text: 'адрес не разобран: ' + r.text });
      }
    }

    /* Начала блоков — только те адреса, где реально есть строка. */
    var startAddrs = [];
    for (var k in starts) {
      if (!has(starts, k)) continue;
      var a = parseInt(k, 10);
      if (has(idx, a)) startAddrs.push(a);
    }
    startAddrs.sort(function (x, y) { return x - y; });

    var blockOfIndex = {};
    var blocks = [];

    for (i = 0; i < startAddrs.length; i++) {
      var from = idx[startAddrs[i]];
      var to = (i + 1 < startAddrs.length) ? idx[startAddrs[i + 1]] - 1 : rows.length - 1;
      if (to < from) continue;

      var b = {
        n: blocks.length,
        start: rows[from].addr,
        end: rows[to].addr,
        fromIndex: from,
        toIndex: to,
        label: ''
      };

      /* Короткая подпись блока для отчёта — первая содержательная строка. */
      for (var q = from; q <= to; q++) {
        if (rows[q].kind !== 'nop' && rows[q].kind !== 'jump') {
          b.label = short(rows[q].text, 24);
          break;
        }
      }
      if (!b.label && rows[from]) b.label = short(rows[from].text, 24);

      blocks.push(b);
      for (q = from; q <= to; q++) blockOfIndex[q] = b.n;
    }

    var edges = [];
    var loops = [];

    for (i = 0; i < jumps.length; i++) {
      var jj = jumps[i];
      var fromBlock = blockOfIndex[jj.rowIndex];
      if (fromBlock === undefined) continue;

      if (jj.kind === 'indirect') {
        warnings.push({
          kind: 'indirect',
          addr: jj.addr,
          text: 'адрес берётся из регистра: ' + jj.name
        });
        skipped.push({
          from: fromBlock, addr: jj.addr, target: -1, name: jj.name,
          kind: jj.kind, why: 'адрес из регистра, статически неизвестен'
        });
        continue;
      }

      if (jj.target < 0 || !has(idx, jj.target)) {
        /* Прежде чем звать это «никуда», проверим: может, адрес
           разрезал трёхбайтную команду. Тогда подскажем, куда
           метил автор — на первый адрес после этой команды. */
        var cov = jj.target >= 0 ? rowCovering(rows, jj.target) : null;
        var why;

        if (cov) {
          var after = cov.addr + cov.len;
          why = 'цель ' + pad(jj.target) + ' попадает внутрь команды на адресе ' +
                pad(cov.addr) + ' (занимает ' + pad(cov.addr) + '–' + pad(after - 1) +
                '); вероятно, имелся в виду ' + pad(after);
          warnings.push({ kind: 'inside-cmd', addr: jj.addr, target: jj.target, text: why });
        } else {
          why = 'переход в никуда: ' + jj.name + ' → ' +
                (jj.target < 0 ? '?' : pad(jj.target));
          warnings.push({ kind: 'dangling', addr: jj.addr, target: jj.target, text: why });
        }

        skipped.push({
          from: fromBlock, addr: jj.addr, target: jj.target, name: jj.name,
          kind: jj.kind, why: why
        });
        continue;
      }

      var toBlock = blockOfIndex[idx[jj.target]];
      if (toBlock === undefined) continue;

      if (startAddrs.indexOf(jj.target) < 0) {
        warnings.push({
          kind: 'inside',
          addr: jj.addr,
          text: 'переход в середину блока, адрес ' + pad(jj.target)
        });
      }

      /* Назад — значит цикл. Вперёд — обычная ветка. */
      var back = jj.target <= jj.addr;

      edges.push({
        from: fromBlock,
        to: toBlock,
        addr: jj.addr,
        target: jj.target,
        name: jj.name,
        kind: jj.kind,
        back: back
      });

      if (back && (jj.kind === 'jump' || jj.kind === 'loop' || jj.kind === 'cond')) {
        loops.push({
          from: fromBlock,
          to: toBlock,
          addr: jj.addr,
          target: jj.target,
          kind: jj.kind,
          name: jj.name
        });
      }
    }

    return {
      size: size,
      rows: rows,
      blocks: blocks,
      edges: edges,
      loops: loops,
      warnings: warnings,
      jumps: jumps,
      skipped: skipped
    };
  }

  /* Граф для mermaid: его видно и в чате Honer AI, и на mermaid.live.
     Подпись блока — адреса и все команды, иначе в чате остаётся
     одинокое «1» и граф ничего не объясняет. */
  function mermaid(a) {
    var out = ['graph TD'];
    var i;

    for (i = 0; i < a.blocks.length; i++) {
      var b = a.blocks[i];
      out.push('  B' + b.n + '["' + esc(blockTitle(a.rows, b)) + '"]');
    }

    for (i = 0; i < a.edges.length; i++) {
      var e = a.edges[i];
      var lbl = e.back ? 'назад' : e.name;
      out.push('  B' + e.from + ' -->|' + esc(lbl) + '| B' + e.to);
    }

    return out.join('\n');
  }

  /* Листинг с занятыми ячейками: у трёхбайтной команды справа
     видно, сколько места она съела. Так пропуск «02 → 05» в
     нумерации адресов не выглядит ошибкой. */
  function listing(a) {
    var out = [];
    for (var i = 0; i < a.rows.length; i++) {
      var r = a.rows[i];
      var span = r.len > 1 ? '  (' + pad(r.addr) + '–' + pad(r.addr + r.len - 1) + ')' : '';
      out.push(pad(r.addr) + '  ' + r.text + span);
    }
    return out.join('\n');
  }

  /* Текстовый отчёт: то же самое словами, для копирования в чат. */
  function report(a) {
    var lines = [];
    var i;

    lines.push('Программа: ' + a.size + ' яч., ' + a.blocks.length + ' блок(ов)');
    lines.push('');

    lines.push('Блоки:');
    for (i = 0; i < a.blocks.length; i++) {
      var b = a.blocks[i];
      lines.push('  Б' + b.n + '  ' + pad(b.start) + '–' + pad(b.end) + '  ' + b.label);
    }

    lines.push('');
    lines.push('Переходы:');
    var sk = a.skipped || [];
    if (!a.edges.length && !sk.length) lines.push('  нет');
    for (i = 0; i < a.edges.length; i++) {
      var e = a.edges[i];
      lines.push('  ' + pad(e.addr) + '  ' + e.name + ' → ' + pad(e.target) +
                 '  (Б' + e.from + ' → Б' + e.to + ')' + (e.back ? '  цикл' : ''));
    }
    /* Отброшенные переходы тоже видны — иначе внизу стоит
       «Замечания: 1», а здесь «нет», и это сбивает с толку. */
    for (i = 0; i < sk.length; i++) {
      var s = sk[i];
      lines.push('  ' + pad(s.addr) + '  ' + s.name + ' → ' +
                 (s.target < 0 ? '?' : pad(s.target)) +
                 '  (не проведён, Б' + s.from + ' — см. «Замечания»)');
    }

    lines.push('');
    lines.push('Циклы: ' + (a.loops.length ? a.loops.length : 'нет'));
    for (i = 0; i < a.loops.length; i++) {
      var l = a.loops[i];
      lines.push('  ' + pad(l.addr) + '  ' + l.name + ' назад на ' + pad(l.target) +
                 ' (Б' + l.from + ' → Б' + l.to + ')');
    }

    lines.push('');
    lines.push('Замечания: ' + (a.warnings.length ? a.warnings.length : 'нет'));
    for (i = 0; i < a.warnings.length; i++) {
      var w = a.warnings[i];
      lines.push('  ' + pad(w.addr) + '  ' + w.text);
    }

    return lines.join('\n');
  }

  global.MKAnalyze = {
    analyze: analyze,
    mermaid: mermaid,
    report: report,
    listing: listing,
    blockTitle: blockTitle,
    targetOf: targetOf,
    nameOf: nameOf,
    kindOf: kindOf
  };
})(typeof window !== 'undefined' ? window : this);
