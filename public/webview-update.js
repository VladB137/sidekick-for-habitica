/* Sidekick: the WebView version on public/webview-update.html, from the user agent ("… Chrome/67.0.3396.87 …").
   A file of its own, not inline, so the page works under the same Content-Security-Policy as the app. */
(function () {
  var m = /Chrome\/([\d.]+)/.exec(navigator.userAgent);
  if (!m) return;
  document.getElementById('version').textContent = m[1];
  document.getElementById('have').hidden = false;
})();
