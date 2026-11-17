(() => {
  'use strict';
  const copy = window.POTEMKIN_CONTENT;
  if (!copy) return;
  const root = document.documentElement;
  const body = document.body;
  const chapters = [...document.querySelectorAll('[data-chapter]')];
  const dots = [...document.querySelectorAll('[data-dot]')];
  const bar = document.querySelector('.presentation-bar');
  const progress = document.querySelector('.presentation-progress i');
  const status = document.querySelector('.presentation-status');
  const previous = document.querySelector('.previous');
  const next = document.querySelector('.next');
  const autoplay = document.querySelector('.autoplay-toggle');
  const motion = document.querySelector('.motion-toggle');
  const menu = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.main-nav');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const state = { current: 0, presenting: false, auto: false, autoStarted: false, finished: false, elapsed: 0, lastTick: 0, interval: null, motionOff: reduced.matches };

  function announce(message) { document.querySelector('#announcement').textContent = message; }
  function closeMenu() {
    nav.classList.remove('open');
    menu.setAttribute('aria-expanded', 'false');
    menu.setAttribute('aria-label', copy.ui.menuOpen);
  }
  function updateAutoplay() {
    autoplay.setAttribute('aria-pressed', String(state.auto));
    autoplay.querySelector('span').textContent = state.auto ? copy.ui.autoplayPause : state.finished || !state.autoStarted ? copy.ui.autoplayStart : copy.ui.autoplayResume;
    autoplay.querySelector('svg').innerHTML = state.auto ? '<path d="M8 5v14M16 5v14"/>' : '<path d="m9 5 11 7-11 7Z"/>';
  }
  function setMotion(off, remember = true) {
    state.motionOff = off;
    root.classList.toggle('motion-off', off);
    motion.setAttribute('aria-pressed', String(off));
    motion.querySelector('.motion-label').textContent = off ? copy.ui.motionOff : copy.ui.motionOn;
    motion.setAttribute('title', off ? copy.ui.motionOff : copy.ui.motionLabel);
    motion.setAttribute('aria-label', off ? copy.ui.motionOff : copy.ui.motionLabel);
    window.PotemkinMotion?.setPaused(off);
    if (off && state.auto) { state.auto = false; updateAutoplay(); }
    if (remember) { try { localStorage.setItem('potemkin-motion', off ? 'off' : 'on'); } catch {} }
  }
  try { state.motionOff = reduced.matches || localStorage.getItem('potemkin-motion') === 'off'; } catch {}
  setMotion(state.motionOff, false);
  reduced.addEventListener('change', event => setMotion(event.matches, false));
  motion.addEventListener('click', () => setMotion(!state.motionOff));
  menu.addEventListener('click', () => {
    const open = !nav.classList.contains('open');
    nav.classList.toggle('open', open);
    menu.setAttribute('aria-expanded', String(open));
    menu.setAttribute('aria-label', open ? copy.ui.menuClose : copy.ui.menuOpen);
  });

  function updateDots(index) {
    dots.forEach((dot, i) => i === index ? dot.setAttribute('aria-current', 'step') : dot.removeAttribute('aria-current'));
  }
  function navigate(index, focus = true) {
    state.current = Math.max(0, Math.min(chapters.length - 1, index));
    state.elapsed = 0;
    state.lastTick = performance.now();
    state.finished = false;
    updateDots(state.current);
    if (!state.presenting) return;
    chapters.forEach((chapter, i) => chapter.classList.toggle('active', i === state.current));
    chapters[state.current].querySelectorAll('img').forEach(img => { img.loading = 'eager'; });
    status.textContent = `${state.current + 1} / ${chapters.length} · ${copy.chapters[state.current]}`;
    previous.disabled = state.current === 0;
    next.disabled = state.current === chapters.length - 1;
    progress.style.width = `${state.current / chapters.length * 100}%`;
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (focus) chapters[state.current].querySelector('h1, h2').focus({ preventScroll: true });
    requestAnimationFrame(() => window.PotemkinMotion?.refresh());
    updateAutoplay();
  }
  function tick() {
    const now = performance.now();
    const delta = now - state.lastTick;
    state.lastTick = now;
    if (!state.auto || !state.presenting || document.hidden) return;
    state.elapsed += Math.min(delta, 1000);
    const sceneDuration = (copy.chapterDurations[state.current] || 36) * 1000;
    const fraction = Math.min(state.elapsed / sceneDuration, 1);
    progress.style.width = `${(state.current + fraction) / chapters.length * 100}%`;
    if (state.elapsed >= sceneDuration) {
      if (state.current < chapters.length - 1) navigate(state.current + 1);
      else {
        state.auto = false;
        state.finished = true;
        progress.style.width = '100%';
        updateAutoplay();
        announce(copy.ui.finished);
      }
    }
  }
  function startPresentation(index = 0) {
    closeMenu();
    state.presenting = true;
    state.auto = false;
    state.autoStarted = false;
    body.classList.add('presentation');
    bar.hidden = false;
    navigate(index);
    if (state.interval) clearInterval(state.interval);
    state.interval = setInterval(tick, 200);
  }
  function exitPresentation() {
    if (!state.presenting) return;
    state.presenting = false;
    state.auto = false;
    clearInterval(state.interval);
    state.interval = null;
    body.classList.remove('presentation');
    bar.hidden = true;
    chapters.forEach(chapter => chapter.classList.remove('active'));
    chapters[state.current].scrollIntoView({ behavior: 'instant', block: 'start' });
    chapters[state.current].querySelector('h1, h2').focus({ preventScroll: true });
  }
  document.querySelectorAll('[data-start]').forEach(button => button.addEventListener('click', event => {
    event.preventDefault();
    startPresentation(0);
  }));
  previous.addEventListener('click', () => navigate(state.current - 1));
  next.addEventListener('click', () => navigate(state.current + 1));
  document.querySelector('.exit-presentation').addEventListener('click', exitPresentation);
  document.querySelector('.skip-effects')?.addEventListener('click', () => window.PotemkinMotion?.skip());
  autoplay.addEventListener('click', () => {
    if (state.finished) navigate(0);
    state.auto = !state.auto;
    state.autoStarted = true;
    state.lastTick = performance.now();
    updateAutoplay();
  });
  document.addEventListener('visibilitychange', () => { state.lastTick = performance.now(); });
  document.querySelectorAll('a[href^="#"]').forEach(link => link.addEventListener('click', event => {
    if (link.hasAttribute('data-start')) return;
    const id = link.getAttribute('href').slice(1);
    const index = chapters.findIndex(chapter => chapter.id === id);
    closeMenu();
    if (state.presenting && index >= 0) {
      event.preventDefault();
      navigate(index);
    } else if (['quellen', 'deutschhilfe'].includes(id)) {
      const target = document.getElementById(id);
      if (state.presenting) exitPresentation();
      target.open = true;
    }
  }));
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Escape') {
      closeMenu();
      if (state.presenting) { event.preventDefault(); exitPresentation(); }
      return;
    }
    if (!state.presenting || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName) || event.target.isContentEditable) return;
    const actionable = event.target.closest('button, a, summary');
    if (event.key === 'ArrowRight' || event.key === 'PageDown' || (event.code === 'Space' && !actionable)) {
      event.preventDefault(); navigate(state.current + 1);
    } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
      event.preventDefault(); navigate(state.current - 1);
    } else if (event.key === 'Home') { event.preventDefault(); navigate(0); }
    else if (event.key === 'End') { event.preventDefault(); navigate(chapters.length - 1); }
  });

  if ('IntersectionObserver' in window) {
    const reveal = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) { entry.target.classList.add('visible'); reveal.unobserve(entry.target); }
      });
    }, { threshold: 0.08 });
    document.querySelectorAll('.reveal').forEach(element => reveal.observe(element));
    const visible = new Map();
    const chapterObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => visible.set(Number(entry.target.dataset.chapter), entry.isIntersecting ? entry.intersectionRatio : 0));
      if (state.presenting) return;
      const winner = [...visible].sort((a, b) => b[1] - a[1])[0];
      if (winner && winner[1] > 0) { state.current = winner[0]; updateDots(state.current); }
    }, { threshold: [0, 0.15, 0.3, 0.45, 0.6, 0.8] });
    chapters.forEach(chapter => chapterObserver.observe(chapter));
  } else document.querySelectorAll('.reveal').forEach(element => element.classList.add('visible'));

  const moveDetails = [...document.querySelectorAll('.move')];
  moveDetails.forEach(details => details.addEventListener('toggle', () => {
    if (!details.open) return;
    moveDetails.forEach(other => { if (other !== details) other.open = false; });
    const move = copy.moves.items.find(item => item.id === details.dataset.move);
    document.querySelector('.move-stage-number').textContent = move.number;
    document.querySelector('.stage-tag').textContent = move.tag;
    document.querySelector('.move-stage-word').textContent = move.stageWord;
    document.querySelectorAll('[data-move-panel]').forEach(panel => { panel.hidden = panel.dataset.movePanel !== move.id; });
    requestAnimationFrame(() => window.PotemkinMotion?.refresh());
  }));

  document.querySelectorAll('.image-wrap img').forEach(img => {
    const fallback = () => {
      if (!img.dataset.retried && !img.currentSrc.includes('-small.png')) {
        img.dataset.retried = 'true';
        img.removeAttribute('srcset');
        img.src = img.getAttribute('src').replace('.png', '-small.png');
      } else {
        img.hidden = true;
        const caption = img.parentElement.querySelector('.image-fallback');
        if (caption) caption.hidden = false;
      }
    };
    img.addEventListener('error', fallback);
    if (img.complete && img.naturalWidth === 0) fallback();
  });

  function icsEscape(value) { return value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;'); }
  function fold(line) {
    let output = '', length = 0;
    for (const char of line) {
      const bytes = new TextEncoder().encode(char).length;
      if (length + bytes > 75) { output += '\r\n '; length = 1; }
      output += char; length += bytes;
    }
    return output;
  }
  document.querySelector('[data-calendar]').addEventListener('click', () => {
    const now = new Date();
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
    let year = Number(parts.year);
    if (Number(parts.month) === 12 && Number(parts.day) > 14) year++;
    const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Potemkin Tag//Fan Presentation//DE', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT', 'UID:potemkin-tag-1412@fan.local', `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${year}1214`, `DTEND;VALUE=DATE:${year}1215`, 'RRULE:FREQ=YEARLY', `SUMMARY:${icsEscape(copy.finale.calendarEvent)}`, `DESCRIPTION:${icsEscape(copy.finale.calendarDescription)}`, 'END:VEVENT', 'END:VCALENDAR'];
    const blob = new Blob([lines.map(fold).join('\r\n') + '\r\n'], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = 'potemkin-tag.ics';
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    document.querySelector('.calendar-status').textContent = copy.finale.calendarSaved;
  });
  root.classList.add('js');
})();
