function initBeforeAfterSliders() {
  document.querySelectorAll('.ba-slider').forEach((slider) => {
    const range = slider.querySelector('.ba-range');
    if (!range) return;

    const setPos = (value) => {
      slider.style.setProperty('--pos', `${value}%`);
      range.value = value;
    };

    setPos(range.value);
    range.addEventListener('input', () => setPos(range.value));

    // iOS Safari only lets you drag a range input's thumb, not jump to a
    // tap/drag anywhere on the track. Handle pointer events on the whole
    // slider area ourselves so dragging works from any starting point.
    let dragging = false;

    const posFromClientX = (clientX) => {
      const rect = slider.getBoundingClientRect();
      const pct = ((clientX - rect.left) / rect.width) * 100;
      return Math.min(100, Math.max(0, pct));
    };

    const stopDrag = (event) => {
      if (!dragging) return;
      dragging = false;
      if (slider.hasPointerCapture(event.pointerId)) {
        slider.releasePointerCapture(event.pointerId);
      }
    };

    slider.addEventListener('pointerdown', (event) => {
      dragging = true;
      slider.setPointerCapture(event.pointerId);
      range.focus({ preventScroll: true });
      setPos(posFromClientX(event.clientX));
    });

    slider.addEventListener('pointermove', (event) => {
      if (!dragging) return;
      setPos(posFromClientX(event.clientX));
    });

    slider.addEventListener('pointerup', stopDrag);
    slider.addEventListener('pointercancel', stopDrag);
  });
}

document.addEventListener('DOMContentLoaded', initBeforeAfterSliders);
