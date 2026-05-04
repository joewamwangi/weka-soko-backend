// Centralized error handling with proper logging and user-friendly messages

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Custom error class for API errors
 */
class ApiError extends Error {
  constructor(status, message, code = 'API_ERROR') {
    super(message);
    this.status = status;
    this.code = code;
    this.isOperational = true;
  }
}

/**
 * Error codes for client-side handling
 */
const ERROR_CODES = {
  // Authentication errors (401-403)
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
  
  // Validation errors (400)
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  MISSING_FIELD: 'MISSING_FIELD',
  INVALID_FORMAT: 'INVALID_FORMAT',
  
  // Resource errors (404)
  NOT_FOUND: 'NOT_FOUND',
  LISTING_NOT_FOUND: 'LISTING_NOT_FOUND',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  
  // Conflict errors (409)
  DUPLICATE_EMAIL: 'DUPLICATE_EMAIL',
  DUPLICATE_PHONE: 'DUPLICATE_PHONE',
  ALREADY_UNLOCKED: 'ALREADY_UNLOCKED',
  
  // Payment errors (402, 502)
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  PAYMENT_VALIDATION_FAILED: 'PAYMENT_VALIDATION_FAILED',
  INVALID_AMOUNT: 'INVALID_AMOUNT',
  
  // Rate limiting (429)
  RATE_LIMITED: 'RATE_LIMITED',
  
  // Server errors (500)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  THIRD_PARTY_ERROR: 'THIRD_PARTY_ERROR',
};

/**
 * Global error handler middleware
 */
function errorHandler(err, req, res, next) {
  // Log error for debugging (but don't leak details to client)
  const errorContext = {
    method: req.method,
    path: req.path,
    userId: req.user?.id,
    timestamp: new Date().toISOString(),
  };

  // Handle ApiError instances
  if (err instanceof ApiError) {
    console.error(`[API Error ${err.status}] ${err.code}: ${err.message}`, errorContext);
    
    return res.status(err.status).json({
      error: isProduction ? getSafeMessage(err.code) : err.message,
      code: err.code,
      status: err.status,
      ...(isProduction ? {} : { stack: err.stack }),
    });
  }

  // Handle PostgreSQL errors
  if (err.code && err.code.startsWith('23')) {
    // PostgreSQL error codes starting with 23 are integrity constraint violations
    console.error('[Database Error]', err.message, errorContext);
    
    let errorCode = ERROR_CODES.DATABASE_ERROR;
    let message = 'Database constraint violation';
    
    if (err.code === '23505') { // Unique violation
      if (err.constraint?.includes('email')) {
        errorCode = ERROR_CODES.DUPLICATE_EMAIL;
        message = 'An account with this email already exists';
      } else if (err.constraint?.includes('phone')) {
        errorCode = ERROR_CODES.DUPLICATE_PHONE;
        message = 'An account with this phone number already exists';
      }
    }
    
    return res.status(409).json({
      error: isProduction ? 'A conflict occurred' : message,
      code: errorCode,
      status: 409,
    });
  }

  // Handle JSON parsing errors
  if (err.type === 'entity.parse.failed') {
    console.error('[JSON Parse Error]', err.message, errorContext);
    return res.status(400).json({
      error: 'Invalid JSON format',
      code: ERROR_CODES.INVALID_FORMAT,
      status: 400,
    });
  }

  // Handle Multer errors (file upload)
  if (err.name === 'MulterError') {
    console.error('[File Upload Error]', err.message, errorContext);
    return res.status(400).json({
      error: err.code === 'LIMIT_FILE_SIZE' 
        ? 'File too large. Maximum size is 10MB' 
        : 'File upload failed',
      code: 'UPLOAD_ERROR',
      status: 400,
    });
  }

  // Default to 500 Internal Server Error
  console.error('[Unhandled Error]', err.message, errorContext);
  console.error(err.stack);

  return res.status(500).json({
    error: isProduction ? 'Something went wrong' : err.message,
    code: ERROR_CODES.INTERNAL_ERROR,
    status: 500,
    ...(isProduction ? {} : { stack: err.stack }),
  });
}

/**
 * Get safe error message for production
 */
function getSafeMessage(code) {
  const safeMessages = {
    [ERROR_CODES.INVALID_CREDENTIALS]: 'Invalid email or password',
    [ERROR_CODES.UNAUTHORIZED]: 'Authentication required',
    [ERROR_CODES.FORBIDDEN]: 'Access denied',
    [ERROR_CODES.ACCOUNT_SUSPENDED]: 'Account suspended',
    [ERROR_CODES.VALIDATION_ERROR]: 'Validation failed',
    [ERROR_CODES.MISSING_FIELD]: 'Required field missing',
    [ERROR_CODES.INVALID_FORMAT]: 'Invalid format',
    [ERROR_CODES.NOT_FOUND]: 'Resource not found',
    [ERROR_CODES.LISTING_NOT_FOUND]: 'Listing not found',
    [ERROR_CODES.USER_NOT_FOUND]: 'User not found',
    [ERROR_CODES.DUPLICATE_EMAIL]: 'Email already in use',
    [ERROR_CODES.DUPLICATE_PHONE]: 'Phone number already in use',
    [ERROR_CODES.ALREADY_UNLOCKED]: 'Listing already unlocked',
    [ERROR_CODES.PAYMENT_FAILED]: 'Payment failed',
    [ERROR_CODES.PAYMENT_VALIDATION_FAILED]: 'Payment validation failed',
    [ERROR_CODES.INVALID_AMOUNT]: 'Invalid payment amount',
    [ERROR_CODES.RATE_LIMITED]: 'Too many requests',
    [ERROR_CODES.INTERNAL_ERROR]: 'Internal server error',
    [ERROR_CODES.DATABASE_ERROR]: 'Database error',
    [ERROR_CODES.THIRD_PARTY_ERROR]: 'Third-party service error',
  };

  return safeMessages[code] || 'An error occurred';
}

/**
 * Create common error types easily
 */
function createError(status, message, code) {
  return new ApiError(status, message, code);
}

// Convenience methods
const errors = {
  badRequest: (message, code = ERROR_CODES.VALIDATION_ERROR) => 
    new ApiError(400, message, code),
  
  unauthorized: (message = 'Unauthorized', code = ERROR_CODES.UNAUTHORIZED) => 
    new ApiError(401, message, code),
  
  forbidden: (message = 'Forbidden', code = ERROR_CODES.FORBIDDEN) => 
    new ApiError(403, message, code),
  
  notFound: (message = 'Resource not found', code = ERROR_CODES.NOT_FOUND) => 
    new ApiError(404, message, code),
  
  conflict: (message = 'Conflict', code = ERROR_CODES.DUPLICATE_EMAIL) => 
    new ApiError(409, message, code),
  
  tooManyRequests: (message = 'Too many requests', code = ERROR_CODES.RATE_LIMITED) => 
    new ApiError(429, message, code),
  
  internal: (message = 'Internal server error', code = ERROR_CODES.INTERNAL_ERROR) => 
    new ApiError(500, message, code),
  
  paymentRequired: (message = 'Payment required', code = ERROR_CODES.PAYMENT_FAILED) => 
    new ApiError(402, message, code),
};

module.exports = {
  errorHandler,
  ApiError,
  ERROR_CODES,
  createError,
  errors,
  getSafeMessage,
};
