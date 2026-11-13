// Theme toggle. The initial theme is applied by the inline script in <head>
// (before first paint); this file only wires up the buttons.
(function () {
  var root = document.documentElement;

  function currentTheme() {
    return root.dataset.theme === 'dark' ? 'dark' : 'light';
  }

  function syncButtons() {
    var dark = currentTheme() === 'dark';
    var label = dark ? 'Switch to light theme' : 'Switch to dark theme';
    document.querySelectorAll('[data-theme-toggle]').forEach(function (button) {
      button.setAttribute('aria-label', label);
    });
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#26282C' : '#F6F6F3');
  }

  function setTheme(theme) {
    root.dataset.theme = theme;
    try { localStorage.setItem('plainerTheme', theme); } catch (e) { /* storage blocked: theme still applies for this page */ }
    syncButtons();
  }

  document.addEventListener('click', function (event) {
    if (!event.target.closest('[data-theme-toggle]')) return;
    setTheme(currentTheme() === 'dark' ? 'light' : 'dark');
  });

  syncButtons();
})();
