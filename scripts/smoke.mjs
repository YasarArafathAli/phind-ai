/**
 * Phase 0 smoke checks: GET /health and GET /api (Swagger HTML).
 * Usage: npm run smoke
 * Optional: SMOKE_BASE=http://127.0.0.1:3001 npm run smoke
 */
const base = (process.env.SMOKE_BASE || 'http://localhost:3001').replace(/\/$/, '');

async function main() {
  const healthRes = await fetch(`${base}/health`);
  const healthJson = await healthRes.json();
  if (!healthRes.ok) {
    console.error('GET /health failed', healthRes.status, healthJson);
    process.exit(1);
  }
  console.log('GET /health', healthRes.status, healthJson);

  const apiRes = await fetch(`${base}/api`);
  const apiText = await apiRes.text();
  if (!apiRes.ok) {
    console.error('GET /api failed', apiRes.status);
    process.exit(1);
  }
  if (!apiText.includes('swagger') && !apiText.includes('Swagger')) {
    console.warn('GET /api: unexpected body (expected Swagger UI HTML)');
  }
  console.log('GET /api', apiRes.status, `(body length ${apiText.length})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
