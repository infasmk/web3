import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { RelayerEngine } from '../relayer/relayerEngine';
import { logger } from '../config';

const paymentSchema = z.object({
  token: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid token address'),
  customer: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid customer address'),
  amount: z.string().regex(/^[1-9]\d*$/, 'Amount must be a positive integer in base token units (wei)'),
  orderId: z.string().min(1, 'orderId is required'),
  metadata: z.record(z.unknown()).optional(),
});

const batchSchema = z.object({
  payments: z.array(paymentSchema).min(1, 'At least 1 payment required in batch')
});

export function createApiRouter(relayer: RelayerEngine): Router {
  const router = Router();

  /**
   * POST /api/v1/payments/process
   * Main checkout settlement endpoint.
   */
  router.post('/payments/process', async (req: Request, res: Response) => {
    try {
      const parsed = paymentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: parsed.error.format()
        });
      }

      const result = await relayer.processPayment(parsed.data);
      return res.status(200).json(result);
    } catch (error: any) {
      logger.error(`❌ Payment processing failed: ${error.message}`);
      return res.status(500).json({
        error: error.message || 'Failed to process payment',
        orderId: req.body?.orderId
      });
    }
  });

  /**
   * POST /api/v1/payments/batch
   * Batch process multiple payments in a single BSC transaction.
   */
  router.post('/payments/batch', async (req: Request, res: Response) => {
    try {
      const parsed = batchSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: parsed.error.format()
        });
      }

      const result = await relayer.batchProcessPayments(parsed.data);
      return res.status(200).json(result);
    } catch (error: any) {
      logger.error(`❌ Batch payment processing failed: ${error.message}`);
      return res.status(500).json({
        error: error.message || 'Failed to process batch payments'
      });
    }
  });

  /**
   * GET /api/v1/payments/readiness
   * Checks if customer balance and gateway allowance are sufficient before submitting order.
   */
  router.get('/payments/readiness', async (req: Request, res: Response) => {
    try {
      const { token, customer, amount } = req.query;
      if (!token || !customer || !amount) {
        return res.status(400).json({
          error: 'token, customer, and amount query parameters are required'
        });
      }

      const readiness = await relayer.checkCustomerReadiness(
        String(token),
        String(customer),
        String(amount)
      );

      return res.status(200).json(readiness);
    } catch (error: any) {
      return res.status(500).json({
        error: error.message || 'Failed to check customer readiness'
      });
    }
  });

  /**
   * GET /api/v1/payments/order/:orderId
   * Checks on-chain execution status of an orderId.
   */
  router.get('/payments/order/:orderId', async (req: Request, res: Response) => {
    try {
      const { orderId } = req.params;
      const isProcessed = await relayer.isOrderProcessed(orderId);
      return res.status(200).json({
        orderId,
        normalizedOrderId: relayer.normalizeOrderId(orderId),
        isProcessed
      });
    } catch (error: any) {
      return res.status(500).json({
        error: error.message || 'Failed to query order status'
      });
    }
  });

  /**
   * GET /api/v1/health
   * Monitor relayer BNB balance, pending nonce, and gateway readiness.
   */
  router.get('/health', async (_req: Request, res: Response) => {
    const health = await relayer.getHealth();
    const statusCode = health.status === 'unhealthy' ? 503 : 200;
    return res.status(statusCode).json(health);
  });

  return router;
}
