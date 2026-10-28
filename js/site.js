// Progressive enhancement only: every page works without this file.
(function () {
  var root = document.documentElement;
  root.classList.add('js');

  // Mobile menu: the <details> works natively; add outside-click and Esc to close.
  var menu = document.querySelector('.nav-menu');
  if (menu) {
    document.addEventListener('click', function (e) {
      if (menu.open && !menu.contains(e.target)) menu.open = false;
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menu.open) {
        menu.open = false;
        menu.querySelector('summary').focus();
      }
    });
    menu.addEventListener('click', function (e) {
      if (e.target.closest('a')) menu.open = false;
    });
  }

  // Copy email: the button ships hidden and is revealed only if the Clipboard API exists.
  var copyBtn = document.querySelector('[data-copy]');
  if (copyBtn && navigator.clipboard && navigator.clipboard.writeText) {
    var label = copyBtn.querySelector('[data-copy-label]');
    var status = document.querySelector('[data-copy-status]');
    var original = label.textContent;
    var timer;
    copyBtn.hidden = false;
    copyBtn.addEventListener('click', function () {
      navigator.clipboard.writeText(copyBtn.dataset.copy).then(function () {
        label.textContent = 'Copied';
        if (status) status.textContent = 'Email address copied to clipboard';
        clearTimeout(timer);
        timer = setTimeout(function () {
          label.textContent = original;
          if (status) status.textContent = '';
        }, 2000);
      });
    });
  }

  // Sticky download bar: show once the hero button is out of view, hide again at the final CTA.
  var bar = document.querySelector('[data-sticky-bar]');
  var heroBtn = document.querySelector('.hero__actions .btn-appstore');
  var finalCta = document.querySelector('#download');
  if (bar && heroBtn && 'IntersectionObserver' in window) {
    var heroVisible = true;
    var finalVisible = false;
    var update = function () {
      bar.classList.toggle('is-hidden', heroVisible || finalVisible);
    };
    update();
    new IntersectionObserver(function (entries) {
      heroVisible = entries[0].isIntersecting || entries[0].boundingClientRect.top > 0;
      update();
    }).observe(heroBtn);
    if (finalCta) {
      new IntersectionObserver(function (entries) {
        finalVisible = entries[0].isIntersecting;
        update();
      }).observe(finalCta);
    }
  }
})();
