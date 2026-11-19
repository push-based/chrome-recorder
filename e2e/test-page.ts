/** A fake site the tests record. Routed by the fixture, so no network. */
export const SITE = 'https://recorder.test';

export const PAGE = `<!doctype html>
<html lang="en">
  <head>
    <title>Recorder test page</title>
    <style>
      body { margin: 0; display: grid; place-items: center; height: 100vh; font: 48px system-ui; }
      #box { width: 120px; height: 120px; background: #7839ee; animation: spin 1s linear infinite; }
      @keyframes spin { to { transform: rotate(360deg); } }
    </style>
  </head>
  <body>
    <div id="box"></div>
    <p id="clock"></p>
    <script>
      setInterval(() => (document.getElementById('clock').textContent = performance.now().toFixed(0)), 16);
    </script>
  </body>
</html>`;
