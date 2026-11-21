try {
  var mode = localStorage.getItem('theme');
  if (mode === 'light' || mode === 'dark') document.documentElement.dataset.theme = mode;
} catch (e) {
  // Storage blocked: the system theme applies.
}
