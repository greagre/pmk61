/* map-view.js v3 — рисование блок-схемы программы МК-61.
   Только картинка. Расчёт (участки, переходы, циклы) берёт из analyze61.js:
   an = { size, rows, blocks, edges, loops, warnings }
   rows[i]   = { addr, len, kind, text }
   blocks[i] = { n, start, end, fromIndex, toIndex }
   edges[i]  = { from, to, target, name, back, addr }

   Границы участка считаются по ПОСЛЕДНЕЙ ЗАНЯТОЙ ячейке, а не по адресу
   последней строки: участок с БП на адресе 02 подписывается 00–04.

   Что нового в v3:
   1) подпись на стрелке берётся из ТЕКСТА строки («F x=0»), а не из name —
      иначе искажённые имена вида «Б∨=0» попадали прямо на схему;
   2) mermaid собирается тем же layout(), что и картинка, поэтому диапазоны
      в тексте и в рамках совпадают всегда;
   3) render() возвращает готовый текст mermaid — странице больше не нужно
      собирать его отдельным проходом, и он не может отстать от схемы;
   4) справа оставлен запас под длинную подпись петли. */
(function (global) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  var ROW_H = 26;    /* высота строки листинга */
  var HEAD_H = 26;   /* заголовок участка */
  var PAD = 10;      /* поле внутри рамки */
  var GAP = 32;      /* промежуток между участками */
  var LOOP_W = 96;   /* вынос петли вправо (с запасом под подпись) */
  var MIN_W = 236;   /* минимальная ширина рамки */

  function pad2(v) {
    v = String(v);
    return v.length < 2 ? '0' + v : v;
  }
  function num(v, d) {
    var n = Number(v);
    return (v === undefined || v === null || v === '' || isNaN(n)) ? d : n;
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

  function rowsOf(an) { return (an && an.rows) || []; }
  function blocksOf(an) { return (an && an.blocks) || []; }
  function edgesOf(an) { return (an && an.edges) || []; }

  function rowAddr(r) { return num(r && r.addr, 0); }
  function rowLen(r) { var n = num(r && r.len, 1); return n > 0 ? n : 1; }
  function rowText(r) { return String((r && r.text) || '—'); }

  /* строки, относящиеся к участку */
  function rowsInBlock(an, b) {
    var rows = rowsOf(an);
    if (b && b.fromIndex !== undefined && b.toIndex !== undefined) {
      return rows.slice(b.fromIndex, b.toIndex + 1);
    }
    var s = num(b && b.start, 0);
    var e = num(b && b.end, s);
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var a = rowAddr(rows[i]);
      if (a >= s && a <= e) out.push(rows[i]);
    }
    return out;
  }

  /* последняя занятая ячейка участка с учётом длины трёхбайтных команд */
  function lastCell(an, b, list) {
    list = list || rowsInBlock(an, b);
    var best = num(b && b.start, 0);
    for (var i = 0; i < list.length; i++) {
      var last = rowAddr(list[i]) + rowLen(list[i]) - 1;
      if (last > best) best = last;
    }
    return best;
  }

  function rowByAddr(an, addr) {
    var rows = rowsOf(an);
    for (var i = 0; i < rows.length; i++) {
      if (rowAddr(rows[i]) === addr) return rows[i];
    }
    return null;
  }

  /* из «F x=0 → 05» делаем «F x=0» — цель уже нарисована стрелкой */
  function shortCommand(text) {
    var t = String(text === undefined || text === null ? '' : text);
    var i = t.indexOf('\u2192');
    if (i > 0) t = t.slice(0, i);
    return t.replace(/\s+/g, ' ').trim();
  }

  /* Подпись перехода: сначала текст строки-источника, потом name из analyze61.
     Это главная защита от искажённых имён вроде «Б∨=0». */
  function edgeLabel(an, e, area) {
    var r = rowByAddr(an, num(e && e.addr, -1));
    if (!r && area && area.rows) {
      for (var i = 0; i < area.rows.length; i++) {
        if (String(rowText(area.rows[i])).indexOf('\u2192') >= 0) { r = area.rows[i]; break; }
      }
    }
    if (r) {
      var t = shortCommand(rowText(r));
      if (t && t !== '\u2014') return t;
    }
    var n = String((e && e.name) || '').replace(/\s+/g, ' ').trim();
    return n || '\u043f\u0435\u0440\u0435\u0445\u043e\u0434';
  }

  function layout(an) {
    var blocks = blocksOf(an);
    var edges = edgesOf(an);
    var areas = [];
    var i;

    for (i = 0; i < blocks.length; i++) {
      var list = rowsInBlock(an, blocks[i]);
      var start = num(blocks[i] && blocks[i].start, list.length ? rowAddr(list[0]) : 0);
      areas.push({
        index: i,
        name: 'Участок ' + (i + 1),
        start: start,
        end: lastCell(an, blocks[i], list),
        rows: list,
        loops: [],
        outs: []
      });
    }

    for (i = 0; i < edges.length; i++) {
      var e = edges[i] || {};
      var f = num(e.from, NaN);
      var t = num(e.to, NaN);
      if (!areas[f]) continue;
      var back = !!e.back || (f === t);
      var label = edgeLabel(an, e, areas[f]);
      if (f === t) {
        areas[f].loops.push({ name: label, target: num(e.target, areas[f].start) });
      } else if (areas[t]) {
        areas[f].outs.push({ name: label, to: t, back: back });
      }
    }

    return areas;
  }

  /* строки для рисования: команда + при трёхбайтной команде — серая строка адреса */
  function areaLines(area) {
    var lines = [];
    for (var i = 0; i < area.rows.length; i++) {
      var r = area.rows[i];
      var ad = rowAddr(r);
      var len = rowLen(r);
      lines.push({ kind: 'cmd', addr: ad, last: ad + len - 1, len: len, text: rowText(r) });
      if (len > 1) {
        var has = false;
        for (var k = 0; k < area.rows.length; k++) {
          if (rowAddr(area.rows[k]) === ad + 1) has = true;
        }
        if (!has) lines.push({ kind: 'addr', addr: ad + 1, last: ad + len - 1 });
      }
    }
    return lines;
  }

  function drawArea(svg, area, x, y, w, opts) {
    var g = el('g', { 'class': 'area' });
    var lines = areaLines(area);
    var h = HEAD_H + PAD + lines.length * ROW_H + PAD / 2;

    g.appendChild(el('rect', {
      x: x, y: y, width: w, height: h, rx: 10, ry: 10,
      fill: opts.areaFill, stroke: opts.areaStroke, 'stroke-width': 2
    }));

    g.appendChild(el('text', {
      x: x + PAD, y: y + 18, 'font-size': 13, 'font-weight': 700, fill: opts.titleColor
    }, area.name + ' · ' + pad2(area.start) + '\u2013' + pad2(area.end)));

    var ty = y + HEAD_H;
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i];
      ty += ROW_H;
      if (ln.kind === 'addr') {
        g.appendChild(el('text', {
          x: x + PAD + 34, y: ty - 7, 'font-size': 12, fill: opts.mutedColor
        }, pad2(ln.addr) + '\u2013' + pad2(ln.last) + '  адрес перехода'));
        continue;
      }
      g.appendChild(el('text', {
        x: x + PAD, y: ty - 7, 'font-size': 13, fill: opts.mutedColor,
        'font-family': 'ui-monospace, Menlo, Consolas, monospace'
      }, pad2(ln.addr)));
      g.appendChild(el('text', {
        x: x + PAD + 34, y: ty - 7, 'font-size': 13, fill: opts.textColor
      }, ln.text));
      if (ln.len > 1) {
        g.appendChild(el('text', {
          x: x + PAD + 34, y: ty + 7, 'font-size': 11, fill: opts.mutedColor
        }, '(' + pad2(ln.addr) + '\u2013' + pad2(ln.last) + ')'));
      }
    }

    /* петля назад — справа от рамки */
    for (var L = 0; L < area.loops.length; L++) {
      var ax = x + w;
      var off = L * 18;
      var ay = y + h - 14;
      var by = y + 14 + off;
      var loopW = LOOP_W - off;
      var path = 'M' + ax + ',' + ay + ' H' + (ax + loopW) + ' V' + by + ' H' + (ax + 8);
      g.appendChild(el('path', { d: path, fill: 'none', stroke: opts.loopColor, 'stroke-width': 2 }));
      g.appendChild(el('polygon', {
        points: (ax + 8) + ',' + by + ' ' + (ax + 18) + ',' + (by - 5) + ' ' + (ax + 18) + ',' + (by + 5),
        fill: opts.loopColor
      }));
      g.appendChild(el('text', {
        x: ax + 6, y: (ay + by) / 2 + 4, 'font-size': 11, fill: opts.loopColor
      }, '\u21ba ' + area.loops[L].name + ' \u2192 ' + pad2(area.loops[L].target)));
    }

    area._x = x; area._y = y; area._w = w; area._h = h;
    svg.appendChild(g);
    return h;
  }

  function drawOuts(svg, areas, opts) {
    for (var i = 0; i < areas.length; i++) {
      var from = areas[i];
      var used = 0;
      for (var k = 0; k < from.outs.length; k++) {
        var out = from.outs[k];
        var to = areas[out.to];
        if (!to || to._y === undefined) continue;
        var down = to._y > from._y;
        var lane = 22 + used * 16;
        used++;
        var y1 = down ? from._y + from._h - 12 : from._y + 12;
        var y2 = down ? to._y + 12 : to._y + to._h - 12;
        var x1 = from._x + from._w;
        var x2 = to._x + to._w;
        var xm = Math.max(x1, x2) + lane;
        var d = 'M' + x1 + ',' + y1 + ' H' + xm + ' V' + y2 + ' H' + (x2 + 12);
        svg.appendChild(el('path', { d: d, fill: 'none', stroke: opts.arrowColor, 'stroke-width': 2 }));
        svg.appendChild(el('polygon', {
          points: (x2 + 12) + ',' + y2 + ' ' + (x2 + 2) + ',' + (y2 - 5) + ' ' + (x2 + 2) + ',' + (y2 + 5),
          fill: opts.arrowColor
        }));
        svg.appendChild(el('text', {
          x: xm + 4, y: (y1 + y2) / 2 + 4, 'font-size': 11, fill: opts.arrowColor
        }, (down ? '\u2193 ' : '\u2191 ') + out.name));
      }
    }
  }

  function render(container, an, options) {
    var opts = {
      areaFill: '#ffffff', areaStroke: '#cfd4dc', titleColor: '#5b6270',
      textColor: '#1c1f24', mutedColor: '#9aa1ad', loopColor: '#d97a10',
      arrowColor: '#2f6fed', width: 0
    };
    if (options) {
      for (var k in options) if (Object.prototype.hasOwnProperty.call(options, k)) opts[k] = options[k];
    }

    while (container.firstChild) container.removeChild(container.firstChild);

    var areas = layout(an);
    var text = mermaid(an);
    if (!areas.length) {
      var empty = document.createElement('div');
      empty.className = 'msg';
      empty.textContent = 'Участков нет.';
      container.appendChild(empty);
      return { areas: areas, mermaid: text };
    }

    var avail = num(opts.width, 0) || (container.clientWidth || 320);
    var w = Math.max(MIN_W, avail - LOOP_W - 34);
    var svg = el('svg', { xmlns: NS, 'class': 'map', preserveAspectRatio: 'xMinYMin meet' });

    var y = 14;
    for (var i = 0; i < areas.length; i++) {
      var h = drawArea(svg, areas[i], 14, y, w, opts);
      y += h + GAP;
    }
    drawOuts(svg, areas, opts);

    svg.setAttribute('viewBox', '0 0 ' + (14 + w + LOOP_W + 34) + ' ' + (y - GAP + 14));
    svg.setAttribute('width', '100%');
    svg.style.display = 'block';
    container.appendChild(svg);
    return { areas: areas, mermaid: text };
  }

  /* Текст графа. Собирается из layout(), поэтому диапазоны всегда совпадают
     с рамками на схеме: 00–02 для F x=0, 05–07 для БП. */
  function mermaid(an) {
    var areas = layout(an);
    var lines = ['graph TD'];
    if (!areas.length) return lines.join('\n');
    var i, k;
    for (i = 0; i < areas.length; i++) {
      var a = areas[i];
      var parts = [];
      for (k = 0; k < a.rows.length; k++) parts.push(shortCommand(rowText(a.rows[k])));
      var cap = pad2(a.start) + '\u2013' + pad2(a.end) + ': ' + (parts.join(', ') || '\u2014');
      if (cap.length > 52) cap = cap.slice(0, 51) + '\u2026';
      lines.push('  B' + i + '["' + cap.replace(/"/g, '') + '"]');
    }
    for (i = 0; i < areas.length; i++) {
      for (k = 0; k < areas[i].loops.length; k++) {
        lines.push('  B' + i + ' -->|\u043d\u0430\u0437\u0430\u0434| B' + i);
      }
      for (k = 0; k < areas[i].outs.length; k++) {
        lines.push('  B' + i + ' -->|' + areas[i].outs[k].name.replace(/"/g, '') + '| B' + areas[i].outs[k].to);
      }
    }
    return lines.join('\n');
  }

  global.MKMap = {
    render: render,
    layout: layout,
    mermaid: mermaid,
    edgeLabel: edgeLabel,
    shortCommand: shortCommand,
    lastCell: lastCell,
    version: 3
  };
})(typeof window !== 'undefined' ? window : this);
