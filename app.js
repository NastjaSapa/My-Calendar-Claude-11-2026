/* Dopamine Calendar — a colorful face for Google Calendar + Google Tasks.
   Everything lives in Google: events in Calendar, Top 3 / deadlines / week notes in Tasks.
   Add ?demo to the address to try it with sample data and no sign-in. */
(function () {
  'use strict';
  const C = window.DC_CONFIG;
  const P = window.DCParse;
  const DEMO = new URLSearchParams(location.search).has('demo');
  const CAL = 'https://www.googleapis.com/calendar/v3';
  const TASKS = 'https://tasks.googleapis.com/tasks/v1';

  // ---------- small helpers ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem('dc.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('dc.' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
    del(k) { try { localStorage.removeItem('dc.' + k); } catch (e) { /* ignore */ } }
  };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sod = P.startOfDay, addDays = P.addDays;
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const fromYmd = (s) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
  const weekStart = (d) => { const x = sod(d); const diff = (x.getDay() + 6) % 7; return addDays(x, -diff); };
  const sameDay = (a, b) => ymd(a) === ymd(b);
  const hm = (d) => d.getHours() + ':' + pad(d.getMinutes());
  const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const WD3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const ordinal = (n) => n + ((n % 100 >= 11 && n % 100 <= 13) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'));
  const isoWeek = (d) => { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day); const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t - y0) / 86400000 + 1) / 7); };
  const fmtDay = (d) => WD3[d.getDay()] + ' ' + d.getDate() + ' ' + MON[d.getMonth()].slice(0, 3);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const dueStr = (d) => ymd(d) + 'T00:00:00.000Z'; // Google Tasks keeps only the date

  const ICON = {
    plus: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    left: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    right: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
    close: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    check: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>',
    work: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></svg>',
    migraine: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>',
    weekend: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M3 17h18M6.5 17a5.5 5.5 0 0 1 11 0M12 5v3M4.5 9.5l2 2M19.5 9.5l-2 2M5 21h14"/></svg>',
    star: '<svg class="star" viewBox="0 0 70 70" aria-hidden="true"><path d="M35 4 L40 30 L66 35 L40 40 L35 66 L30 40 L4 35 L30 30 Z"/></svg>'
  };
  const MODE_NAME = { work: 'Work', migraine: 'Migraine', weekend: 'Weekend' };
  // Google Calendar event colors, shown in our own palette
  const COLORS = [
    { id: '', name: 'Calendar default', hex: 'transparent' },
    { id: '5', name: 'Banana', hex: '#FFD68B' },
    { id: '4', name: 'Flamingo', hex: '#FF9FB0' },
    { id: '2', name: 'Sage', hex: '#B9F0D3' },
    { id: '1', name: 'Lavender', hex: '#C9BDF4' },
    { id: '6', name: 'Tangerine', hex: '#F7965E' }
  ];

  // ---------- state ----------
  const S = {
    view: store.get('view', 'today'),
    sel: sod(new Date()),
    modePref: store.get('mode', 'auto'),
    token: null, tokenExp: 0,
    signedIn: false, needsReauth: false, authError: '',
    calendars: [], events: [], loadedWeek: null, loading: false,
    lists: {}, tasks: { top3: [], deadlines: [], notes: [] }, tasksLoaded: false,
    sheet: null
  };

  function mode() {
    if (S.modePref !== 'auto') return S.modePref;
    const n = new Date();
    return C.workDays.includes(n.getDay()) && n.getHours() >= C.workStartHour && n.getHours() < C.workEndHour ? 'work' : 'weekend';
  }
  function applyMode() {
    const m = mode();
    document.body.dataset.mode = m;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = { work: '#FF8FA4', migraine: '#C4C2E6', weekend: '#A790EA' }[m];
  }

  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2600);
  }

  // ---------- Google sign-in ----------
  let tokenClient = null, pending = null;
  function gisLoaded() {
    if (DEMO || !window.google || !google.accounts) return;
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: C.clientId,
      scope: C.scopes,
      callback: (resp) => {
        const p = pending; pending = null;
        if (resp.error) { p && p.rej(new Error(resp.error_description || resp.error)); return; }
        if (!google.accounts.oauth2.hasGrantedAllScopes(resp, ...C.scopes.split(' '))) {
          p && p.rej(new Error('Please tick all boxes so the app can see your calendar and tasks.'));
          return;
        }
        S.token = resp.access_token;
        S.tokenExp = Date.now() + (Number(resp.expires_in || 3600) - 60) * 1000;
        store.set('token', { t: S.token, e: S.tokenExp });
        store.set('known', true);
        p && p.res();
      },
      error_callback: (err) => { const p = pending; pending = null; p && p.rej(new Error(err && err.type === 'popup_closed' ? 'The sign-in window was closed.' : 'Sign-in did not work. Try again.')); }
    });
    render();
  }
  function requestToken() {
    return new Promise((res, rej) => {
      if (!tokenClient) { rej(new Error('Google sign-in is still loading, try again in a second.')); return; }
      pending = { res, rej };
      tokenClient.requestAccessToken({ prompt: store.get('known', false) ? '' : 'consent' });
    });
  }
  async function signIn() {
    S.authError = '';
    try {
      await requestToken();
      S.signedIn = true; S.needsReauth = false;
      render();
      await loadAll(true);
    } catch (e) { S.authError = e.message; render(); }
  }
  function signOut() {
    if (S.token && window.google) { try { google.accounts.oauth2.revoke(S.token, () => {}); } catch (e) { /* ignore */ } }
    store.del('token'); store.del('known');
    Object.assign(S, { token: null, tokenExp: 0, signedIn: false, calendars: [], events: [], loadedWeek: null, lists: {}, tasks: { top3: [], deadlines: [], notes: [] }, tasksLoaded: false, sheet: null });
    render();
  }

  class NeedAuth extends Error {}
  async function api(url, opts) {
    opts = opts || {};
    if (!S.token || Date.now() > S.tokenExp) throw new NeedAuth('expired');
    const r = await fetch(url, {
      method: opts.method || 'GET',
      headers: Object.assign({ Authorization: 'Bearer ' + S.token }, opts.body ? { 'Content-Type': 'application/json' } : {}),
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    if (r.status === 401) { S.token = null; store.del('token'); throw new NeedAuth('401'); }
    if (!r.ok) { const t = await r.text(); throw new Error('Google answered ' + r.status + ': ' + t.slice(0, 160)); }
    return r.status === 204 ? null : r.json();
  }
  function handleErr(e) {
    if (e instanceof NeedAuth) { S.needsReauth = true; render(); return; }
    console.error(e); toast(e.message || 'Something went wrong');
  }

  // ---------- loading data ----------
  async function loadCalendars() {
    const out = []; let pageToken = '';
    do {
      const r = await api(CAL + '/users/me/calendarList?maxResults=250' + (pageToken ? '&pageToken=' + pageToken : ''));
      out.push(...(r.items || [])); pageToken = r.nextPageToken || '';
    } while (pageToken);
    S.calendars = out.filter((c) => c.selected && !c.hidden && !c.deleted)
      .sort((a, b) => (b.primary ? 1 : 0) - (a.primary ? 1 : 0));
  }
  function normEvent(e, cal) {
    const allDay = !!(e.start && e.start.date);
    const start = allDay ? fromYmd(e.start.date) : new Date(e.start.dateTime);
    const end = allDay ? fromYmd(e.end.date) : new Date(e.end.dateTime);
    return { id: e.id, calId: cal.id, calName: cal.summaryOverride || cal.summary, primary: !!cal.primary, title: e.summary || '(no title)', location: e.location || '', allDay, start, end };
  }
  async function loadEvents(force) {
    const ws = weekStart(S.sel);
    if (!force && S.loadedWeek === ymd(ws)) return;
    const we = addDays(ws, 7);
    const all = await Promise.all(S.calendars.map(async (cal) => {
      try {
        const q = '?singleEvents=true&orderBy=startTime&maxResults=250&timeMin=' + encodeURIComponent(ws.toISOString()) + '&timeMax=' + encodeURIComponent(we.toISOString());
        const r = await api(CAL + '/calendars/' + encodeURIComponent(cal.id) + '/events' + q);
        return (r.items || []).filter((e) => e.status !== 'cancelled' && e.start).map((e) => normEvent(e, cal));
      } catch (e) { if (e instanceof NeedAuth) throw e; return []; }
    }));
    S.events = all.flat().sort((a, b) => a.start - b.start);
    S.loadedWeek = ymd(ws);
  }
  async function ensureList(key) {
    if (S.lists[key]) return S.lists[key];
    const r = await api(TASKS + '/users/@me/lists?maxResults=100');
    for (const l of r.items || []) for (const k of Object.keys(C.lists)) if (l.title === C.lists[k]) S.lists[k] = l.id;
    if (!S.lists[key]) { const nl = await api(TASKS + '/users/@me/lists', { method: 'POST', body: { title: C.lists[key] } }); S.lists[key] = nl.id; }
    return S.lists[key];
  }
  async function loadTasks() {
    for (const key of ['top3', 'deadlines', 'notes']) {
      const id = await ensureList(key);
      const r = await api(TASKS + '/lists/' + id + '/tasks?showCompleted=false&showHidden=false&maxResults=100');
      S.tasks[key] = (r.items || []).filter((t) => t.title).map((t) => ({ id: t.id, title: t.title, due: t.due ? fromYmd(t.due) : null, position: t.position || '' }));
    }
    S.tasks.top3.sort((a, b) => (a.position < b.position ? -1 : 1));
    S.tasks.deadlines.sort((a, b) => (a.due || 8.64e15) - (b.due || 8.64e15));
    S.tasksLoaded = true;
  }
  async function loadAll(force) {
    if (DEMO) { render(); return; }
    S.loading = true; render();
    try {
      if (!S.calendars.length || force) await loadCalendars();
      await Promise.all([loadEvents(force), (force || !S.tasksLoaded) ? loadTasks() : null]);
      S.lastLoad = Date.now();
    } catch (e) { handleErr(e); }
    S.loading = false; render();
  }

  // ---------- changing data ----------
  async function createEvent(calId, title, when, colorId) {
    const body = { summary: title };
    if (when.allDay) { body.start = { date: ymd(when.start) }; body.end = { date: ymd(when.end) }; }
    else { body.start = { dateTime: when.start.toISOString(), timeZone: tz }; body.end = { dateTime: when.end.toISOString(), timeZone: tz }; }
    if (colorId) body.colorId = colorId;
    if (DEMO) {
      const cal = S.calendars.find((c) => c.id === calId) || S.calendars[0];
      S.events.push(normEvent(Object.assign({ id: 'd' + Date.now() }, body, when.allDay ? {} : { start: { dateTime: body.start.dateTime }, end: { dateTime: body.end.dateTime } }), cal));
      S.events.sort((a, b) => a.start - b.start); return;
    }
    await api(CAL + '/calendars/' + encodeURIComponent(calId) + '/events', { method: 'POST', body });
    S.loadedWeek = null; await loadEvents(true);
  }
  async function createTask(kind, title, due) {
    const item = { id: 'tmp' + Date.now(), title, due: due || null, position: 'zzzz' };
    S.tasks[kind].push(item);
    if (kind === 'deadlines') S.tasks.deadlines.sort((a, b) => (a.due || 8.64e15) - (b.due || 8.64e15));
    render();
    if (DEMO) return;
    const listId = await ensureList(kind);
    const body = { title };
    if (due) body.due = dueStr(due);
    const t = await api(TASKS + '/lists/' + listId + '/tasks', { method: 'POST', body });
    item.id = t.id; item.position = t.position || item.position;
  }
  async function completeTask(kind, id) {
    const item = S.tasks[kind].find((t) => t.id === id);
    if (!item || item.done) return;
    item.done = true; render();
    setTimeout(() => { S.tasks[kind] = S.tasks[kind].filter((t) => t !== item); render(); }, 700);
    if (DEMO) return;
    try { await api(TASKS + '/lists/' + S.lists[kind] + '/tasks/' + id, { method: 'PATCH', body: { status: 'completed' } }); }
    catch (e) { S.tasks[kind].push(item); item.done = false; handleErr(e); render(); }
  }

  // ---------- views ----------
  function modePill() {
    const m = mode();
    return '<button class="pill" data-action="mode" aria-label="Mode: ' + MODE_NAME[m] + (S.modePref === 'auto' ? ' (automatic)' : '') + '. Change mode">' + ICON[m] + '<span>' + MODE_NAME[m] + '</span></button>';
  }
  function weekNav() {
    return '<div class="weeknav"><button class="icon-btn" data-action="prevweek" aria-label="Previous week">' + ICON.left + '</button>' +
      '<button class="icon-btn" data-action="nextweek" aria-label="Next week">' + ICON.right + '</button></div>';
  }
  function reauthBanner() {
    if (!S.needsReauth) return '';
    return '<div class="content" style="padding-bottom:0"><button class="big-btn" data-action="reauth">Tap to reconnect Google</button></div>';
  }
  function eventsOn(day) {
    const a = sod(day), b = addDays(a, 1);
    return S.events.filter((e) => e.start < b && e.end > a);
  }
  function eventMeta(e) {
    if (e.location) return e.location;
    return e.primary ? '' : e.calName;
  }

  function viewToday() {
    const sel = S.sel, today = sod(new Date());
    const ws = weekStart(sel);
    let days = '';
    for (let i = 0; i < 7; i++) {
      const d = addDays(ws, i);
      const cls = 'day' + (sameDay(d, sel) ? ' on' : '') + (sameDay(d, today) ? ' today' : '');
      days += '<button class="' + cls + '" data-action="pick" data-date="' + ymd(d) + '" aria-label="' + WD[d.getDay()] + ' ' + d.getDate() + '"' + (sameDay(d, sel) ? ' aria-current="date"' : '') + '><span class="l">' + WD[d.getDay()][0] + '</span><span class="n">' + d.getDate() + '</span></button>';
    }
    const evs = eventsOn(sel);
    const allDay = evs.filter((e) => e.allDay);
    const timed = evs.filter((e) => !e.allDay);
    let body = '';
    if (allDay.length) body += '<div class="allday">' + allDay.map((e) => '<span class="tag">' + esc(e.title) + '</span>').join('') + '</div>';
    body += timed.map((e) => {
      const startsBefore = !sameDay(e.start, sel), endsAfter = !sameDay(e.end, sel) && !(e.end.getHours() === 0 && e.end.getMinutes() === 0 && sameDay(addDays(e.end, -1), sel));
      return '<div class="event"><div class="time"><b>' + (startsBefore ? '…' : hm(e.start)) + '</b><span>' + (endsAfter ? '…' : hm(e.end)) + '</span></div>' +
        '<div class="what"><b>' + esc(e.title) + '</b>' + (eventMeta(e) ? '<span>' + esc(eventMeta(e)) + '</span>' : '') + '</div></div>';
    }).join('');
    const dueToday = S.tasks.deadlines.filter((t) => t.due && sameDay(t.due, sel));
    if (dueToday.length) body += '<div class="allday">' + dueToday.map((t) => '<span class="tag" style="background:var(--d1)">Due: ' + esc(t.title) + '</span>').join('') + '</div>';
    if (!evs.length && !dueToday.length) body = S.loading ? '<div class="empty">Loading…</div>' : '<div class="empty"><span class="display">Free!</span>Nothing planned for this day.</div>';
    return '<section class="hero">' + ICON.star +
      '<div class="topbar"><span class="eyebrow">' + MON[sel.getMonth()] + '</span><div class="weeknav">' + weekNav().replace(/^<div class="weeknav">|<\/div>$/g, '') + modePill() + '</div></div>' +
      '<h1 class="display">' + WD[sel.getDay()] + '\n' + ordinal(sel.getDate()) + '</h1>' +
      '<div class="days">' + days + '</div></section>' + reauthBanner() +
      '<div class="content' + (S.loading ? ' loading' : '') + '">' + body + '</div>';
  }

  function urgentRow(t) {
    const today = sod(new Date());
    const days = Math.round((t.due - today) / 86400000);
    // The dot grows as the deadline gets closer: tiny at 7+ weeks, huge at 0 days.
    const k = Math.max(0, Math.min(1, 1 - days / 49));
    const size = Math.round(14 + k * 46);
    const tone = days <= 3 ? 'var(--d0)' : days <= 10 ? 'var(--d1)' : days <= 24 ? 'var(--d2)' : 'var(--d3)';
    const fs = days <= 3 ? 21 : days <= 10 ? 19 : 17;
    let label;
    if (days < 0) label = 'overdue · was due ' + fmtDay(t.due);
    else if (days === 0) label = 'due today!';
    else if (days === 1) label = 'due tomorrow!';
    else if (days < 14) label = 'due ' + fmtDay(t.due) + ' · ' + days + ' days';
    else label = 'due ' + fmtDay(t.due) + ' · ' + Math.round(days / 7) + ' weeks';
    const shadow = days <= 3 ? ';box-shadow:var(--shadow)' : '';
    return '<div class="urgent' + (days < 0 ? ' overdue' : '') + '"><div class="blobwrap"><div class="blob" style="width:' + size + 'px;height:' + size + 'px;background:' + tone + shadow + '"></div></div>' +
      '<div class="info"><b style="font-size:' + fs + 'px">' + esc(t.title) + '</b><span>' + label + '</span></div>' + checkBtn('deadlines', t) + '</div>';
  }
  function checkBtn(kind, t) {
    return '<button class="check' + (t.done ? ' done' : '') + '" data-action="done" data-kind="' + kind + '" data-id="' + esc(t.id) + '" aria-label="Mark ' + esc(t.title) + ' as done">' + ICON.check + '</button>';
  }

  function viewWeek() {
    const ws = weekStart(S.sel), we = addDays(ws, 6), today = sod(new Date());
    const range = ws.getDate() + (ws.getMonth() !== we.getMonth() ? ' ' + MON[ws.getMonth()].slice(0, 3) : '') + ' – ' + we.getDate() + ' ' + MON[we.getMonth()].slice(0, 3);
    let rows = '';
    for (let i = 0; i < 7; i++) {
      const d = addDays(ws, i);
      const evs = eventsOn(d);
      const pills = evs.slice(0, 4).map((e) => '<span class="mini">' + (e.allDay ? '' : hm(e.start) + ' ') + esc(e.title) + '</span>').join('') + (evs.length > 4 ? '<span class="mini">+' + (evs.length - 4) + '</span>' : '');
      rows += '<button class="dayrow' + (sameDay(d, today) ? ' today' : '') + '" data-action="openday" data-date="' + ymd(d) + '"><span class="dn"><span class="display">' + WD3[d.getDay()] + '</span><span>' + d.getDate() + '</span></span><span class="pills">' + pills + '</span></button>';
    }
    const top = S.tasks.top3;
    const shown = top.slice(0, 3);
    const prios = shown.map((t, i) => '<div class="prio"><span class="num display">' + (i + 1) + '</span><span class="t">' + esc(t.title) + '</span>' + checkBtn('top3', t) + '</div>').join('');
    const full = top.filter((t) => !t.done).length >= 3;
    const deadlines = S.tasks.deadlines.filter((t) => t.due);
    const notes = S.tasks.notes.filter((t) => t.due && ymd(weekStart(t.due)) === ymd(ws));
    return '<section class="hero">' + ICON.star +
      '<div class="topbar"><span class="eyebrow">' + range + '</span><div class="weeknav">' + weekNav().replace(/^<div class="weeknav">|<\/div>$/g, '') + modePill() + '</div></div>' +
      '<h1 class="display small">Week ' + isoWeek(ws) + '</h1></section>' + reauthBanner() +
      '<div class="content' + (S.loading ? ' loading' : '') + '">' +
      '<div class="card daylist">' + rows + '</div>' +
      '<div class="card prio-card"><div class="card-head"><h2 class="display">Top 3</h2><span class="count">' + Math.min(top.length, 3) + ' / 3</span></div>' + prios +
      (full ? '<span class="hint">Full – tick one off before adding another</span>' : '<button class="add-line" data-action="addtask" data-kind="top3">+ Add a priority</button>') +
      (top.length > 3 ? '<span class="hint">+' + (top.length - 3) + ' more waiting in Google Tasks</span>' : '') + '</div>' +
      '<div class="card"><h2 class="display">Getting urgent</h2><span class="sub">The dot grows every week until the deadline</span>' +
      (deadlines.length ? deadlines.map(urgentRow).join('') : '<span class="hint" style="text-align:left">No deadlines. Add forms, applications, anything with a due date.</span>') +
      '<button class="add-line" data-action="addtask" data-kind="deadlines">+ Add a deadline</button></div>' +
      '<div class="card notes-card"><h2 class="display">Week notes</h2><span class="sub">No day needed – sometime this week</span>' +
      notes.map((t) => '<div class="note"><span class="t">' + esc(t.title) + '</span>' + checkBtn('notes', t) + '</div>').join('') +
      '<button class="add-line" data-action="addtask" data-kind="notes">+ Add a note</button></div>' +
      '</div>';
  }

  function viewSignIn() {
    const ready = !!tokenClient;
    return '<section class="signin"><span class="eyebrow">Dopamine Calendar</span>' +
      '<h1 class="display">Hello,<br>colorful<br>week!</h1>' +
      '<p>Your Google Calendar and Tasks, in a nicer outfit. Everything stays in Google, so it keeps syncing with everyone you share calendars with.</p>' +
      (S.authError ? '<div class="err">' + esc(S.authError) + '</div>' : '') +
      '<button class="big-btn" data-action="signin"' + (ready ? '' : ' disabled') + '>' + (ready ? 'Sign in with Google' : 'Loading Google…') + '</button>' +
      '<a class="ghost-btn" href="?demo" style="display:flex;align-items:center;justify-content:center;text-decoration:none;color:inherit">Try with sample data</a></section>';
  }

  function bottomBar() {
    return '<nav class="bottombar" aria-label="Views"><div class="navseg">' +
      '<button class="' + (S.view === 'today' ? 'on' : '') + '" data-action="view" data-view="today"' + (S.view === 'today' ? ' aria-current="page"' : '') + '>Day</button>' +
      '<button class="' + (S.view === 'week' ? 'on' : '') + '" data-action="view" data-view="week"' + (S.view === 'week' ? ' aria-current="page"' : '') + '>Week</button></div>' +
      '<button class="fab" data-action="addevent" aria-label="New event">' + ICON.plus + '</button></nav>';
  }

  // ---------- sheets ----------
  function sheetEvent() {
    const sh = S.sheet;
    const writable = S.calendars.filter((c) => c.accessRole === 'owner' || c.accessRole === 'writer');
    if (!sh.calId && writable.length) sh.calId = writable[0].id;
    return '<div class="sheet-top"><button class="icon-btn" style="background:var(--card)" data-action="close" aria-label="Close">' + ICON.close + '</button><span class="eyebrow">New event</span><span style="width:46px"></span></div>' +
      '<h2 class="display">What\'s<br>on?</h2>' +
      '<div class="field"><label for="f-what">WHAT</label><input id="f-what" data-field="title" value="' + esc(sh.title || '') + '" placeholder="Dinner with friends" autocomplete="off"></div>' +
      '<div class="field when"><label for="f-when">WHEN – JUST TYPE IT</label><input id="f-when" data-field="when" value="' + esc(sh.when || '') + '" placeholder="fri 7-10pm" autocomplete="off" inputmode="text">' +
      '<div id="parsed"></div></div>' +
      '<div class="chips">' + ['today', 'tomorrow', 'all day'].map((c) => '<button class="chip" data-action="chip" data-chip="' + c + '">' + c[0].toUpperCase() + c.slice(1) + '</button>').join('') + '</div>' +
      (writable.length > 1 ? '<span class="section-label">CALENDAR</span><div class="chips">' + writable.map((c) => '<button class="chip' + (c.id === sh.calId ? ' on' : '') + '" data-action="cal" data-cal="' + esc(c.id) + '" aria-pressed="' + (c.id === sh.calId) + '">' + esc(c.primary ? 'Mine' : (c.summaryOverride || c.summary)) + '</button>').join('') + '</div>' : '') +
      '<span class="section-label">COLOR</span><div class="colors">' + COLORS.map((c) => '<button class="swatch' + ((sh.color || '') === c.id ? ' on' : '') + '" style="background:' + (c.id ? c.hex : 'var(--card)') + '" data-action="color" data-color="' + c.id + '" aria-label="' + c.name + '" aria-pressed="' + ((sh.color || '') === c.id) + '"></button>').join('') + '</div>' +
      '<button class="save" data-action="saveevent" id="save">Save it!</button>';
  }
  function sheetTask() {
    const sh = S.sheet;
    const head = { top3: 'New<br>priority', deadlines: 'New<br>deadline', notes: 'Week<br>note' }[sh.kind];
    return '<div class="sheet-top"><button class="icon-btn" style="background:var(--card)" data-action="close" aria-label="Close">' + ICON.close + '</button><span class="eyebrow">' + (sh.kind === 'notes' ? 'Week ' + isoWeek(weekStart(S.sel)) : '') + '</span><span style="width:46px"></span></div>' +
      '<h2 class="display">' + head + '</h2>' +
      '<div class="field"><label for="f-what">WHAT</label><input id="f-what" data-field="title" value="' + esc(sh.title || '') + '" placeholder="' + (sh.kind === 'deadlines' ? 'Registration form' : sh.kind === 'top3' ? 'Finish chapter 3' : 'Buy birthday present') + '" autocomplete="off"></div>' +
      (sh.kind === 'deadlines' ? '<div class="field when"><label for="f-when">DUE – JUST TYPE IT</label><input id="f-when" data-field="when" value="' + esc(sh.when || '') + '" placeholder="in 3 weeks · 21.12 · fri" autocomplete="off"><div id="parsed"></div></div>' : '') +
      '<button class="save" data-action="savetask" id="save">Save it!</button>';
  }
  function sheetMode() {
    const opts = [
      ['auto', 'Automatic', 'Work look Mon–Thu ' + C.workStartHour + '–' + C.workEndHour + ' h, weekend look the rest of the time'],
      ['work', 'Work', 'Warm pink & apricot'],
      ['migraine', 'Migraine', 'Soft pastels, calm, no shadows'],
      ['weekend', 'Weekend', 'Sunset lilac, coral & turquoise']
    ];
    return '<div class="sheet-top"><button class="icon-btn" style="background:var(--card)" data-action="close" aria-label="Close">' + ICON.close + '</button><span class="eyebrow">Mood</span><span style="width:46px"></span></div>' +
      '<h2 class="display">How are<br>you today?</h2><div class="modes">' +
      opts.map(([k, n, d]) => '<button class="mode-opt' + (S.modePref === k ? ' on' : '') + '" data-action="setmode" data-mode="' + k + '" aria-pressed="' + (S.modePref === k) + '"><b>' + n + '</b><span>' + d + '</span></button>').join('') +
      '</div>' + (DEMO ? '<a class="danger" href="./">Leave demo</a>' : S.signedIn ? '<button class="danger" data-action="signout">Sign out</button>' : '');
  }
  function updateParsed() {
    const sh = S.sheet; if (!sh) return;
    const el = document.getElementById('parsed'), save = document.getElementById('save');
    if (sh.type === 'event') {
      const w = P.parseWhen(sh.when || '', new Date(), S.sel);
      sh.parsed = w;
      if (el) {
        if (!(sh.when || '').trim()) { el.className = 'parsed bad'; el.textContent = 'e.g. "9-10", "fri 7-10pm", "21.11 18-20"'; }
        else if (!w) { el.className = 'parsed bad'; el.textContent = 'Hmm, I didn\'t get that. Try "fri 7-10pm".'; }
        else { el.className = 'parsed'; el.innerHTML = ICON.check + '<span>' + esc(fmtDay(w.start) + (w.allDay ? ' · all day' : ' · ' + hm(w.start) + ' – ' + hm(w.end))) + '</span>'; }
      }
      if (save) save.disabled = !w || !(sh.title || '').trim() || !sh.calId;
    } else if (sh.type === 'task') {
      let ok = !!(sh.title || '').trim();
      if (sh.kind === 'deadlines') {
        const d = P.parseDue(sh.when || '', new Date());
        sh.parsed = d; ok = ok && !!d;
        if (el) {
          if (!(sh.when || '').trim()) { el.className = 'parsed bad'; el.textContent = 'e.g. "in 3 weeks", "21.12", "fri"'; }
          else if (!d) { el.className = 'parsed bad'; el.textContent = 'Hmm, try "in 3 weeks" or "21.12".'; }
          else { el.className = 'parsed'; el.innerHTML = ICON.check + '<span>' + esc('Due ' + fmtDay(d)) + '</span>'; }
        }
      }
      if (save) save.disabled = !ok;
    }
  }
  function renderSheet() {
    const root = document.getElementById('sheet-root');
    if (!S.sheet) { root.innerHTML = ''; return; }
    const html = S.sheet.type === 'event' ? sheetEvent() : S.sheet.type === 'task' ? sheetTask() : sheetMode();
    root.innerHTML = '<div class="sheet-backdrop" data-action="backdrop"><div class="sheet" role="dialog" aria-modal="true" aria-label="' + (S.sheet.type === 'mode' ? 'Mood' : 'New item') + '">' + html + '</div></div>';
    updateParsed();
  }
  function openSheet(sheet) {
    S.sheet = sheet; renderSheet();
    const first = document.querySelector('#sheet-root input');
    if (first) setTimeout(() => first.focus(), 60);
  }
  function closeSheet() { S.sheet = null; renderSheet(); }

  // ---------- render ----------
  function render() {
    applyMode();
    const app = document.getElementById('app');
    if (!DEMO && !S.signedIn) { app.innerHTML = viewSignIn(); renderSheet(); return; }
    app.innerHTML = (S.view === 'week' ? viewWeek() : viewToday()) + bottomBar();
    if (S.sheet && S.sheet.type === 'mode') renderSheet();
  }

  // ---------- events ----------
  document.addEventListener('click', async (ev) => {
    const el = ev.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
    if (a === 'backdrop') { if (ev.target === el) closeSheet(); return; }
    switch (a) {
      case 'signin': signIn(); break;
      case 'reauth': try { await requestToken(); S.needsReauth = false; await loadAll(true); } catch (e) { toast(e.message); } break;
      case 'signout': closeSheet(); signOut(); break;
      case 'view': S.view = el.dataset.view; store.set('view', S.view); render(); window.scrollTo(0, 0); break;
      case 'pick': S.sel = fromYmd(el.dataset.date); render(); break;
      case 'openday': S.sel = fromYmd(el.dataset.date); S.view = 'today'; store.set('view', 'today'); render(); window.scrollTo(0, 0); break;
      case 'prevweek': case 'nextweek':
        S.sel = addDays(S.sel, a === 'prevweek' ? -7 : 7); render();
        if (!DEMO) { S.loading = true; render(); try { await loadEvents(); } catch (e) { handleErr(e); } S.loading = false; render(); }
        break;
      case 'mode': openSheet({ type: 'mode' }); break;
      case 'setmode': S.modePref = el.dataset.mode; store.set('mode', S.modePref); closeSheet(); render(); break;
      case 'addevent': openSheet({ type: 'event', title: '', when: '', color: '' }); break;
      case 'addtask': openSheet({ type: 'task', kind: el.dataset.kind, title: '', when: '' }); break;
      case 'close': closeSheet(); break;
      case 'chip': {
        const sh = S.sheet, c = el.dataset.chip;
        let w = (sh.when || '').replace(/\b(today|tomorrow|all day)\b/g, '').replace(/\s+/g, ' ').trim();
        sh.when = (c === 'all day' ? w + ' all day' : c + ' ' + w).trim();
        const input = document.getElementById('f-when'); input.value = sh.when; input.focus(); updateParsed(); break;
      }
      case 'cal': S.sheet.calId = el.dataset.cal; renderSheet(); break;
      case 'color': S.sheet.color = el.dataset.color; renderSheet(); break;
      case 'saveevent': {
        const sh = S.sheet; updateParsed();
        if (!sh.parsed || !sh.title.trim()) return;
        el.disabled = true; el.textContent = 'Saving…';
        try {
          await createEvent(sh.calId, sh.title.trim(), sh.parsed, sh.color);
          const d = sod(sh.parsed.start); closeSheet();
          S.sel = d; S.view = 'today'; store.set('view', 'today');
          if (!DEMO && S.loadedWeek !== ymd(weekStart(d))) await loadEvents();
          render(); toast('Saved to Google Calendar');
        } catch (e) { el.disabled = false; el.textContent = 'Save it!'; handleErr(e); }
        break;
      }
      case 'savetask': {
        const sh = S.sheet; updateParsed();
        if (!sh.title.trim() || (sh.kind === 'deadlines' && !sh.parsed)) return;
        const due = sh.kind === 'deadlines' ? sh.parsed : sh.kind === 'notes' ? weekStart(S.sel) : null;
        const kind = sh.kind, title = sh.title.trim();
        closeSheet();
        try { await createTask(kind, title, due); toast('Saved to Google Tasks'); } catch (e) { S.tasks[kind] = S.tasks[kind].filter((t) => !String(t.id).startsWith('tmp')); render(); handleErr(e); }
        break;
      }
      case 'done': completeTask(el.dataset.kind, el.dataset.id); break;
    }
  });
  document.addEventListener('input', (ev) => {
    const f = ev.target.dataset && ev.target.dataset.field;
    if (f && S.sheet) { S.sheet[f] = ev.target.value; updateParsed(); }
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && S.sheet) closeSheet();
    if (ev.key === 'Enter' && S.sheet && ev.target.tagName === 'INPUT') {
      const save = document.getElementById('save'); if (save && !save.disabled) save.click();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      applyMode();
      if (!DEMO && S.signedIn && !S.needsReauth && Date.now() - (S.lastLoad || 0) > 60000) loadAll(true);
    }
  });
  setInterval(() => { const before = document.body.dataset.mode; applyMode(); if (before !== document.body.dataset.mode) render(); }, 60000);

  // ---------- demo data ----------
  function demo() {
    const ws = weekStart(new Date());
    const at = (day, h, m, dur) => { const s = addDays(ws, day); s.setHours(h, m || 0, 0, 0); return { start: { dateTime: s.toISOString() }, end: { dateTime: new Date(s.getTime() + dur * 60000).toISOString() } }; };
    S.calendars = [{ id: 'me', summary: 'Me', primary: true, accessRole: 'owner' }, { id: 'shared', summary: 'Shared', accessRole: 'writer' }];
    const raw = [
      ['me', 'Team standup', 0, 9, 0, 60, 'Video call'], ['shared', 'Lunch', 0, 12, 30, 60], ['me', 'Pilates', 0, 18, 0, 60, 'Studio'],
      ['me', 'Product review', 1, 14, 0, 90, 'Room 3'], ['shared', 'Dinner with friends', 4, 19, 0, 180],
      ['me', 'Pilates', 3, 18, 0, 60, 'Studio'], ['shared', 'Flea market', 5, 14, 0, 120], ['me', 'Cinema', 5, 19, 30, 150, 'Ticket added from Gmail']
    ];
    S.events = raw.map(([cal, title, d, h, m, dur, loc], i) => normEvent(Object.assign({ id: 'e' + i, summary: title, location: loc }, at(d, h, m, dur)), S.calendars.find((c) => c.id === cal)));
    S.events.push(normEvent({ id: 'ad', summary: 'Mum\'s birthday', start: { date: ymd(addDays(ws, 2)) }, end: { date: ymd(addDays(ws, 3)) } }, S.calendars[0]));
    S.events.sort((a, b) => a.start - b.start);
    const t = sod(new Date());
    S.tasks = {
      top3: [{ id: 'p1', title: 'Finish thesis chapter 3' }, { id: 'p2', title: 'Prepare product review' }, { id: 'p3', title: 'Call the landlord' }],
      deadlines: [{ id: 'u1', title: 'Insurance claim', due: addDays(t, 2) }, { id: 'u2', title: 'Registration form 2', due: addDays(t, 11) }, { id: 'u3', title: 'Tax form', due: addDays(t, 21) }, { id: 'u4', title: 'Registration form 1', due: addDays(t, 49) }],
      notes: [{ id: 'n1', title: 'Buy birthday present', due: ws }, { id: 'n2', title: 'Book dentist appointment', due: ws }]
    };
    S.tasksLoaded = true;
  }

  // ---------- start ----------
  window.DC = { gisLoaded };
  if (DEMO) { demo(); }
  else {
    const saved = store.get('token', null);
    if (saved && saved.e > Date.now()) { S.token = saved.t; S.tokenExp = saved.e; S.signedIn = true; loadAll(true); }
    else if (store.get('known', false)) { S.signedIn = true; S.needsReauth = true; }
  }
  render();
  if (window.google && google.accounts) gisLoaded();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
