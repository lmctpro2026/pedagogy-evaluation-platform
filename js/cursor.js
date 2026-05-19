// ===========================================================================
// Custom cursor — dot + circle with hover/click affordances
// ===========================================================================

(function () {
  if (window.matchMedia('(hover: none)').matches) return;

  // Inject cursor nodes
  const dot = document.createElement('div');
  dot.className = 'cursor-dot';
  const circle = document.createElement('div');
  circle.className = 'cursor-circle';
  document.body.appendChild(circle);
  document.body.appendChild(dot);
  document.documentElement.style.cursor = 'none';
  document.body.style.cursor = 'none';

  let mx = -100, my = -100, cx = -100, cy = -100;

  document.addEventListener('mousemove', e => {
    mx = e.clientX; my = e.clientY;
    dot.style.transform = `translate(${mx}px, ${my}px)`;
  });

  document.addEventListener('mouseleave', () => document.body.classList.add('cursor-hidden'));
  document.addEventListener('mouseenter', () => document.body.classList.remove('cursor-hidden'));

  function loop() {
    cx += (mx - cx) * 0.16;
    cy += (my - cy) * 0.16;
    circle.style.transform = `translate(${cx}px, ${cy}px)`;
    requestAnimationFrame(loop);
  }
  loop();

  const hoverSelector = 'a, button, .btn, .likert-option, .score-card, [data-hover]';
  document.addEventListener('mouseover', e => {
    if (e.target.closest && e.target.closest(hoverSelector)) {
      document.body.classList.add('is-hover');
      if (e.target.closest('button, .btn, .likert-option')) {
        document.body.classList.add('is-click');
      } else {
        document.body.classList.remove('is-click');
      }
    }
  });
  document.addEventListener('mouseout', e => {
    if (e.target.closest && e.target.closest(hoverSelector)) {
      document.body.classList.remove('is-hover');
      document.body.classList.remove('is-click');
    }
  });
})();
