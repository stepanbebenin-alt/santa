const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

if (!html.includes('mqtt.min.js')) {
  html = html.replace(
    '<script src="https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js"></script>',
    '<script src="https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js"></script>\n  <!-- MQTT over WSS for real-time multi-phone sync even on static HTTPS hosts -->\n  <script src="https://unpkg.com/mqtt@5.3.4/dist/mqtt.min.js"></script>'
  );
}

const marker = '<!-- APPLICATION SCRIPTS -->';
const idx = html.indexOf(marker);
if (idx !== -1) {
  const files = [
    'brand-logos-data.js',
    'belarus-stores.js',
    'brand-data.js',
    'app-media-stores.js',
    'app-camera-voice.js',
    'app-ai-agents.js',
    'app-core.js'
  ];
  const combinedScripts = files
    .map(f => `<script>\n${fs.readFileSync(f, 'utf8')}\n</script>`)
    .join('\n  ');
  html = html.slice(0, idx) + marker + '\n  ' + combinedScripts + '\n</body>\n</html>\n';
  fs.writeFileSync('index.html', html, 'utf8');
  console.log('Re-bundled index.html cleanly! Size:', html.length);
}
