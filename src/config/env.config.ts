export default () => ({
  port: parseInt(process.env.PORT || '3001', 10),
  /** Where users land after Google OAuth (Nest redirects here). Must match your Next.js origin. */
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL,
    embeddingModel: process.env.OPENAI_EMBEDDING_MODEL,
  },
  // Google OAuth config for document ingestion
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_REDIRECT_URI,
    /** Optional absolute path for persisted tokens (default: `data/google-oauth.json` under cwd; on Vercel use `/tmp/...`). */
    oauthTokenPath:
      process.env.GOOGLE_OAUTH_TOKEN_PATH ||
      (process.env.VERCEL === '1' ? '/tmp/google-oauth.json' : undefined),
  },
});
