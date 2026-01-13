export default () => ({
  port: parseInt(process.env.PORT || '3001', 10),
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL,
    embeddingModel: process.env.OPENAI_EMBEDDING_MODEL,
  },
});
