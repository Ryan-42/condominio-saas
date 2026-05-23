/* Theme toggle — plain script, works on every page */
function toggleTheme() {
  var html = document.documentElement;
  var isDark = html.getAttribute('data-theme') === 'dark';
  var next = isDark ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  _syncToggleIcon(next);
  var btn = document.getElementById('theme-toggle');
  if (btn) {
    btn.classList.remove('theme-toggle--spinning');
    void btn.offsetWidth; /* reflow to restart animation */
    btn.classList.add('theme-toggle--spinning');
  }
}

function _syncToggleIcon(theme) {
  var btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
}

document.addEventListener('DOMContentLoaded', function () {
  _syncToggleIcon(localStorage.getItem('theme') || 'light');
});
