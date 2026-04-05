// theme.js — InspectAI global theme switcher
(function() {
  var STORAGE_KEY = 'inspectai-theme';

  function getPreferred() {
    var saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
    // Default: light
    return 'light';
  }

  function apply(theme) {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    localStorage.setItem(STORAGE_KEY, theme);
  }

  // Apply immediately (before paint)
  apply(getPreferred());

  // Toggle function
  window.toggleTheme = function() {
    var current = getPreferred();
    apply(current === 'dark' ? 'light' : 'dark');
  };
})();
