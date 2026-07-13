function initBeforeAfterSliders() {
  document.querySelectorAll('.ba-slider').forEach((slider) => {
    const range = slider.querySelector('.ba-range');
    if (!range) return;

    const setPos = (value) => {
      slider.style.setProperty('--pos', `${value}%`);
    };

    setPos(range.value);
    range.addEventListener('input', () => setPos(range.value));
  });
}

document.addEventListener('DOMContentLoaded', initBeforeAfterSliders);
