(() => {
  'use strict';
  const assets = window.POTEMKIN_ASSETS;
  if (!Array.isArray(assets)) return;

  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const lowPower = (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) ||
    (navigator.deviceMemory && navigator.deviceMemory <= 4) || connection?.saveData;
  const concurrency = lowPower ? 2 : 3;
  const tasks = new Map(), queue = [], planned = new Set();
  const overlay = document.getElementById('asset-loader');
  const progress = document.getElementById('load-progress');
  const status = document.getElementById('load-status');
  const start = document.getElementById('load-start');
  const continuation = document.getElementById('load-continue');
  const previousFocus = document.activeElement;
  const pageElements = [...document.querySelectorAll('body > .skip-link, body > header, body > main, body > footer, body > .chapter-dots, body > .presentation-bar')];
  const previousInert = new Map(pageElements.map(element => [element, element.inert]));
  let active = 0, pumping = false, finished = false, dismissed = !overlay, deadline;
  let resolveReady, resolveDismissed;
  const ready = new Promise(resolve => { resolveReady = resolve; });
  const dismissal = new Promise(resolve => { resolveDismissed = resolve; });
  const state = { total: 0, settled: 0, loaded: 0, failed: 0, percent: 0, dismissed, complete: false };
  const absolute = url => new URL(url, document.baseURI).href;

  function announce() {
    state.total = planned.size;
    state.settled = state.loaded = state.failed = 0;
    for (const key of planned) {
      const task = tasks.get(key);
      if (task?.status === 'loaded') { state.loaded++; state.settled++; }
      else if (task?.status === 'failed') { state.failed++; state.settled++; }
    }
    state.percent = state.total ? Math.round(state.settled / state.total * 100) : 100;
    if (progress) {
      progress.max = 100;
      progress.value = state.percent;
      progress.style.setProperty('--load-progress', `${state.percent}%`);
      progress.setAttribute('aria-valuenow', String(state.percent));
    }
    if (status) status.textContent = state.percent === 100 ? 'Bereit. Der Vorhang öffnet sich.' : `Potemkin macht sich bereit … ${state.percent} %`;
    document.dispatchEvent(new CustomEvent('potemkin:assets-progress', { detail: { ...state } }));
    if (state.settled === state.total && !finished) {
      finished = state.complete = true;
      if (start) start.disabled = false;
      resolveReady({ ...state });
      dismiss('ready');
    }
  }

  function dismiss(reason = 'continue') {
    if (dismissed) return;
    const restoreFocus = overlay?.contains(document.activeElement);
    dismissed = state.dismissed = true;
    clearTimeout(deadline);
    document.documentElement.classList.remove('is-loading');
    for (const [element, wasInert] of previousInert) element.inert = wasInert;
    document.removeEventListener('keydown', trapFocus, true);
    if (overlay) {
      overlay.hidden = true;
      overlay.setAttribute('aria-hidden', 'true');
    }
    if (restoreFocus) {
      const target = previousFocus && previousFocus !== document.body ? previousFocus : document.querySelector('main h1');
      if (target) {
        const temporaryTab = !target.hasAttribute('tabindex') && !target.matches('a, button, input, select, textarea');
        if (temporaryTab) target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
        if (temporaryTab) target.addEventListener('blur', () => target.removeAttribute('tabindex'), { once: true });
      }
    }
    resolveDismissed(reason);
    document.dispatchEvent(new CustomEvent('potemkin:loader-dismissed', { detail: { reason } }));
  }

  function trapFocus(event) {
    if (event.key !== 'Tab' || dismissed || !continuation) return;
    event.preventDefault();
    continuation.focus({ preventScroll: true });
  }

  function download(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = 'async';
      let settled = false;
      const timer = setTimeout(() => complete(new Error(`Image timed out: ${url}`)), 30000);
      function complete(error) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        image.onload = image.onerror = null;
        if (error) reject(error); else resolve(image);
      }
      image.onload = async () => {
        try {
          if (typeof image.decode === 'function') await image.decode();
          if (!image.naturalWidth) throw new Error(`Empty image: ${url}`);
          complete();
        } catch (error) { complete(error); }
      };
      image.onerror = () => complete(new Error(`Image unavailable: ${url}`));
      image.src = url;
    });
  }

  async function run(task) {
    active++;
    task.status = 'loading';
    try {
      let image;
      try { image = await download(task.url); }
      catch (error) {
        if (!task.fallback || task.fallback === task.url) throw error;
        image = await download(task.fallback);
      }
      task.image = image;
      task.status = 'loaded';
      task.resolve(image);
    } catch (error) {
      task.status = 'failed';
      task.reject(error);
    } finally {
      active--;
      announce();
      pump();
    }
  }

  function pump() {
    if (pumping) return;
    pumping = true;
    Promise.resolve().then(() => {
      pumping = false;
      queue.sort((a, b) => b.priority - a.priority);
      while (active < concurrency && queue.length) run(queue.shift());
    });
  }

  function load(url, options = {}) {
    if (!url) return Promise.reject(new Error('Missing image URL'));
    const key = absolute(url);
    let task = tasks.get(key);
    if (task && (task.status !== 'failed' || !options.retry)) {
      if (options.priority > task.priority) task.priority = options.priority;
      return task.promise;
    }
    task = { url: key, fallback: options.fallback ? absolute(options.fallback) : null, priority: options.priority || 0, status: 'queued' };
    task.promise = new Promise((resolve, reject) => { task.resolve = resolve; task.reject = reject; });
    tasks.set(key, task);
    queue.push(task);
    pump();
    return task.promise;
  }

  window.PotemkinAssets = {
    load, ready, dismissed: dismissal, dismiss,
    get state() { return { ...state }; },
    get lowPower() { return !!lowPower; }
  };
  if (overlay) {
    overlay.hidden = false;
    overlay.removeAttribute('aria-hidden');
    document.documentElement.classList.add('is-loading');
    for (const element of pageElements) element.inert = true;
    document.addEventListener('keydown', trapFocus, true);
    if (start) start.disabled = true;
    start?.addEventListener('click', () => dismiss('start'));
    continuation?.addEventListener('click', () => dismiss('continue'));
    deadline = setTimeout(() => dismiss('timeout'), 12000);
  } else resolveDismissed('no-overlay');

  function plan(url, fallback, priority) {
    if (!url) return;
    planned.add(absolute(url));
    // Every planned request is observed, including failures; an explicit replay can retry later.
    load(url, { fallback, priority }).catch(() => {});
  }
  const order = [...document.querySelectorAll('[data-media-id]')].map(element => element.dataset.mediaId);
  assets.forEach((asset, index) => {
    const position = order.indexOf(asset.id);
    const rank = position < 0 ? index : position;
    const original = asset.atlas || asset.file;
    const preferred = asset.optimizedAtlas || asset.atlas || asset.optimizedFile || asset.file;
    const poster = asset.optimizedPoster || asset.poster;
    if (poster) plan(poster, asset.poster, 85 - rank);
    plan(preferred, original, asset.id === 'hero-keyart' ? 100 : 70 - rank);
  });
  const loaderImage = document.getElementById('loader-potemkin');
  try {
    if (loaderImage && localStorage.getItem('potemkin-motion') === 'off') {
      const still = loaderImage.closest('picture')?.querySelector('source');
      if (still) {
        still.media = 'all';
        loaderImage.src = still.srcset;
      }
      document.documentElement.classList.add('motion-off');
    }
  } catch {}
  if (loaderImage) plan(loaderImage.currentSrc || loaderImage.getAttribute('src'), null, 110);
  announce();
})();
