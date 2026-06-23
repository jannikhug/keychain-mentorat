const timeDisplay = document.getElementById('time');

function refreshTime() {
  timeDisplay.textContent = 'ZH - ' + new Date().toLocaleTimeString('de-CH', {
    timeZone: 'Europe/Berlin',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

refreshTime();
setInterval(refreshTime, 1000);

// Dark mode toggle
const toggleContainer = document.querySelector('.header-togglemode');
toggleContainer.innerHTML = `
  <span class="theme-btn" data-mode="light">Light </span>
  <span class="theme-sep"> | </span>
  <span class="theme-btn" data-mode="dark"> Dark</span>
`;

const buttons = toggleContainer.querySelectorAll('.theme-btn');

function applyTheme(mode) {
  document.documentElement.dataset.theme = mode;
  localStorage.setItem('theme', mode);
  buttons.forEach(btn => btn.classList.toggle('active', btn.dataset.mode === mode));
}

const saved = localStorage.getItem('theme');
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
applyTheme(saved ?? (prefersDark ? 'dark' : 'light'));

buttons.forEach(btn => btn.addEventListener('click', () => applyTheme(btn.dataset.mode)));

// Hamburger menu
const hamburger = document.querySelector('.header-hamburger');
const navOverlay = document.querySelector('.nav-overlay');

hamburger.addEventListener('click', () => {
  hamburger.classList.toggle('open');
  navOverlay.classList.toggle('open');
});
