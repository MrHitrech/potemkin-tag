(() => {
  'use strict';
  const assets = window.POTEMKIN_ASSETS, copy = window.POTEMKIN_CONTENT;
  if (!assets || !copy) return;
  const players = [], byElement = new WeakMap(), cache = window.PotemkinAssets;
  const lowPower = cache?.lowPower || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
  const paintInterval = 1000 / (lowPower ? 30 : 60);
  let motionOff = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let waiting = document.documentElement.classList.contains('is-loading'), raf = 0;
  const clamp = x => Math.max(0, Math.min(1, x));
  const ease = x => 1 - Math.pow(1 - clamp(x), 3);
  const sequenceDelay = asset => asset.id === 'victory-salute' ? .32 : .12;

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = async () => {
        try { if (image.decode) await image.decode(); resolve(image); }
        catch (error) { reject(error); }
      };
      image.onerror = reject;
      image.src = url;
    });
  }

  function frameAt(asset, time) {
    const milliseconds = Math.max(0, time) * 1000;
    let end = 0;
    for (let index = 0; index < asset.frameCount; index++) {
      end += asset.durations?.[index] || 1000 / (asset.fps || 12);
      if (milliseconds < end) return index;
    }
    return asset.frameCount - 1;
  }

  // Layout is measured on activation and resize, never in the animation loop.
  function measure(player) {
    const bounds = player.stage.getBoundingClientRect();
    const ratio = Math.min(devicePixelRatio || 1, 2);
    const width = Math.round(bounds.width * ratio), height = Math.round(bounds.height * ratio);
    if (width === player.width && height === player.height && ratio === player.ratio) return;
    player.width = width; player.height = height; player.ratio = ratio; player.dirty = true;
  }

  function clipEffect(ctx, effect, p, w, h) {
    ctx.beginPath();
    if (effect === 'rift') { const x = (w + h) * p - h; ctx.moveTo(x, 0); ctx.lineTo(x + h, h); ctx.lineTo(0, h); ctx.lineTo(0, 0); }
    else if (effect === 'scan') ctx.rect(0, 0, w, h * p);
    else if (effect === 'grasp') { ctx.rect(0, 0, w * p / 2, h); ctx.rect(w - w * p / 2, 0, w * p / 2, h); }
    else if (effect === 'ascent') { const y = h * (1 - p); ctx.moveTo(0, y); ctx.lineTo(w, y - h * .25); ctx.lineTo(w, h); ctx.lineTo(0, h); }
    else if (effect === 'rush') ctx.rect(0, 0, w * p, h);
    else if (effect === 'flick') ctx.arc(w * .78, h * .38, Math.hypot(w, h) * p, 0, Math.PI * 2);
    else if (effect === 'stamp') ctx.arc(w * .5, h * .5, Math.hypot(w, h) * .55 * p, 0, Math.PI * 2);
    else if (effect === 'fracture') { for (let row = 0; row < 10; row++) { const width = w * clamp(p * 1.4 - row * .04); ctx.rect(row % 2 ? w - width : 0, row * h / 10, width, h / 10 + 1); } }
    else if (effect === 'ember') { const size = 24; for (let y = 0; y < h; y += size) for (let x = 0; x < w; x += size) if (((x * 13 + y * 7) % 137) / 137 < p) ctx.rect(x, y, size + 1, size + 1); }
    else ctx.rect(0, h * (1 - p), w, h * p);
    ctx.clip();
  }

  // Extract and tint each original frame only once, then reuse it throughout its reveal.
  function compose(player, frame) {
    if (player.sourceFrame === frame) return;
    const { asset, source, sourceContext, silhouette, silhouetteContext, image } = player;
    const w = asset.width, h = asset.height;
    const sx = asset.frameCount > 1 ? (frame % asset.columns) * w : 0;
    const sy = asset.frameCount > 1 ? Math.floor(frame / asset.columns) * h : 0;
    sourceContext.clearRect(0, 0, w, h);
    sourceContext.drawImage(image, sx, sy, w, h, 0, 0, w, h);
    silhouetteContext.clearRect(0, 0, w, h);
    silhouetteContext.globalCompositeOperation = 'source-over';
    silhouetteContext.drawImage(source, 0, 0);
    silhouetteContext.globalCompositeOperation = 'source-in';
    silhouetteContext.fillStyle = player.ink;
    silhouetteContext.fillRect(0, 0, w, h);
    silhouetteContext.globalCompositeOperation = 'source-over';
    player.sourceFrame = frame;
  }

  function draw(player, time, final = false) {
    if (!player.image || player.width < 1 || player.height < 1) return;
    const { asset, canvas, ctx, width, height, ratio } = player;
    const frame = asset.frameCount > 1 ? frameAt(asset, final ? Infinity : time - sequenceDelay(asset)) : 0;
    const progress = final ? 1 : ease((time - .18) / 1.55);
    if (progress === 1 && player.lastFrame === frame && player.revealed && !player.dirty) return;
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    compose(player, frame);
    const scale = Math.min(width / asset.width, height / asset.height) * .97;
    const dw = asset.width * scale, dh = asset.height * scale;
    const shift = (1 - progress) * (player.effect === 'rush' ? -35 : player.effect === 'ascent' ? 0 : 16) * ratio;
    const lift = (1 - progress) * (player.effect === 'ascent' ? 30 : 0) * ratio;
    const x = (width - dw) / 2 + shift, y = (height - dh) / 2 + lift;
    ctx.clearRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = !asset.pixelArt;
    ctx.globalAlpha = final ? 1 : ease(time / .28);
    if (progress === 1) {
      // Once revealed, a still image or unchanged source frame needs one paint only.
      ctx.drawImage(asset.monochrome ? player.silhouette : player.source, x, y, dw, dh);
    } else {
      if (!asset.monochrome) {
        ctx.save(); ctx.globalAlpha *= .2 * (1 - progress);
        ctx.drawImage(player.silhouette, x - 13 * ratio, y + 5 * ratio, dw, dh); ctx.restore();
      }
      ctx.drawImage(player.silhouette, x, y, dw, dh);
      if (!asset.monochrome) {
        ctx.save(); ctx.translate(x, y); clipEffect(ctx, player.effect, progress, dw, dh);
        ctx.drawImage(player.source, 0, 0, dw, dh); ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
    player.lastFrame = frame; player.revealed = progress === 1; player.dirty = false;
    player.element.dataset.frame = String(frame);
    player.canvas.hidden = false; player.poster.hidden = true;
    player.element.querySelector('.image-fallback')?.setAttribute('hidden', '');
  }

  function showPoster(player) {
    const unavailable = player.poster.complete && !player.poster.naturalWidth;
    player.canvas.hidden = true;
    player.poster.hidden = unavailable;
    player.element.querySelector('.image-fallback')?.toggleAttribute('hidden', !unavailable);
  }

  async function ensure(player, retry = false) {
    if (player.image) return true;
    if (player.loading) return player.loading;
    const original = player.asset.atlas || player.asset.file;
    const preferred = player.asset.optimizedAtlas || player.asset.atlas || player.asset.optimizedFile || player.asset.file;
    player.loading = (cache ? cache.load(preferred, { fallback: original, priority: 200, retry }) : loadImage(preferred).catch(() => loadImage(original)))
      .then(image => {
        player.image = image;
        player.element.dataset.loaded = 'true';
        delete player.element.dataset.failed;
        return true;
      }).catch(() => {
        player.element.dataset.failed = 'true';
        showPoster(player);
        return false;
      }).finally(() => { player.loading = null; });
    return player.loading;
  }

  const runnable = player => player.visible && !player.done && player.image && !motionOff && !waiting && !document.hidden;
  function schedule() {
    if (!raf && players.some(runnable)) raf = requestAnimationFrame(tick);
  }
  function stopIfIdle() {
    if (raf && !players.some(runnable)) { cancelAnimationFrame(raf); raf = 0; }
  }
  function tick(now) {
    raf = 0;
    for (const player of players) {
      if (!runnable(player)) { player.lastTime = null; continue; }
      // Use actual elapsed time: a missed paint never stretches the original sequence.
      if (player.lastTime !== null) player.elapsed += Math.max(0, now - player.lastTime) / 1000;
      player.lastTime = now;
      if (player.elapsed >= player.duration) {
        player.done = true;
        player.element.classList.remove('is-playing');
        draw(player, player.elapsed, true);
        player.element.dataset.complete = 'true';
      } else if (now - player.lastPaint >= paintInterval - 1) {
        draw(player, player.elapsed);
        player.lastPaint = now;
      }
    }
    schedule();
  }

  async function activate(player, replay = false) {
    if (replay) {
      player.elapsed = 0; player.done = false; player.lastTime = null;
      player.lastFrame = -1; player.revealed = false;
      player.element.dataset.complete = 'false';
      player.element.classList.remove('is-playing');
    }
    if (motionOff) {
      player.done = true; showPoster(player);
      return;
    }
    if (waiting || !player.visible || document.hidden) return;
    if (!await ensure(player, replay)) return;
    if (motionOff || waiting || !player.visible || document.hidden) return;
    measure(player);
    if (player.done) { draw(player, player.elapsed, true); return; }
    player.element.classList.add('is-playing');
    draw(player, player.elapsed);
    player.lastTime = null;
    schedule();
  }

  const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    for (const entry of entries) {
      const player = byElement.get(entry.target);
      player.visible = entry.isIntersecting && entry.intersectionRatio > .05;
      if (player.visible) activate(player);
      else { player.lastTime = null; player.element.classList.remove('is-playing'); }
    }
    stopIfIdle();
  }, { threshold: [0, .08, .25] }) : null;
  const resizeObserver = 'ResizeObserver' in window ? new ResizeObserver(entries => {
    for (const entry of entries) {
      const player = byElement.get(entry.target.closest('[data-media-id]'));
      if (!player) continue;
      measure(player);
      if (player.visible && player.image && !motionOff && !waiting) draw(player, player.elapsed, player.done);
    }
  }) : null;

  document.querySelectorAll('[data-media-id]').forEach(element => {
    const asset = assets.find(item => item.id === element.dataset.mediaId);
    if (!asset) return;
    const canvas = element.querySelector('canvas'), source = document.createElement('canvas'), silhouette = document.createElement('canvas');
    if (!canvas) return;
    source.width = silhouette.width = asset.width; source.height = silhouette.height = asset.height;
    const player = {
      element, asset, canvas, ctx: canvas.getContext('2d'), source, sourceContext: source.getContext('2d'),
      silhouette, silhouetteContext: silhouette.getContext('2d'), stage: element.querySelector('.media-stage'),
      poster: element.querySelector('.media-poster'), ink: copy.media?.[asset.id]?.ink || '#bfec93', effect: element.dataset.effect,
      elapsed: 0, done: false, visible: false, image: null, loading: null, lastTime: null, lastPaint: -Infinity,
      width: 0, height: 0, ratio: 1, dirty: true, sourceFrame: -1, lastFrame: -1, revealed: false,
      duration: Math.max(1.73, (asset.durationSeconds || 0) + (asset.frameCount > 1 ? sequenceDelay(asset) : 0))
    };
    if (!player.ctx || !player.sourceContext || !player.silhouetteContext || !player.stage || !player.poster) return;
    players.push(player); byElement.set(element, player);
    element.querySelector('.replay-media')?.addEventListener('click', () => activate(player, true));
    let posterRetried = false;
    const posterError = () => {
      if (player.image && !player.canvas.hidden) return;
      const sources = player.poster.closest('picture')?.querySelectorAll('source');
      if (!posterRetried && sources?.length) {
        posterRetried = true;
        for (const source of sources) source.remove();
        player.poster.src = asset.poster || asset.file;
        return;
      }
      player.poster.hidden = true;
      element.querySelector('.image-fallback')?.removeAttribute('hidden');
    };
    player.poster.addEventListener('load', () => {
      if (player.canvas.hidden) player.poster.hidden = false;
      element.querySelector('.image-fallback')?.setAttribute('hidden', '');
    });
    player.poster.addEventListener('error', posterError);
    if (player.poster.complete && !player.poster.naturalWidth) posterError();
    resizeObserver?.observe(player.stage);
    if (observer) observer.observe(element);
    else { player.visible = true; activate(player); }
  });

  function refresh() {
    for (const player of players) {
      const bounds = player.element.getBoundingClientRect();
      player.visible = bounds.width > 0 && bounds.height > 0 && bounds.bottom > 0 && bounds.top < innerHeight && bounds.right > 0 && bounds.left < innerWidth;
      measure(player);
      if (player.visible) activate(player);
      else { player.lastTime = null; player.element.classList.remove('is-playing'); }
    }
    stopIfIdle();
  }
  window.PotemkinMotion = {
    setPaused(off) {
      motionOff = off;
      for (const player of players) {
        player.lastTime = null; player.element.classList.remove('is-playing');
        if (off) showPoster(player);
        else if (player.visible) activate(player, true);
      }
      stopIfIdle();
    },
    refresh,
    skip() {
      for (const player of players) if (player.visible) {
        player.done = true; player.lastTime = null;
        player.element.classList.remove('is-playing'); player.element.dataset.complete = 'true';
        if (player.image && !motionOff) draw(player, player.duration, true);
        else showPoster(player);
      }
      stopIfIdle();
    },
    getState() { return players.map(player => ({ id: player.asset.id, visible: player.visible, done: player.done, loaded: !!player.image, frame: Number(player.element.dataset.frame || 0) })); }
  };
  let resize;
  addEventListener('resize', () => { clearTimeout(resize); resize = setTimeout(refresh, 100); });
  document.addEventListener('potemkin:layout', refresh);
  document.addEventListener('visibilitychange', () => {
    for (const player of players) player.lastTime = null;
    if (document.hidden) {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      for (const player of players) player.element.classList.remove('is-playing');
    } else refresh();
  });
  cache?.dismissed.then(() => { waiting = false; refresh(); });
})();
