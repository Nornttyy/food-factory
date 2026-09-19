// Independent of the module graph and image downloads: playable as soon as HTML is ready.
(() => {
  const get = id => document.getElementById(id);
  const overlay = get('loading'), menu = get('main-menu'), dough = get('loading-dough');
  const bar = get('loading-progress'), status = get('loading-status'), retry = get('loading-retry');
  let done = false, failed = false, count = 0, progress = 0, animation;
  const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let reduced;
  try { reduced = JSON.parse(localStorage.getItem('food-factory-preferences-v1') || '{}').reducedMotion; } catch { /* Private browsing still works. */ }
  function poke() {
    if (done) return;
    count++;
    get('loading-count').textContent = `揉了 ${count} 下`;
    animation?.cancel();
    if (reduced ?? motion?.matches) return;
    animation = dough.animate?.([
      { transform: 'scale(1.2,.76) rotate(-3deg)' },
      { transform: 'scale(.88,1.15) rotate(2deg)', offset: .36 },
      { transform: 'scale(1.05,.95)', offset: .65 },
      { transform: 'scale(1)' },
    ], { duration: 520, easing: 'ease-out' });
  }
  function fail() {
    if (done || failed) return;
    failed = true;
    clearTimeout(slowTimer);
    overlay.setAttribute('aria-busy', 'false');
    status.textContent = '没加载成功，再试一次';
    retry.hidden = false;
  }
  function bootError(event) {
    if (event.target?.id === 'factory-entry' || /\/src\/factory-[^/]+\.js/.test(event.filename || '')) fail();
  }
  const slowTimer = setTimeout(() => {
    if (done || failed) return;
    status.textContent = '还在准备，可以继续揉';
    retry.hidden = false;
  }, 12000);
  dough.addEventListener('click', poke);
  retry.addEventListener('click', () => window.location.reload());
  window.addEventListener('error', bootError, true);
  window.addEventListener('unhandledrejection', fail);
  window.factoryLoading = {
    progress(loaded, total) {
      if (done || failed || !Number.isFinite(loaded) || !Number.isFinite(total) || total <= 0) return;
      progress = Math.max(progress, Math.min(100, Math.round(loaded / total * 100)));
      bar.value = progress;
      get('loading-percent').textContent = `${progress}%`;
      if (loaded > 0) status.textContent = '摆好食材中…';
    },
    complete() {
      if (done) return;
      done = true;
      clearTimeout(slowTimer);
      animation?.cancel();
      dough.removeEventListener('click', poke);
      window.removeEventListener('error', bootError, true);
      window.removeEventListener('unhandledrejection', fail);
      const hadFocus = overlay.contains(document.activeElement);
      bar.value = 100;
      overlay.setAttribute('aria-busy', 'false');
      overlay.hidden = true;
      menu.inert = false;
      if (hadFocus) get('menu-play').focus({ preventScroll: true });
    },
    fail,
  };
})();
