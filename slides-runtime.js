(() => {
  'use strict';
  const root = document.documentElement;
  const chapters = [...document.querySelectorAll('[data-chapter]')];
  const header = document.querySelector('.site-header');
  const bar = document.querySelector('.presentation-bar');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let scheduled = false, fitting = false;
  root.classList.add('slides-ready');

  function fit() {
    scheduled = false;
    if (fitting) return;
    fitting = true;
    const height = Math.round(window.visualViewport?.height || innerHeight);
    const headerHeight = Math.ceil(header.getBoundingClientRect().height);
    const barHeight = document.body.classList.contains('presentation') ? Math.ceil(bar.getBoundingClientRect().height) : 0;
    root.style.setProperty('--viewport-height', `${height}px`);
    root.style.setProperty('--header-height', `${headerHeight}px`);
    root.style.setProperty('--bar-height', `${barHeight}px`);
    root.style.setProperty('--slide-height', `${Math.max(180, height - headerHeight - barHeight)}px`);
    // Layout is measured only on viewport/content changes, never during scrolling.
    for (const chapter of chapters) {
      if (!chapter.getClientRects().length) continue;
      const content = chapter.querySelector('.slide-content');
      content.style.setProperty('--slide-scale', '1');
      chapter.classList.remove('slide-overflow');
      const style = getComputedStyle(chapter);
      const available = chapter.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      let scale = 1;
      for (let attempt = 0; attempt < 4; attempt++) {
        const natural = Math.max(content.scrollHeight, content.offsetHeight);
        if (natural * scale <= available + 1) break;
        scale = Math.max(.52, Math.min(scale, available / natural) * .995);
        content.style.setProperty('--slide-scale', scale.toFixed(4));
      }
      // At extreme text zoom, allow native scrolling rather than hiding text.
      if (Math.max(content.scrollHeight, content.offsetHeight) * scale > available + 2) chapter.classList.add('slide-overflow');
      chapter.dataset.fitScale = scale.toFixed(3);
    }
    fitting = false;
    window.PotemkinMotion?.refresh();
  }
  function refresh() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(fit);
  }
  function goTo(chapter, smooth = true) {
    if (!chapter) return;
    refresh();
    chapter.scrollIntoView({ behavior: smooth && !reduced.matches ? 'smooth' : 'instant', block: 'start' });
  }
  window.PotemkinSlides = { refresh, fit, goTo };
  addEventListener('resize', refresh, {passive:true});
  window.visualViewport?.addEventListener('resize', refresh, {passive:true});
  addEventListener('orientationchange', refresh, {passive:true});
  document.fonts?.ready.then(refresh);
  document.addEventListener('toggle', event => { if (event.target.closest?.('.chapter')) refresh(); }, true);
  document.addEventListener('potemkin:loader-dismissed', () => {
    fit();
    const target = document.getElementById(location.hash.slice(1));
    if (target?.matches('[data-chapter]')) goTo(target, false);
  });
  const resize = new ResizeObserver(refresh);
  resize.observe(header);
  resize.observe(bar);
  fit();
})();
