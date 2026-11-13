// Environment config. Dev and Prod use different Firebase projects and backends.
// The site has no build step, so the environment is picked by hostname:
// plainer.co.uk is Prod; everything else (Netlify previews, localhost) is Dev.
// Firebase web config values are public identifiers, not secrets.
const environments = {
  prod: {
    name: 'prod',
    firebase: {
      apiKey: 'REPLACE_PROD_FIREBASE_API_KEY',
      authDomain: 'REPLACE_PROD_FIREBASE_AUTH_DOMAIN',
    },
    apiBaseUrl: 'REPLACE_PROD_API_BASE_URL',
  },
  dev: {
    name: 'dev',
    firebase: {
      apiKey: 'REPLACE_DEV_FIREBASE_API_KEY',
      authDomain: 'REPLACE_DEV_FIREBASE_AUTH_DOMAIN',
    },
    apiBaseUrl: 'REPLACE_DEV_API_BASE_URL',
  },
};

const prodHosts = ['plainer.co.uk', 'www.plainer.co.uk'];

export const config = prodHosts.includes(location.hostname) ? environments.prod : environments.dev;
