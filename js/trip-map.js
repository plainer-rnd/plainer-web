// Trip map: every stop with a known place is pinned (numbered like the Route list) and joined in route order.
// Leaflet is loaded from the CDN only when a trip has something to show, so pages without a map never pay for it.
import { mapTiles } from './config.js';
import { el } from './dom.js';

const LEAFLET = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/';
const SRI = {
  'leaflet.css': 'sha512-Zcn6bjR/8RZbLEpLIeOwNtzREBAJnUKESxces60Mpoj+2okopSAcSUIUOseddDm0cxnGQzxIR7vJgsLZbdLE3w==',
  'leaflet.js': 'sha512-BwHfrr4c9kmRkLw6iXFdzcdWV/PGkVgiIyIWLLlTSXzWQzxuSg4DiQUCpauz/EWjgk5TYQqX/kvn9pG1NpYfqg==',
};

let loading = null;

function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = LEAFLET + 'leaflet.css';
    css.integrity = SRI['leaflet.css'];
    css.crossOrigin = 'anonymous';
    document.head.append(css);
    const script = document.createElement('script');
    script.src = LEAFLET + 'leaflet.js';
    script.integrity = SRI['leaflet.js'];
    script.crossOrigin = 'anonymous';
    script.onload = () => (window.L ? resolve(window.L) : reject(new Error('Leaflet missing')));
    script.onerror = () => { loading = null; reject(new Error('Leaflet failed to load')); };
    document.head.append(script);
  });
  return loading;
}

// `section` holds the map; `canvas` is the element Leaflet draws into. Both stay hidden until there are pins.
export function createTripMap({ section, canvas }) {
  let map = null;
  let layer = null;
  let lastShape = '';
  let version = 0;

  async function update(pins) {
    const mine = ++version;
    section.hidden = pins.length === 0;
    if (!pins.length) return;
    let L;
    try {
      L = await loadLeaflet();
    } catch (error) {
      section.hidden = true; // offline or blocked: the lists below say everything the map does
      return;
    }
    if (mine !== version) return;

    if (!map) {
      map = L.map(canvas, { scrollWheelZoom: false, worldCopyJump: true });
      L.tileLayer(mapTiles.url, { attribution: mapTiles.attribution, maxZoom: mapTiles.maxZoom }).addTo(map);
      layer = L.layerGroup().addTo(map);
    }
    // Pins always reflect the latest names and counts; the view only moves when the places themselves change.
    layer.clearLayers();
    const points = pins.map((pin) => [pin.latitude, pin.longitude]);
    if (pins.length > 1) L.polyline(points, { color: '#7B6FD6', weight: 3, opacity: .7, dashArray: '2 8', lineCap: 'round' }).addTo(layer);
    pins.forEach((pin) => {
      const icon = L.divIcon({ className: 'map-pin-wrap', html: '', iconSize: [30, 30], iconAnchor: [15, 15] });
      const marker = L.marker([pin.latitude, pin.longitude], { icon, title: `Stop ${pin.number}: ${pin.name}`, keyboard: true });
      marker.on('add', () => {
        const node = marker.getElement();
        if (!node) return;
        node.setAttribute('aria-label', `Stop ${pin.number}: ${pin.name}`);
        if (!node.firstChild) node.append(el('span', { class: 'map-pin', text: String(pin.number) }));
      });
      // Names are user data: the popup is built from DOM nodes, never from an HTML string.
      marker.bindPopup(el('div', { class: 'map-popup' }, [el('b', { text: `${pin.number}. ${pin.name}` }), el('span', { class: 'muted small', text: pin.meta })]));
      marker.addTo(layer);
    });

    const shape = JSON.stringify(points);
    if (shape !== lastShape) {
      lastShape = shape;
      if (pins.length === 1) map.setView(points[0], 8);
      else map.fitBounds(points, { padding: [32, 32], maxZoom: 10 });
    }
    map.invalidateSize();
  }

  return { update };
}
