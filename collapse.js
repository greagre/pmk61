/* =========================================================
   pmk61 / collapse.js  (v2, 27.11.2026)

   СВОРАЧИВАНИЕ ПАНЕЛЕЙ

   Экран телефона короткий, а на вкладке «Код» друг под другом стоят
   четыре длинных блока: панель ассемблера, панель кодов, листинг
   расширения и журнал переходов. Пока все раскрыты, до калькулятора
   надо листать пол-экрана.

   ЧТО НОВОГО В v2 (после дочитанного asm-editor.js)

   1. ТРЕУГОЛЬНИК ПОВОРАЧИВАЛСЯ НАОБОРОТ.
      В v1 поворот был привязан к data-folded="1" (свёрнуто), поэтому
      свёрнутая панель показывала раскрытый треугольник ▾, а раскрытая —
      закрытый ▸. Теперь база — ▸ (панель закрыта), а поворот на 90°
      включается при data-folded="0": развернул — треугольник смотрит вниз.

   2. РАЗВОРОТ ПРИ ФОКУСЕ ИЗ БИБЛИОТЕКИ.
      asm-editor.js: loadAsmToEditor(name, text) кладёт текст в поле,
      переключает вкладку на «Код» и делает area.focus(). Если панель
      свёрнута, тело скрыто — человек жмёт «В редактор» и ничего
      не видит. Поэтому:
        • на панели слушается focusin — любой фокус внутри разворачивает;
        • у textarea подменяется focus(): сначала разворот, потом фокус.
      Обе меры не меняют ни строчки в asm-editor.js.

   3. ПОДХВАТ ПОЗДНО СОЗДАННЫХ ПАНЕЛЕЙ.
      mount() в asm-editor.js вставляет #asmPanel перед #prog после
      того, как ui.js нарисовал калькулятор (опрос раз в 100 мс, до 4 с),
      ext61-ui.js строит extProg ещё позже. Вместо одного длинного
      интервала теперь MutationObserver на body с задержкой 60 мс плюс
      редкий страховочный интервал: панель получает шапку сразу, как
      только появилась.

   ПОЧЕМУ ОТДЕЛЬНЫМ ФАЙЛОМ, А НЕ ПРАВКОЙ ПАНЕЛЕЙ

   asm-editor.js — 50 000 знаков, codes-panel.js и ext61-ui.js держат
   ссылки на свои поля в замыкании. Переписывать их ради кнопки в шапке
   — значит трогать рабочий код, который только что проверен прогонами
   (5040 и 1234). Слой находит панель по id, ставит в шапку кнопку
   и ПЕРЕМЕЩАЕТ содержимое в обёртку. Перемещение узлов ссылок
   не ломает: asm-editor продолжает работать со своим textarea,
   ext61-ui пишет в свой body, панель кодов — в свой listBox.

   ЧТО СВОРАЧИВАЕТСЯ И ПО УМОЛЧАНИЮ

     asmPanel   «Ассемблер: текст → память»      раскрыт
     codesPanel «Коды и нажатия: текст → память»  свёрнут
     extProg    «Листинг расширения»              свёрнут
     extJumpLog «Переходы банков и страниц»       свёрнут

   В СВЁРНУТОМ ВИДЕ ВИДНА СВОДКА

   Шапка листинга расширения (.prog-head) остаётся на экране целиком,
   а в ней живёт info из ext61-ui.js: «F0: 0 · занято 7 из 105 ·
   банк 0 · страница 0». Свёрнутая панель — одна строка с главным
   числом, а не пустая полоска.

   ГДЕ ЗАПОМИНАЕТСЯ

   localStorage, ключ pmk61/folded: {codesPanel:true, extProg:true, …}.
   Ключ отдельный от pmk61/codesrc и pmk61/asmsrc: сворачивание
   не зависит от того, что лежит в полях.

   ЧЕГО СЛОЙ НЕ ДЕЛАЕТ

   Не трогает #prog (листинг ui.js, он не панель и живёт всегда),
   не пересобирает DOM панелей, не знает про их кнопки.
   [id:0FDE9C]
   ========================================================= */
(function (global) {
  'use strict';

  var KEY = 'pmk61/folded';

  /* Панели по id и их состояние по умолчанию. */
  var PANELS = [
    { id: 'asmPanel', folded: false },
    { id: 'codesPanel', folded: true },
    { id: 'extProg', folded: true },
    { id: 'extJumpLog', folded: true }
  ];

  var state = null;
  var cssDone = false;
  var busy = false;
  var debounceTimer = null;

  /* ---------- состояние ---------- */

  function loadState() {
    if (state) return state;
    state = {};
    try {
      var raw = global.localStorage.getItem(KEY);
      var o = raw ? JSON.parse(raw) : null;
      if (o && typeof o === 'object' && !Array.isArray(o)) state = o;
    } catch (e) { state = {}; }
    return state;
  }

  function saveState() {
    try { global.localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }

  function defFold(id) {
    for (var i = 0; i < PANELS.length; i++) {
      if (PANELS[i].id === id) return !!PANELS[i].folded;
    }
    return false;
  }

  function isFolded(id) {
    var s = loadState();
    return (typeof s[id] === 'boolean') ? s[id] : defFold(id);
  }

  function setFolded(id, v) {
    loadState();
    state[id] = !!v;
    saveState();
    paintPanel(id);
  }

  /* ---------- стили ---------- */

  function injectCss() {
    if (cssDone || document.getElementById('pmkFoldCss')) { cssDone = true; return; }
    var st = document.createElement('style');
    st.id = 'pmkFoldCss';
    st.textContent = [
      '.pmk-fold-head{display:flex;align-items:center;gap:8px;cursor:pointer;',
        '-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}',
      '.pmk-fold-head h3{margin:0;flex:1;min-width:0}',
      '.pmk-fold-btn{flex:none;width:30px;height:30px;display:inline-flex;align-items:center;',
        'justify-content:center;padding:0;border:1px solid rgba(127,127,127,.45);',
        'border-radius:9px;background:transparent;color:inherit;font-size:13px;line-height:1;',
        'transition:transform .15s ease;-webkit-tap-highlight-color:transparent}',
      '.pmk-fold-btn:focus:not(:focus-visible){outline:none}',
      /* Свёрнуто: тела нет, треугольник смотрит вправо (▸). */
      '.pmk-fold[data-folded="1"] > .pmk-fold-body{display:none}',
      /* Развёрнуто: тот же треугольник повёрнут вниз (▾). */
      '.pmk-fold[data-folded="0"] > .pmk-fold-head .pmk-fold-btn{transform:rotate(90deg)}',
      /* Строка панели не должна «дёргаться» на тап. */
      '.pmk-fold > .pmk-fold-head{min-height:32px}'
    ].join('');
    document.head.appendChild(st);
    cssDone = true;
  }

  /* ---------- шапка и тело ---------- */

  /* Заголовок панели: у asm-editor и codes-panel это <h3>, у листингов
     ext61-ui — div.prog-head с названием и сводкой внутри. */
  function findHead(panel) {
    var h3 = null;
    var progHead = null;
    for (var i = 0; i < panel.children.length; i++) {
      var ch = panel.children[i];
      if (!h3 && ch.tagName === 'H3') h3 = ch;
      if (!progHead && ch.classList && ch.classList.contains('prog-head')) progHead = ch;
    }
    return { h3: h3, progHead: progHead };
  }

  /* Тело: всё, кроме шапки. Один раз оборачивается в div.pmk-fold-body,
     дальше панель может перерисовывать его как хочет. */
  function ensureBody(panel, head) {
    var body = null;
    for (var i = 0; i < panel.children.length; i++) {
      var ch = panel.children[i];
      if (ch.classList && ch.classList.contains('pmk-fold-body')) { body = ch; break; }
    }
    if (body) return body;

    body = document.createElement('div');
    body.className = 'pmk-fold-body';

    var moved = [];
    for (var j = 0; j < panel.children.length; j++) {
      var c = panel.children[j];
      if (c === head) continue;
      moved.push(c);
    }

    panel.appendChild(body);
    for (var k = 0; k < moved.length; k++) body.appendChild(moved[k]);
    return body;
  }

  function makeButton() {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pmk-fold-btn';
    btn.textContent = '▸';
    btn.setAttribute('aria-label', 'Свернуть или развернуть панель');
    return btn;
  }

  /* ---------- разворот изнутри ---------- */

  /* Библиотека зовёт area.focus() на свёрнутой панели. Сначала
     разворачиваем, потом отдаём фокус настоящему focus(). */
  function hookInside(panel, id) {
    if (panel.dataset.pmkFoldFocus === '1') return;
    panel.dataset.pmkFoldFocus = '1';

    panel.addEventListener('focusin', function () {
      if (isFolded(id)) setFolded(id, false);
    });

    var area = panel.querySelector('textarea');
    if (area && typeof area.focus === 'function' && !area.__pmkFocusPatched) {
      var orig = area.focus;
      area.__pmkFocusPatched = true;
      area.focus = function () {
        if (isFolded(id)) setFolded(id, false);
        return orig.apply(area, arguments);
      };
    }
  }

  /* ---------- одна панель ---------- */

  function paintPanel(id) {
    var panel = document.getElementById(id);
    if (!panel) return false;

    if (panel.dataset && panel.dataset.pmkFold === '1') {
      applyFlag(panel, id);
      return true;
    }

    injectCss();

    var found = findHead(panel);
    var head = null;

    if (found.h3) {
      /* Свой div-шапка: кнопка слева, заголовок справа. h3 остаётся
         настоящим h3 — стили панели (margin, размер) не разъезжаются. */
      head = document.createElement('div');
      head.className = 'pmk-fold-head';
      panel.insertBefore(head, found.h3);
      head.appendChild(found.h3);
    } else if (found.progHead) {
      /* Шапку листинга не оборачиваем: внутри неё сводка, которую
         в свёрнутом виде надо видеть. Просто добавляем кнопку. */
      head = found.progHead;
      head.classList.add('pmk-fold-head');
    } else {
      /* Ни заголовка, ни шапки — панель ещё не достроена, зайдём позже. */
      return false;
    }

    if (!head.querySelector('button.pmk-fold-btn')) {
      head.insertBefore(makeButton(), head.firstChild);
    }

    ensureBody(panel, head);

    panel.classList.add('pmk-fold');
    panel.dataset.pmkFold = '1';

    head.addEventListener('click', function (ev) {
      /* Кнопки и поля внутри шапки живут своей жизнью — не переключаем. */
      var t = ev.target;
      if (t && t.closest && t.closest('button.pmk-fold-btn')) { /* это наша кнопка */ }
      else if (t && t.closest && t.closest('button,a,input,select,textarea')) return;
      setFolded(id, !isFolded(id));
    });

    hookInside(panel, id);
    applyFlag(panel, id);
    return true;
  }

  function applyFlag(panel, id) {
    var folded = isFolded(id);
    panel.dataset.folded = folded ? '1' : '0';
    var btn = panel.querySelector('.pmk-fold-btn');
    if (btn) {
      btn.setAttribute('aria-expanded', folded ? 'false' : 'true');
      btn.title = folded ? 'Развернуть' : 'Свернуть';
    }
  }

  function paint() {
    if (busy) return 0;
    busy = true;
    var done = 0;
    try {
      for (var i = 0; i < PANELS.length; i++) {
        if (paintPanel(PANELS[i].id)) done++;
      }
    } finally { busy = false; }
    return done;
  }

  function paintSoon() {
    if (debounceTimer) return;
    debounceTimer = setTimeout(function () {
      debounceTimer = null;
      paint();
    }, 60);
  }

  /* ---------- запуск ---------- */

  function watchNewPanels() {
    if (typeof MutationObserver === 'undefined') return;
    try {
      var mo = new MutationObserver(paintSoon);
      mo.observe(document.body, { childList: true, subtree: false });
    } catch (e) {}
  }

  function boot() {
    injectCss();
    paint();
    watchNewPanels();

    /* Страховка на случай, если панель вставили внутрь уже существующего
       узла (subtree:false её не увидит) — редкий опрос, дешёвый. */
    var tries = 0;
    var t = setInterval(function () {
      tries++;
      var done = paint();
      if (done >= PANELS.length || tries > 60) clearInterval(t);
    }, 500);

    /* Смена вкладок и полный reset ядра не пересоздают панели, но после
       reset ext61-ui может позвать ensureBox заново — лишняя проверка
       не повредит: paint() идемпотентна. */
    document.addEventListener('click', function () { paintSoon(); }, true);
  }

  global.MKFold = {
    paint: paint,
    isFolded: isFolded,
    setFolded: setFolded,
    open: function (id) { setFolded(id, false); },
    close: function (id) { setFolded(id, true); },
    toggle: function (id) { setFolded(id, !isFolded(id)); },
    openAll: function () {
      for (var i = 0; i < PANELS.length; i++) setFolded(PANELS[i].id, false);
    },
    closeAll: function () {
      for (var i = 0; i < PANELS.length; i++) setFolded(PANELS[i].id, true);
    },
    ids: function () {
      var out = [];
      for (var i = 0; i < PANELS.length; i++) out.push(PANELS[i].id);
      return out;
    }
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  }
})(typeof window !== 'undefined' ? window : this);
