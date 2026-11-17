// Environment config. Dev and Prod use different Firebase projects and backends.
// The site has no build step, so the environment is picked by hostname:
// plainer.co.uk is Prod; everything else (Netlify previews, localhost) is Dev.
// Firebase web config values are public identifiers, not secrets.
const environments = {
  prod: {
    name: 'prod',
    firebase: {
      apiKey: 'AIzaSyDRRcqoH41S5lFhwPDgo-S8S7bLIINE_qY',
      authDomain: 'plainer-prod-c4880.firebasestorage.app',
    },
    apiBaseUrl: 'https://plainer-trips-prod-537949589654.europe-west1.run.app',
  },
  dev: {
    name: 'dev',
    firebase: {
      apiKey: 'AIzaSyCsT_JRucFXOdDtCTWrWnaVhT3HPLhckTk',
      authDomain: 'plainer-dev.firebaseapp.com',
    },
    apiBaseUrl: 'https://plainer-trips-537949589654.europe-west1.run.app',
  },
};

// Map tiles for the trip map (shown with Leaflet). OpenStreetMap's public tile server needs no key but is meant for
// light use; to switch provider, change the URL and attribution here.
export const mapTiles = {
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
  maxZoom: 19,
};

const prodHosts = ['plainer.co.uk', 'www.plainer.co.uk'];

export const config = prodHosts.includes(location.hostname) ? environments.prod : environments.dev;
