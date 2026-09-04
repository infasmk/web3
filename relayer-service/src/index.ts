import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { CONFIG, logger } from './config';
import { RelayerEngine } from './relayer/relayerEngine';
import { createApiRouter } from './api/routes';

async function bootstrap() {
  const app = express();

  // Security & Parsing Middleware
  app.use(helmet());
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '1mb' }));

  // Initialize Relayer Core Engine
  const relayerEngine = new RelayerEngine();

  // API Routes
  app.use('/api/v1', createApiRouter(relayerEngine));

  // Root welcome
  app.get('/', (_req, res) => {
    res.json({
      service: 'BEP-20 Payment Gateway Relayer',
      network: 'BNB Smart Chain',
      chainId: CONFIG.BSC_CHAIN_ID,
      docs: '/api/v1/health'
    });
  });

  // Global Error Handler
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error(`Unhandled server error: ${err.stack || err.message}`);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  });

  const server = app.listen(CONFIG.PORT, CONFIG.HOST, () => {
    logger.info(`=======================================================`);
    logger.info(`⚡ BEP-20 Payment Gateway Relayer Service is running!`);
    logger.info(`🌍 Listening at http://${CONFIG.HOST}:${CONFIG.PORT}`);
    logger.info(`🔗 Chain: BNB Smart Chain (ID: ${CONFIG.BSC_CHAIN_ID})`);
    logger.info(`📍 Gateway: ${CONFIG.GATEWAY_CONTRACT_ADDRESS}`);
    logger.info(`💰 Treasury: ${CONFIG.TREASURY_ADDRESS}`);
    logger.info(`=======================================================`);
  });

  const shutdown = () => {
    logger.info('🛑 Shutting down relayer service...');
    server.close(() => {
      logger.info('Relayer service stopped.');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((err) => {
  logger.error('Fatal initialization error:', err);
  process.exit(1);
});
