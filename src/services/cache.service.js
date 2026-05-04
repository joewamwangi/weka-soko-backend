// Redis caching service for performance
const Redis = require('ioredis');

let redis;
let isRedisAvailable = false;

// Initialize Redis connection
function initRedis() {
  if (process.env.REDIS_URL) {
    redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy: times => Math.min(times * 50, 2000),
    });

    redis.on('connect', () => {
      console.log('✅ Redis connected');
      isRedisAvailable = true;
    });

    redis.on('error', (err) => {
      console.error('❌ Redis error:', err.message);
      isRedisAvailable = false;
    });
  } else {
    console.log('⚠️  Redis not configured - caching disabled');
  }
}

/**
 * Get value from cache
 */
async function get(key) {
  if (!isRedisAvailable || !redis) return null;
  
  try {
    const value = await redis.get(key);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    console.error('Cache GET error:', error.message);
    return null;
  }
}

/**
 * Set value in cache with TTL
 */
async function set(key, value, ttlSeconds = 3600) {
  if (!isRedisAvailable || !redis) return false;
  
  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error('Cache SET error:', error.message);
    return false;
  }
}

/**
 * Delete value from cache
 */
async function del(key) {
  if (!isRedisAvailable || !redis) return false;
  
  try {
    await redis.del(key);
    return true;
  } catch (error) {
    console.error('Cache DEL error:', error.message);
    return false;
  }
}

/**
 * Cache middleware for Express routes
 */
function cacheMiddleware(ttlSeconds = 300) {
  return async (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') return next();

    const key = `cache:${req.originalUrl}`;
    
    // Try to get from cache
    const cached = await get(key);
    if (cached) {
      return res.json(cached);
    }

    // Store original json method
    const originalJson = res.json.bind(res);
    res.json = (data) => {
      // Cache the response
      set(key, data, ttlSeconds).catch(() => {});
      return originalJson(data);
    };

    next();
  };
}

/**
 * Invalidate cache for specific patterns
 */
async function invalidatePattern(pattern) {
  if (!isRedisAvailable || !redis) return false;
  
  try {
    const keys = await redis.keys(`cache:${pattern}*`);
    if (keys.length > 0) {
      await redis.del(...keys);
      console.log(`🗑️  Invalidated ${keys.length} cache keys`);
    }
    return true;
  } catch (error) {
    console.error('Cache invalidate error:', error.message);
    return false;
  }
}

module.exports = {
  initRedis,
  get,
  set,
  del,
  cacheMiddleware,
  invalidatePattern,
  isRedisAvailable: () => isRedisAvailable,
};
