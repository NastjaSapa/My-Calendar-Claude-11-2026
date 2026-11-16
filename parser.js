// Understands typed times like "fri 7-10pm", "9-10", "tomorrow 14:00",
// "21.11 18-20", "all day sat", "in 3 weeks". English + a bit of German.
(function (root) {
  const DAYS = [
    ['sun', 'sunday', 'so', 'sonntag'],
    ['mon', 'monday', 'mo', 'montag'],
    ['tue', 'tues', 'tuesday', 'di', 'dienstag'],
    ['wed', 'wednesday', 'mi', 'mittwoch'],
    ['thu', 'thur', 'thurs', 'thursday', 'do', 'donnerstag'],
    ['fri', 'friday', 'fr', 'freitag'],
    ['sat', 'saturday', 'sa', 'samstag']
  ];
  const MONTHS = [
    ['jan', 'january', 'januar'], ['feb', 'february', 'februar'], ['mar', 'march', 'mär', 'märz', 'maerz'],
    ['apr', 'april'], ['may', 'mai'], ['jun', 'june', 'juni'], ['jul', 'july', 'juli'],
    ['aug', 'august'], ['sep', 'sept', 'september'], ['oct', 'october', 'okt', 'oktober'],
    ['nov', 'november'], ['dec', 'december', 'dez', 'dezember']
  ];
  const dayIndex = (w) => DAYS.findIndex((d) => d.includes(w));
  const monthIndex = (w) => MONTHS.findIndex((m) => m.includes(w));

  function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

  // Finds the date part. Returns { date, rest, found }.
  function parseDay(text, now) {
    let t = ' ' + text + ' ';
    const today = startOfDay(now);
    let date = null;
    let m;

    if ((m = t.match(/\s(today|heute)\s/))) { date = today; t = t.replace(m[0], ' '); }
    else if ((m = t.match(/\s(day after tomorrow|übermorgen|uebermorgen)\s/))) { date = addDays(today, 2); t = t.replace(m[0], ' '); }
    else if ((m = t.match(/\s(tomorrow|tmrw|morgen)\s/))) { date = addDays(today, 1); t = t.replace(m[0], ' '); }
    else if ((m = t.match(/\sin\s+(\d+|a|one|two|three|four|five|six)\s*(days?|d|weeks?|w|wochen?|tagen?|months?|monaten?)\s/))) {
      const words = { a: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
      const n = words[m[1]] || parseInt(m[1], 10);
      const unit = m[2];
      if (/^(w|week|weeks|woche|wochen)$/.test(unit)) date = addDays(today, n * 7);
      else if (/^month|^monat/.test(unit)) { date = new Date(today); date.setMonth(date.getMonth() + n); }
      else date = addDays(today, n);
      t = t.replace(m[0], ' ');
    }
    else if ((m = t.match(/\s(\d{1,2})\.(\d{1,2})\.?(\d{2,4})?(?=\s)/)) || (m = t.match(/\s(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?=\s)/))) {
      const d = parseInt(m[1], 10), mo = parseInt(m[2], 10) - 1;
      let y = m[3] ? parseInt(m[3], 10) : today.getFullYear();
      if (y < 100) y += 2000;
      date = new Date(y, mo, d);
      if (!m[3] && date < today) date = new Date(y + 1, mo, d);
      t = t.replace(m[0], ' ');
    }
    else if ((m = t.match(/\s(\d{1,2})(?:st|nd|rd|th|\.)?\s+([a-zäö]+)\.?(?=\s)/)) && monthIndex(m[2]) >= 0) {
      date = new Date(today.getFullYear(), monthIndex(m[2]), parseInt(m[1], 10));
      if (date < today) date.setFullYear(date.getFullYear() + 1);
      t = t.replace(m[0], ' ');
    }
    else if ((m = t.match(/\s([a-zäö]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?=\s)/)) && monthIndex(m[1]) >= 0) {
      date = new Date(today.getFullYear(), monthIndex(m[1]), parseInt(m[2], 10));
      if (date < today) date.setFullYear(date.getFullYear() + 1);
      t = t.replace(m[0], ' ');
    }
    else if ((m = t.match(/\s(next\s+|nächsten?\s+|naechsten?\s+)?([a-zäö]+)\.?(?=\s)/g))) {
      for (const raw of m) {
        const mm = raw.match(/\s(next\s+|nächsten?\s+|naechsten?\s+)?([a-zäö]+)\.?/);
        const idx = dayIndex(mm[2]);
        if (idx >= 0) {
          let diff = (idx - today.getDay() + 7) % 7;
          if (mm[1]) diff += diff === 0 ? 7 : 7;
          date = addDays(today, diff);
          t = t.replace(raw, ' ');
          break;
        }
      }
    }
    return { date, rest: t.trim(), found: !!date };
  }

  // One time token like "9", "9:30", "9.30", "7pm", "19h", "9 am"
  const TIME = '(\\d{1,2})(?:[:.](\\d{2}))?\\s*(am|pm|a|p|h|uhr)?';

  function toMinutes(h, m, suf) {
    h = parseInt(h, 10); m = m ? parseInt(m, 10) : 0;
    if (suf === 'pm' || suf === 'p') { if (h < 12) h += 12; }
    if ((suf === 'am' || suf === 'a') && h === 12) h = 0;
    if (h > 24 || m > 59) return null;
    return h * 60 + m;
  }

  function parseTime(text) {
    const range = new RegExp('(?:^|\\s|at\\s|um\\s)' + TIME + '\\s*(?:-|–|—|to|till|until|bis)\\s*' + TIME + '(?=\\s|$)');
    let m = text.match(range);
    if (m) {
      const s1 = m[3], s2 = m[6];
      let a = toMinutes(m[1], m[2], s1);
      let b = toMinutes(m[4], m[5], s2);
      if (a == null || b == null) return null;
      const pm2 = s2 === 'pm' || s2 === 'p';
      if (!s1 && pm2 && a + 720 <= b) a += 720;
      if (b <= a && !s2 && b + 720 > a) b += 720;
      if (b <= a) b += 1440; // runs past midnight
      return { start: a, end: b, rest: text.replace(m[0], ' ').trim() };
    }
    const single = new RegExp('(?:^|\\s)(?:at\\s+|um\\s+|@)?' + TIME + '(?=\\s|$)');
    m = text.match(single);
    if (m && (m[2] || m[3] || /(?:^|\s)(at|um|@)\s*\d/.test(text) || text.trim() === m[0].trim())) {
      const a = toMinutes(m[1], m[2], m[3]);
      if (a == null) return null;
      return { start: a, end: a + 60, rest: text.replace(m[0], ' ').trim() };
    }
    return null;
  }

  // defaultDate: the day to use when no day is typed (e.g. the day you're looking at)
  function parseWhen(input, now, defaultDate) {
    now = now || new Date();
    let text = (input || '').toLowerCase().replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
    if (!text) return null;
    let allDay = false;
    const ad = text.match(/(^|\s)(all[- ]?day|ganztägig|ganztags|whole day)(?=\s|$)/);
    if (ad) { allDay = true; text = text.replace(ad[0], ' ').trim(); }

    const day = parseDay(text, now);
    const time = allDay ? null : parseTime(day.rest);
    const leftover = (time ? time.rest : day.rest).replace(/\b(at|um|from|von|on|am)\b/g, '').trim();
    if (leftover.length) return null; // something we didn't understand
    if (!day.found && !time && !allDay) return null;

    const base = day.date || startOfDay(defaultDate || now);
    if (!time) {
      const start = startOfDay(base);
      return { allDay: true, start, end: addDays(start, 1) };
    }
    const start = new Date(base); start.setHours(0, time.start, 0, 0);
    const end = new Date(base); end.setHours(0, time.end, 0, 0);
    return { allDay: false, start, end };
  }

  // Deadline: only a date. "in 3 weeks", "21.12", "fri", "dec 4"
  function parseDue(input, now) {
    now = now || new Date();
    const text = (input || '').toLowerCase().replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
    if (!text) return null;
    const day = parseDay(text, now);
    if (!day.found || day.rest.replace(/\b(on|am|by|bis)\b/g, '').trim()) return null;
    return day.date;
  }

  const api = { parseWhen, parseDue, startOfDay, addDays };
  if (typeof module !== 'undefined') module.exports = api; else root.DCParse = api;
})(this);
