/* Pure scheduling functions; dates use China calendar days, never a rolling 24h cutoff. */
(function (root) {
  'use strict';
  const DAY = 86400000;
  const day = t => Math.floor((Number(t) + 28800000) / DAY);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const defaults = { minutes: 60, seconds: 50, smart: true, intervals: [1, 2, 5, 7], success: [7, 14, 25, 40], protection: 14, auditFraction: .125 };
  function settings(s = {}) {
    const positive = (v, fallback, max) => Number.isFinite(Number(v)) && Number(v) > 0 ? clamp(Number(v), 1, max) : fallback;
    return { ...defaults, ...s, minutes: positive(s.minutes, 60, 1440), seconds: positive(s.seconds, 50, 600),
      intervals: defaults.intervals.map((v,i) => positive(s.intervals?.[i], v, 365)),
      success: defaults.success.map((v,i) => positive(s.success?.[i], v, 365)),
      protection: positive(s.protection, 14, 365), auditFraction: .125, smart: s.smart !== false };
  }
  function migrate(state) {
    state.reviewSettings = settings(state.reviewSettings);
    for (const x of state.items) {
      if (x.schedule) continue;
      const h = x.history || [];
      let streak = 0;
      for (let i=h.length-1; i>=0 && h[i].grade===3; i--) streak++;
      x.schedule = { version: 1, originalDue: Number(x.next) || 0, plannedInterval: Number(x.interval) || 0,
        lastGrade: h.length ? h[h.length-1].grade : null, streak, reviewCount: h.filter(v=>v.kind==='review').length,
        legacyCount: h.filter(v=>!v.kind).length, learnedAt: h[0]?.at ?? null };
    }
    state.scheduleVersion = 1;
    return state;
  }
  const due = (x, now) => !!x.history?.length && day(x.schedule?.originalDue ?? x.next) <= day(now);
  function components(x, now, s) {
    const h = (x.history || []).filter(v=>Number.isInteger(v.grade) && v.grade>=0 && v.grade<=3);
    // Bayesian smoothing prevents a single grade from defining long-term mastery.
    const failures = h.filter(v=>v.grade<=1).length;
    const frequency = (failures + 1) / (h.length + 2);
    const weakness = (h.reduce((n,v)=>n+(3-v.grade)/3,0)+1)/(h.length+2);
    const last = h[h.length-1]?.at;
    const elapsed = last == null ? 0 : Math.max(0,day(now)-day(last));
    const interval = Math.max(1,x.schedule?.plannedInterval || x.interval || 1);
    const risk = clamp(.6*weakness + .4*clamp(elapsed/(interval*2),0,1),0,1);
    const overdueDays = Math.max(0,day(now)-day(x.schedule?.originalDue ?? x.next));
    const overdue = clamp(overdueDays/s.protection,0,1);
    // Existing importance uses 1–3 stars. No text inference.
    const importance = Number.isFinite(x.importance) ? clamp((x.importance-1)/2,0,1) : .5;
    return { risk, overdue, importance, frequency, overdueDays, score: .45*risk+.25*overdue+.20*importance+.10*frequency };
  }
  function plan(state, now = Date.now(), extra = false) {
    const s = settings(state.reviewSettings), today = day(now);
    const completed = state.items.flatMap(x=>x.history || []).filter(h=>h.kind==='review' && day(h.at)===today);
    const spent = completed.reduce((n,h)=>n+(h.durationSeconds || s.seconds),0);
    const capacity = Math.max(0,Math.floor((s.minutes*60-spent)/s.seconds));
    const candidates = state.items.filter(x=>due(x,now) && !x.history.some(h=>day(h.at)===today && h.kind==='review'));
    const rank = (a,b) => {
      const ca=components(a,now,s), cb=components(b,now,s);
      const pa=ca.overdueDays>=s.protection, pb=cb.overdueDays>=s.protection;
      return Number(pb)-Number(pa) || (pa && pb ? (a.schedule.originalDue-b.schedule.originalDue) : cb.score-ca.score) || String(a.id).localeCompare(String(b.id));
    };
    candidates.sort(s.smart ? rank : (a,b)=>a.schedule.originalDue-b.schedule.originalDue || String(a.id).localeCompare(String(b.id)));
    const limit = extra ? candidates.length : capacity;
    const selected = [];
    if (s.smart && limit) {
      const audit = candidates.slice().sort((a,b)=>(a.history.at(-1)?.at || 0)-(b.history.at(-1)?.at || 0) || String(a.id).localeCompare(String(b.id)));
      selected.push(...audit.slice(0,Math.min(candidates.length,Math.floor(limit*s.auditFraction))));
    }
    const ids = new Set(selected.map(x=>x.id));
    for (const x of candidates) if (selected.length<limit && !ids.has(x.id)) { selected.push(x); ids.add(x.id); }
    return { selected, waiting: candidates.filter(x=>!ids.has(x.id)), capacity, spent,
      dueCount: state.items.filter(x=>due(x,now)).length, backlogSeconds: state.items.filter(x=>due(x,now)).length*s.seconds };
  }
  function grade(state, x, value, now = Date.now(), durationSeconds = null, formal = false) {
    migrate(state);
    const s=state.reviewSettings, previous=x.history.at(-1), first=!x.history.length;
    const sameDay = previous && day(previous.at)===day(now);
    const streak = sameDay ? x.schedule.streak : (value===3 ? x.schedule.streak+1 : 0);
    let interval = s.intervals[value];
    if (!first && value===3) interval=s.success[Math.min(Math.max(0,streak-1),s.success.length-1)];
    if (!first && value<=1) interval=Math.min(interval,Math.max(1,Math.floor(x.schedule.plannedInterval/2)));
    if (!first && value===2) interval=Math.min(interval,Math.max(1,Math.round(x.schedule.plannedInterval*.75)));
    const kind=first?'learn':formal?'review':'practice';
    const record={ at:now, grade:value, response:'', kind, originalDue:x.schedule.originalDue,
      scheduledDay:day(now), actualReviewAt:now, plannedInterval:interval,
      durationSeconds: Number.isFinite(durationSeconds) ? clamp(durationSeconds,1,600) : null,
      sameDayRepeat:!!sameDay };
    // Every real operation is retained, but one item still has exactly one next due date.
    x.history.push(record);
    x.schedule={...x.schedule, lastGrade:value, streak:value===3?streak:0, plannedInterval:interval,
      originalDue:(day(now)+interval)*DAY-28800000, actualReviewAt:now,
      reviewCount:x.schedule.reviewCount+(kind==='review'&&!sameDay?1:0), learnedAt:x.schedule.learnedAt ?? now };
    x.next=x.schedule.originalDue; x.interval=interval;
    x.master=x.schedule.streak>=2 && components(x,now,s).frequency<.4;
    if (kind==='review' && record.durationSeconds!=null && !sameDay) s.seconds=clamp(s.seconds*.9+record.durationSeconds*.1,10,600);
    return record;
  }
  const api={day,settings,migrate,due,components,plan,grade,defaults};
  if (typeof module!=='undefined') module.exports=api;
  else root.ReviewScheduler=api;
})(typeof window!=='undefined'?window:globalThis);
