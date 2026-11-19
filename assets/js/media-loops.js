(() => {
  'use strict';
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  document.querySelectorAll('.lazy-loop-video').forEach(video => {
    let visible = false;
    let loaded = false;
    const sync = () => {
      const animate = visible && !document.hidden && !motion.matches && !navigator.connection?.saveData;
      if (!animate) {
        video.pause();
        // Reduced-motion and data-saving visitors see the supplied poster.
        if (loaded && (motion.matches || navigator.connection?.saveData)) {
          video.querySelectorAll('source').forEach(source => source.removeAttribute('src'));
          video.removeAttribute('src'); video.load(); loaded = false;
        }
        return;
      }
      if (!loaded) {
        video.querySelectorAll('source[data-src]').forEach(source => { source.src = source.dataset.src; });
        video.preload = 'metadata'; video.load(); loaded = true;
      }
      video.muted = true;
      video.play().catch(() => {});
    };
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(entries => { visible = entries[0].isIntersecting; sync(); }, { threshold: 0.1 }).observe(video);
    } else {
      const check = () => { const r = video.getBoundingClientRect(); visible = r.bottom > 0 && r.top < innerHeight; sync(); };
      addEventListener('scroll', check, { passive: true }); addEventListener('resize', check); check();
    }
    motion.addEventListener('change', sync);
    document.addEventListener('visibilitychange', sync);
  });
})();
