(function () {
  const input = document.getElementById('address');
  if (!input) return;

  let radarKey = null;
  let debounceTimer = null;
  let activeIndex = -1;
  let suggestions = [];
  let requestId = 0;

  const wrapper = document.createElement('div');
  wrapper.className = 'address-autocomplete-wrap';
  input.parentNode.insertBefore(wrapper, input);
  wrapper.appendChild(input);

  const list = document.createElement('ul');
  list.className = 'address-suggestions';
  list.hidden = true;
  wrapper.appendChild(list);

  input.setAttribute('autocomplete', 'off');
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-autocomplete', 'list');

  function closeList() {
    list.hidden = true;
    list.innerHTML = '';
    suggestions = [];
    activeIndex = -1;
    input.setAttribute('aria-expanded', 'false');
  }

  function renderList() {
    if (!suggestions.length) {
      closeList();
      return;
    }
    list.innerHTML = suggestions
      .map(
        (s, i) =>
          `<li class="address-suggestion${i === activeIndex ? ' active' : ''}" data-index="${i}">${escapeHtml(s.formattedAddress || s.addressLabel || '')}</li>`
      )
      .join('');
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  async function fetchSuggestions(query) {
    if (!radarKey || query.trim().length < 4) {
      closeList();
      return;
    }
    const myRequestId = ++requestId;
    try {
      const res = await fetch(
        `https://api.radar.io/v1/search/autocomplete?query=${encodeURIComponent(query)}&limit=5&countryCode=US&layers=address,street`,
        { headers: { Authorization: radarKey } }
      );
      if (myRequestId !== requestId) return; // a newer request superseded this one
      if (!res.ok) {
        closeList();
        return;
      }
      const data = await res.json();
      suggestions = data.addresses || [];
      activeIndex = -1;
      renderList();
    } catch (e) {
      closeList();
    }
  }

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const query = input.value;
    debounceTimer = setTimeout(() => fetchSuggestions(query), 300);
  });

  input.addEventListener('keydown', (evt) => {
    if (list.hidden || !suggestions.length) return;
    if (evt.key === 'ArrowDown') {
      evt.preventDefault();
      activeIndex = Math.min(activeIndex + 1, suggestions.length - 1);
      renderList();
    } else if (evt.key === 'ArrowUp') {
      evt.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      renderList();
    } else if (evt.key === 'Enter') {
      if (activeIndex >= 0) {
        evt.preventDefault();
        selectSuggestion(activeIndex);
      }
    } else if (evt.key === 'Escape') {
      closeList();
    }
  });

  list.addEventListener('mousedown', (evt) => {
    const li = evt.target.closest('.address-suggestion');
    if (!li) return;
    evt.preventDefault();
    selectSuggestion(Number(li.dataset.index));
  });

  function selectSuggestion(index) {
    const s = suggestions[index];
    if (!s) return;
    input.value = s.formattedAddress || s.addressLabel || input.value;
    closeList();
  }

  document.addEventListener('click', (evt) => {
    if (!wrapper.contains(evt.target)) closeList();
  });

  fetch('/api/config')
    .then((res) => res.json())
    .then((data) => {
      radarKey = data.radarPublishableKey;
    })
    .catch(() => {});
})();
