function initNav() {
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.querySelector('.main-nav');
  if (!toggle || !nav) return;
  toggle.addEventListener('click', () => {
    nav.classList.toggle('open');
  });

  const path = window.location.pathname.split('/').pop() || 'index.html';
  nav.querySelectorAll('a').forEach((a) => {
    const href = a.getAttribute('href');
    if (href === path || (path === '' && href === 'index.html')) {
      a.classList.add('active');
    }
  });
}

function formatPrice(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

function initFooterYear() {
  const el = document.getElementById('year');
  if (el) el.textContent = new Date().getFullYear();
}

function initScrollReveal() {
  if (!('IntersectionObserver' in window)) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const targets = document.querySelectorAll(
    '.card, .plan-card, .section-head, .trust-item, .ba-slider, .page-hero h1'
  );
  if (targets.length === 0) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
  );

  targets.forEach((el) => {
    el.classList.add('reveal');
    observer.observe(el);
  });

  // Safety net: guarantee content isn't stuck invisible if the observer
  // never fires for any reason.
  setTimeout(() => {
    targets.forEach((el) => el.classList.add('is-visible'));
    observer.disconnect();
  }, 3000);
}

function initVideoAutoplay() {
  const videos = document.querySelectorAll('.video-gallery video');
  if (videos.length === 0) return;

  if (!('IntersectionObserver' in window)) {
    videos.forEach((video) => video.play().catch(() => {}));
    return;
  }

  const visibleVideos = new Set();

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const video = entry.target;
        if (entry.isIntersecting) {
          visibleVideos.add(video);
          video.play().catch(() => {});
        } else {
          visibleVideos.delete(video);
          video.pause();
        }
      });
    },
    { threshold: 0.5 }
  );

  videos.forEach((video) => observer.observe(video));

  // Some mobile browsers (iOS Low Power Mode, strict autoplay policies)
  // block play() calls made outside a direct user gesture, which is what
  // the IntersectionObserver callback above is. Re-attempt play() on every
  // touch/scroll/click the user makes on the page — cheap no-ops once
  // videos are actually playing, but catches the case where the first
  // gesture doesn't land in time to unlock the in-flight play() call.
  function retryVisibleVideos() {
    visibleVideos.forEach((video) => {
      if (video.paused) video.play().catch(() => {});
    });
  }

  ['touchstart', 'scroll', 'click', 'keydown'].forEach((evt) =>
    document.addEventListener(evt, retryVisibleVideos, { passive: true })
  );
}

document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initFooterYear();
  initScrollReveal();
  initVideoAutoplay();
});
