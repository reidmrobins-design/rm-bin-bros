(function () {
  const section = document.getElementById('reviewsSection');
  const list = document.getElementById('reviewList');
  if (!section || !list) return;

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function formatAuthor(name) {
    const parts = String(name || '').trim().split(/\s+/);
    if (parts.length < 2) return parts[0] || 'Customer';
    return `${parts[0]} ${parts[parts.length - 1][0]}.`;
  }

  function starDisplay(rating) {
    return '★'.repeat(rating) + '☆'.repeat(5 - rating);
  }

  async function loadReviews() {
    try {
      const res = await fetch('/api/reviews');
      const data = await res.json();
      const reviews = (data.reviews || []).slice(0, 6);

      if (reviews.length === 0) return;

      list.innerHTML = reviews
        .map(
          (r) => `
        <div class="card review-card">
          <div class="review-stars">${starDisplay(r.rating)}</div>
          ${r.comment ? `<p>"${escapeHtml(r.comment)}"</p>` : ''}
          <div class="review-author">${escapeHtml(formatAuthor(r.customer_name))}</div>
        </div>
      `
        )
        .join('');

      section.style.display = '';
    } catch (e) {
      // Silently skip the section if reviews can't be loaded.
    }
  }

  loadReviews();
})();
