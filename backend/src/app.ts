import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import matchRoutes from './routes/matchRoutes';
import trainingRoutes from './routes/trainingRoutes';
import battleRoutes from './routes/battleRoutes';
import llmRoutes from './routes/llmRoutes';

// Load environment variables
dotenv.config();

export function createApp() {
  const app = express();

  // Middleware
  app.use((req, res, next) => {
    const allowedOrigin = process.env.CORS_ORIGIN ?? '*';
    const allowedHeaders = [
      'Content-Type',
      'Authorization',
      'Accept',
      'X-LLM-Base-Url',
      'X-LLM-Api-Key',
      'X-LLM-Model',
      'X-LLM-Timeout-Ms',
      'X-LLM-Prompt-Aggressive',
      'X-LLM-Prompt-Conservative',
      'X-LLM-Prompt-Balanced',
      'X-LLM-Seat0-Personality',
      'X-LLM-Seat1-Personality',
      'X-LLM-Seat2-Personality',
      'X-LLM-Seat3-Personality',
      'X-LLM-Decision-Mode',
      'X-LLM-Speech-Style',
      'X-LLM-Taunt-Level',
      'X-LLM-Profile-Aggressive',
      'X-LLM-Profile-Balanced',
      'X-LLM-Profile-Conservative',
      'X-Battle-Anti-Tribute',
      'X-Battle-Double-Down-Tribute',
      'X-Battle-Return-Tribute-Rule'
    ].join(', ');
    res.header('Access-Control-Allow-Origin', allowedOrigin);
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', allowedHeaders);

    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }

    return next();
  });
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Basic route
  app.get('/', (_req: Request, res: Response) => {
    res.json({
      message: 'Welcome to Guandan Training API',
      status: 'running',
      timestamp: new Date().toISOString()
    });
  });

  // Health check endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString()
    });
  });

  // API routes
  app.use('/api', matchRoutes);
  app.use('/api/training', trainingRoutes);
  app.use('/api/battle', battleRoutes);
  app.use('/api/llm', llmRoutes);

  return app;
}

export const app = createApp();

if (require.main === module) {
  const PORT = process.env.PORT || 8005;
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📡 API available at http://localhost:${PORT}`);
  });
}
