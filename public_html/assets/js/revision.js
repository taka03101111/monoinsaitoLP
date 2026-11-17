(() => {
  'use strict';
  document.querySelectorAll('a[href="#demoDataPolicy"]').forEach(link => {
    link.addEventListener('click', () => {
      const policy = document.getElementById('demoDataPolicy');
      const details = policy?.closest('details');
      if (details) details.open = true;
    });
  });
  const video = document.getElementById('introVideo');
  if (!video) return;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let inView = false;
  video.loop = true;
  video.muted = true;
  video.controls = false;
  const syncPlayback = () => {
    if (inView && !document.hidden && !reducedMotion.matches && !navigator.connection?.saveData) {
      // Autoplay can be blocked by browser policy; the poster remains as a fallback.
      video.play().catch(() => {});
    } else video.pause();
  };
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      inView = entries[0].isIntersecting;
      syncPlayback();
    }, { threshold: 0.1 });
    observer.observe(video);
  } else {
    inView = true;
    syncPlayback();
  }
  document.addEventListener('visibilitychange', syncPlayback);
  reducedMotion.addEventListener('change', syncPlayback);
})();
