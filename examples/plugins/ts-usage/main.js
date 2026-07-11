// Usage Watcher — сторонний плагин Tilzio. Классический Web Worker, глобал `ts`.
// NO import/export/require. Чистые функции — function-декларации (тестируемы харнессом).
// Контракт: docs/plugins/api-reference.md. Spec: 2026-06-10-tilzio-usage-watcher-design.md.

// --- утилиты/санитайзеры (function-декларации → видимы тест-харнессу) ---
function num(x) { var n = Number(x); return isFinite(n) ? n : 0; }
function limitAlerts(t, settings) {
  var thr = (settings && settings.alertPct != null) ? num(settings.alertPct) : 80;
  var w = (t.window && t.window.utilPct != null) ? num(t.window.utilPct) : -1;
  var wk = (t.week && t.week.utilPct != null) ? num(t.week.utilPct) : -1;
  return (w >= thr) || (wk >= thr);
}
function str(x) { return x == null ? '' : String(x); }
function fmtMoney(x) { return '$' + num(x).toFixed(2); }
function fmtPct(x) { return Math.round(num(x)) + '%'; }
function fmtTokens(x) {
  var n = num(x);
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(Math.round(n));
}
function fmtDurationMin(m) {
  m = Math.max(0, Math.round(num(m)));
  if (m < 60) return m + 'm';
  if (m < 1440) { var h = Math.floor(m / 60), mm = m % 60; return h + 'h ' + (mm < 10 ? '0' : '') + mm + 'm'; }
  var d = Math.floor(m / 1440), hh = Math.floor((m % 1440) / 60); return d + 'd ' + hh + 'h';
}
function minutesUntilISO(iso, nowMs) {
  var t = Date.parse(iso);
  if (!isFinite(t)) return null;
  var now = isFinite(nowMs) ? nowMs : Date.now();
  return Math.max(0, Math.round((t - now) / 60000));
}
function dayLabel(d) { var s = str(d); var m = s.match(/(\d{1,2})$/); return m ? m[1] : s; }
function sparkBars(values, dates) {
  var vals = (values || []).map(num);
  var max = vals.reduce(function (a, b) { return b > a ? b : a; }, 0);
  return vals.map(function (v, i) {
    var lbl = (dates && dates[i] != null) ? dayLabel(dates[i]) : String(i + 1);
    return { label: lbl, value: v, tone: heightTone(v, max) };
  });
}

function threshTone(pct) {
  var p = num(pct);
  if (p >= 85) return 'error';
  if (p >= 60) return 'warn';
  return 'success';
}
// Цвет чипа лимита (status-bar) по порогу алерта — макет красит чип, а не фикс-цветом:
// ≥ порога → красный, ≥ 60% порога → жёлтый, иначе зелёный (Gruvbox).
function threshColorHex(pct, alertPct) {
  var p = num(pct), thr = num(alertPct) || 80;
  if (p >= thr) return '#fb4934';
  if (p >= thr * 0.6) return '#fabd2f';
  return '#b8bb26';
}
// --- редизайн Tilzio: общие хелперы ---
var PROVIDER_SQUARE = { claude: '🟧', codex: '🟦', cursor: '🟪', gemini: '🟨' };
function providerSquare(t) {
  if (t && t.available === false) return '⬜';
  return (t && PROVIDER_SQUARE[t.id]) || '⬜';
}
// тепловая шкала по относительной высоте столбика (4 доступных tone хоста)
function heightTone(value, max) {
  var f = (num(max) > 0) ? num(value) / num(max) : 0;
  if (f >= 0.85) return 'error';
  if (f >= 0.60) return 'accent';
  if (f >= 0.35) return 'warn';
  return 'success';
}
// глиф порога (как ic-dot/ic-warn/ic-stop в макете)
function threshGlyph(tone) { return tone === 'error' ? '⏹' : tone === 'warn' ? '▲' : '●'; }

// §5 тренд: сравнение округлённых %, '' если нет прошлого или равно.
function trendArrow(cur, prev) {
  if (prev == null || cur == null) return '';
  var c = Math.round(num(cur)), p = Math.round(num(prev));
  if (c > p) return '▲';
  if (c < p) return '▼';
  return '';
}
function trendKey(provider, which) { return provider + '.' + which; }
// Текущие %-значения лимитов всех доступных провайдеров: { 'claude.5h':82, 'claude.week':50 }.
function collectPct(tools) {
  var out = {};
  (tools || []).forEach(function (t) {
    if (!t || !t.available) return;
    if (t.window && t.window.utilPct != null) out[trendKey(t.id, '5h')] = num(t.window.utilPct);
    if (t.week && t.week.utilPct != null) out[trendKey(t.id, 'week')] = num(t.week.utilPct);
  });
  return out;
}
// Стрелки относительно prevPct: { 'claude.5h':'▲', ... }.
function computeTrends(tools, prevPct) {
  var cur = collectPct(tools), out = {};
  Object.keys(cur).forEach(function (k) { out[k] = trendArrow(cur[k], prevPct && prevPct[k]); });
  return out;
}

// §4.5: техническая диагностика usage (STATE.usageDiag) → короткая человекочитаемая причина.
function limitsUnavailReason(raw) {
  var s = String(raw || '');
  if (/not found/i.test(s)) return 'claude not found on PATH';
  if (/no usage data|claude exit/i.test(s)) return 'Claude not signed in — run `claude`';
  if (/claude (threw|no result)/i.test(s)) return 'claude unavailable';
  return 'service unavailable';
}

// Единый рендер лимита: meter=графическая полоса (хост H4) | rings=кольцо | showFill off=только число. Всегда порог-tone.
// arrow (опц., '▲'/'▼') ставится после % (тренд §5).
function limitWidget(label, pct, resetMin, settings, arrow) {
  var p = num(pct);
  var tone = threshTone(p);
  var lbl = threshGlyph(tone) + ' ' + label;
  var ar = arrow ? ' ' + arrow : '';
  var rings = !!(settings && settings.limitViz === 'rings');
  var showFill = !(settings && settings.showFill === false);
  var resetTxt = (resetMin != null) ? ' · reset ' + fmtDurationMin(resetMin) : '';
  if (!showFill) return { type: 'text', label: lbl, text: fmtPct(p) + ar + resetTxt, tone: tone };
  if (rings) return { type: 'chart', kind: 'ring', segments: [{ label: lbl, value: p, tone: tone }], max: 100, caption: lbl + ' ' + fmtPct(p) + ar + resetTxt };
  var m = { type: 'meter', label: lbl, value: p, max: 100, text: fmtPct(p) + ar, tone: tone };
  if (resetMin != null) m.caption = 'reset · ' + fmtDurationMin(resetMin);
  return m;
}

// --- парсеры расхода (daily / weekly) ---
function rowCost(row) { return num(row && (row.totalCost != null ? row.totalCost : row.costUSD)); }
function tokTypes(row) {
  row = row || {};
  return {
    input: num(row.inputTokens),
    output: num(row.outputTokens),
    cacheCreate: num(row.cacheCreationTokens != null ? row.cacheCreationTokens : row.cacheCreationInputTokens),
    cacheRead: num(row.cacheReadTokens != null ? row.cacheReadTokens : row.cacheReadInputTokens),
  };
}

function parseDaily(dailyJson) {
  var arr = (dailyJson && Array.isArray(dailyJson.daily)) ? dailyJson.daily : [];
  var last = arr.length ? arr[arr.length - 1] : null;
  var sparkRows = arr.slice(-7);
  return {
    todayCost: last ? rowCost(last) : 0,
    todayTokens: last ? num(last.totalTokens) : 0,
    todayTok: tokTypes(last),
    spark7: sparkRows.map(rowCost),
    spark7dates: sparkRows.map(function (r) { return str(r && (r.date != null ? r.date : r.period)); }),
  };
}

function parseWeekly(weeklyJson) {
  var arr = (weeklyJson && Array.isArray(weeklyJson.weekly)) ? weeklyJson.weekly : [];
  var last = arr.length ? arr[arr.length - 1] : null;
  return { weekCost: last ? rowCost(last) : 0, weekTok: tokTypes(last) };
}

function parseMonthly(monthlyJson) {
  var arr = (monthlyJson && Array.isArray(monthlyJson.monthly)) ? monthlyJson.monthly : [];
  var last = arr.length ? arr[arr.length - 1] : null;
  return { monthCost: last ? rowCost(last) : 0, monthTok: tokTypes(last) };
}

// --- разбор текста `claude -p /usage` (источник % лимитов; формат версионно-зависим → защитно) ---

var MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// «Jun 17 at 1:50am (Asia/Seoul)» → ISO | null. Локальная конструкция (claude печатает локальное
// время; tz-скобка игнорируется). Год: текущий; при Dec→Jan rollover (дата вышла в прошлом) +1.
// Порог rollover — 24ч: дата в пределах суток «в прошлом» трактуется как сегодня/ближайшее будущее (resetMin клипнется к 0).
function parseResetText(text, nowMs) {
  var s = String(text || '').toLowerCase();
  var mi = -1, mpos = -1;
  for (var i = 0; i < 12; i++) { var p = s.indexOf(MONTHS[i]); if (p >= 0) { mi = i; mpos = p; break; } }
  if (mi < 0) return null;
  var after = s.slice(mpos + 3);
  var dayM = after.match(/(\d{1,2})/);
  if (!dayM) return null;
  var day = num(dayM[1]);
  var tM = after.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/);
  if (!tM) return null;
  var hour = num(tM[1]) % 12;
  if (tM[3] === 'pm') hour += 12;
  var min = tM[2] ? num(tM[2]) : 0;
  var now = isFinite(nowMs) ? nowMs : Date.now();
  var year = new Date(now).getFullYear();
  var d = new Date(year, mi, day, hour, min, 0);
  if (d.getTime() < now - 86400000) d = new Date(year + 1, mi, day, hour, min, 0);
  return d.toISOString();
}

// Строка с якорем anchor → { utilPct, resetAt } | null (нет строки или нет % → null).
function parseUsageLine(s, anchor, nowMs) {
  var lines = String(s || '').split('\n');
  var line = null;
  for (var i = 0; i < lines.length; i++) { if (lines[i].indexOf(anchor) >= 0) { line = lines[i]; break; } }
  if (line == null) return null;
  var pm = line.match(/(\d+)%/);
  if (!pm) return null;
  var rm = line.match(/resets\s+(.+?)\s*$/i);
  return { utilPct: num(pm[1]), resetAt: parseResetText(rm ? rm[1] : '', nowMs) };
}

// stdout `claude -p /usage` → { fiveHour, sevenDay, sonnet } | null (нет ни одной валидной строки).
function parseUsageText(stdout, nowMs) {
  var s = String(stdout || '');
  var fiveHour = parseUsageLine(s, 'Current session', nowMs);
  var sevenDay = parseUsageLine(s, 'Current week (all models)', nowMs);
  var sonnet = parseUsageLine(s, 'Current week (Sonnet only)', nowMs);
  if (!fiveHour && !sevenDay && !sonnet) return null;
  return { fiveHour: fiveHour, sevenDay: sevenDay, sonnet: sonnet };
}

// --- ccusage через ts.exec (защитный JSON, без падений) ---
async function execCcusage(tool, subArgs, execFn) {
  var exec = execFn || ts.exec;
  var args = [tool].concat(subArgs, ['--json', '--offline']);
  try {
    var r = await exec('ccusage', args, {});
    if (!r || r.code !== 0) {
      var msg = (r && (r.stderr || '')) + '';
      return { ok: false, notFound: /not found|ENOENT/i.test(msg), code: r ? r.code : -1 };
    }
    var json = null;
    try { json = JSON.parse(r.stdout); } catch (e) { return { ok: false, parse: true }; }
    return { ok: true, json: json };
  } catch (e) {
    return { ok: false, error: (e && e.message) || String(e) };
  }
}

// blocks --active → нормализованное 5ч-окно (только Claude). null, если активного нет.
function parseActiveWindow(blocksJson, nowMs) {
  if (!blocksJson || !Array.isArray(blocksJson.blocks)) return null;
  var b = blocksJson.blocks.find(function (x) { return x && x.isActive && !x.isGap; });
  if (!b) return null;
  var resetMin = minutesUntilISO(b.endTime, nowMs);
  // projection может быть null — берём resetMin из endTime (надёжнее), projection опц.
  return {
    resetAt: str(b.endTime) || null,
    resetMin: resetMin,
    costUSD: num(b.costUSD),
    tokens: num(b.totalTokens),
    tokenCounts: b.tokenCounts || {},
  };
}

// --- сборка ToolData (нормализованная модель инструмента) ---

function buildClaude(usage, blocksJson, dailyJson, weeklyJson, nowMs, monthlyJson) {
  var win = parseActiveWindow(blocksJson, nowMs);   // {resetAt,resetMin,costUSD,tokens} | null
  var day = parseDaily(dailyJson);
  var wk = parseWeekly(weeklyJson);
  var mo = parseMonthly(monthlyJson);
  var window = win ? { resetAt: win.resetAt, resetMin: win.resetMin, costUSD: win.costUSD, tokens: win.tokens } : undefined;
  if (window && usage && usage.fiveHour) {
    window.utilPct = usage.fiveHour.utilPct;
    if (!window.resetMin && usage.fiveHour.resetAt) window.resetMin = minutesUntilISO(usage.fiveHour.resetAt, nowMs);
  }
  var week = { costUSD: wk.weekCost };
  if (usage && usage.sevenDay) { week.utilPct = usage.sevenDay.utilPct; week.resetAt = usage.sevenDay.resetAt; }
  if (week.resetAt) week.resetMin = minutesUntilISO(week.resetAt, nowMs); // для чипа wkReset (зеркало window.resetMin)
  week.tok = wk.weekTok;
  return {
    id: 'claude', name: 'Claude', dot: '🟢', available: true, hasLimits: true,
    window: window, week: week,
    today: { costUSD: day.todayCost, tokens: day.todayTokens, tok: day.todayTok },
    month: { costUSD: mo.monthCost, tok: mo.monthTok },
    spark7: day.spark7,
    spark7dates: day.spark7dates,
    sonnet: (usage && usage.sonnet) ? usage.sonnet : undefined,
  };
}
function buildCodex(dailyJson, monthlyJson) {
  var day = parseDaily(dailyJson);
  var mo = parseMonthly(monthlyJson);
  return {
    id: 'codex', name: 'Codex', dot: '🟢', available: true,
    today: { costUSD: day.todayCost, tokens: day.todayTokens, tok: day.todayTok },
    week: { costUSD: day.spark7.slice(-7).reduce(function (a, b) { return a + b; }, 0) },
    month: { costUSD: mo.monthCost, tok: mo.monthTok },
    spark7: day.spark7,
    spark7dates: day.spark7dates,
  };
}
function buildStub(id, name) {
  return { id: id, name: name, dot: '⚪', available: false, note: 'no local source' };
}
function pickHottest(tools) {
  var withPct = tools.filter(function (t) { return t && t.available && t.window && t.window.utilPct != null; });
  if (withPct.length) {
    return withPct.reduce(function (a, b) { return b.window.utilPct > a.window.utilPct ? b : a; });
  }
  var avail = tools.filter(function (t) { return t && t.available && t.today; });
  if (!avail.length) return null;
  return avail.reduce(function (a, b) { return num(b.today.costUSD) > num(a.today.costUSD) ? b : a; });
}

// --- статус-бар: per-provider чипы (Этап C) ---
// thresh:true → цвет чипа считается по порогу (threshColorHex), а не из defaultColor.
var SB_TEMPLATES = {
  name:  { title: 'Name',         defaultOn: true,  defaultColor: '#ebdbb2', applies: function (t) { return true; },                                  sb: function (t) { return providerSquare(t) + ' ' + t.name; } },
  '5h':  { title: '5h limit',     defaultOn: true,  thresh: true,            defaultColor: '#fabd2f', applies: function (t) { return !!(t.hasLimits || (t.window && t.window.utilPct != null)); },  sb: function (t) { var v = (t.window && t.window.utilPct != null) ? t.window.utilPct : 0; return '5h ' + fmtPct(v); } },
  week:  { title: 'Weekly limit', defaultOn: true,  thresh: true,            defaultColor: '#b8bb26', applies: function (t) { return !!(t.hasLimits || (t.week && t.week.utilPct != null)); },      sb: function (t) { var v = (t.week && t.week.utilPct != null) ? t.week.utilPct : 0; return 'wk ' + fmtPct(v); } },
  today: { title: '$ today',      defaultOn: true,  defaultColor: '#ebdbb2', applies: function (t) { return !!t.today; },                              sb: function (t) { return fmtMoney(t.today.costUSD); } },
  tok:   { title: 'Tokens today', defaultOn: false, defaultColor: '#ff5fbf', applies: function (t) { return !!t.today; },                              sb: function (t) { return fmtTokens(t.today.tokens) + ' tok'; } },
  reset: { title: '5h reset',     defaultOn: true,  defaultColor: '#928374', applies: function (t) { return !!(t.window && t.window.resetMin != null); }, sb: function (t) { return '⏱ ' + fmtDurationMin(t.window.resetMin); } },
  wkReset: { title: 'Weekly reset', defaultOn: false, defaultColor: '#928374', applies: function (t) { return !!(t.week && t.week.resetMin != null); }, sb: function (t) { return 'wk ⏱ ' + fmtDurationMin(t.week.resetMin); } },
};
var SB_PROVIDERS = [
  { id: 'claude', keys: ['name', '5h', 'week', 'wkReset', 'today', 'tok', 'reset'] },
  { id: 'codex',  keys: ['name', 'today', 'tok'] },
];
function chipKey(provider, key) { return provider + '.' + key; }
function chipOn(provider, key, settings) {
  var k = chipKey(provider, key);
  if (settings && settings.chips && Object.prototype.hasOwnProperty.call(settings.chips, k)) return !!settings.chips[k];
  var t = SB_TEMPLATES[key]; return t ? !!t.defaultOn : false;
}
// Порядок чипов провайдера = декларация SB_PROVIDERS (пользовательский реордер убран — макет).
function orderedChipKeys(provider) {
  var prov = SB_PROVIDERS.find(function (p) { return p.id === provider; });
  return prov ? prov.keys.slice() : [];
}
// Чистый билдер обновлений чипов: [{id, data}] (data={} прячет элемент).
// Лимит-чипы (thresh) красятся по порогу алерта; остальные — фикс-цветом шаблона.
function sbChipUpdates(tools, settings) {
  var out = [];
  out.push({ id: 'usage.sb.watcher', data: { text: 'Watcher', icon: '⏱', color: '#fe8019', fill: true, command: 'usage.refresh', priority: 60 } });
  var alertThr = (settings && settings.alertPct != null) ? num(settings.alertPct) : 80;
  SB_PROVIDERS.forEach(function (p, pIdx) {
    var tool = (tools || []).find(function (t) { return t.id === p.id; });
    var toolOn = tool && !(settings && settings.tools && settings.tools[p.id] === false);
    var base = 70 + pIdx * 10;
    orderedChipKeys(p.id).forEach(function (key, idx) {
      var id = 'usage.sb.' + p.id + '.' + key;
      var tmpl = SB_TEMPLATES[key];
      var text = (toolOn && chipOn(p.id, key, settings) && tmpl && tmpl.applies(tool)) ? tmpl.sb(tool) : null;
      if (text == null || text === '') { out.push({ id: id, data: {} }); return; }
      var chipData = { text: text, command: 'usage.refresh', priority: base + idx, group: p.id };
      if (tmpl.thresh) {
        var chipUtil = (key === '5h')
          ? ((tool && tool.window && tool.window.utilPct != null) ? num(tool.window.utilPct) : 0)
          : ((tool && tool.week && tool.week.utilPct != null) ? num(tool.week.utilPct) : 0);
        chipData.color = threshColorHex(chipUtil, alertThr);
        if (chipUtil >= alertThr) chipData.alert = true;
      } else {
        chipData.color = tmpl.defaultColor;
      }
      out.push({ id: id, data: chipData });
    });
  });
  return out;
}

// --- board: показатели уровня карточки (рисуются на каждый выбранный инструмент) ---
var CARD_METRICS = [
  { id: 'card.5h', title: '5h limit', block: 'limits', defaultOn: true,
    card: function (t, c) {
      if (!(t.hasLimits || (t.window && t.window.utilPct != null))) return [];
      var v = (t.window && t.window.utilPct != null) ? t.window.utilPct : 0;
      var rm = t.window ? t.window.resetMin : null;
      var ar = (c && c.trends) ? c.trends[trendKey(t.id, '5h')] : '';
      return [limitWidget('5h', v, rm, c && c.settings, ar)];
    } },
  { id: 'card.week', title: 'Weekly limit', block: 'limits', defaultOn: true,
    card: function (t, c) {
      if (!(t.hasLimits || (t.week && t.week.utilPct != null))) return [];
      var v = (t.week && t.week.utilPct != null) ? t.week.utilPct : 0;
      var rm = (t.week && t.week.resetAt) ? minutesUntilISO(t.week.resetAt) : null;
      var ar = (c && c.trends) ? c.trends[trendKey(t.id, 'week')] : '';
      return [limitWidget('Weekly', v, rm, c && c.settings, ar)];
    } },
  { id: 'card.daySpend', title: '$ Today', block: 'spend', defaultOn: true,
    card: function (t) {
      if (!t.today) return [];
      return [{ type: 'text', label: 'Today', text: fmtMoney(t.today.costUSD) }];
    } },
  { id: 'card.weekSpend', title: '$ Week', block: 'spend', defaultOn: true,
    card: function (t) {
      if (!t.week) return [];
      return [{ type: 'text', label: 'Week', text: fmtMoney(t.week.costUSD) }];
    } },
  { id: 'card.monthSpend', title: '$ Month', block: 'spend', defaultOn: true,
    card: function (t) {
      if (!(t.month && num(t.month.costUSD) > 0)) return [];
      return [{ type: 'text', label: 'Month', text: fmtMoney(t.month.costUSD) }];
    } },
  { id: 'card.spark', title: '7d history', block: 'history', defaultOn: true,
    card: function (t, c) {
      if (!t.spark7 || !t.spark7.length) return [];
      if (c && c.settings && c.settings.historyViz === 'bars')
        return [{ type: 'chart', kind: 'bar', bars: sparkBars(t.spark7, t.spark7dates) }];
      return [{ type: 'chart', kind: 'line', values: t.spark7.map(num) }];
    } },
  { id: 'card.weekSonnet', title: 'Sonnet week %', block: 'limits', defaultOn: true,
    card: function (t, c) {
      if (!t.sonnet || t.sonnet.utilPct == null) return [];
      var rm = t.sonnet.resetAt ? minutesUntilISO(t.sonnet.resetAt) : null;
      return [limitWidget('Sonnet wk', t.sonnet.utilPct, rm, c && c.settings)];
    } },
  { id: 'card.tokens', title: 'Token breakdown', block: 'tokens', defaultOn: true,
    card: function (t) {
      // Макет: один период (текущий, today) — компактный список тип→значение.
      var p = t.today;
      if (!p || !p.tok) return [];
      return [
        { type: 'text', label: 'Input', text: fmtTokens(p.tok.input) },
        { type: 'text', label: 'Output', text: fmtTokens(p.tok.output) },
        { type: 'text', label: 'Cache Create', text: fmtTokens(p.tok.cacheCreate) },
        { type: 'text', label: 'Cache Read', text: fmtTokens(p.tok.cacheRead) },
        { type: 'text', label: 'Cost', text: fmtMoney(p.costUSD), tone: 'warn' },
      ];
    } },
];
// --- board: общие виджеты (один раз под карточками) ---
var BOARD_METRICS = [
  { id: 'board.spark7all', title: 'Combined 7d sparkline', scope: 'board', defaultOn: false,
    board: function (c) {
      var sums = [], dates = null;
      c.tools.forEach(function (t) {
        (t.spark7 || []).forEach(function (v, i) { sums[i] = (sums[i] || 0) + num(v); });
        if (!dates && t.spark7dates && t.spark7dates.length) dates = t.spark7dates;
      });
      if (!sums.length) return [];
      if (c.settings && c.settings.historyViz === 'bars')
        return [{ type: 'chart', kind: 'bar', bars: sparkBars(sums, dates), caption: 'Σ 7 days $' }];
      return [{ type: 'chart', kind: 'line', values: sums, caption: 'Σ 7 days $' }];
    } },
];

function sectionCollapsed(id, settings) {
  return !!(settings && settings.collapsed && settings.collapsed[id] === true);
}

function providerSummary(t) {
  var parts = [];
  if (t.window && t.window.utilPct != null) parts.push(fmtPct(t.window.utilPct));
  if (t.today) parts.push(fmtMoney(t.today.costUSD));
  return parts.join(' · ');
}
function providerHeader(t, collapsed) {
  var item = { text: providerSquare(t) + ' ' + t.name, icon: collapsed ? '▸' : '▾',
               command: 'usage.toggleCollapse:' + t.id, tone: t.available ? 'accent' : 'default' };
  var b = providerSummary(t);
  if (b) item.badge = b;
  return { type: 'list', items: [item] };
}

var BLOCK_LABELS = { limits: 'LIMITS', spend: 'SPEND', history: 'HISTORY', tokens: 'TOKENS' };
// Подпись блока в одну строку с заголовком (напр. History · 7 days $) — раньше была
// отдельным caption у графика на своей строке.
var BLOCK_CAPTIONS = { history: '7 days $' };
var BLOCKS = ['limits', 'spend', 'history', 'tokens'];
function metricsInBlock(block) {
  return CARD_METRICS.filter(function (m) { return m.block === block; }).map(function (m) { return m.id; });
}
function orderedBlocks(settings) {
  var saved = (settings && Array.isArray(settings.blockOrder)) ? settings.blockOrder : [];
  var out = [];
  saved.forEach(function (b) { if (BLOCKS.indexOf(b) >= 0 && out.indexOf(b) < 0) out.push(b); });
  BLOCKS.forEach(function (b) { if (out.indexOf(b) < 0) out.push(b); });
  return out;
}
function orderedMetricIds(block, settings) {
  var all = metricsInBlock(block);
  var saved = (settings && settings.boardOrder && Array.isArray(settings.boardOrder[block])) ? settings.boardOrder[block] : [];
  var out = [];
  saved.forEach(function (id) { if (all.indexOf(id) >= 0 && out.indexOf(id) < 0) out.push(id); });
  all.forEach(function (id) { if (out.indexOf(id) < 0) out.push(id); });
  return out;
}
function buildProviderSection(t, c) {
  var collapsed = sectionCollapsed(t.id, c.settings);
  var out = [providerHeader(t, collapsed)];
  if (collapsed) return out;
  var items = [];
  orderedBlocks(c.settings).forEach(function (bk) {
    var ws = [];
    orderedMetricIds(bk, c.settings).forEach(function (id) {
      if (!cardMetricOn(id, c.settings)) return;
      var m = CARD_METRICS.find(function (x) { return x.id === id; });
      if (m) m.card(t, c).forEach(function (w) { ws.push(w); });
    });
    if (ws.length) {
      var hdr = BLOCK_LABELS[bk] + (BLOCK_CAPTIONS[bk] ? ' · ' + BLOCK_CAPTIONS[bk] : '');
      var item = { id: bk, widgets: [{ type: 'text', text: hdr }].concat(ws) };
      if (bk === 'limits' && limitAlerts(t, c.settings)) item.alert = true;
      items.push(item);
    }
  });
  if (items.length) out.push({ type: 'reorder', command: 'usage.reorderBoard', items: items, card: true });
  return out;
}

function cardMetricOn(id, settings) {
  var m = CARD_METRICS.concat(BOARD_METRICS).find(function (x) { return x.id === id; });
  if (settings && settings.metrics && Object.prototype.hasOwnProperty.call(settings.metrics, id))
    return !!settings.metrics[id];
  return m ? !!m.defaultOn : false;
}

function buildBoardWidgets(c) {
  var widgets = [];
  c.tools.forEach(function (t) {
    if (c.settings && c.settings.tools && c.settings.tools[t.id] === false) return;
    buildProviderSection(t, c).forEach(function (w) { widgets.push(w); });
  });
  BOARD_METRICS.forEach(function (m) {
    if (!cardMetricOn(m.id, c.settings)) return;
    m.board(c).forEach(function (w) { widgets.push(w); });
  });
  return widgets;
}

// --- алерты: порог + антиспам ---

// Возвращает { notify: string|null, alerted: {window?, week?} } — слитое новое состояние.
function checkAlerts(claude, alertPct, alerted) {
  alerted = alerted || {};
  var out = { notify: null, alerted: { window: alerted.window, week: alerted.week } };
  if (!claude) return out;
  // Макет тоста: заголовок «Claude · <лимит> N%», тело «Threshold X% exceeded · resets in <dur>».
  var breaches = [];
  var w = claude.window;
  if (w && w.utilPct != null && w.utilPct >= alertPct && w.resetAt && alerted.window !== w.resetAt) {
    breaches.push({ label: '5h limit ' + fmtPct(w.utilPct), resetMin: w.resetMin });
    out.alerted.window = w.resetAt;
  }
  var wk = claude.week;
  if (wk && wk.utilPct != null && wk.utilPct >= alertPct && wk.resetAt && alerted.week !== wk.resetAt) {
    breaches.push({ label: 'week ' + fmtPct(wk.utilPct), resetMin: wk.resetMin });
    out.alerted.week = wk.resetAt;
  }
  if (breaches.length) {
    var first = breaches[0];
    var body = ['Threshold ' + fmtPct(alertPct) + ' exceeded'];
    if (first.resetMin != null) body.push('resets in ' + fmtDurationMin(first.resetMin));
    breaches.slice(1).forEach(function (b) { body.push(b.label); });
    out.notify = { title: 'Claude · ' + first.label, body: body.join(' · '), tone: 'error', icon: '🔔' };
  }
  return out;
}

function defaultSettings() {
  var metrics = {};
  CARD_METRICS.concat(BOARD_METRICS).forEach(function (m) { metrics[m.id] = !!m.defaultOn; });
  var chips = {};
  SB_PROVIDERS.forEach(function (p) { p.keys.forEach(function (key) { chips[chipKey(p.id, key)] = !!SB_TEMPLATES[key].defaultOn; }); });
  return { metrics: metrics, tools: { claude: true, codex: true, cursor: false, gemini: false }, alertPct: 80, collapsed: {}, limitViz: 'meter', showFill: true, historyViz: 'bars', chips: chips, boardOrder: { limits: [], spend: [], history: [], tokens: [] }, blockOrder: ['limits', 'spend', 'history', 'tokens'] };
}

// --- настройки: storage, дефолты, тумблеры, режим настроек ---

async function loadSettings() {
  var def = defaultSettings();
  var saved = null;
  try { saved = await ts.storage.get('settings'); } catch (e) { saved = null; }
  if (!saved || typeof saved !== 'object') return def;
  var metrics = Object.assign({}, def.metrics, saved.metrics || {});
  var tools = Object.assign({}, def.tools, saved.tools || {});
  var alertPct = saved.alertPct != null ? clampAlert(saved.alertPct) : def.alertPct;
  var collapsed = Object.assign({}, (saved.collapsed && typeof saved.collapsed === 'object') ? saved.collapsed : {});
  var limitViz = (saved.limitViz === 'rings') ? 'rings' : 'meter';
  var showFill = saved.showFill !== false;
  var historyViz = (saved.historyViz === 'line') ? 'line' : 'bars';
  var chips = Object.assign({}, def.chips, (saved.chips && typeof saved.chips === 'object') ? saved.chips : {});
  var boardOrder = (function () {
    var v = saved.boardOrder, out = { limits: [], spend: [], history: [], tokens: [] };
    if (v && typeof v === 'object') BLOCKS.forEach(function (b) { if (Array.isArray(v[b])) out[b] = v[b].filter(function (x) { return typeof x === 'string'; }); });
    return out;
  })();
  var blockOrder = Array.isArray(saved.blockOrder) ? saved.blockOrder.filter(function (b) { return typeof b === 'string'; }) : ['limits', 'spend', 'history', 'tokens'];
  return { metrics: metrics, tools: tools, alertPct: alertPct, collapsed: collapsed, limitViz: limitViz, showFill: showFill, historyViz: historyViz, chips: chips, boardOrder: boardOrder, blockOrder: blockOrder };
}
async function saveSettings(s) { try { await ts.storage.set('settings', s); } catch (e) {} }
function clampAlert(x) { return Math.max(5, Math.min(95, Math.round(num(x)))); }

function buildSettingsWidgets(s) {
  var toolIds = ['claude', 'codex', 'cursor', 'gemini'];
  var toolNames = { claude: 'Claude', codex: 'Codex', cursor: 'Cursor', gemini: 'Gemini' };
  var out = [{ type: 'text', label: 'Settings', text: '⚙ Usage Watcher', tone: 'accent' }];

  // ===== ⚙ GENERAL =====
  out.push({ type: 'text', label: '⚙ GENERAL', text: 'everywhere', tone: 'accent' });
  out.push({ type: 'text', text: 'TOOLS' });
  // toggle-виджеты вместо ✓/◻-кнопок
  toolIds.forEach(function (id) {
    var on = s.tools[id] !== false && !!s.tools[id];
    out.push({ type: 'toggle', label: (PROVIDER_SQUARE[id] || '⬜') + ' ' + toolNames[id],
               value: on, command: 'usage.toggleTool:' + id });
  });
  out.push({ type: 'text', label: 'Alert threshold', text: fmtPct(s.alertPct) });
  out.push({ type: 'buttons', items: [
    { text: '− 5%', command: 'usage.alertDown' },
    { text: '+ 5%', command: 'usage.alertUp' },
  ] });

  // ===== 📋 PANEL =====
  out.push({ type: 'text', label: '📋 PANEL', text: 'right column', tone: 'accent' });
  // Макет: плоский список карточек-тумблеров (без под-заголовков блоков и без реордера —
  // порядок блоков тащится в самом борде через usage.reorderBoard).
  out.push({ type: 'text', text: 'CARDS' });
  orderedBlocks(s).forEach(function (bk) {
    orderedMetricIds(bk, s).forEach(function (id) {
      var m = CARD_METRICS.find(function (x) { return x.id === id; });
      out.push({ type: 'toggle', label: m.title, value: cardMetricOn(id, s), command: 'usage.toggleMetric:' + id });
    });
  });
  BOARD_METRICS.forEach(function (m) {
    out.push({ type: 'toggle', label: m.title, value: cardMetricOn(m.id, s), command: 'usage.toggleMetric:' + m.id });
  });
  // RENDER: segmented-виджеты
  out.push({ type: 'text', text: 'RENDER' });
  out.push({ type: 'segmented', label: 'Limits', value: s.limitViz !== 'rings' ? 'meter' : 'rings',
             command: 'usage.setViz',
             options: [{ value: 'meter', label: 'Meter' }, { value: 'rings', label: 'Rings' }] });
  out.push({ type: 'toggle', label: 'Fill scale', value: s.showFill !== false,
             command: 'usage.toggleFill' });
  out.push({ type: 'segmented', label: 'History', value: s.historyViz === 'bars' ? 'bars' : 'line',
             command: 'usage.setHistoryViz',
             options: [{ value: 'bars', label: 'Bars' }, { value: 'line', label: 'Line' }] });

  // ===== 📡 STATUS BAR =====
  // Макет: плоский список тумблеров чипов (без групп по провайдеру, без цвет-пикеров —
  // цвет лимит-чипов считается по порогу). Подпись «провайдер · показатель».
  out.push({ type: 'text', label: '📡 STATUS BAR', text: 'window bottom', tone: 'accent' });
  SB_PROVIDERS.forEach(function (p) {
    var name = p.id.charAt(0).toUpperCase() + p.id.slice(1);
    orderedChipKeys(p.id).forEach(function (key) {
      out.push({ type: 'toggle', label: name + ' · ' + SB_TEMPLATES[key].title,
                 value: chipOn(p.id, key, s), command: 'usage.toggleChip:' + p.id + ':' + key });
    });
  });

  out.push({ type: 'buttons', items: [{ text: '✓ Done', command: 'usage.settingsDone' }] });
  return out;
}

// --- модульное состояние воркера ---
var STATE = { settings: null, mode: 'dash', tools: [], hottest: null, alerted: {},
              usage: null, usageDiag: '', ccusageMissing: false, notifiedNoCcusage: false,
              lastUsageMs: 0, lastCcusageMs: 0, prevPct: {}, trends: {} };

// fetchUsage пишет короткий код причины в STATE.usageDiag (claude not found / claude exit N /
// no usage data / claude threw …). renderPanel маппит его через limitsUnavailReason в баннер.
async function fetchUsage() {
  var r;
  try { r = await ts.exec('claude', ['-p', '/usage'], {}); }
  catch (e) { STATE.usageDiag = 'claude threw: ' + ((e && e.message) || e); return null; }
  if (!r) { STATE.usageDiag = 'claude no result'; return null; }
  var stderr = String(r.stderr || '');
  if (/not found|ENOENT/i.test(stderr)) { STATE.usageDiag = 'claude not found'; return null; }
  var u = parseUsageText(r.stdout, Date.now());
  if (!u) {
    STATE.usageDiag = (r.code && r.code !== 0)
      ? 'claude exit ' + r.code + ': ' + stderr.slice(0, 80)
      : 'no usage data';
    return null;
  }
  STATE.usageDiag = '';
  return u;
}

async function collectTools(settings, usage, nowMs) {
  var out = [];
  var ccusageMissing = false;
  if (settings.tools.claude) {
    var b = await execCcusage('claude', ['blocks', '--active']);
    var d = await execCcusage('claude', ['daily']);
    var w = await execCcusage('claude', ['weekly']);
    var mo = await execCcusage('claude', ['monthly']);
    if (b.notFound || d.notFound) ccusageMissing = true;
    out.push(buildClaude(usage, b.json, d.json, w.json, nowMs, mo.json));
  }
  if (settings.tools.codex) {
    var cd = await execCcusage('codex', ['daily']);
    var cmo = await execCcusage('codex', ['monthly']);
    if (cd.notFound) ccusageMissing = true;
    out.push(buildCodex(cd.json, cmo.json));
  }
  if (settings.tools.cursor) out.push(buildStub('cursor', 'Cursor'));
  if (settings.tools.gemini) out.push(buildStub('gemini', 'Gemini'));
  return { tools: out, ccusageMissing: ccusageMissing };
}

// opts.usage: тянуть ли usage в этом проходе (по умолчанию ДА).
// usage кешируется в STATE.usage; сбой → кеш не затираем (деградация только если кеша нет).
var refresh = async function (opts) {
  if (!STATE.settings) STATE.settings = await loadSettings();
  var doUsage = !opts || opts.usage !== false;
  var nowMs = Date.now();
  var freshUsage = false;
  if (doUsage && STATE.settings.tools.claude) {
    var o = await fetchUsage();
    if (o) { STATE.usage = o; freshUsage = true; }
    STATE.lastUsageMs = nowMs;
  }
  var usage = STATE.settings.tools.claude ? STATE.usage : null;
  STATE.lastCcusageMs = nowMs;
  var res = await collectTools(STATE.settings, usage, nowMs);
  STATE.tools = res.tools;
  STATE.hottest = pickHottest(res.tools);
  STATE.ccusageMissing = res.ccusageMissing;
  if (freshUsage) {
    STATE.trends = computeTrends(STATE.tools, STATE.prevPct);
    STATE.prevPct = collectPct(STATE.tools);
    try { await ts.storage.set('prevPct', STATE.prevPct); } catch (e) {}
  }
  if (res.ccusageMissing && !STATE.notifiedNoCcusage) {
    STATE.notifiedNoCcusage = true;
    ts.notify('Usage Watcher: install ccusage — `npm i -g ccusage`');
  }
  renderStatus();
  renderPanel({ tools: STATE.tools, hottest: STATE.hottest, settings: STATE.settings, trends: STATE.trends });
  var claude = STATE.tools.find(function (t) { return t.id === 'claude'; });
  var al = checkAlerts(claude, num(STATE.settings.alertPct), STATE.alerted);
  STATE.alerted = al.alerted;
  if (al.notify) ts.notify(al.notify);
};

// статус-бар из текущего STATE (без сети) — для live-обновления при тумблерах
var renderStatus = function () {
  sbChipUpdates(STATE.tools, STATE.settings).forEach(function (u) { ts.ui.update(u.id, u.data); });
};

var renderPanel = function (c) {
  c = c || {};
  if (c.trends == null) c.trends = STATE.trends;
  if (STATE.mode === 'settings') {
    ts.ui.update('usage.panel', { header: { title: 'Settings', actions: [{ icon: '‹', command: 'usage.settingsDone' }, { icon: '✕', command: 'usage.settingsDone' }] }, widgets: buildSettingsWidgets(STATE.settings) });
  } else {
    // Макет: в шапке борда только шестерёнка (рефреш — по таймеру и через чип Watcher).
    // Кнопочной строки ↻/⚙ больше нет; остаются только условные баннеры-предупреждения.
    var head = [];
    if (STATE.usageDiag && !STATE.usage) head = head.concat([{ type: 'text', text: 'Limits unavailable: ' + limitsUnavailReason(STATE.usageDiag), tone: 'warn' }]);
    if (STATE.ccusageMissing) head = head.concat([{ type: 'text', text: '⚠ Install ccusage: npm i -g ccusage', tone: 'warn' }]);
    ts.ui.update('usage.panel', { header: { title: 'Usage Watcher', icon: '⏱', actions: [{ icon: '⚙', command: 'usage.settings' }] }, widgets: head.concat(buildBoardWidgets(c)) });
  }
};

// --- lifecycle + cycle ---
// Один таймер (15с tick). По времени: ccusage каждые ~45с, usage каждые USAGE_EVERY (180с).
var TICK = 15000, CCUSAGE_EVERY = 45000, timer = null;
var USAGE_EVERY = 180000; // usage (claude -p /usage) каждые ~180с; в диапазоне 60с–5мин
ts.onActivate(async function () {
  STATE.settings = await loadSettings();
  try { var pp = await ts.storage.get('prevPct'); if (pp && typeof pp === 'object') STATE.prevPct = pp; } catch (e) {}
  await refresh({ usage: true });           // первый проход тянет и ccusage, и usage
  timer = setInterval(async function () {
    var now = Date.now();
    var usageDue = STATE.settings && STATE.settings.tools.claude && (now - STATE.lastUsageMs >= USAGE_EVERY);
    var ccusageDue = (now - STATE.lastCcusageMs >= CCUSAGE_EVERY);
    if (usageDue || ccusageDue) { try { await refresh({ usage: usageDue }); } catch (e) {} }
  }, TICK);
});
ts.onDeactivate(function () { if (timer) clearInterval(timer); });

ts.ui.onEvent(async function (ev) {
  if (!ev || ev.type !== 'command') return;
  var parts = String(ev.command).split(':');
  var cmd = parts[0];
  switch (cmd) {
    case 'usage.refresh': await refresh({ usage: false }); break;
    case 'usage.settings': STATE.mode = 'settings'; renderPanel({ tools: STATE.tools, hottest: STATE.hottest, settings: STATE.settings }); break;
    case 'usage.settingsDone': STATE.mode = 'dash'; await refresh({ usage: false }); break;
    case 'usage.toggleMetric':
      STATE.settings.metrics[parts[1]] = parts[2] === '1'; await saveSettings(STATE.settings);
      renderPanel({ tools: STATE.tools, hottest: STATE.hottest, settings: STATE.settings }); renderStatus(); break;
    case 'usage.toggleTool':
      STATE.settings.tools[parts[1]] = parts[2] === '1'; await saveSettings(STATE.settings); await refresh({ usage: false }); break;
    case 'usage.alertUp': STATE.settings.alertPct = clampAlert(num(STATE.settings.alertPct) + 5); await saveSettings(STATE.settings); renderPanel({ tools: STATE.tools, hottest: STATE.hottest, settings: STATE.settings }); renderStatus(); break;
    case 'usage.alertDown': STATE.settings.alertPct = clampAlert(num(STATE.settings.alertPct) - 5); await saveSettings(STATE.settings); renderPanel({ tools: STATE.tools, hottest: STATE.hottest, settings: STATE.settings }); renderStatus(); break;
    case 'usage.toggleCollapse':
      STATE.settings.collapsed[parts[1]] = !sectionCollapsed(parts[1], STATE.settings);
      await saveSettings(STATE.settings);
      renderPanel({ tools: STATE.tools, hottest: STATE.hottest, settings: STATE.settings });
      break;
    case 'usage.setViz':
      STATE.settings.limitViz = parts[1] === 'rings' ? 'rings' : 'meter';
      await saveSettings(STATE.settings);
      renderPanel({ tools: STATE.tools, hottest: STATE.hottest, settings: STATE.settings }); break;
    case 'usage.setHistoryViz':
      STATE.settings.historyViz = parts[1] === 'bars' ? 'bars' : 'line';
      await saveSettings(STATE.settings);
      renderPanel({ tools: STATE.tools, hottest: STATE.hottest, settings: STATE.settings }); break;
    case 'usage.toggleFill':
      STATE.settings.showFill = parts[1] === '1';
      await saveSettings(STATE.settings);
      renderPanel({ tools: STATE.tools, hottest: STATE.hottest, settings: STATE.settings }); break;
    case 'usage.toggleChip':
      STATE.settings.chips[chipKey(parts[1], parts[2])] = parts[3] === '1';
      await saveSettings(STATE.settings);
      renderPanel({ tools: STATE.tools, hottest: STATE.hottest, settings: STATE.settings }); renderStatus(); break;
    case 'usage.reorderMetrics': {
      var rmb = parts[1];
      var rmValid = orderedMetricIds(rmb, STATE.settings); // все метрики блока
      var rmo = String(parts[2] || '').split(',').filter(function (id) { return rmValid.indexOf(id) >= 0; });
      if (rmo.length) {
        if (!STATE.settings.boardOrder) STATE.settings.boardOrder = { limits: [], spend: [], history: [], tokens: [] };
        STATE.settings.boardOrder[rmb] = rmo;
        await saveSettings(STATE.settings);
        renderPanel({ tools: STATE.tools, hottest: STATE.hottest, settings: STATE.settings });
      }
      break;
    }
    case 'usage.reorderBoard': {
      var known = BLOCKS;
      var ord = String(parts[1] || '').split(',').filter(function (b) { return known.indexOf(b) >= 0; });
      if (ord.length) {
        STATE.settings.blockOrder = ord;
        await saveSettings(STATE.settings);
        renderPanel({ tools: STATE.tools, hottest: STATE.hottest, settings: STATE.settings });
      }
      break;
    }
  }
});
