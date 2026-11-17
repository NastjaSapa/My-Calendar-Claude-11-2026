/* Dopamine Calendar — a colorful face for Google Calendar + Google Tasks.
   Everything lives in Google: events in Calendar, Top 3 / deadlines / week notes in Tasks,
   and (only if you turn it on) the migraine log in a private "My tracking" calendar.
   Add ?demo to the address to try it with sample data and no sign-in.
   Add ?migraine to open straight into migraine mode (used by the app-icon shortcut). */
(function () {
  'use strict';
  const C = window.DC_CONFIG;
  const P = window.DCParse;
  const PARAMS = new URLSearchParams(location.search);
  const DEMO = PARAMS.has('demo');
  const CAL = 'https://www.googleapis.com/calendar/v3';
  const TASKS = 'https://tasks.googleapis.com/tasks/v1';

  // ---------- small helpers ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem('dc.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('dc.' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
    del(k) { try { localStorage.removeItem('dc.' + k); } catch (e) { /* ignore */ } }
  };
  // Health things never touch real storage in the demo
  const mem = {};
  const hstore = DEMO ? {
    get(k, d) { return k in mem ? mem[k] : d; }, set(k, v) { mem[k] = v; }, del(k) { delete mem[k]; }
  } : store;
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
  const fmtDur = (ms) => { const m = Math.max(0, Math.round(ms / 60000)); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + (m % 60) + ' min' : ''); };
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const dueStr = (d) => ymd(d) + 'T00:00:00.000Z'; // Google Tasks keeps only the date
  const monthStart = (d) => new Date(d.getFullYear(), d.getMonth(), 1);

  const sv = (body, w) => '<svg width="' + (w || 22) + '" height="' + (w || 22) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
  const ICON = {
    plus: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    left: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    right: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
    close: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    check: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>',
    work: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></svg>',
    migraine: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>',
    weekend: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M3 17h18M6.5 17a5.5 5.5 0 0 1 11 0M12 5v3M4.5 9.5l2 2M19.5 9.5l-2 2M5 21h14"/></svg>',
    star: '<svg class="star" viewBox="0 0 70 70" aria-hidden="true"><path d="M35 4 L40 30 L66 35 L40 40 L35 66 L30 40 L4 35 L30 30 Z"/></svg>',
    wave: (w) => sv('<path d="M3 9c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M3 15c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/>', w),
    aura: (w) => sv('<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><path d="M8 12l2-2 2 2 2-2 2 2"/>', w),
    bolt: (w) => sv('<circle cx="12" cy="12" r="9"/><path d="M13 7l-3 5h4l-3 5"/>', w),
    leaf: (w) => sv('<path d="M5 19c0-9 5-14 14-14 0 9-5 14-14 14z"/><path d="M5 19l7-7"/>', w),
    pill: (w) => sv('<path d="M10.5 3.5a5 5 0 0 1 7 7l-7 7a5 5 0 0 1-7-7z"/><path d="M7 7l7 7"/>', w),
    eye: (w) => sv('<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', w),
    hand: (w) => sv('<path d="M8 13V5a1.5 1.5 0 0 1 3 0v6"/><path d="M11 11V4a1.5 1.5 0 0 1 3 0v7"/><path d="M14 11V5.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-1a6 6 0 0 1-5-3l-2.5-4a1.5 1.5 0 0 1 2.5-1.6L8 15"/>', w),
    speech: (w) => sv('<path d="M4 5h16v11H9l-5 4z"/>', w),
    send: (w) => sv('<path d="M4 12l16-8-6 16-3-7z"/>', w),
    shield: (w) => sv('<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/>', w)
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
  // Symptom tiles. Several can be on at the same time. The info text explains each one
  // in plain words – it describes, it never diagnoses.
  const PHASES = [
    ['warning', 'Warning signs', 'wave', 'blue', 'Early signs, hours up to a day before: tiredness, yawning, stiff neck, cravings, or being sensitive to light and sound.'],
    ['aura', 'Aura', 'aura', 'lav', 'Usually 5 to 60 minutes, often before the headache: flickering or zigzag lines, blind spots, tingling, or trouble finding words.'],
    ['headache', 'Headache', 'bolt', 'rose', 'The pain phase, often with nausea and sensitivity to light, sound or smells.'],
    ['recovering', 'Recovering', 'leaf', 'sage', 'The “migraine hangover” after the pain: tired, foggy, slower thinking. Can last up to a day.']
  ];
  const AURA_TYPES = [
    ['seeing', 'Seeing', 'eye', 'Flickering, zigzag lines, blind spots or blurry vision.'],
    ['feeling', 'Feeling', 'hand', 'Tingling or numbness, often in the hand, arm or face.'],
    ['speaking', 'Words', 'speech', 'Trouble finding or saying words, or understanding others.']
  ];

  // ---------- state ----------
  if (store.get('mode', 'auto') === 'migraine') store.set('mode', 'auto'); // migraine is now started, not picked
  const S = {
    view: store.get('view', 'today'),
    sel: sod(new Date()),
    modePref: store.get('mode', 'auto'),
    look: store.get('look', 'dark'), // migraine look: 'dark' or 'pastel'
    token: null, tokenExp: 0, healthGranted: false,
    signedIn: false, needsReauth: false, authError: '',
    allCalendars: [], calendars: [], events: [], loadedWeek: null, loading: false,
    month: { key: null, events: [] },
    lists: {}, tasks: { top3: [], deadlines: [], notes: [] }, tasksLoaded: false,
    attack: hstore.get('attack', null),   // the migraine happening right now
    queue: hstore.get('healthQueue', []), // ended attacks not saved to Google yet
    health: { consent: hstore.get('healthConsent', null), calId: hstore.get('healthCalId', null), events: [] },
    medNames: hstore.get('medNames', []),
    primaryEmail: '',
    screen: null, consentTick: false,
    sheet: null
  };
  // Remember the consent screen while the privacy page is open, so "Back" lands on it again
  function setScreen(s) { S.screen = s; try { if (s) sessionStorage.setItem('dc.screen', s); else sessionStorage.removeItem('dc.screen'); } catch (e) { /* ignore */ } }
  try { if (sessionStorage.getItem('dc.screen') === 'consent') S.screen = 'consent'; } catch (e) { /* ignore */ }
  const healthOn = () => !!S.health.consent;
  const migraineActive = () => !!(S.attack && S.attack.active);

  function mode() {
    if (migraineActive()) return 'migraine';
    if (S.modePref !== 'auto') return S.modePref;
    const n = new Date();
    return C.workDays.includes(n.getDay()) && n.getHours() >= C.workStartHour && n.getHours() < C.workEndHour ? 'work' : 'weekend';
  }
  function applyMode() {
    const m = mode();
    document.body.dataset.mode = m;
    document.body.dataset.look = S.look;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = { work: '#FF8FA4', migraine: S.look === 'pastel' ? '#C4C2E6' : '#16151F', weekend: '#A790EA' }[m];
  }

  function toast(msg, actionLabel, fn) {
    const t = document.getElementById('toast');
    t.innerHTML = '<span>' + esc(msg) + '</span>' + (actionLabel ? '<button type="button" id="toast-act">' + esc(actionLabel) + '</button>' : '');
    if (actionLabel) document.getElementById('toast-act').onclick = () => { t.classList.remove('show'); fn(); };
    t.classList.toggle('has-action', !!actionLabel);
    t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), actionLabel ? 6000 : 2600);
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
        const health = google.accounts.oauth2.hasGrantedAllScopes(resp, C.healthScope);
        if (p && p.health && !health) { p.rej(new Error('Please allow the private "My tracking" calendar, so your log can be saved.')); return; }
        S.token = resp.access_token;
        S.tokenExp = Date.now() + (Number(resp.expires_in || 3600) - 60) * 1000;
        S.healthGranted = health;
        store.set('token', { t: S.token, e: S.tokenExp, h: health });
        store.set('known', true);
        p && p.res();
      },
      error_callback: (err) => { const p = pending; pending = null; p && p.rej(new Error(err && err.type === 'popup_closed' ? 'The sign-in window was closed.' : 'Sign-in did not work. Try again.')); }
    });
    render();
  }
  function requestToken(health) {
    return new Promise((res, rej) => {
      if (!tokenClient) { rej(new Error('Google sign-in is still loading, try again in a second.')); return; }
      pending = { res, rej, health: !!health };
      tokenClient.requestAccessToken({
        prompt: store.get('known', false) && !health ? '' : 'consent',
        scope: health ? C.scopes + ' ' + C.healthScope : C.scopes,
        include_granted_scopes: true
      });
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
    Object.assign(S, { token: null, tokenExp: 0, healthGranted: false, signedIn: false, allCalendars: [], calendars: [], events: [], loadedWeek: null, month: { key: null, events: [] }, lists: {}, tasks: { top3: [], deadlines: [], notes: [] }, tasksLoaded: false, sheet: null });
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
    if (!r.ok) { const t = await r.text(); const err = new Error('Google answered ' + r.status + ': ' + t.slice(0, 160)); err.status = r.status; throw err; }
    return r.status === 204 ? null : r.json();
  }
  function handleErr(e) {
    if (e instanceof NeedAuth) { S.needsReauth = true; render(); return; }
    console.error(e); toast(e.message || 'Something went wrong');
  }

  // ---------- loading data ----------
  const isHealthCal = (c) => c.id === S.health.calId || c.summary === C.healthCalendarName;
  async function loadCalendars() {
    const out = []; let pageToken = '';
    do {
      const r = await api(CAL + '/users/me/calendarList?maxResults=250' + (pageToken ? '&pageToken=' + pageToken : ''));
      out.push(...(r.items || [])); pageToken = r.nextPageToken || '';
    } while (pageToken);
    S.allCalendars = out;
    // The private Health calendar is never shown as normal events
    const hc = out.find((c) => c.summary === C.healthCalendarName && c.accessRole === 'owner');
    if (hc && !S.health.calId) { S.health.calId = hc.id; hstore.set('healthCalId', hc.id); }
    if (hc && !S.health.consent && (hc.description || '').indexOf('Consent given') >= 0) {
      S.health.consent = { at: 'earlier', v: 1 }; hstore.set('healthConsent', S.health.consent);
    }
    S.calendars = out.filter((c) => c.selected && !c.hidden && !c.deleted && !isHealthCal(c))
      .sort((a, b) => (b.primary ? 1 : 0) - (a.primary ? 1 : 0));
    const prim = out.find((c) => c.primary);
    S.primaryEmail = prim && prim.id.indexOf('@') > 0 ? prim.id : '';
  }
  function normEvent(e, cal) {
    const allDay = !!(e.start && e.start.date);
    const start = allDay ? fromYmd(e.start.date) : new Date(e.start.dateTime);
    const end = allDay ? fromYmd(e.end.date) : new Date(e.end.dateTime);
    return { id: e.id, calId: cal.id, calName: cal.summaryOverride || cal.summary, primary: !!cal.primary, writable: cal.accessRole === 'owner' || cal.accessRole === 'writer', title: e.summary || '(no title)', location: e.location || '', allDay, start, end };
  }
  async function loadRange(from, to) {
    const all = await Promise.all(S.calendars.map(async (cal) => {
      try {
        const q = '?singleEvents=true&orderBy=startTime&maxResults=250&timeMin=' + encodeURIComponent(from.toISOString()) + '&timeMax=' + encodeURIComponent(to.toISOString());
        const r = await api(CAL + '/calendars/' + encodeURIComponent(cal.id) + '/events' + q);
        return (r.items || []).filter((e) => e.status !== 'cancelled' && e.start).map((e) => normEvent(e, cal));
      } catch (e) { if (e instanceof NeedAuth) throw e; return []; }
    }));
    return all.flat().sort((a, b) => a.start - b.start);
  }
  async function loadEvents(force) {
    const ws = weekStart(S.sel);
    if (!force && S.loadedWeek === ymd(ws)) return;
    S.events = await loadRange(ws, addDays(ws, 7));
    S.loadedWeek = ymd(ws);
  }
  async function loadMonth(force) {
    const gs = weekStart(monthStart(S.sel)), ge = addDays(gs, 42);
    const key = ymd(gs);
    if (DEMO) return;
    if (force || S.month.key !== key) { S.month.events = await loadRange(gs, ge); S.month.key = key; }
    try { await loadHealthRange(gs, ge); } catch (e) { if (e instanceof NeedAuth) throw e; console.warn(e); }
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
      await Promise.all([loadEvents(force), (force || !S.tasksLoaded) ? loadTasks() : null, S.view === 'month' ? loadMonth(force) : null]);
      S.lastLoad = Date.now();
      syncPending();
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
    S.loadedWeek = null; S.month.key = null; await loadEvents(true);
  }
  async function shiftEvent(e, days) {
    const s = addDays(e.start, days), en = addDays(e.end, days);
    if (!DEMO) {
      await api(CAL + '/calendars/' + encodeURIComponent(e.calId) + '/events/' + encodeURIComponent(e.id), {
        method: 'PATCH', body: { start: { dateTime: s.toISOString(), timeZone: tz }, end: { dateTime: en.toISOString(), timeZone: tz } }
      });
    }
    e.start = s; e.end = en; S.month.key = null;
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

  // ---------- migraine log (private Health calendar) ----------
  // Symptoms and medication go into hidden fields of the event (extendedProperties),
  // never into the title. Each value is kept short (Google allows 1024 characters).
  const PH_CODE = { warning: 'w', aura: 'a', headache: 'h', recovering: 'r' };
  const PH_NAME = { w: 'warning', a: 'aura', h: 'headache', r: 'recovering' };
  const enc36 = (t) => Math.round(t / 60000).toString(36);
  const dec36 = (s) => parseInt(s, 36) * 60000;
  const encPhases = (list) => list.slice(-60).map((x) => (x.off ? PH_CODE[x.p].toUpperCase() : PH_CODE[x.p]) + enc36(x.t)).join(',').slice(0, 1000);
  const decPhases = (s) => (s || '').split(',').filter(Boolean).map((x) => { const c = x[0]; const o = { p: PH_NAME[c.toLowerCase()], t: dec36(x.slice(1)) }; if (c !== c.toLowerCase()) o.off = true; return o; }).filter((x) => x.p);
  // Which symptoms are on right now (several at once are fine)
  function activePhases(a) {
    const on = {};
    for (const x of a.phases) { if (x.off) delete on[x.p]; else if (!on[x.p]) on[x.p] = x.t; }
    return on;
  }
  const hadPhase = (a, p) => a.phases.some((x) => x.p === p && !x.off);
  const encMeds = (list) => { let out = list.slice(-20).map((m) => m.n.replace(/[|@]/g, ' ').slice(0, 30) + '@' + enc36(m.t)).join('|'); while (out.length > 1000) out = out.slice(out.indexOf('|') + 1); return out; };
  const decMeds = (s) => (s || '').split('|').filter(Boolean).map((x) => { const i = x.lastIndexOf('@'); return { n: x.slice(0, i), t: dec36(x.slice(i + 1)) }; });

  function attackBody(a) {
    const start = new Date(a.start);
    let end = new Date(a.end || Date.now());
    if (end - start < 60000) end = new Date(a.start + 60000);
    return {
      summary: 'Migraine', transparency: 'transparent', visibility: 'private',
      start: { dateTime: start.toISOString(), timeZone: tz }, end: { dateTime: end.toISOString(), timeZone: tz },
      extendedProperties: { private: { dc: 'attack', v: '1', ongoing: a.active ? '1' : '0', phases: encPhases(a.phases), aura: (a.aura || []).join(','), meds: encMeds(a.meds) } }
    };
  }
  function decodeAttack(e) {
    const x = (e.extendedProperties && e.extendedProperties.private) || {};
    return {
      eventId: e.id, start: Date.parse(e.start.dateTime || e.start.date), end: Date.parse(e.end.dateTime || e.end.date),
      active: x.ongoing === '1', phases: decPhases(x.phases), aura: (x.aura || '').split(',').filter(Boolean), meds: decMeds(x.meds), synced: true
    };
  }
  async function ensureHealthCal() {
    if (S.health.calId) return S.health.calId;
    const found = S.allCalendars.find((c) => c.summary === C.healthCalendarName && c.accessRole === 'owner');
    if (found) { S.health.calId = found.id; hstore.set('healthCalId', found.id); return found.id; }
    const at = S.health.consent && S.health.consent.at !== 'earlier' ? S.health.consent.at.slice(0, 10) : ymd(new Date());
    const cal = await api(CAL + '/calendars', { method: 'POST', body: { summary: C.healthCalendarName, description: 'Private migraine log from Dopamine Calendar. Consent given ' + at + '.', timeZone: tz } });
    S.health.calId = cal.id; hstore.set('healthCalId', cal.id);
    return cal.id;
  }
  // Saves one attack to Google. Never opens a sign-in window: during an attack nobody
  // should have to deal with pop-ups. If it can't save now, it tries again later.
  async function syncAttack(a) {
    if (!a || !healthOn()) return false;
    if (DEMO) {
      if (!a.eventId) a.eventId = 'demo' + a.start;
      S.health.events = S.health.events.filter((x) => x.eventId !== a.eventId).concat([Object.assign({}, a, { synced: true })]);
      a.synced = true; persistHealth(); return true;
    }
    if (!S.token || Date.now() > S.tokenExp || !S.healthGranted) { a.synced = false; persistHealth(); return false; }
    try {
      const calId = await ensureHealthCal();
      const body = attackBody(a);
      let r = null;
      if (a.eventId) {
        try { r = await api(CAL + '/calendars/' + encodeURIComponent(calId) + '/events/' + encodeURIComponent(a.eventId), { method: 'PATCH', body }); }
        catch (e) { if (e.status !== 404 && e.status !== 410) throw e; }
      }
      if (!r) r = await api(CAL + '/calendars/' + encodeURIComponent(calId) + '/events', { method: 'POST', body });
      a.eventId = r.id; a.synced = true;
      S.health.events = S.health.events.filter((x) => x.eventId !== a.eventId).concat([Object.assign({}, a)]);
    } catch (e) {
      if (e.status === 404) { S.health.calId = null; hstore.del('healthCalId'); }
      a.synced = false; console.warn('Migraine log not saved yet', e);
    }
    persistHealth();
    return a.synced;
  }
  async function syncPending() {
    if (!healthOn()) return;
    if (migraineActive() && !S.attack.synced) await syncAttack(S.attack);
    const left = [];
    for (const a of S.queue) if (!(await syncAttack(a))) left.push(a);
    S.queue = left; persistHealth();
  }
  async function loadHealthRange(from, to) {
    if (DEMO || !healthOn() || !S.health.calId || !S.healthGranted) return;
    const q = '?singleEvents=true&maxResults=250&privateExtendedProperty=' + encodeURIComponent('dc=attack') +
      '&timeMin=' + encodeURIComponent(from.toISOString()) + '&timeMax=' + encodeURIComponent(to.toISOString());
    try {
      const r = await api(CAL + '/calendars/' + encodeURIComponent(S.health.calId) + '/events' + q);
      S.health.events = (r.items || []).filter((e) => e.status !== 'cancelled' && e.start).map(decodeAttack);
    } catch (e) {
      if (e.status === 404) { S.health.calId = null; hstore.del('healthCalId'); return; }
      throw e;
    }
  }
  function persistHealth() {
    hstore.set('attack', S.attack);
    hstore.set('healthQueue', S.queue);
  }
  function allAttacks() {
    const list = S.health.events.slice();
    const add = (a) => { if (a && !list.some((x) => a.eventId && x.eventId === a.eventId)) list.push(a); };
    S.queue.forEach(add);
    if (S.attack) {
      const i = list.findIndex((x) => S.attack.eventId && x.eventId === S.attack.eventId);
      if (i >= 0) list[i] = S.attack; else list.push(S.attack);
    }
    return list;
  }

  function startMigraine(src) {
    if (migraineActive()) return;
    S.attack = { active: true, start: Date.now(), end: null, phases: [], aura: [], auraStart: null, meds: [], eventId: null, synced: false, src: src || '' };
    persistHealth();
    S.sheet = null; setScreen(null); S.view = 'now'; S.sel = sod(new Date());
    render(); window.scrollTo(0, 0);
    toast('Migraine mode on', 'Undo', undoMigraine);
    syncAttack(S.attack).then(render);
  }
  async function undoMigraine() {
    const a = S.attack; if (!a) return;
    S.attack = null; persistHealth();
    if (S.view === 'now') { S.view = 'today'; S.sel = sod(new Date()); }
    render();
    if (a.eventId) {
      S.health.events = S.health.events.filter((x) => x.eventId !== a.eventId);
      if (!DEMO && S.health.calId) { try { await api(CAL + '/calendars/' + encodeURIComponent(S.health.calId) + '/events/' + encodeURIComponent(a.eventId), { method: 'DELETE' }); } catch (e) { console.warn(e); } }
    }
  }
  async function endMigraine() {
    const a = S.attack; if (!a) return;
    a.active = false; a.end = Date.now();
    S.attack = null; persistHealth();
    if (S.view === 'now') { S.view = 'today'; S.sel = sod(new Date()); }
    S.sheet = null; render();
    if (!healthOn()) { toast('Feel better! Migraine mode is off.'); return; }
    const ok = await syncAttack(a);
    if (!ok) { S.queue.push(a); persistHealth(); }
    toast(ok ? 'Logged · ' + fmtDur(a.end - a.start) + '. Feel better!' : 'Feel better! The log saves when you reconnect.');
    render();
  }
  function changeAttack(fn) {
    const a = S.attack; if (!a) return;
    fn(a); a.synced = false; persistHealth();
    clearTimeout(changeAttack._t); changeAttack._t = setTimeout(() => syncAttack(a).then(() => { if (!S.sheet || S.sheet.type !== 'meds') render(); }), 1200);
  }
  function togglePhase(p) {
    changeAttack((a) => {
      if (activePhases(a)[p]) a.phases.push({ p, t: Date.now(), off: true });
      else { a.phases.push({ p, t: Date.now() }); if (p === 'aura' && !a.auraStart) a.auraStart = Date.now(); }
    });
  }
  function toggleAura(type) {
    changeAttack((a) => { a.aura = a.aura.includes(type) ? a.aura.filter((x) => x !== type) : a.aura.concat([type]); if (!a.auraStart) a.auraStart = Date.now(); });
  }
  function logMed(name) {
    name = name.trim(); if (!name) return;
    const t = Date.now();
    changeAttack((a) => a.meds.push({ n: name, t }));
    S.medNames = [name].concat(S.medNames.filter((x) => x.toLowerCase() !== name.toLowerCase())).slice(0, 6);
    hstore.set('medNames', S.medNames);
    toast(name + ' · ' + hm(new Date(t)));
  }
  async function tellMyPerson() {
    const text = C.shareText;
    if (navigator.share) { try { await navigator.share({ text }); } catch (e) { /* closed */ } }
    else location.href = 'sms:?&body=' + encodeURIComponent(text);
  }
  async function turnOnHealth() {
    if (DEMO) {
      S.health.consent = { at: new Date().toISOString(), v: 1 }; hstore.set('healthConsent', S.health.consent);
      setScreen(null); render(); toast('Migraine log is on'); return;
    }
    try {
      await requestToken(true);
      S.health.consent = { at: new Date().toISOString(), v: 1 }; hstore.set('healthConsent', S.health.consent);
      await loadCalendars();
      await ensureHealthCal();
      setScreen(null); S.month.key = null; render();
      toast('Migraine log is on');
    } catch (e) { handleErr(e); }
  }
  function turnOffHealth() {
    S.health.consent = null; hstore.del('healthConsent');
    closeSheet(); render();
    toast('Migraine log is off. Past entries stay in your Health calendar.');
  }
  async function deleteAllHealth() {
    try {
      if (!DEMO && S.health.calId) {
        if (!S.healthGranted) await requestToken(true);
        try { await api(CAL + '/calendars/' + encodeURIComponent(S.health.calId), { method: 'DELETE' }); }
        catch (e) { if (e.status !== 404 && e.status !== 410) throw e; }
      }
      S.health = { consent: null, calId: null, events: [] };
      S.queue = []; if (S.attack) { S.attack.eventId = null; S.attack.synced = false; }
      hstore.del('healthConsent'); hstore.del('healthCalId'); hstore.del('medNames'); S.medNames = [];
      persistHealth(); closeSheet(); render();
      toast('All health data deleted');
    } catch (e) { handleErr(e); }
  }

  // ---------- views ----------
  function modePill() {
    const m = mode();
    return '<button class="pill" data-action="mode" aria-label="Mode: ' + MODE_NAME[m] + (S.modePref === 'auto' && m !== 'migraine' ? ' (automatic)' : '') + '. Settings">' + ICON[m] + '<span>' + MODE_NAME[m] + '</span></button>';
  }
  function navBtns(prev, next, what) {
    return '<button class="icon-btn" data-action="' + prev + '" aria-label="Previous ' + what + '">' + ICON.left + '</button>' +
      '<button class="icon-btn" data-action="' + next + '" aria-label="Next ' + what + '">' + ICON.right + '</button>';
  }
  function reauthBanner() {
    if (!S.needsReauth) return '';
    return '<div class="content" style="padding-bottom:0"><button class="big-btn" data-action="reauth">Tap to reconnect Google</button></div>';
  }
  function eventsIn(list, day) {
    const a = sod(day), b = addDays(a, 1);
    return list.filter((e) => e.start < b && e.end > a);
  }
  const eventsOn = (day) => eventsIn(S.events, day);
  function eventMeta(e) {
    if (e.location) return e.location;
    return e.primary ? '' : e.calName;
  }
  function holdHint() {
    const n = store.get('holdHints', 0);
    if (n >= 3 || migraineActive()) return '';
    if (!S.hintCounted) { S.hintCounted = true; store.set('holdHints', n + 1); }
    return '<p class="hold-hint">' + ICON.migraine + '<span>Tip: hold the date to start migraine mode</span></p>';
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
    if (!healthOn() && !migraineActive() && !store.get('logOffered', false)) {
      body = '<div class="card offer-card"><span class="offer-k">' + ICON.shield(18) + 'NEW · OPTIONAL</span><h2 class="display">Private migraine log</h2>' +
        '<span class="sub" style="margin-top:0">Log attacks with one tap and see your migraine days in the month view. Saved only in your own Google account.</span>' +
        '<div class="offer-btns"><button class="add-line" data-action="consent">Learn more</button><button class="add-line offer-later" data-action="dismisslog">Not now</button></div>' +
        '<a class="offer-privacy" href="privacy.html">Privacy info</a></div>' + body;
    }
    const title = WD[sel.getDay()] + '\n' + ordinal(sel.getDate());
    return '<section class="hero">' + ICON.star +
      '<div class="topbar"><span class="eyebrow">' + MON[sel.getMonth()] + '</span><div class="weeknav">' + navBtns('prevweek', 'nextweek', 'week') + modePill() + '</div></div>' +
      '<h1 class="display holdable" data-hold="1" aria-describedby="hold-help">' + title + '</h1>' +
      '<span id="hold-help" class="sr">Press and hold to start migraine mode</span>' +
      '<div class="days">' + days + '</div>' + holdHint() + '</section>' + reauthBanner() +
      '<div class="content' + (S.loading ? ' loading' : '') + '">' + body + '</div>';
  }

  // "Just one thing" – the day view during a migraine
  function viewMigraineDay() {
    const a = S.attack, now = new Date(), start = new Date(a.start);
    let note = '';
    if (!healthOn()) note = ' · not logged';
    else if (!a.synced && (S.needsReauth || !S.healthGranted)) note = ' · saves when you reconnect';
    const top = S.tasks.top3.find((t) => !t.done);
    const on = activePhases(a);
    const nowList = PHASES.filter((x) => on[x[0]]).map((x) => x[1] + ' since ' + hm(new Date(on[x[0]])));
    const rest = eventsOn(now).filter((e) => e.end > now && !e.moved);
    const rows = rest.map((e) => {
      const canMove = !e.allDay && e.writable && e.start > now;
      return '<div class="mig-row"><div class="mig-row-t"><b>' + (e.allDay ? '' : hm(e.start) + ' ') + esc(e.title) + '</b>' +
        (canMove ? '<span>Move to tomorrow, same time?</span>' : eventMeta(e) ? '<span>' + esc(eventMeta(e)) + '</span>' : '') + '</div>' +
        (canMove ? '<button class="mig-small" data-action="movetomorrow" data-id="' + esc(e.id) + '">Move</button>' : '') + '</div>';
    }).join('');
    return '<section class="mig">' +
      '<div class="mig-top"><button class="pill mig-pill" data-action="mode" aria-label="Mode: Migraine. Change mode">' + ICON.migraine + '<span>Migraine</span></button>' +
      '<button class="mig-end" data-action="endmig">End migraine</button></div>' +
      '<span class="mig-status">Started ' + hm(start) + ' · ' + fmtDur(now - start) + note + '</span>' +
      '<h1 class="display mig-title">Just one thing.</h1>' +
      (top ? '<div class="mig-one">' + checkBtn('top3', top) + '<div class="mig-one-t"><span class="mig-k">TODAY\'S #1</span><b>' + esc(top.title) + '</b></div></div>'
        : '<div class="mig-one"><div class="mig-one-t"><span class="mig-k">TODAY\'S #1</span><b>Rest. That\'s the plan.</b></div></div>') +
      '<div class="mig-actions">' +
      '<button class="mig-btn blue" data-action="phase">' + ICON.wave(24) + '<span>How is it now?</span></button>' +
      '<button class="mig-btn rose" data-action="meds">' + ICON.pill(24) + '<span>Took meds</span></button></div>' +
      (nowList.length ? '<span class="mig-now">Now: ' + nowList.join(' · ') + '</span>' : '') +
      '<span class="mig-section">THE REST CAN WAIT</span>' +
      (rows || '<div class="mig-row"><div class="mig-row-t"><span>Nothing else today.</span></div></div>') +
      '<button class="mig-whole" data-action="view" data-view="today">Show my whole day ' + ICON.right + '</button>' +
      (healthOn() || S.loading ? '' : '<p class="mig-foot">Not logging. You can turn on the private migraine log in Settings once you feel better.</p>') +
      '</section>';
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
      '<div class="topbar"><span class="eyebrow">' + range + '</span><div class="weeknav">' + navBtns('prevweek', 'nextweek', 'week') + modePill() + '</div></div>' +
      '<h1 class="display small holdable" data-hold="1">Week ' + isoWeek(ws) + '</h1></section>' + reauthBanner() +
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

  // Month view: works in every mode. Migraine days come from the private log.
  function healthDays() {
    const map = {};
    const at = (k) => map[k] || (map[k] = {});
    for (const a of allAttacks()) {
      const s = new Date(a.start), e = new Date(a.end || Date.now());
      for (let d = sod(s); d <= e; d = addDays(d, 1)) {
        const k = ymd(d);
        const ph = a.phases.filter((x) => !x.off && ymd(new Date(x.t)) === k).map((x) => x.p);
        if (ph.length && ph.every((p) => p === 'recovering')) at(k).rec = true; else at(k).mig = true;
      }
      if (a.aura.length || hadPhase(a, 'aura')) at(ymd(s)).aura = true;
      for (const m of a.meds) at(ymd(new Date(m.t))).med = true;
    }
    return map;
  }
  function viewMonth() {
    const first = monthStart(S.sel), gs = weekStart(first), today = sod(new Date());
    const dim = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const cells = Math.ceil(((first.getDay() + 6) % 7 + dim) / 7) * 7;
    const evs = DEMO ? S.events : S.month.events;
    const hd = healthOn() ? healthDays() : {};
    let grid = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((l) => '<span class="mhead" aria-hidden="true">' + l + '</span>').join('');
    let migDays = 0, auraAttacks = 0, medDays = 0;
    for (let i = 0; i < cells; i++) {
      const d = addDays(gs, i), k = ymd(d), h = hd[k] || {};
      const inMonth = d.getMonth() === first.getMonth();
      const n = eventsIn(evs, d).length;
      if (inMonth && h.mig) migDays++;
      if (inMonth && h.med) medDays++;
      const cls = 'mcell' + (inMonth ? '' : ' out') + (sameDay(d, today) ? ' today' : '') + (h.mig ? ' is-mig' : h.rec ? ' is-rec' : '');
      const label = WD[d.getDay()] + ' ' + d.getDate() + ' ' + MON[d.getMonth()] + (n ? ', ' + n + ' event' + (n > 1 ? 's' : '') : '') + (h.mig ? ', migraine' : h.rec ? ', recovery' : '') + (h.aura ? ', aura' : '');
      grid += '<button class="' + cls + '" data-action="openday" data-date="' + k + '" aria-label="' + label + '"><span class="mnum">' + d.getDate() + '</span><span class="mdots">' +
        (h.aura ? '<i class="adot"></i>' : '') + '<i class="edot n' + Math.min(n, 3) + '"></i></span></button>';
    }
    if (healthOn()) for (const a of allAttacks()) { const s = new Date(a.start); if (s.getMonth() === first.getMonth() && s.getFullYear() === first.getFullYear() && (a.aura.length || hadPhase(a, 'aura'))) auraAttacks++; }
    const stats = healthOn() ? '<div class="mstats">' +
      '<div class="mstat rose"><b>' + migDays + '</b><span>migraine days</span></div>' +
      '<div class="mstat lav"><b>' + auraAttacks + '</b><span>attacks with aura</span></div>' +
      '<div class="mstat blue"><b>' + medDays + '</b><span>medication days</span></div></div>' : '';
    const legend = healthOn() ? '<div class="mlegend"><span><i class="lg is-mig"></i>Migraine</span><span><i class="lg is-rec"></i>Recovery</span><span><i class="lg aura"></i>Aura</span><span><i class="lg ev"></i>Events</span></div>' : '';
    const offer = !healthOn() && !migraineActive() ? '<div class="card"><h2 class="display" style="font-size:26px">Your migraine days, here</h2><span class="sub" style="margin-top:0">Turn on the private migraine log to see migraine days, aura and medication days in this view.</span><button class="add-line" data-action="consent">Learn more</button></div>' : '';
    return '<section class="hero">' + ICON.star +
      '<div class="topbar"><span class="eyebrow">' + first.getFullYear() + '</span><div class="weeknav">' + navBtns('prevmonth', 'nextmonth', 'month') + modePill() + '</div></div>' +
      '<h1 class="display small holdable" data-hold="1">' + MON[first.getMonth()] + '</h1></section>' + reauthBanner() +
      '<div class="content' + (S.loading ? ' loading' : '') + '">' + stats +
      '<div class="card mgrid" role="group" aria-label="' + MON[first.getMonth()] + ' ' + first.getFullYear() + '">' + grid + '</div>' + legend + offer + '</div>';
  }

  function viewConsent() {
    const email = S.primaryEmail || (DEMO ? 'lena.mueller@example.com' : 'your Google account');
    return '<section class="consent">' +
      '<div class="c-top"><span class="c-badge">' + ICON.shield(22) + '</span><span class="c-eyebrow">MIGRAINE LOG</span>' +
      '<button class="icon-btn" data-action="consentclose" aria-label="Close">' + ICON.close + '</button></div>' +
      '<h1 class="display c-title">Before you start your migraine log</h1>' +
      '<p>Migraine mode can keep a private log of your attacks. Because this is health data, we ask you first.</p>' +
      '<div class="c-card"><h2 class="c-h rose">WHAT GETS SAVED</h2><ul><li>When an attack starts and ends</li><li>The phase: warning signs, aura, headache, recovery</li><li>Aura type and medication, if you add them</li><li>Notes you type yourself</li></ul></div>' +
      '<div class="c-card"><h2 class="c-h sage">WHERE IT LIVES</h2><p>In a private calendar called “' + esc(C.healthCalendarName) + '” in your own Google account:</p>' +
      '<div class="c-acc"><span class="c-av">' + esc(email.charAt(0).toUpperCase()) + '</span><span class="c-mail">' + esc(email) + '</span></div>' +
      '<p>Only you can see it unless you share it yourself.</p><p class="c-strong">Dopamine Calendar has no server. We never receive or see your data.</p></div>' +
      '<div class="c-card"><h2 class="c-h blue">ABOUT GOOGLE</h2><p>Google stores this calendar like any other, encrypted. Google says it does not use Calendar content for ads.</p><p class="c-muted">One exception: if you turn on “Personal Intelligence” and connect Calendar, Google may use it to personalise content and ads. You can disconnect it in your Google Account settings.</p></div>' +
      '<div class="c-card"><h2 class="c-h lav">WHAT IT\'S FOR – AND WHAT IT\'S NOT</h2><p>To show your migraine days, make your day lighter during and after an attack, and create a report for your doctor if you want one.</p><p class="c-muted">It does not diagnose and does not give medical advice. In an emergency, call 112.</p></div>' +
      '<div class="c-card"><h2 class="c-h rose">YOU\'RE IN CONTROL</h2><p>This is optional – the calendar works without it. Turn it off any time in Settings. “Delete all health data” removes the Health calendar and everything in it.</p></div>' +
      '<a class="c-link" href="privacy.html">Read the full privacy info ' + ICON.right + '</a>' +
      '<label class="c-agree" for="agree"><input id="agree" type="checkbox"' + (S.consentTick ? ' checked' : '') + '><span>I agree that Dopamine Calendar saves my migraine and symptom data in my Google account, as described above.</span></label>' +
      '<button class="c-on" id="consent-on" data-action="consenton"' + (S.consentTick ? '' : ' disabled') + '>Turn on migraine log</button>' +
      '<button class="c-later" data-action="consentclose">Not now</button>' +
      '<p class="c-foot">Questions? <a href="mailto:' + esc(C.contactEmail) + '">' + esc(C.contactEmail) + '</a></p></section>';
  }

  function viewSignIn() {
    const ready = !!tokenClient;
    return '<section class="signin"><span class="eyebrow">Dopamine Calendar</span>' +
      '<h1 class="display">Hello,<br>colorful<br>week!</h1>' +
      '<p>Your Google Calendar and Tasks, in a nicer outfit. Everything stays in Google, so it keeps syncing with everyone you share calendars with.</p>' +
      (S.authError ? '<div class="err">' + esc(S.authError) + '</div>' : '') +
      '<button class="big-btn" data-action="signin"' + (ready ? '' : ' disabled') + '>' + (ready ? 'Sign in with Google' : 'Loading Google…') + '</button>' +
      '<a class="ghost-btn" href="?demo" style="display:flex;align-items:center;justify-content:center;text-decoration:none;color:inherit">Try with sample data</a>' +
      '<a class="signin-privacy" href="privacy.html">Privacy info</a></section>';
  }

  function bottomBar() {
    const b = (v, label) => '<button class="' + (S.view === v ? 'on' : '') + '" data-action="view" data-view="' + v + '"' + (S.view === v ? ' aria-current="page"' : '') + '>' + label + '</button>';
    const mig = migraineActive();
    const cur = S.view === 'now' && !mig ? 'today' : S.view;
    const b2 = (v, label) => '<button class="' + (cur === v ? 'on' : '') + '" data-action="view" data-view="' + v + '"' + (cur === v ? ' aria-current="page"' : '') + '>' + label + '</button>';
    return '<nav class="bottombar' + (mig ? ' mig-nav' : '') + '" aria-label="Views"><div class="navseg">' + (mig ? b2('now', ICON.migraine + '<span>Now</span>') : '') + b2('today', 'Day') + b2('week', 'Week') + b2('month', 'Month') + '</div>' +
      (mode() === 'migraine' ? '' : '<button class="fab" data-action="addevent" aria-label="New event">' + ICON.plus + '</button>') + '</nav>';
  }

  // ---------- sheets ----------
  function sheetTop(label) {
    return '<div class="sheet-top"><button class="icon-btn" style="background:var(--card)" data-action="close" aria-label="Close">' + ICON.close + '</button><span class="eyebrow">' + label + '</span><span style="width:46px"></span></div>';
  }
  function sheetEvent() {
    const sh = S.sheet;
    const writable = S.calendars.filter((c) => c.accessRole === 'owner' || c.accessRole === 'writer');
    if (!sh.calId && writable.length) sh.calId = writable[0].id;
    return sheetTop('New event') +
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
    return sheetTop(sh.kind === 'notes' ? 'Week ' + isoWeek(weekStart(S.sel)) : '') +
      '<h2 class="display">' + head + '</h2>' +
      '<div class="field"><label for="f-what">WHAT</label><input id="f-what" data-field="title" value="' + esc(sh.title || '') + '" placeholder="' + (sh.kind === 'deadlines' ? 'Registration form' : sh.kind === 'top3' ? 'Finish chapter 3' : 'Buy birthday present') + '" autocomplete="off"></div>' +
      (sh.kind === 'deadlines' ? '<div class="field when"><label for="f-when">DUE – JUST TYPE IT</label><input id="f-when" data-field="when" value="' + esc(sh.when || '') + '" placeholder="in 3 weeks · 21.12 · fri" autocomplete="off"><div id="parsed"></div></div>' : '') +
      '<button class="save" data-action="savetask" id="save">Save it!</button>';
  }
  function sheetMode() {
    const opts = [
      ['auto', 'Automatic', 'Work look Mon–Thu ' + C.workStartHour + '–' + C.workEndHour + ' h, weekend look the rest of the time'],
      ['work', 'Work', 'Warm pink & apricot'],
      ['weekend', 'Weekend', 'Sunset lilac, coral & turquoise']
    ];
    const act = migraineActive();
    let log;
    if (healthOn()) {
      log = '<div class="set-box"><b>Migraine log: on</b><span>Saved privately in “' + esc(C.healthCalendarName) + '” in your Google account.</span>' +
        '<div class="chips"><button class="chip" data-action="healthoff">Turn off</button>' +
        '<button class="chip" data-action="healthdelete">' + (S.sheet.confirmDelete ? 'Tap again to delete everything' : 'Delete all health data') + '</button></div></div>';
    } else if (act) {
      log = '<div class="set-box"><b>Migraine log: off</b><span>You can turn it on once you feel better.</span></div>';
    } else {
      log = '<div class="set-box"><b>Migraine log: off</b><span>Optional. A private log of your attacks, in your own Google account.</span><div class="chips"><button class="chip" data-action="consent">Turn on…</button></div></div>';
    }
    return sheetTop('Settings') +
      '<h2 class="display">How are<br>you today?</h2>' +
      (act ? '<button class="mode-opt on" data-action="endmig"><b>End migraine</b><span>Back to your colorful calendar</span></button>'
        : '<button class="mode-opt migraine-opt" data-action="startmig"><b>' + ICON.migraine + ' Migraine now</b><span>Dark, calm, only what matters. Shortcut: hold the date.</span></button>') +
      '<div class="modes">' +
      (act ? '<span class="section-label">OR END MIGRAINE AND SWITCH TO</span>' : '') +
      opts.map(([k, n, d]) => '<button class="mode-opt' + (!act && S.modePref === k ? ' on' : '') + '" data-action="setmode" data-mode="' + k + '" aria-pressed="' + (!act && S.modePref === k) + '"><b>' + n + '</b><span>' + d + '</span></button>').join('') +
      '</div>' +
      '<span class="section-label">MIGRAINE LOOK</span><div class="looks">' +
      [['dark', 'Dark', 'Dark, dimmed colors'], ['pastel', 'Pastel', 'Soft, light pastels']].map(([k, n, d]) => '<button class="look-opt look-' + k + (S.look === k ? ' on' : '') + '" data-action="look" data-look="' + k + '" aria-pressed="' + (S.look === k) + '"><span class="look-sw" aria-hidden="true"></span><b>' + n + '</b><span>' + d + '</span></button>').join('') + '</div>' +
      '<span class="section-label">MIGRAINE LOG</span>' + log +
      '<a class="danger" href="privacy.html">Privacy info</a>' +
      (DEMO ? '<a class="danger" href="./">Leave demo</a>' : S.signedIn ? '<button class="danger" data-action="signout">Sign out</button>' : '');
  }
  // The symptom tracker: big tiles, pictograms, no typing needed
  function sheetPhase() {
    const a = S.attack;
    if (!a) return sheetTop('') + '<p>Migraine mode is off.</p>';
    const on = activePhases(a), info = S.sheet.info;
    const tiles = PHASES.map(([k, n, ic, tone, tip]) => {
      const sel = !!on[k];
      return '<div class="ph-wrap">' +
        '<button class="ph-tile ' + tone + (sel ? ' on' : '') + '" data-action="setphase" data-phase="' + k + '" aria-pressed="' + sel + '" aria-describedby="tip-' + k + '">' +
        (sel ? '<span class="ph-check">' + ICON.check + '</span>' : '') + ICON[ic](48) + '<span>' + n + '</span></button>' +
        '<button class="ph-i" data-action="phinfo" data-key="' + k + '" aria-label="What is ' + n + '?" aria-expanded="' + (info === k) + '">i</button>' +
        '<span class="ph-tip" role="tooltip" id="tip-' + k + '">' + esc(tip) + '</span></div>';
    }).join('');
    const infoRow = PHASES.find((x) => x[0] === info);
    const showAura = !!on.aura || a.aura.length || hadPhase(a, 'aura');
    const auraTypes = AURA_TYPES.map(([k, n, ic, tip]) => '<div class="ph-wrap ph-wrap-aura"><button class="ph-aura' + (a.aura.includes(k) ? ' on' : '') + '" data-action="auratype" data-type="' + k + '" aria-pressed="' + a.aura.includes(k) + '" aria-describedby="tip-a-' + k + '">' + ICON[ic](28) + '<span>' + n + '</span></button>' +
      '<span class="ph-tip" role="tooltip" id="tip-a-' + k + '">' + esc(tip) + '</span></div>').join('');
    return sheetTop(healthOn() ? 'Saved to your private log' : 'Not logging') +
      '<h2 class="display ph-title">How is it right now?</h2>' +
      '<p class="ph-sub">Pick everything that fits. Tap again to switch off.</p>' +
      '<div class="ph-grid">' + tiles + '</div>' +
      (infoRow ? '<div class="ph-info ' + infoRow[3] + '" role="note"><b>' + infoRow[1] + '</b><span>' + esc(infoRow[4]) + '</span></div>' : '') +
      (showAura ? '<div class="ph-box"><div class="ph-box-h"><span>AURA · PICK ALL THAT FIT</span>' + (a.auraStart ? '<b>since ' + hm(new Date(a.auraStart)) + ' · ' + fmtDur(Date.now() - a.auraStart) + '</b>' : '') + '</div><div class="ph-auras">' + auraTypes + '</div>' +
        '<button class="ph-more" data-action="aurainfo" aria-expanded="' + !!S.sheet.auraInfo + '">' + (S.sheet.auraInfo ? 'Hide explanations' : 'What do these mean?') + '</button>' +
        (S.sheet.auraInfo ? '<div class="ph-aura-info">' + AURA_TYPES.map((x) => '<span><b>' + x[1] + ':</b> ' + esc(x[3]) + '</span>').join('') + '</div>' : '') + '</div>' : '') +
      '<p class="ph-share">“' + esc(C.shareText) + '”</p>' +
      '<button class="mig-btn sage wide" data-action="tell">' + ICON.send(24) + '<span>Tell my person</span></button>';
  }
  function sheetMeds() {
    const a = S.attack, sh = S.sheet;
    const today = a ? a.meds.filter((m) => sameDay(new Date(m.t), new Date())) : [];
    return sheetTop(healthOn() ? 'Saved to your private log' : 'Not logging') +
      '<h2 class="display ph-title">What did you take?</h2>' +
      (S.medNames.length ? '<div class="chips med-chips">' + S.medNames.map((n) => '<button class="chip" data-action="logmed" data-med="' + esc(n) + '">' + esc(n) + '</button>').join('') + '</div>' : '') +
      '<div class="field"><label for="f-med">NAME</label><input id="f-med" data-field="med" value="' + esc(sh.med || '') + '" placeholder="Your medication" autocomplete="off"></div>' +
      '<button class="save" data-action="savemed" id="save">Log it</button>' +
      (today.length ? '<div class="med-list"><span class="section-label">TODAY</span>' + today.map((m) => '<span>' + hm(new Date(m.t)) + ' · ' + esc(m.n) + '</span>').join('') + '</div>' : '');
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
    } else if (sh.type === 'meds') {
      if (save) save.disabled = !(sh.med || '').trim();
    }
  }
  function renderSheet() {
    const root = document.getElementById('sheet-root');
    if (!S.sheet) { root.innerHTML = ''; return; }
    const t = S.sheet.type;
    const html = t === 'event' ? sheetEvent() : t === 'task' ? sheetTask() : t === 'phase' ? sheetPhase() : t === 'meds' ? sheetMeds() : sheetMode();
    const label = { mode: 'Settings', phase: 'How is it right now?', meds: 'Medication' }[t] || 'New item';
    root.innerHTML = '<div class="sheet-backdrop" data-action="backdrop"><div class="sheet" role="dialog" aria-modal="true" aria-label="' + label + '">' + html + '</div></div>';
    updateParsed();
  }
  function openSheet(sheet) {
    S.sheet = sheet; renderSheet();
    const first = document.querySelector('#sheet-root input');
    if (first && sheet.type !== 'meds') setTimeout(() => first.focus(), 60);
  }
  function closeSheet() { S.sheet = null; renderSheet(); }

  // ---------- render ----------
  function render() {
    applyMode();
    const app = document.getElementById('app');
    if (S.screen === 'consent') { app.innerHTML = viewConsent(); document.body.dataset.screen = 'consent'; renderSheet(); return; }
    delete document.body.dataset.screen;
    if (!DEMO && !S.signedIn) { app.innerHTML = viewSignIn(); renderSheet(); return; }
    let main;
    if (S.view === 'week') main = viewWeek();
    else if (S.view === 'month') main = viewMonth();
    else if (S.view === 'now' && migraineActive()) main = viewMigraineDay();
    else main = viewToday();
    app.innerHTML = main + bottomBar();
    if (S.sheet && (S.sheet.type === 'mode' || S.sheet.type === 'phase')) renderSheet();
  }
  async function loadMonthAndRender() {
    if (DEMO) { render(); return; }
    S.loading = true; render();
    try { await loadMonth(); } catch (e) { handleErr(e); }
    S.loading = false; render();
  }

  // ---------- events ----------
  document.addEventListener('click', async (ev) => {
    const el = ev.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
    if (a === 'backdrop') { if (ev.target === el) closeSheet(); return; }
    if (S.justHeld && el.closest('[data-hold]')) return;
    switch (a) {
      case 'signin': signIn(); break;
      case 'reauth': try { await requestToken(); S.needsReauth = false; await loadAll(true); } catch (e) { toast(e.message); } break;
      case 'signout': closeSheet(); signOut(); break;
      case 'view':
        S.view = el.dataset.view; store.set('view', S.view);
        if (S.view === 'now') S.sel = sod(new Date());
        render(); window.scrollTo(0, 0);
        if (S.view === 'month') loadMonthAndRender();
        break;
      case 'pick': S.sel = fromYmd(el.dataset.date); render(); break;
      case 'openday':
        S.sel = fromYmd(el.dataset.date); S.view = 'today'; store.set('view', 'today'); render(); window.scrollTo(0, 0);
        if (!DEMO && S.loadedWeek !== ymd(weekStart(S.sel))) { S.loading = true; render(); try { await loadEvents(); } catch (e) { handleErr(e); } S.loading = false; render(); }
        break;
      case 'prevweek': case 'nextweek':
        S.sel = addDays(S.sel, a === 'prevweek' ? -7 : 7); render();
        if (!DEMO) { S.loading = true; render(); try { await loadEvents(); } catch (e) { handleErr(e); } S.loading = false; render(); }
        break;
      case 'prevmonth': case 'nextmonth':
        S.sel = new Date(S.sel.getFullYear(), S.sel.getMonth() + (a === 'prevmonth' ? -1 : 1), 1);
        loadMonthAndRender();
        break;
      case 'mode': openSheet({ type: 'mode' }); break;
      case 'setmode': S.modePref = el.dataset.mode; store.set('mode', S.modePref); closeSheet(); if (migraineActive()) endMigraine(); else render(); break;
      case 'look': S.look = el.dataset.look; store.set('look', S.look); render(); renderSheet(); break;
      case 'startmig': startMigraine('settings'); break;
      case 'endmig': endMigraine(); break;
      case 'phase': openSheet({ type: 'phase' }); break;
      case 'meds': openSheet({ type: 'meds', med: '' }); break;
      case 'setphase': togglePhase(el.dataset.phase); renderSheet(); render(); break;
      case 'phinfo': S.sheet.info = S.sheet.info === el.dataset.key ? null : el.dataset.key; renderSheet(); break;
      case 'aurainfo': S.sheet.auraInfo = !S.sheet.auraInfo; renderSheet(); break;
      case 'auratype': toggleAura(el.dataset.type); renderSheet(); break;
      case 'tell': tellMyPerson(); break;
      case 'logmed': logMed(el.dataset.med); closeSheet(); render(); break;
      case 'savemed': if ((S.sheet.med || '').trim()) { logMed(S.sheet.med); closeSheet(); render(); } break;
      case 'movetomorrow': {
        const e = S.events.find((x) => x.id === el.dataset.id); if (!e) return;
        el.disabled = true;
        try {
          await shiftEvent(e, 1); e.moved = true; render();
          toast('Moved to ' + fmtDay(e.start), 'Undo', async () => { try { await shiftEvent(e, -1); e.moved = false; render(); } catch (err) { handleErr(err); } });
        } catch (err) { el.disabled = false; handleErr(err); }
        break;
      }
      case 'dismisslog': store.set('logOffered', true); render(); toast('You can turn it on any time in Settings'); break;
      case 'consent': store.set('logOffered', true); closeSheet(); S.consentTick = false; setScreen('consent'); render(); window.scrollTo(0, 0); break;
      case 'consentclose': setScreen(null); render(); break;
      case 'consenton': if (S.consentTick) { el.disabled = true; el.textContent = 'Turning on…'; await turnOnHealth(); if (S.screen) { el.disabled = false; el.textContent = 'Turn on migraine log'; } } break;
      case 'healthoff': turnOffHealth(); break;
      case 'healthdelete':
        if (!S.sheet.confirmDelete) { S.sheet.confirmDelete = true; renderSheet(); }
        else deleteAllHealth();
        break;
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
  document.addEventListener('change', (ev) => {
    if (ev.target.id === 'agree') {
      S.consentTick = ev.target.checked;
      const b = document.getElementById('consent-on'); if (b) b.disabled = !S.consentTick;
    }
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && S.sheet) closeSheet();
    if (ev.key === 'Enter' && S.sheet && ev.target.tagName === 'INPUT') {
      const save = document.getElementById('save'); if (save && !save.disabled) save.click();
    }
  });

  // Shortcut 2: press and hold the date (or the week/month title) to start migraine mode
  let hold = null;
  const HOLD_MS = 800;
  function cancelHold() { if (!hold) return; clearTimeout(hold.t); hold.el.classList.remove('holding'); hold = null; }
  document.addEventListener('pointerdown', (ev) => {
    const el = ev.target.closest('[data-hold]');
    if (!el || migraineActive() || ev.button > 0) return;
    cancelHold();
    el.classList.add('holding');
    hold = {
      el, x: ev.clientX, y: ev.clientY,
      t: setTimeout(() => {
        el.classList.remove('holding'); hold = null;
        S.justHeld = true; setTimeout(() => { S.justHeld = false; }, 400);
        if (navigator.vibrate) { try { navigator.vibrate(30); } catch (e) { /* ignore */ } }
        startMigraine('hold');
      }, HOLD_MS)
    };
  });
  document.addEventListener('pointermove', (ev) => { if (hold && Math.hypot(ev.clientX - hold.x, ev.clientY - hold.y) > 12) cancelHold(); });
  document.addEventListener('pointerup', cancelHold);
  document.addEventListener('pointercancel', cancelHold);
  document.addEventListener('contextmenu', (ev) => { if (ev.target.closest('[data-hold]')) ev.preventDefault(); });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      applyMode();
      if (!DEMO && S.signedIn && !S.needsReauth && Date.now() - (S.lastLoad || 0) > 60000) loadAll(true);
      else if (migraineActive() && !S.screen) render();
    }
  });
  setInterval(() => {
    const before = document.body.dataset.mode; applyMode();
    const typing = S.sheet && ['event', 'task', 'meds'].includes(S.sheet.type);
    if (!typing && !S.screen && (before !== document.body.dataset.mode || (migraineActive() && (S.view === 'now' || S.view === 'today')))) render();
  }, 60000);

  // ---------- demo data ----------
  function demo() {
    const ws = weekStart(new Date());
    const at = (day, h, m, dur) => { const s = addDays(ws, day); s.setHours(h, m || 0, 0, 0); return { start: { dateTime: s.toISOString() }, end: { dateTime: new Date(s.getTime() + dur * 60000).toISOString() } }; };
    S.calendars = [{ id: 'me', summary: 'Me', primary: true, accessRole: 'owner' }, { id: 'shared', summary: 'Shared', accessRole: 'writer' }];
    S.primaryEmail = 'lena.mueller@example.com';
    const raw = [
      ['me', 'Team standup', 0, 9, 0, 60, 'Video call'], ['shared', 'Lunch', 0, 12, 30, 60], ['me', 'Pilates', 0, 18, 0, 60, 'Studio'],
      ['me', 'Product review', 1, 14, 0, 90, 'Room 3'], ['shared', 'Dinner with friends', 4, 19, 0, 180],
      ['me', 'Pilates', 3, 18, 0, 60, 'Studio'], ['shared', 'Flea market', 5, 14, 0, 120], ['me', 'Cinema', 5, 19, 30, 150, 'Ticket added from Gmail']
    ];
    S.events = raw.map(([cal, title, d, h, m, dur, loc], i) => normEvent(Object.assign({ id: 'e' + i, summary: title, location: loc }, at(d, h, m, dur)), S.calendars.find((c) => c.id === cal)));
    // a few events today, so "Just one thing" has something to move
    const t0 = sod(new Date());
    [['Call with Sam', 1], ['Grocery run', 3]].forEach(([title, hrs], i) => {
      const s = new Date(Date.now() + hrs * 3600000); s.setMinutes(0, 0, 0);
      if (sameDay(s, t0)) S.events.push(normEvent({ id: 'dt' + i, summary: title, start: { dateTime: s.toISOString() }, end: { dateTime: new Date(s.getTime() + 3600000).toISOString() } }, S.calendars[0]));
    });
    S.events.push(normEvent({ id: 'ad', summary: 'Mum\'s birthday', start: { date: ymd(addDays(ws, 2)) }, end: { date: ymd(addDays(ws, 3)) } }, S.calendars[0]));
    S.events.sort((a, b) => a.start - b.start);
    S.tasks = {
      top3: [{ id: 'p1', title: 'Finish thesis chapter 3' }, { id: 'p2', title: 'Prepare product review' }, { id: 'p3', title: 'Call the landlord' }],
      deadlines: [{ id: 'u1', title: 'Insurance claim', due: addDays(t0, 2) }, { id: 'u2', title: 'Registration form 2', due: addDays(t0, 11) }, { id: 'u3', title: 'Tax form', due: addDays(t0, 21) }, { id: 'u4', title: 'Registration form 1', due: addDays(t0, 49) }],
      notes: [{ id: 'n1', title: 'Buy birthday present', due: ws }, { id: 'n2', title: 'Book dentist appointment', due: ws }]
    };
    S.tasksLoaded = true;
    // sample migraine history (shown once the log is turned on in the demo)
    const ms = monthStart(new Date());
    const past = (day, h, durH, phases, aura, meds) => {
      const s = new Date(ms.getFullYear(), ms.getMonth(), day, h).getTime();
      return { eventId: 'h' + day, start: s, end: s + durH * 3600000, active: false, synced: true, aura: aura || [],
        phases: phases.map(([p, off]) => ({ p, t: s + off * 3600000 })), meds: (meds || []).map((off) => ({ n: 'Sample medication', t: s + off * 3600000 })) };
    };
    S.health.events = [
      past(3, 8, 10, [['headache', 0], ['recovering', 26]], [], [1]),
      past(10, 14, 7, [['aura', 0], ['headache', 0.5]], ['seeing'], [1]),
      past(11, 9, 3, [['recovering', 0]], []),
      past(17, 7, 12, [['warning', 0], ['headache', 2]], [], [2, 8])
    ].filter((a) => a.start < Date.now());
    S.medNames = ['Sample medication'];
  }

  // ---------- start ----------
  window.DC = { gisLoaded };
  if (DEMO) { demo(); }
  else {
    const saved = store.get('token', null);
    if (saved && saved.e > Date.now()) { S.token = saved.t; S.tokenExp = saved.e; S.healthGranted = !!saved.h; S.signedIn = true; loadAll(true); }
    else if (store.get('known', false)) { S.signedIn = true; S.needsReauth = true; }
  }
  if (migraineActive()) { S.view = 'now'; S.sel = sod(new Date()); }
  // Shortcut 1: the app-icon shortcut opens ./?migraine – straight into migraine mode
  const wantMigraine = PARAMS.has('migraine'), wantNew = PARAMS.has('new');
  if (wantMigraine || wantNew) history.replaceState(null, '', location.pathname + (DEMO ? '?demo' : ''));
  if (wantMigraine && !migraineActive()) startMigraine('shortcut');
  else render();
  if (wantNew && !migraineActive()) openSheet({ type: 'event', title: '', when: '', color: '' });
  if (window.google && google.accounts) gisLoaded();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
