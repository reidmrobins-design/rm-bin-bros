const keyGate = document.getElementById('keyGate');
const gateKeyInput = document.getElementById('adminKey');
const keyAlertBox = document.getElementById('keyAlertBox');
const loadMapBtn = document.getElementById('loadMapBtn');
const app = document.getElementById('canvassApp');

const STATUS_LABELS = {
  accepted: 'Accepted',
  declined: 'Declined',
  come_back: 'Come Back',
};

let adminKey = null;
let map = null;
let locationIqKey = null;
let meMarker = null;
let watchId = null;
let pendingLatLng = null;
let pendingTempMarker = null;
let activeMarkId = null;
const markerLayers = new Map(); // id -> Leaflet marker

const markPanel = document.getElementById('markPanel');
const markAddress = document.getElementById('markAddress');
const markNote = document.getElementById('markNote');
const cancelMarkBtn = document.getElementById('cancelMarkBtn');

const detailPanel = document.getElementById('detailPanel');
const detailAddress = document.getElementById('detailAddress');
const detailMeta = document.getElementById('detailMeta');
const detailNote = document.getElementById('detailNote');
const closeDetailBtn = document.getElementById('closeDetailBtn');
const deleteMarkBtn = document.getElementById('deleteMarkBtn');

const toast = document.getElementById('canvassToast');
let toastTimer = null;

function showToast(msg) {
  toast.textContent = msg;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 2600);
}

function apiFetch(path, options = {}) {
  return fetch(path, {
    ...options,
    headers: {
      'x-admin-key': adminKey,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
}

function divIcon(className) {
  return L.divIcon({
    className: '',
    html: `<div class="${className}"></div>`,
    iconSize: className === 'canvass-marker-me' ? [18, 18] : [26, 26],
    iconAnchor: className === 'canvass-marker-me' ? [9, 9] : [13, 26],
  });
}

function markerIconFor(status) {
  return divIcon(`canvass-marker canvass-marker-${status}`);
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso.replace(' ', 'T') + 'Z');
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function closePanels() {
  markPanel.hidden = true;
  detailPanel.hidden = true;
  if (pendingTempMarker) {
    map.removeLayer(pendingTempMarker);
    pendingTempMarker = null;
  }
  pendingLatLng = null;
  activeMarkId = null;
}

function addMarkerToMap(row) {
  const marker = L.marker([row.lat, row.lng], { icon: markerIconFor(row.status) }).addTo(map);
  marker.on('click', () => openDetailPanel(row.id));
  markerLayers.set(row.id, marker);
}

function updateMarkerOnMap(row) {
  const existing = markerLayers.get(row.id);
  if (existing) {
    existing.setIcon(markerIconFor(row.status));
  }
}

function removeMarkerFromMap(id) {
  const existing = markerLayers.get(id);
  if (existing) {
    map.removeLayer(existing);
    markerLayers.delete(id);
  }
}

const marksById = new Map();

async function loadMarks() {
  try {
    const res = await apiFetch('/api/canvass-marks');
    if (res.status === 401) {
      showToast('Invalid admin key.');
      localStorage.removeItem('rmBinBrosAdminKey');
      if (keyGate) {
        app.hidden = true;
        keyGate.hidden = false;
      }
      return;
    }
    if (!res.ok) {
      showToast('Could not load saved stops.');
      return;
    }
    const rows = await res.json();
    rows.forEach((row) => {
      marksById.set(row.id, row);
      addMarkerToMap(row);
    });
  } catch (e) {
    showToast('Network error loading stops.');
  }
}

function reverseGeocode(lat, lng) {
  if (!locationIqKey) {
    markAddress.textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    return;
  }
  fetch(`https://api.locationiq.com/v1/reverse?key=${encodeURIComponent(locationIqKey)}&lat=${lat}&lon=${lng}&format=json`)
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (pendingLatLng && pendingLatLng.lat === lat && pendingLatLng.lng === lng) {
        markAddress.textContent = data && data.display_name ? data.display_name : `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      }
    })
    .catch(() => {
      if (pendingLatLng && pendingLatLng.lat === lat && pendingLatLng.lng === lng) {
        markAddress.textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      }
    });
}

function openMarkPanel(latlng) {
  closePanels();
  pendingLatLng = { lat: latlng.lat, lng: latlng.lng };
  pendingTempMarker = L.marker(latlng, { icon: divIcon('canvass-marker canvass-marker-pending'), opacity: 0.85 }).addTo(map);
  markAddress.textContent = 'Looking up address…';
  markNote.value = '';
  markPanel.hidden = false;
  reverseGeocode(latlng.lat, latlng.lng);
}

async function saveMark(status) {
  if (!pendingLatLng) return;
  try {
    const res = await apiFetch('/api/canvass-marks', {
      method: 'POST',
      body: JSON.stringify({
        lat: pendingLatLng.lat,
        lng: pendingLatLng.lng,
        status,
        address: markAddress.textContent,
        note: markNote.value,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showToast(data.error || 'Could not save that stop.');
      return;
    }
    marksById.set(data.id, data);
    addMarkerToMap(data);
    closePanels();
    showToast(`Saved: ${STATUS_LABELS[status]}`);
  } catch (e) {
    showToast('Network error saving stop.');
  }
}

function openDetailPanel(id) {
  const row = marksById.get(id);
  if (!row) return;
  closePanels();
  activeMarkId = id;
  detailAddress.textContent = row.address || `${row.lat.toFixed(5)}, ${row.lng.toFixed(5)}`;
  detailMeta.textContent = `${STATUS_LABELS[row.status]} · ${formatDate(row.created_at)}`;
  detailNote.value = row.note || '';
  detailPanel.querySelectorAll('.canvass-status-btn').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.status === row.status);
  });
  detailPanel.hidden = false;
}

async function updateActiveMark(status) {
  if (!activeMarkId) return;
  try {
    const res = await apiFetch(`/api/canvass-marks/${activeMarkId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showToast(data.error || 'Could not update that stop.');
      return;
    }
    marksById.set(data.id, data);
    updateMarkerOnMap(data);
    closePanels();
    showToast(`Updated: ${STATUS_LABELS[status]}`);
  } catch (e) {
    showToast('Network error updating stop.');
  }
}

async function saveActiveNote() {
  if (!activeMarkId) return;
  const note = detailNote.value;
  try {
    const res = await apiFetch(`/api/canvass-marks/${activeMarkId}`, {
      method: 'PATCH',
      body: JSON.stringify({ note }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) marksById.set(data.id, data);
  } catch (e) {
    // best-effort; no toast needed for a background note save
  }
}

async function deleteActiveMark() {
  if (!activeMarkId) return;
  if (!confirm('Delete this stop?')) return;
  const id = activeMarkId;
  try {
    const res = await apiFetch(`/api/canvass-marks/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      showToast('Could not delete that stop.');
      return;
    }
    marksById.delete(id);
    removeMarkerFromMap(id);
    closePanels();
    showToast('Stop deleted.');
  } catch (e) {
    showToast('Network error deleting stop.');
  }
}

function placeMeMarker(lat, lng) {
  const latlng = [lat, lng];
  if (meMarker) {
    meMarker.setLatLng(latlng);
  } else {
    meMarker = L.marker(latlng, { icon: divIcon('canvass-marker-me'), zIndexOffset: 1000 }).addTo(map);
  }
}

function centerOnMe(zoom) {
  if (!navigator.geolocation) {
    showToast('Geolocation is not available on this device.');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;
      placeMeMarker(latitude, longitude);
      map.setView([latitude, longitude], zoom || 18);
    },
    () => {
      showToast('Could not get your location. Check location permissions.');
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

function startWatchingMe() {
  if (!navigator.geolocation || watchId !== null) return;
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      placeMeMarker(pos.coords.latitude, pos.coords.longitude);
    },
    () => {},
    { enableHighAccuracy: true }
  );
}

function initMap() {
  map = L.map('map', { zoomControl: true }).setView([39.5, -98.35], 4);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  map.on('click', (e) => openMarkPanel(e.latlng));

  document.querySelectorAll('#markPanel .canvass-status-btn').forEach((btn) => {
    btn.addEventListener('click', () => saveMark(btn.dataset.status));
  });
  document.querySelectorAll('#detailPanel .canvass-status-btn').forEach((btn) => {
    btn.addEventListener('click', () => updateActiveMark(btn.dataset.status));
  });
  detailNote.addEventListener('blur', saveActiveNote);
  cancelMarkBtn.addEventListener('click', closePanels);
  closeDetailBtn.addEventListener('click', closePanels);
  deleteMarkBtn.addEventListener('click', deleteActiveMark);
  document.getElementById('locateBtn').addEventListener('click', () => centerOnMe(18));

  loadMarks();

  fetch('/api/config')
    .then((res) => res.json())
    .then((data) => {
      locationIqKey = data.locationIqApiKey;
    })
    .catch(() => {});

  centerOnMe(18);
  startWatchingMe();
}

function openApp() {
  if (keyGate) keyGate.hidden = true;
  app.hidden = false;
  if (!map) initMap();
}

if (keyGate) {
  // Standalone canvass.html: gate the map behind its own admin-key form.
  loadMapBtn.addEventListener('click', () => {
    const key = gateKeyInput.value.trim();
    if (!key) {
      keyAlertBox.innerHTML = '<div class="alert alert-error">Enter your admin key first.</div>';
      return;
    }
    localStorage.setItem('rmBinBrosAdminKey', key);
    adminKey = key;
    openApp();
  });

  const savedKey = localStorage.getItem('rmBinBrosAdminKey');
  if (savedKey) {
    gateKeyInput.value = savedKey;
    adminKey = savedKey;
    openApp();
  }
} else {
  // Embedded on admin.html: no separate gate — reuse the admin key already
  // entered for the appointments table above, saved to localStorage when
  // "Load Appointments" is clicked.
  const placeholder = document.getElementById('canvassEmbedPlaceholder');

  function tryEmbeddedInit() {
    if (map) return;
    const key = localStorage.getItem('rmBinBrosAdminKey');
    if (!key) return;
    adminKey = key;
    if (placeholder) placeholder.hidden = true;
    initMap();
  }

  tryEmbeddedInit();
  const loadBtn = document.getElementById('loadBtn');
  if (loadBtn) {
    loadBtn.addEventListener('click', () => setTimeout(tryEmbeddedInit, 0));
  }
}
