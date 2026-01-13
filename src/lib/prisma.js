import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  log: ['error', 'warn'],
  errorFormat: 'minimal',
});

// Connection state tracking
let isConnected = false;
let connectionPromise = null;

/**
 * Ensure Prisma is connected before operations
 * Prevents "Engine is not yet connected" errors
 */
async function ensurePrismaConnection() {
  if (isConnected) return;
  
  if (connectionPromise) {
    await connectionPromise;
    return;
  }

  connectionPromise = (async () => {
    try {
      await prisma.$connect();
      // Wait a bit more to ensure engine is fully ready
      await new Promise(resolve => setTimeout(resolve, 500));
      isConnected = true;
      console.log('[Prisma] ✅ Database connected and ready');
    } catch (error) {
      console.error('[Prisma] ❌ Connection failed:', error.message);
      connectionPromise = null; // Reset on failure
      throw error;
    }
  })();

  await connectionPromise;
}

/**
 * Wrapped Prisma client that ensures connection before each operation
 */
const safePrisma = new Proxy(prisma, {
  get(target, prop) {
    // If accessing a model (like prisma.reminders)
    if (typeof target[prop] === 'object' && target[prop] !== null) {
      return new Proxy(target[prop], {
        get(modelTarget, modelProp) {
          const original = modelTarget[modelProp];
          
          // If it's a query method (findMany, count, create, etc.)
          if (typeof original === 'function') {
            return async function(...args) {
              await ensurePrismaConnection();
              return original.apply(modelTarget, args);
            };
          }
          
          return original;
        }
      });
    }
    
    // For direct methods like $connect, $disconnect
    const original = target[prop];
    if (typeof original === 'function' && prop.startsWith('$')) {
      return original.bind(target);
    }
    
    return original;
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('[Prisma] Disconnecting...');
  await prisma.$disconnect();
  isConnected = false;
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('[Prisma] Disconnecting...');
  await prisma.$disconnect();
  isConnected = false;
  process.exit(0);
});

process.on('beforeExit', async () => {
  await prisma.$disconnect();
  isConnected = false;
});

// Export both raw and safe versions
export { prisma, safePrisma, ensurePrismaConnection };
export default safePrisma;