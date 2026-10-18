/* Sidekick: if the app can't start in this WebView (too old for the build), show what to update instead of a blank screen.
   A classic script, so it runs even where the app's module fails to parse. src/app/polyfills.ts sets __oracleRan first thing. */
(function () {
  var failed = false;
  window.addEventListener('error', function () { failed = true; });
  window.addEventListener('load', function () {
    setTimeout(function () {
      var app = document.getElementById('app');
      if (!window.__oracleRan || (failed && app && !app.firstChild)) location.replace('webview-update.html');
    }, 2000);
  });
})();
