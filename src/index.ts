import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import { sql } from 'drizzle-orm';
import { env } from '@/config/env.js';
import { runMigrations } from '@/db/migrate.js';
import { testConnection, db } from '@/db/index.js';
import { systemStats } from '@/db/schema.js';
import { requireLicense } from '@/middleware/requireLicense.js';
import { validateLicense, createLicense, getLicenseStats, listLicenses, getLicenseById, deleteLicense, resetLicenseUsage, updateLicenseLimit } from '@/services/license.js';

console.log('Starting RankWrangler Server...');

// Run database migrations before starting server
await runMigrations();

// Initialize system stats row if it doesn't exist
try {
  await db.insert(systemStats)
    .values({
      id: 'current',
      productsInCache: 0,
      totalSpApiCalls: 0,
      totalCacheHits: 0
    })
    .onConflictDoNothing();
  console.log('[Server] System stats initialized');
} catch (error) {
  console.error('[Server] Failed to initialize system stats:', error);
  // Non-critical, continue server startup
}

// Test database connection
await testConnection();

const fastify = Fastify({
  logger: false  // Disable Pino logger to avoid bundling issues
});

// Register Fastify plugins
await fastify.register(helmet);
await fastify.register(cors, {
  origin: (origin, callback) => {
    const allowedOrigins = [
      'https://merchbase.co',
      'http://localhost:3000',
      'http://localhost:5173'
    ];
    
    // Allow Safari extension origins
    if (origin && origin.startsWith('safari-web-extension://')) {
      return callback(null, true);
    }
    
    // Allow requests with no origin (e.g., mobile apps, server-to-server)
    if (!origin) return callback(null, true);
    
    // Check if origin is in allowed list
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    return callback(new Error('Not allowed by CORS'), false);
  },
  credentials: true,
});

// Health check endpoint
fastify.get('/api/health', async (request, reply) => {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'rankwrangler-server'
  };
});

// API routes
fastify.register(async function (fastify) {
  fastify.post('/api/searchCatalog', async (request, reply) => {
    const { searchCatalog } = await import('@/services/spapi.js');
    const { z } = await import('zod');
    
    const searchCatalogSchema = z.object({
      keywords: z.array(z.string()).min(1, 'At least one keyword is required'),
    });

    try {
      const validatedData = searchCatalogSchema.parse(request.body);
      
      console.log(`[${new Date().toISOString()}] Searching catalog for keywords:`, validatedData.keywords);
      
      const results = await searchCatalog(validatedData.keywords);
      
      console.log(`[${new Date().toISOString()}] Found ${results.length} catalog items`);
      
      return {
        success: true,
        data: results,
      };
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error searching catalog:`, error);
      
      reply.status(500);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  });

  fastify.post('/api/getProductInfo', {
    preHandler: requireLicense
  }, async (request, reply) => {
    const { getProductInfo } = await import('@/services/spapi.js');
    const { z } = await import('zod');
    
    const getProductInfoSchema = z.object({
      marketplaceId: z.string().min(1, 'Marketplace ID is required'),
      asin: z.string().min(1, 'ASIN is required'),
    });

    try {
      const validatedData = getProductInfoSchema.parse(request.body);
      
      console.log(`[${new Date().toISOString()}] Getting product info for ASIN: ${validatedData.asin}, Marketplace: ${validatedData.marketplaceId}`);
      
      const productInfo = await getProductInfo(validatedData.marketplaceId, validatedData.asin);
      
      console.log(`[${new Date().toISOString()}] Retrieved product info for ASIN: ${validatedData.asin}`);
      console.log(`[${new Date().toISOString()}] Product info payload: ${JSON.stringify(productInfo)}`);
      
      return {
        success: true,
        data: productInfo,
      };
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error getting product info:`, error);
      
      reply.status(500);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  });

  // License validation endpoint (for extension)
  fastify.post('/api/license/validate', async (request, reply) => {
    const { z } = await import('zod');
    
    const validateLicenseSchema = z.object({
      licenseKey: z.string().min(1, 'License key is required'),
    });

    try {
      const { licenseKey } = validateLicenseSchema.parse(request.body);
      const validation = await validateLicense(licenseKey);
      
      if (validation.valid) {
        return {
          success: true,
          data: validation.data
        };
      } else {
        reply.status(401);
        return {
          success: false,
          error: validation.error
        };
      }
    } catch (error) {
      reply.status(400);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Invalid request',
      };
    }
  });

  // License status endpoint (requires valid license)
  fastify.get('/api/license/status', {
    preHandler: requireLicense
  }, async (request, reply) => {
    return {
      success: true,
      data: request.license
    };
  });

  // Admin endpoint to generate licenses (protected)
  fastify.post('/api/admin/license/generate', async (request, reply) => {
    const { z } = await import('zod');
    
    const generateLicenseSchema = z.object({
      email: z.string().email('Valid email is required'),
      adminKey: z.string().min(1, 'Admin key is required'),
      unlimited: z.boolean().optional().default(false),
    });

    try {
      const validatedData = generateLicenseSchema.parse(request.body);
      
      // Simple admin authentication (you might want to improve this)
      if (validatedData.adminKey !== env.LICENSE_SECRET) {
        reply.status(401);
        return {
          success: false,
          error: 'Invalid admin key'
        };
      }
      
      const license = await createLicense(
        validatedData.email,
        validatedData.unlimited
      );
      
      console.log(`[Admin] Generated license for ${validatedData.email}`);
      
      return {
        success: true,
        data: {
          licenseKey: license.key,
          email: license.email
        }
      };
    } catch (error) {
      console.error(`[Admin] Error generating license:`, error);
      reply.status(400);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Invalid request',
      };
    }
  });

  // Admin endpoint to get license statistics
  fastify.get('/api/admin/license/stats', async (request, reply) => {
    const { z } = await import('zod');
    
    const adminKeySchema = z.object({
      adminKey: z.string().min(1),
    });

    try {
      const { adminKey } = adminKeySchema.parse(request.query);
      
      if (adminKey !== env.LICENSE_SECRET) {
        reply.status(401);
        return {
          success: false,
          error: 'Invalid admin key'
        };
      }
      
      const stats = await getLicenseStats();
      
      return {
        success: true,
        data: stats
      };
    } catch (error) {
      reply.status(400);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Invalid request',
      };
    }
  });

  // Admin endpoint to list licenses
  fastify.get('/api/admin/license/list', async (request, reply) => {
    const { z } = await import('zod');
    
    const listLicensesSchema = z.object({
      adminKey: z.string().min(1)
    });

    try {
      const { adminKey } = listLicensesSchema.parse(request.query);
      
      if (adminKey !== env.LICENSE_SECRET) {
        reply.status(401);
        return {
          success: false,
          error: 'Invalid admin key'
        };
      }
      
      const licenses = await listLicenses();
      
      return {
        success: true,
        data: licenses
      };
    } catch (error) {
      reply.status(400);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Invalid request',
      };
    }
  });

  // Admin endpoint to get license details
  fastify.get('/api/admin/license/details', async (request, reply) => {
    const { z } = await import('zod');
    
    const getLicenseSchema = z.object({
      adminKey: z.string().min(1),
      searchBy: z.enum(['id', 'email', 'key']),
      value: z.string().min(1)
    });

    try {
      const { adminKey, searchBy, value } = getLicenseSchema.parse(request.query);
      
      if (adminKey !== env.LICENSE_SECRET) {
        reply.status(401);
        return {
          success: false,
          error: 'Invalid admin key'
        };
      }
      
      const license = await getLicenseById(searchBy, value);
      
      if (!license) {
        reply.status(404);
        return {
          success: false,
          error: 'License not found'
        };
      }
      
      return {
        success: true,
        data: license
      };
    } catch (error) {
      reply.status(400);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Invalid request',
      };
    }
  });

  // Admin endpoint to delete license
  fastify.post('/api/admin/license/delete', async (request, reply) => {
    const { z } = await import('zod');
    
    const deleteLicenseSchema = z.object({
      adminKey: z.string().min(1),
      licenseId: z.string().min(1)
    });

    try {
      const { adminKey, licenseId } = deleteLicenseSchema.parse(request.body);
      
      if (adminKey !== env.LICENSE_SECRET) {
        reply.status(401);
        return {
          success: false,
          error: 'Invalid admin key'
        };
      }
      
      const success = await deleteLicense(licenseId);
      
      if (!success) {
        reply.status(404);
        return {
          success: false,
          error: 'License not found'
        };
      }
      
      console.log(`[Admin] Deleted license ID: ${licenseId}`);
      
      return {
        success: true,
        message: 'License deleted successfully'
      };
    } catch (error) {
      reply.status(400);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Invalid request',
      };
    }
  });

  // Admin endpoint to clear product cache
  fastify.post('/api/admin/cache/clear', async (request, reply) => {
    const { z } = await import('zod');
    
    const clearCacheSchema = z.object({
      adminKey: z.string().min(1, 'Admin key is required'),
    });

    try {
      const { adminKey } = clearCacheSchema.parse(request.body);
      
      if (adminKey !== env.LICENSE_SECRET) {
        reply.status(401);
        return {
          success: false,
          error: 'Invalid admin key'
        };
      }
      
      // Clear all cached products
      const { productCache } = await import('@/db/schema.js');
      
      // First get count before deleting
      const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(productCache);
      const countBefore = countResult.count;
      
      // Delete all cache entries
      await db.delete(productCache);
      
      console.log(`[Admin] Cleared product cache: ${countBefore} entries removed`);
      
      return {
        success: true,
        data: {
          clearedCount: countBefore
        }
      };
    } catch (error) {
      console.error(`[Admin] Error clearing cache:`, error);
      reply.status(400);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Invalid request',
      };
    }
  });

  // Admin endpoint to reset license usage
  fastify.post('/api/admin/license/reset', async (request, reply) => {
    const { z } = await import('zod');
    
    const resetUsageSchema = z.object({
      adminKey: z.string().min(1),
      licenseId: z.string().min(1)
    });

    try {
      const { adminKey, licenseId } = resetUsageSchema.parse(request.body);
      
      if (adminKey !== env.LICENSE_SECRET) {
        reply.status(401);
        return {
          success: false,
          error: 'Invalid admin key'
        };
      }
      
      const success = await resetLicenseUsage(licenseId);
      
      if (!success) {
        reply.status(404);
        return {
          success: false,
          error: 'License not found'
        };
      }
      
      console.log(`[Admin] Reset usage for license ID: ${licenseId}`);
      
      return {
        success: true,
        message: 'License usage reset successfully'
      };
    } catch (error) {
      reply.status(400);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Invalid request',
      };
    }
  });

  // Admin endpoint to reset or update license limit
  fastify.post('/api/admin/license/reset-limit', async (request, reply) => {
    const { z } = await import('zod');

    const resetLimitSchema = z.object({
      adminKey: z.string().min(1),
      licenseId: z.string().min(1),
      limit: z.number().int().min(-1).max(1_000_000).optional(),
    });

    try {
      const { adminKey, licenseId, limit } = resetLimitSchema.parse(request.body);

      if (adminKey !== env.LICENSE_SECRET) {
        reply.status(401);
        return {
          success: false,
          error: 'Invalid admin key'
        };
      }

      const targetLimit = limit ?? 100_000;
      const success = await updateLicenseLimit(licenseId, targetLimit);

      if (!success) {
        reply.status(404);
        return {
          success: false,
          error: 'License not found'
        };
      }

      console.log(`[Admin] Updated limit for license ID: ${licenseId} to ${targetLimit}`);

      return {
        success: true,
        message: 'License limit updated successfully',
        data: {
          licenseId,
          limit: targetLimit
        }
      };
    } catch (error) {
      reply.status(400);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Invalid request',
      };
    }
  });
});

// 404 handler
fastify.setNotFoundHandler(async (request, reply) => {
  reply.status(404);
  return {
    success: false,
    error: 'Route not found'
  };
});

// Error handler
fastify.setErrorHandler(async (error, request, reply) => {
  console.error(`[${new Date().toISOString()}] Unhandled error:`, error);
  reply.status(500);
  return {
    success: false,
    error: 'Internal server error'
  };
});

const port = env.PORT;

console.log(`Attempting to start server on port ${port}...`);

try {
  // Start Fastify server
  await fastify.listen({ port, host: '0.0.0.0' });
  
  console.log(`[${new Date().toISOString()}] RankWrangler Server running on port ${port}`);
  console.log(`[${new Date().toISOString()}] Health check: http://localhost:${port}/api/health`);
  console.log(`[${new Date().toISOString()}] API endpoints: http://localhost:${port}/api/searchCatalog, http://localhost:${port}/api/getProductInfo`);
} catch (err) {
  console.error('Failed to start server:', err);
  process.exit(1);
}
