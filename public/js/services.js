async function loadPlans() {
  const container = document.getElementById('plans');
  try {
    const res = await fetch('/api/services');
    const services = await res.json();
    if (!Array.isArray(services) || services.length === 0) {
      container.innerHTML = '<p>Plans are temporarily unavailable. Please check back soon.</p>';
      return;
    }
    container.innerHTML = services.map((s) => `
      <div class="plan-card ${s.key === 'monthly' ? 'popular' : ''}">
        ${s.key === 'monthly' ? '<span class="popular-tag">Most Popular</span>' : ''}
        <h3>${s.name}</h3>
        <div class="plan-cadence">${s.cadence}</div>
        <div class="plan-price">${formatPrice(s.price_cents)} <small>/ visit</small></div>
        <p class="desc">${s.description}</p>
        <a class="btn btn-secondary" href="booking.html?service=${s.id}">Book This Plan</a>
      </div>
    `).join('');
  } catch (e) {
    container.innerHTML = '<p>Could not load plans right now. Please refresh the page.</p>';
  }
}

loadPlans();
