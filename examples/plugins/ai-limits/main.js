// AI Limits — a third-party Tilzio plugin. Classic Web Worker, global `ts`.
// NO import/export/require. Pure functions are function declarations (testable by the harness).
// Contract: docs/plugins/api-reference.md. Spec: 2026-06-10-tilzio-usage-watcher-design.md.

// --- utilities/sanitizers (function declarations → visible to the test harness) ---
function num(x) { var n = Number(x); return isFinite(n) ? n : 0; }
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
// Limit chip color (status bar) follows the alert threshold — the mockup paints the chip,
// not a fixed color: ≥ threshold → red, ≥ 60% of threshold → yellow, otherwise green (Gruvbox).
function threshColorHex(pct, alertPct) {
  var p = num(pct), thr = num(alertPct) || 80;
  if (p >= thr) return '#fb4934';
  if (p >= thr * 0.6) return '#fabd2f';
  return '#b8bb26';
}
// §5 trend: compares rounded %, '' when there is no previous value or they are equal.
function trendArrow(cur, prev) {
  if (prev == null || cur == null) return '';
  var c = Math.round(num(cur)), p = Math.round(num(prev));
  if (c > p) return '▲';
  if (c < p) return '▼';
  return '';
}
function trendKey(provider, which) { return provider + '.' + which; }
// Current limit % values of all available providers: { 'claude.5h':82, 'claude.week':50 }.
function collectPct(tools) {
  var out = {};
  (tools || []).forEach(function (t) {
    if (!t || !t.available) return;
    if (t.window && t.window.utilPct != null) out[trendKey(t.id, '5h')] = num(t.window.utilPct);
    if (t.week && t.week.utilPct != null) out[trendKey(t.id, 'week')] = num(t.week.utilPct);
  });
  return out;
}
// Arrows relative to prevPct: { 'claude.5h':'▲', ... }.
function computeTrends(tools, prevPct) {
  var cur = collectPct(tools), out = {};
  Object.keys(cur).forEach(function (k) { out[k] = trendArrow(cur[k], prevPct && prevPct[k]); });
  return out;
}

// §4.5: technical usage diagnostics (STATE.usageDiag) → a short human-readable reason.
function limitsUnavailReason(raw) {
  var s = String(raw || '');
  if (/not found/i.test(s)) return 'claude not found on PATH';
  if (/no usage data|claude exit/i.test(s)) return 'Claude not signed in — run `claude`';
  if (/claude (threw|no result)/i.test(s)) return 'claude unavailable';
  return 'service unavailable';
}

// --- spend parsers (daily / weekly) ---
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

// Date of a ccusage row: the real CLI writes period ('2026-07-13' daily/weekly,
// '2026-07' monthly); date is the legacy fallback.
function rowDate(row) { return str(row && (row.date != null ? row.date : row.period)); }
// Local date 'YYYY-MM-DD' (ccusage groups by local day as well).
function localYMD(nowMs) {
  var d = new Date(isFinite(nowMs) ? nowMs : Date.now());
  var m = d.getMonth() + 1, day = d.getDate();
  return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
}
// 'YYYY-MM-DD…' → day number (UTC basis, used only for date differences) | null.
function ymdToDayNum(s) {
  var m = str(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return Math.floor(Date.UTC(num(m[1]), num(m[2]) - 1, num(m[3])) / 86400000);
}

// The last row is "today" only when its period matches the current local date:
// in the morning, before the first request, ccusage returns yesterday as the last row → honest zeros.
function parseDaily(dailyJson, nowMs) {
  var arr = (dailyJson && Array.isArray(dailyJson.daily)) ? dailyJson.daily : [];
  var last = arr.length ? arr[arr.length - 1] : null;
  if (last && rowDate(last) !== localYMD(nowMs)) last = null;
  var sparkRows = arr.slice(-7);
  return {
    todayCost: last ? rowCost(last) : 0,
    todayTokens: last ? num(last.totalTokens) : 0,
    todayTok: tokTypes(last),
    spark7: sparkRows.map(rowCost),
    spark7dates: sparkRows.map(function (r) { return str(r && (r.date != null ? r.date : r.period)); }),
  };
}

// A week is valid only when "today" ∈ [weekStart, weekStart+7d).
function parseWeekly(weeklyJson, nowMs) {
  var arr = (weeklyJson && Array.isArray(weeklyJson.weekly)) ? weeklyJson.weekly : [];
  var last = arr.length ? arr[arr.length - 1] : null;
  if (last) {
    var ws = ymdToDayNum(rowDate(last)), today = ymdToDayNum(localYMD(nowMs));
    if (ws == null || today == null || today < ws || today >= ws + 7) last = null;
  }
  return { weekCost: last ? rowCost(last) : 0, weekTok: tokTypes(last) };
}

// A month is valid only when 'YYYY-MM' matches the current local month.
function parseMonthly(monthlyJson, nowMs) {
  var arr = (monthlyJson && Array.isArray(monthlyJson.monthly)) ? monthlyJson.monthly : [];
  var last = arr.length ? arr[arr.length - 1] : null;
  if (last && rowDate(last).slice(0, 7) !== localYMD(nowMs).slice(0, 7)) last = null;
  return { monthCost: last ? rowCost(last) : 0, monthTok: tokTypes(last) };
}

// --- parsing `claude -p /usage` output (source of limit %; format is version-dependent → defensive) ---

var MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// "Jun 17 at 1:50am (Asia/Seoul)" → ISO | null. Built as local time (claude prints local
// time; the tz parenthesis is ignored). Year: current; on Dec→Jan rollover (date landed in the past) +1.
// Rollover threshold is 24h: a date within one day "in the past" is treated as today/near future (resetMin clips to 0).
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

// One limit line → { utilPct, resetAt } | null (no % → null).
function parseLimitFragment(line, nowMs) {
  var pm = String(line || '').match(/(\d+)%/);
  if (!pm) return null;
  var rm = String(line || '').match(/resets\s+(.+?)\s*$/i);
  return { utilPct: num(pm[1]), resetAt: parseResetText(rm ? rm[1] : '', nowMs) };
}

// The line matching anchor → { utilPct, resetAt } | null (no line or no % → null).
function parseUsageLine(s, anchor, nowMs) {
  var lines = String(s || '').split('\n');
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].indexOf(anchor) >= 0) return parseLimitFragment(lines[i], nowMs);
  }
  return null;
}

// Per-model week: 'Current week (<model>)' where <model> ≠ 'all models'.
// The CLI used to print 'Sonnet only', now e.g. 'Fable' — anchoring on a specific model is dead,
// so we take ANY model parenthesis → { utilPct, resetAt, label } | null.
function parseModelWeekLine(s, nowMs) {
  var lines = String(s || '').split('\n');
  for (var i = 0; i < lines.length; i++) {
    var m = lines[i].match(/^\s*Current week \(([^)]+)\)/);
    if (!m || /^all models$/i.test(m[1])) continue;
    var frag = parseLimitFragment(lines[i], nowMs);
    if (!frag) continue;
    return { utilPct: frag.utilPct, resetAt: frag.resetAt, label: m[1] };
  }
  return null;
}

// stdout of `claude -p /usage` → { fiveHour, sevenDay, sonnet } | null (no valid line at all).
// The field is named sonnet for compatibility (store/panel) but carries the current model's label.
function parseUsageText(stdout, nowMs) {
  var s = String(stdout || '');
  var fiveHour = parseUsageLine(s, 'Current session', nowMs);
  var sevenDay = parseUsageLine(s, 'Current week (all models)', nowMs);
  var sonnet = parseModelWeekLine(s, nowMs);
  if (!fiveHour && !sevenDay && !sonnet) return null;
  return { fiveHour: fiveHour, sevenDay: sevenDay, sonnet: sonnet };
}

// --- ccusage via ts.exec (defensive JSON, never throws) ---
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
    // A missing binary is REJECTED by the broker ('…executable file not found…')
    // rather than arriving in r.stderr — otherwise the '⚠ Install ccusage' banner would never show.
    var em = (e && e.message) || String(e);
    return { ok: false, notFound: /not found|ENOENT/i.test(em), error: em };
  }
}

// blocks --active → normalized 5h window (Claude only). null when there is no active block.
function parseActiveWindow(blocksJson, nowMs) {
  if (!blocksJson || !Array.isArray(blocksJson.blocks)) return null;
  var b = blocksJson.blocks.find(function (x) { return x && x.isActive && !x.isGap; });
  if (!b) return null;
  var resetMin = minutesUntilISO(b.endTime, nowMs);
  // projection may be null — take resetMin from endTime (more reliable), projection is optional.
  return {
    resetAt: str(b.endTime) || null,
    resetMin: resetMin,
    costUSD: num(b.costUSD),
    tokens: num(b.totalTokens),
    tokenCounts: b.tokenCounts || {},
  };
}

// --- ToolData assembly (normalized per-tool model) ---

function buildClaude(usage, blocksJson, dailyJson, weeklyJson, nowMs, monthlyJson) {
  var win = parseActiveWindow(blocksJson, nowMs);   // {resetAt,resetMin,costUSD,tokens} | null
  var day = parseDaily(dailyJson, nowMs);
  var wk = parseWeekly(weeklyJson, nowMs);
  var mo = parseMonthly(monthlyJson, nowMs);
  var window = win ? { resetAt: win.resetAt, resetMin: win.resetMin, costUSD: win.costUSD, tokens: win.tokens } : undefined;
  if (window && usage && usage.fiveHour) {
    window.utilPct = usage.fiveHour.utilPct;
    if (!window.resetMin && usage.fiveHour.resetAt) window.resetMin = minutesUntilISO(usage.fiveHour.resetAt, nowMs);
  } else if (!window && usage && usage.fiveHour) {
    // No active ccusage window (ccusage not installed / no block found) — the % from
    // `claude -p /usage` must still reach the chip/panel and the 5h alert.
    // The block's cost/tokens are intentionally absent (unknown without ccusage).
    window = { utilPct: usage.fiveHour.utilPct };
    if (usage.fiveHour.resetAt) {
      window.resetAt = usage.fiveHour.resetAt;
      window.resetMin = minutesUntilISO(usage.fiveHour.resetAt, nowMs);
    }
  }
  var week = { costUSD: wk.weekCost };
  if (usage && usage.sevenDay) { week.utilPct = usage.sevenDay.utilPct; week.resetAt = usage.sevenDay.resetAt; }
  if (week.resetAt) week.resetMin = minutesUntilISO(week.resetAt, nowMs); // for the wkReset chip (mirror of window.resetMin)
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

// --- status bar: per-provider chips (Stage C) ---
// thresh:true → the chip color is computed from the threshold (threshColorHex), not defaultColor.
// Original brand icons (Simple Icons, 24×24 paths) for the status-bar name chips.
// The host renders them as inline SVG via iconPath/iconColor (pluginSlots.cleanIconPath).
// Duplicating panel.html GLYPH_PATHS is deliberate (worker/iframe isolation).
var SB_ICON_PATHS = {
  claude: 'm4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z',
  codex: 'M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z'
};
// Claude gets its brand terracotta; Codex is monochrome and inherits the chip color.
var SB_ICON_COLORS = { claude: '#D97757' };

var SB_TEMPLATES = {
  name:  { title: 'Name',         defaultOn: true,  defaultColor: '#ebdbb2', applies: function (t) { return true; },                                  sb: function (t) { return t.name; } },
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
// Provider chip order = the SB_PROVIDERS declaration (user reorder removed — per the mockup).
function orderedChipKeys(provider) {
  var prov = SB_PROVIDERS.find(function (p) { return p.id === provider; });
  return prov ? prov.keys.slice() : [];
}
// Pure builder of chip updates: [{id, data}] (data={} hides the item).
// Limit chips (thresh) are colored by the alert threshold; the rest use the template's fixed color.
function sbChipUpdates(tools, settings) {
  var out = [];
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
      if (key === 'name' && SB_ICON_PATHS[p.id]) {
        chipData.iconPath = SB_ICON_PATHS[p.id];
        if (SB_ICON_COLORS[p.id]) chipData.iconColor = SB_ICON_COLORS[p.id];
      }
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

// --- board: card-level metrics (drawn for every selected tool) ---
var CARD_METRICS = [
  { id: 'card.5h',        title: '5h limit',        block: 'limits',  defaultOn: true },
  { id: 'card.week',      title: 'Weekly limit',    block: 'limits',  defaultOn: true },
  { id: 'card.weekSonnet',title: 'Model week %',    block: 'limits',  defaultOn: true },
  { id: 'card.daySpend',  title: '$ Today',         block: 'spend',   defaultOn: true },
  { id: 'card.weekSpend', title: '$ Week',          block: 'spend',   defaultOn: true },
  { id: 'card.monthSpend',title: '$ Month',         block: 'spend',   defaultOn: true },
  { id: 'card.spark',     title: '7d history',      block: 'history', defaultOn: true },
  { id: 'card.tokens',    title: 'Token breakdown', block: 'tokens',  defaultOn: true },
];
// --- board: shared widgets (rendered once below the cards) ---
var BOARD_METRICS = [ { id: 'board.spark7all', title: 'Combined 7d sparkline', defaultOn: false } ];

var BLOCKS = ['limits', 'spend', 'history', 'tokens'];
// Known ids for validating messages from the iframe (messages are untrusted):
var TOOL_IDS = ['claude', 'codex', 'cursor', 'gemini'];
var METRIC_IDS = CARD_METRICS.concat(BOARD_METRICS).map(function (m) { return m.id; });
var BLOCK_VIZ = { limits: ['meter', 'rings'], history: ['bars', 'line'] };
function orderedBlocks(settings) {
  var saved = (settings && Array.isArray(settings.blockOrder)) ? settings.blockOrder : [];
  var out = [];
  saved.forEach(function (b) { if (BLOCKS.indexOf(b) >= 0 && out.indexOf(b) < 0) out.push(b); });
  BLOCKS.forEach(function (b) { if (out.indexOf(b) < 0) out.push(b); });
  return out;
}
function cardMetricOn(id, settings) {
  var m = CARD_METRICS.concat(BOARD_METRICS).find(function (x) { return x.id === id; });
  if (settings && settings.metrics && Object.prototype.hasOwnProperty.call(settings.metrics, id))
    return !!settings.metrics[id];
  return m ? !!m.defaultOn : false;
}

// --- alerts: threshold + anti-spam ---

// ISO week 'YYYY-Www' — fallback dedup key for the weekly alert when the reset text
// failed to parse (without it the alert silently never fired).
function isoWeekKey(nowMs) {
  var d = new Date(isFinite(nowMs) ? nowMs : Date.now());
  var t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  t.setDate(t.getDate() - ((t.getDay() + 6) % 7) + 3);            // Thursday of the current week
  var jan4 = new Date(t.getFullYear(), 0, 4);
  jan4.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + 3);   // Thursday of the first ISO week
  var wk = 1 + Math.round((t - jan4) / 604800000);
  return t.getFullYear() + '-W' + (wk < 10 ? '0' : '') + wk;
}

// Returns { notify: string|null, alerted: {window?, week?} } — the merged new state.
function checkAlerts(claude, alertPct, alerted) {
  alerted = alerted || {};
  var out = { notify: null, alerted: { window: alerted.window, week: alerted.week } };
  if (!claude) return out;
  // Toast mockup: title "Claude · <limit> N%", body "Threshold X% exceeded · resets in <dur>".
  var breaches = [];
  var w = claude.window;
  var wKey = (w && w.resetAt) ? w.resetAt : ('5h:' + localYMD(Date.now()));   // without resetAt — once a day
  if (w && w.utilPct != null && w.utilPct >= alertPct && alerted.window !== wKey) {
    breaches.push({ label: '5h limit ' + fmtPct(w.utilPct), resetMin: w.resetMin });
    out.alerted.window = wKey;
  }
  var wk = claude.week;
  var wkKey = (wk && wk.resetAt) ? wk.resetAt : isoWeekKey();   // without resetAt — once per ISO week
  if (wk && wk.utilPct != null && wk.utilPct >= alertPct && alerted.week !== wkKey) {
    breaches.push({ label: 'week ' + fmtPct(wk.utilPct), resetMin: wk.resetMin });
    out.alerted.week = wkKey;
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
  return { metrics: metrics, tools: { claude: true, codex: true, cursor: false, gemini: false }, alertPct: 80, collapsed: {}, limitViz: 'meter', showFill: true, historyViz: 'bars', chips: chips, blockOrder: ['limits', 'spend', 'history', 'tokens'], blocks: { limits: true, spend: true, history: true, tokens: true } };
}

// --- settings: storage, defaults, toggles, settings mode ---

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
  var blockOrder = Array.isArray(saved.blockOrder) ? saved.blockOrder.filter(function (b) { return typeof b === 'string'; }) : ['limits', 'spend', 'history', 'tokens'];
  var blocks = Object.assign({ limits: true, spend: true, history: true, tokens: true }, (saved.blocks && typeof saved.blocks === 'object') ? saved.blocks : {});
  return { metrics: metrics, tools: tools, alertPct: alertPct, collapsed: collapsed, limitViz: limitViz, showFill: showFill, historyViz: historyViz, chips: chips, blockOrder: blockOrder, blocks: blocks };
}
async function saveSettings(s) { try { await ts.storage.set('settings', s); } catch (e) {} }
function clampAlert(x) { return Math.max(5, Math.min(95, Math.round(num(x)))); }

// --- module-level worker state ---
var STATE = { settings: null, tools: [], alerted: {},
              usage: null, usageDiag: '', ccusageMissing: false, notifiedNoCcusage: false,
              lastUsageMs: 0, lastCcusageMs: 0, prevPct: {}, trends: {}, viewFrameId: null };

// fetchUsage writes a short reason code into STATE.usageDiag (claude not found / claude exit N /
// no usage data / claude threw …). buildState() maps it via limitsUnavailReason into diag.limitsUnavail.
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

// opts.usage: whether to fetch usage on this pass (default YES).
// usage is cached in STATE.usage; on failure the cache is kept (degrade only when there is no cache).
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
  STATE.ccusageMissing = res.ccusageMissing;
  if (freshUsage) {
    STATE.trends = computeTrends(STATE.tools, STATE.prevPct);
    STATE.prevPct = collectPct(STATE.tools);
    try { await ts.storage.set('prevPct', STATE.prevPct); } catch (e) {}
  }
  if (res.ccusageMissing && !STATE.notifiedNoCcusage) {
    STATE.notifiedNoCcusage = true;
    ts.notify('AI Limits: install ccusage — `npm i -g ccusage`');
  }
  renderStatus();
  postState();
  var claude = STATE.tools.find(function (t) { return t.id === 'claude'; });
  var al = checkAlerts(claude, num(STATE.settings.alertPct), STATE.alerted);
  STATE.alerted = al.alerted;
  if (al.notify) ts.notify(al.notify);
};

// status bar from the current STATE (no network) — for live updates when toggles flip
var renderStatus = function () {
  sbChipUpdates(STATE.tools, STATE.settings).forEach(function (u) { ts.ui.update(u.id, u.data); });
};

// Snapshot pushed to the iframe: everything the dashboard/settings need is derivable from these.
function buildState() {
  return {
    tools: STATE.tools,
    settings: STATE.settings,
    trends: STATE.trends,
    diag: {
      limitsUnavail: (STATE.usageDiag && !STATE.usage) ? limitsUnavailReason(STATE.usageDiag) : null,
      ccusageMissing: !!STATE.ccusageMissing,
    },
  };
}
function postState() {
  if (STATE.viewFrameId == null) return; // iframe not ready yet
  ts.view.post(STATE.viewFrameId, {
    type: 'state', tools: STATE.tools, settings: STATE.settings, trends: STATE.trends,
    diag: buildState().diag,
  });
}

// --- lifecycle + cycle ---
// A single timer (15s tick). Schedule: ccusage every ~45s, usage every USAGE_EVERY (180s).
var TICK = 15000, CCUSAGE_EVERY = 45000, timer = null;
var USAGE_EVERY = 180000; // usage (claude -p /usage) every ~180s; within the 60s–5min range
ts.onActivate(async function () {
  STATE.settings = await loadSettings();
  try { var pp = await ts.storage.get('prevPct'); if (pp && typeof pp === 'object') STATE.prevPct = pp; } catch (e) {}
  await refresh({ usage: true });           // the first pass fetches both ccusage and usage
  timer = setInterval(async function () {
    var now = Date.now();
    var usageDue = STATE.settings && STATE.settings.tools.claude && (now - STATE.lastUsageMs >= USAGE_EVERY);
    var ccusageDue = (now - STATE.lastCcusageMs >= CCUSAGE_EVERY);
    if (usageDue || ccusageDue) { try { await refresh({ usage: usageDue }); } catch (e) {} }
  }, TICK);
});
ts.onDeactivate(function () { if (timer) clearInterval(timer); });

// Handshake with the iframe panel: the frame sends {type:'ready'} after mounting → remember its
// frameId and immediately push the current snapshot. The rest of the message dispatch is Task 4.
// Every field of an incoming message is validated against known id sets;
// garbage is ignored silently — no throw is reachable from a malformed message.
async function handleViewMessage(msg) {
  var s = STATE.settings;
  if (!s) return;
  switch (msg.type) {
    case 'refresh': await refresh({ usage: false }); return;           // refresh() calls postState()+renderStatus()
    case 'toggleCollapse':
      if (typeof msg.provider !== 'string' || TOOL_IDS.indexOf(msg.provider) < 0) return;
      if (!s.collapsed) s.collapsed = {};
      s.collapsed[msg.provider] = !(s.collapsed && s.collapsed[msg.provider] === true);
      break;
    case 'setBlockViz': {
      var allowedViz = BLOCK_VIZ[msg.block];
      if (!allowedViz || typeof msg.viz !== 'string' || allowedViz.indexOf(msg.viz) < 0) return;
      if (msg.block === 'limits') s.limitViz = msg.viz;
      else s.historyViz = msg.viz;
      break;
    }
    case 'toggleFill':
      s.showFill = !(s.showFill !== false);   // parity with the old "Fill scale" setting (default on → bare % when off)
      break;
    case 'toggleTool':
      if (typeof msg.tool !== 'string' || TOOL_IDS.indexOf(msg.tool) < 0) return;
      if (!s.tools) s.tools = {};
      s.tools[msg.tool] = !(s.tools && s.tools[msg.tool]);
      await saveSettings(s); await refresh({ usage: false }); return;   // refetch tools
    case 'setAlert': {
      var delta = Number(msg.delta);
      if (!isFinite(delta)) return;
      s.alertPct = clampAlert(num(s.alertPct) + delta);
      break;
    }
    case 'reorderBlocks': {
      if (!Array.isArray(msg.order)) return;
      var ord = [];
      msg.order.forEach(function (b) { if (BLOCKS.indexOf(b) >= 0 && ord.indexOf(b) < 0) ord.push(b); });
      if (!ord.length) return;
      s.blockOrder = ord;
      break;
    }
    case 'toggleBlock':
      if (typeof msg.block !== 'string' || BLOCKS.indexOf(msg.block) < 0) return;
      if (!s.blocks) s.blocks = { limits: true, spend: true, history: true, tokens: true };
      s.blocks[msg.block] = !(s.blocks[msg.block] !== false);
      break;
    case 'toggleMetric':
      if (typeof msg.id !== 'string' || METRIC_IDS.indexOf(msg.id) < 0) return;
      if (!s.metrics) s.metrics = {};
      s.metrics[msg.id] = !cardMetricOn(msg.id, s);
      break;
    case 'toggleChip': {
      var prov = SB_PROVIDERS.find(function (p) { return p.id === msg.provider; });
      if (!prov || typeof msg.key !== 'string' || prov.keys.indexOf(msg.key) < 0) return;
      if (!s.chips) s.chips = {};
      s.chips[chipKey(msg.provider, msg.key)] = !chipOn(msg.provider, msg.key, s);
      break;
    }
    default: return;
  }
  await saveSettings(s);
  renderStatus();   // chip toggles / alert / tool affect the status bar
  postState();      // reflect the setting in the dashboard
}
ts.view.onMessage(function (msg, frameId) {
  if (!msg || typeof msg !== 'object') return;
  STATE.viewFrameId = frameId;              // remember which docked frame to push to
  if (msg.type === 'ready') { postState(); return; }
  handleViewMessage(msg);                    // defined in Task 4
});

ts.ui.onEvent(async function (ev) {
  if (!ev || ev.type !== 'command') return;
  if (String(ev.command).split(':')[0] === 'usage.refresh') { await refresh({ usage: false }); }
});
