// Centralized logging utility with proper error tracking

const isProduction = process.env.NODE_ENV === 'production';
const logLevel = process.env.LOG_LEVEL || (isProduction ? 'error' : 'debug');

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  critical: 4,
};

const shouldLog = (level) => {
  return LOG_LEVELS[level.toLowerCase()] >= LOG_LEVELS[logLevel.toLowerCase()];
};

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

const levelColors = {
  debug: colors.cyan,
  info: colors.green,
  warn: colors.yellow,
  error: colors.red,
  critical: colors.magenta,
};

/**
 * Log a message with context
 */
function log(level, message, context = {}, error = null) {
  if (!shouldLog(level)) return;

  const timestamp = new Date().toISOString();
  const color = levelColors[level] || colors.reset;
  const levelStr = level.toUpperCase().padEnd(8);
  
  // Base log format
  let logOutput = `${timestamp} ${color}${levelStr}${colors.reset}: ${message}`;
  
  // Add context if provided
  if (Object.keys(context).length > 0) {
    logOutput += '\n' + JSON.stringify(context, null, 2);
  }
  
  // Add error details if provided
  if (error) {
    logOutput += `\nError: ${error.message}`;
    if (!isProduction && error.stack) {
      logOutput += `\n${error.stack}`;
    }
  }

  // Output to console
  if (level === 'error' || level === 'critical') {
    console.error(logOutput);
  } else {
    console.log(logOutput);
  }

  // TODO: Send to external logging service (Sentry, LogRocket, etc.)
  // if (isProduction && level === 'critical') {
  //   sendToLoggingService({ level, message, context, error, timestamp });
  // }
}

/**
 * Log payment-related events
 */
function logPayment(event, data) {
  log('info', `[Payment] ${event}`, {
    paymentId: data.paymentId,
    userId: data.userId,
    amount: data.amount,
    type: data.type,
    status: data.status,
    ...data
  });
}

/**
 * Log authentication events
 */
function logAuth(event, data) {
  log('info', `[Auth] ${event}`, {
    userId: data.userId,
    email: data.email,
    ip: data.ip,
    ...data
  });
}

/**
 * Log moderation events
 */
function logModeration(event, data) {
  log('warn', `[Moderation] ${event}`, {
    userId: data.userId,
    listingId: data.listingId,
    violation: data.violation,
    severity: data.severity,
    ...data
  });
}

/**
 * Log database errors
 */
function logDatabase(operation, error, context = {}) {
  log('error', `[Database] ${operation}`, {
    error: error.message,
    code: error.code,
    ...context
  }, error);
}

/**
 * Log third-party API calls
 */
function logApiCall(service, operation, status, context = {}) {
  const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
  log(level, `[${service}] ${operation}`, {
    status,
    ...context
  });
}

/**
 * Performance logging
 */
function logPerformance(operation, durationMs, context = {}) {
  if (durationMs > 1000) {
    log('warn', `[Performance] ${operation} took ${durationMs}ms`, context);
  } else if (shouldLog('debug')) {
    log('debug', `[Performance] ${operation} took ${durationMs}ms`, context);
  }
}

/**
 * Create a logger instance with prefix
 */
function createLogger(prefix) {
  return {
    debug: (msg, ctx) => log('debug', `[${prefix}] ${msg}`, ctx),
    info: (msg, ctx) => log('info', `[${prefix}] ${msg}`, ctx),
    warn: (msg, ctx) => log('warn', `[${prefix}] ${msg}`, ctx),
    error: (msg, ctx, err) => log('error', `[${prefix}] ${msg}`, ctx, err),
    critical: (msg, ctx, err) => log('critical', `[${prefix}] ${msg}`, ctx, err),
    
    payment: (event, data) => logPayment(event, { ...data, prefix }),
    auth: (event, data) => logAuth(event, { ...data, prefix }),
    moderation: (event, data) => logModeration(event, { ...data, prefix }),
  };
}

module.exports = {
  log,
  logPayment,
  logAuth,
  logModeration,
  logDatabase,
  logApiCall,
  logPerformance,
  createLogger,
  LOG_LEVELS,
};
