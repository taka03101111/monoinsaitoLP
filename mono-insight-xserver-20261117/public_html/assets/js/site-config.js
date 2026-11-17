/* Public configuration only. Never place API keys, SMTP credentials or signing secrets here. */
window.MONO_SITE = Object.freeze({
  formEndpoint: '/api/forms.php',
  gaMeasurementId: '', // Client supplies G-XXXXXXXXXX after analytics consent policy is agreed.
  loginEnabled: false, // Turn on only after the SaaS is confirmed live (11/23 or later).
  loginNotBefore: '2026-11-23T00:00:00+09:00',
  loginUrl: 'https://app.monoinsights.jp/',
  demoMode: ['localhost','127.0.0.1','[::1]'].includes(location.hostname) ? 'local' : 'sample',
});
