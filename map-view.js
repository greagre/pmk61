/* map-view.js v1 — рисование блок-схемы программы МК-61.
   Только картинка: блоки, границы участков, стрелки и петли.
   Расчёт (участки, переходы, циклы) берётся из analyze61.js.
   Подключается и в отдельную страницу карты, и во вкладку «Карта» калькулятора. */
(function (global) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var ROW_H = 26;      /* высота строки листинга */
  var PAD_X = 12;      /* поля внутри рамки */
  var HEAD_H = 24;     /* полоса заголовка участка */
  var GAP = 30;        /* промежуток между участками */
  var LOOP_W = 62;     /* вынос петли вправо */
  var SIDE_W = 74;     /* вынос перехода к другому участку */
  var MIN_W = 230;     /* минимальная ширина рамки */

  function pad2(v) {
    v = String(v);
    return v.length < 2 ? '0' + v : v;
  }
  function num(v, d) {
    return (v === undefined || v === null || v === '' || isNaN(v)) ? d : Number(v);
  }
  function firstDefined() {
    for (var i = 0; i < arguments.length; i++) {
      if (arguments[i] !== undefined && arguments[i] !== null && arguments[i] !== '') return arguments[i];
    }
    return undefined;
  }

  function el(tag, attrs, text) {
    var n = document.createElementNS(NS, tag);
    if (attrs) {
      for (var k in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, k) && attrs[k] !== undefined && attrs[k] !== null) {
          n.setAttribute(k, attrs[k]);
        }
      }
    }
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }

  /* ---- совместимость имён полей анализа ---- */

  function rowsOf(a) { return (a && a.rows) || []; }
  function blocksOf(a) { return (a && a.blocks) || (a && a.areas) || []; }
  function edgesOf(a) { return (a && a.edges) || []; }
  function skippedOf(a) { return (a && a.skipped) || []; }

  function rowAddr(r) { return num(r && r.addr, 0); }
  function rowLen(r) { var n = num(r && r.len, 1); return n > 0 ? n : 1; }
  function rowText(r) { return String(firstDefined(r && r.text, r && r.name, r && r.code, '')); }
  function rowCode(r) { return firstDefined(r && r.code, ''); }

  function blockStart(b, i) {
    return num(firstDefined(b && b.start, b && b.addr, b && b.from, b && b.first), i * 0);
  }
  function blockEndRaw(b, i) {
    return num(firstDefined(b && b.end, b && b.last, b && b.to), blockStart(b, i));
  }
  function blockName(b, i) {
    return String(firstDefined(b && b.name, b && b.label, b && b.title, 'Б' + i));
  }

  function edgeFrom(e) { return num(firstDefined(e && e.from, e && e.src, e && e.a, e && e.block), -1); }
  function edgeTo(e) { return num(firstDefined(e && e.to, e && e.dst, e && e.b, e && e.targetBlock), -1); }
  function edgeKind(e) { return String(firstDefined(e && e.kind, e && e.dir, '')); }
  function edgeName(e) {
    return String(firstDefined(e && e.name, e && e.text, e && e.command, 'переход'));
  }

  /* ---- границы участка: по последней ЗАНЯТОЙ ячейке ---- */

  function blockRange(a, b, i) {
    var start = blockStart(b, i);
    var rawEnd = blockEndRaw(b, i);
    var end = start;
    var rows = rowsOf(a);
    for (var k = 0; k < rows.length; k++) {
      var r = rows[k];
      var ad = rowAddr(r);
      if (ad < start) continue;
      if (rawEnd >= start && ad > rawEnd) continue;
      var last = ad + rowLen(r) - 1;
      if (last > end) end = last;
    }
    return { start: start, end: end };
  }

  function blockRows(a, start, end) {
    var out = [];
    var rows = rowsOf(a);
    for (var k = 0; k < rows.length; k++) {
      var ad = rowAddr(rows[k]);
      if (ad >= start && ad <= end) out.push(rows[k]);
    }
    return out;
  }

  /* Раскладка: для каждого участка — рамка, строки, петли и внешние переходы. */
  function layout(a) {
    var blocks = blocksOf(a);
    var edges = edgesOf(a);
    var areas = [];

    if (!blocks.length) {
      var rows = rowsOf(a);
      if (rows.length) {
        areas.push({ index: 0, name: 'Участок 1', start: rowAddr(rows[0]), end: rowAddr(rows[rows.length - 1]) + rowLen(rows[rows.length - 1]) - 1 });
      }
    } else {
      for (var i = 0; i < blocks.length; i++) {
        var rg = blockRange(a, blocks[i], i);
        areas.push({ index: i, name: blockName(blocks[i], i), start: rg.start, end: rg.end });
      }
    }

    for (var j = 0; j < areas.length; j++) {
      areas[j].rows = blockRows(a, areas[j].start, areas[j].end);
      areas[j].loops = [];
      areas[j].outs = [];
    }

    /* куда относится адрес перехода */
    function areaAt(addr) {
      for (var q = 0; q < areas.length; q++) {
        if (addr >= areas[q].start && addr <= areas[q].end) return areas[q];
      }
      return null;
    }

    for (var e = 0; e < edges.length; e++) {
      var ed = edges[e];
      var fromA = areas[edgeFrom(ed)] || areaAt(num(firstDefined(ed && ed.at, ed && ed.addr), -1));
      if (!fromA) continue;
      var toA = areas[edgeTo(ed)] || areaAt(num(firstDefined(ed && ed.target, ed && ed.cell), -1));
      if (toA && toA === fromA) {
        fromA.loops.push({ name: edgeName(ed), kind: edgeKind(ed) });
      } else if (toA) {
        fromA.outs.push({ name: edgeName(ed), to: toA.index });
      }
    }

    return areas;
  }

  /* Высота рамки участка: заголовок + строки команд + серые строки адресов */
  function areaLines(area) {
    var lines = [];
    for (var i = 0; i < area.rows.length; i++) {
      var r = area.rows[i];
      var ad = rowAddr(r);
      var len = rowLen(r);
      lines.push({
        kind: 'cmd',
        addr: ad,
        last: ad + len - 1,
        len: len,
        code: rowCode(r),
        text: rowText(r)
      });
      if (len > 1) {
        lines.push({
          kind: 'addr',
          addr: ad + 1,
          last: ad + len - 1,
          code: '',
          text: 'адрес ' + pad2(area.rows[i] && 0 === 0 ? 0 : 0) + '',
          raw: r
        });
      }
    }
    return lines;
  }

  function drawArea(svg, area, x, y, w, opts) {
    var g = el('g', { 'class': 'area' });
    var lines = areaLines(area);
    var h = HEAD_H + PAD_X + lines.length * ROW_H + PAD_X;

    g.appendChild(el('rect', {
      x: x, y: y, width: w, height: h, rx: 10, ry: 10,
      fill: opts.areaFill, stroke: opts.areaStroke, 'stroke-width': 2
    }));

    var title = g.appendChild(el('text', {
      x: x + PAD_X, y: y + 18, 'font-size': 13, 'font-weight': 700, fill: opts.titleColor
    }, area.name + ' · ' + pad2(area.start) + '\u2013' + pad2(area.end)));
    title.setAttribute('class', 'area-title');

    var ty = y + HEAD_H + 4;
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i];
      ty += ROW_H;
      if (ln.kind === 'addr') {
        var t0 = el('text', {
          x: x + PAD_X + 34, y: ty - 6, 'font-size': 12, fill: opts.mutedColor
        }, pad2(ln.addr) + '\u2013' + pad2(ln.last) + '  адрес');
        g.appendChild(t0);
        continue;
      }
      g.appendChild(el('text', {
        x: x + PAD_X, y: ty - 6, 'font-size': 13,
        fill: opts.mutedColor, 'font-family': 'monospace'
      }, pad2(ln.addr)));
      g.appendChild(el('text', {
        x: x + PAD_X + 34, y: ty - 6, 'font-size': 13, fill: opts.textColor
      }, ln.text));
      if (ln.len > 1) {
        g.appendChild(el('text', {
          x: x + PAD_X + 34, y: ty + 8, 'font-size': 11, fill: opts.mutedColor
        }, '(' + pad2(ln.addr) + '\u2013' + pad2(ln.last) + ')'));
      }
    }

    /* петли назад — справа от рамки */
    for (var L = 0; L < area.loops.length; L++) {
      var loop = area.loops[L];
      var ax = x + w;
      var ay = y + h - 14;
      var by = y + 14;
      var path = 'M ' + ax + ' ' + ay +
        ' L ' + (ax + LOOP_W) + ' ' + ay +
        ' L ' + (ax + LOOP_W) + ' ' + by +
        ' L ' + (ax + 6) + ' ' + by;
      g.appendChild(el('path', {
        d: path, fill: 'none', stroke: opts.loopColor, 'stroke-width': 2
      }));
      g.appendChild(el('polygon', {
        points: (ax + 6) + ',' + by + ' ' + (ax + 16) + ',' + (by - 5) + ' ' + (ax + 16) + ',' + (by + 5),
        fill: opts.loopColor
      }));
      var lx = ax + LOOP_W + 4;
      var ly = (ay + by) / 2 + 4;
      g.appendChild(el('text', {
        x: lx, y: ly, 'font-size': 12, fill: opts.loopColor
      }, '\u21ba ' + loop.name));
    }

    area._h = h;
    area._y = y;
    area._x = x;
    area._w = w;
    svg.appendChild(g);
    return h;
  }

  /* Переходы между участками: линия сбоку с подписью над ней. */
  function drawOuts(svg, areas, opts) {
    for (var i = 0; i < areas.length; i++) {
      var from = areas[i];
      for (var k = 0; k < from.outs.length; k++) {
        var out = from.outs[k];
        var to = areas[out.to];
        if (!to || to._y === undefined) continue;
        var down = to._y > from._y;
        var x1 = from._x + from._w + 10;
        var y1 = down ? from._y + from._h - 12 : from._y + 12;
        var x2 = to._x + to._w + 10;
        var y2 = down ? to._y + 12 : to._y + to._h - 12;
        var xm = Math.max(x1, x2) + 18;
        var d = 'M ' + x1 + ' ' + y1 + ' H ' + xm + ' V ' + y2 + ' H ' + x2;
        svg.appendChild(el('path', {
          d: d, fill: 'none', stroke: opts.arrowColor, 'stroke-width': 2
        }));
        var dir = down ? 1 : -1;
        svg.appendChild(el('polygon', {
          points: (x2 + 10) + ',' + y2 + ' ' + x2 + ',' + (y2 - 5) + ' ' + x2 + ',' + (y2 + 5),
          fill: opts.arrowColor
        }));
        svg.appendChild(el('text', {
          x: xm + 4, y: (y1 + y2) / 2 + 4, 'font-size': 12, fill: opts.arrowColor
        }, '\u2193 ' + out.name));
      }
    }
  }

  function render(container, a, options) {
    var opts = {
      areaFill: '#ffffff', areaStroke: '#c9d3e0', titleColor: '#2b3a4a',
      textColor: '#1c2530', mutedColor: '#7b8794', loopColor: '#d9842a',
      arrowColor: '#3b6fd4', width: 340
    };
    if (options) for (var k in options) if (Object.prototype.hasOwnProperty.call(options, k)) opts[k] = options[k];

    while (container.firstChild) container.removeChild(container.firstChild);

    var areas = layout(a);
    if (!areas.length) {
      var empty = document.createElement('div');
      empty.className = 'map-empty';
      empty.textContent = 'Программа пуста — вводить нечего рисовать.';
      container.appendChild(empty);
      return { areas: [] };
    }

    /* ширину подгоняем по числу кружков и подписей, но не меньше MIN_W */
    var w = Math.max(MIN_W, num(opts.width, 340));
    var svg = el('svg', {
      xmlns: NS, 'class': 'map-svg',
      viewBox: '0 0 ' + (w + LOOP_W + 40) + ' ' + '10'
    });

    var y = 10;
    for (var i = 0; i < areas.length; i++) {
      var h = drawArea(svg, areas[i], 4, y, w, opts);
      y += h + GAP;
    }
    drawOuts(svg, areas, opts);

    svg.setAttribute('viewBox', '0 0 ' + (w + LOOP_W + 40) + ' ' + y);
    svg.setAttribute('width', '100%');
    svg.removeAttribute('height');
    svg.style.display = 'block';
    container.appendChild(svg);
    return { areas: areas };
  }

  /* Текст графа для вставки в чат — то же, что на странице проверок. */
  function mermaid(a) {
    var areas = layout(a);
    var lines = ['graph TD'];
    for (var i = 0; i < areas.length; i++) {
      var ar = areas[i];
      var parts = [];
      for (var k = 0; k < ar.rows.length; k++) parts.push(rowText(ar.rows[k]));
      var cap = pad2(ar.start) + '\u2013' + pad2(ar.end) + ': ' + (parts.join(', ') || '—');
      if (cap.length > 46) cap = cap.slice(0, 45) + '\u2026';
      lines.push('  B' + i + '["' + cap.replace(/"/g, '') + '"]');
    }
    for (var L = 0; L < areas.length; L++) {
      var aos = areas[L];
      for (var q = 0; q < aos.loops.length; q++) {
        lines.push('  B' + L + ' -->|\u043d\u0430\u0437\u0430\u0434| B' + L);
      }
      for (var o = 0; o < aos.outs.length; o++) {
        lines.push('  B' + L + ' -->|' + aos.outs[o].name.replace(/"/g, '') + '| B' + aos.outs[o].to);
      }
    }
    return lines.join('\n');
  }

  global.MKMap = {
    render: render,
    mermaid: mermaid,
    layout: layout,
    blockRange: blockRange,
    version: 1
  };
})(typeof window !== 'undefined' ? window : this);
