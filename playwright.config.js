const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  reporter: 'list',
  use: { baseURL: 'http://localhost:4173' },
  webServer: {
    command: 'node tests/serve.js',
    url: 'http://localhost:4173/',
    reuseExistingServer: true,
  },
});
