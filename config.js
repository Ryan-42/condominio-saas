// Dev  (live-server :5500 ou uvicorn :8000)  → aponta para o backend local
// Prod (Railway/Render, mesma origem)         → URL relativa (string vazia)
window.API_BASE = (
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1'
) ? `http://${window.location.hostname}:8000` : '';
