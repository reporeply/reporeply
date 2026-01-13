export function setupErrorHandlers(app) {
  // Global error handler
  app.use((error, req, res, next) => {
    console.error('[Error Handler]', {
      name: error.name,
      message: error.message,
      stack: error.stack,
    });

    const statusCode = error.statusCode || 500;
    const message = error.isOperational 
      ? error.message 
      : 'An unexpected error occurred';

    res.status(statusCode).json({
      error: {
        message,
        timestamp: error.timestamp || new Date().toISOString(),
      },
    });
  });

  // Handle unhandled rejections
  process.on('unhandledRejection', (reason, promise) => {
    console.error('[Unhandled Rejection]', reason);
  });

  process.on('uncaughtException', (error) => {
    console.error('[Uncaught Exception]', error);
    process.exit(1);
  });
}