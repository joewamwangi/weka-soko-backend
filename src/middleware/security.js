// src/middleware/security.js
const rateLimit = require("express-rate-limit");
const { body, query, validationResult } = require("express-validator");
const xss = require("xss-clean");

const TRUSTED_ORIGINS = [
  process.env.FRONTEND_URL,
  process.env.ADMIN_URL,
  "http://localhost:3000",
  "http://localhost:3001",
].filter(Boolean);

const isVercelPreview = (origin) =>
  /^https:\/\/weka-soko[^.]*\.vercel\.app$/.test(origin);

const isRailwayPreview = (origin) =>
  /^https:\/\/[^-]+-[^-]+-[^-]+\.railway\.app$/.test(origin);

function corsOrigin(origin, callback) {
  if (!origin) return callback(null, true);
  if (TRUSTED_ORIGINS.includes(origin)) return callback(null, true);
  if (isVercelPreview(origin)) return callback(null, true);
  if (isRailwayPreview(origin)) return callback(null, true);
  if (process.env.NODE_ENV === "development") return callback(null, true);
  callback(null, false);
}

function csrfProtection(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const token = req.headers["x-csrf-token"];
  const session = req.headers["x-session-id"];
  if (process.env.NODE_ENV === "development") return next();
  if (!token || !session) {
    return res.status(403).json({ error: "Missing security headers" });
  }
  next();
}

function validationErrorHandler(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: "Validation failed",
      details: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  next();
}

const loginValidators = [
  body("email")
    .isEmail()
    .normalizeEmail()
    .withMessage("Valid email required"),
  body("password")
    .isLength({ min: 1, max: 128 })
    .withMessage("Password required"),
];

const registerValidators = [
  body("name")
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Name must be 2-100 characters")
    .matches(/^[a-zA-Z0-9\s'-]+$/)
    .withMessage("Name contains invalid characters"),
  body("email")
    .isEmail()
    .normalizeEmail()
    .withMessage("Valid email required"),
  body("password")
    .isLength({ min: 8, max: 128 })
    .withMessage("Password must be 8-128 characters")
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage("Password must contain uppercase, lowercase, and number"),
  body("phone")
    .optional()
    .matches(/^(\+254|0)[1-9]\d{8}$/)
    .withMessage("Invalid Kenyan phone number"),
];

const listingValidators = [
  body("title")
    .trim()
    .isLength({ min: 3, max: 200 })
    .withMessage("Title must be 3-200 characters"),
  body("description")
    .optional()
    .isLength({ min: 0, max: 5000 })
    .withMessage("Description must be under 5000 characters"),
  body("price")
    .isFloat({ min: 0, max: 999999999 })
    .withMessage("Invalid price"),
  body("category")
    .optional()
    .isIn([
      "vehicles", "property", "electronics", "furniture",
      "fashion", "sports", "tools", "books", "services", "jobs", "other"
    ])
    .withMessage("Invalid category"),
  body("condition")
    .optional()
    .isIn(["new", "like_new", "good", "fair", "poor"])
    .withMessage("Invalid condition"),
];

const messageValidators = [
  body("body")
    .trim()
    .isLength({ min: 1, max: 2000 })
    .withMessage("Message must be 1-2000 characters")
    .custom((value) => {
      if (/<script|javascript:|on\w+=/i.test(value)) {
        throw new Error("Invalid characters in message");
      }
      return true;
    }),
];

const chatLookupValidators = [
  query("listingId")
    .isInt({ min: 1 })
    .withMessage("Valid listing ID required"),
];

function sanitizeInput(req, res, next) {
  if (req.body) {
    req.body = xss(req.body);
    for (const key of Object.keys(req.body)) {
      if (typeof req.body[key] === "string") {
        req.body[key] = req.body[key].slice(0, 10000);
      }
    }
  }
  if (req.query) {
    for (const key of Object.keys(req.query)) {
      if (typeof req.query[key] === "string") {
        req.query[key] = xss(req.query[key]);
      }
    }
  }
  next();
}

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
  keyGenerator: (req) => {
    return req.user?.id || req.ip;
  },
  skip: (req) => req.path === "/health",
});

const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: "Search rate limit exceeded. Please slow down." },
});

const listingCreateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { error: "Listing creation limit reached. Try again later." },
  keyGenerator: (req) => req.user?.id || req.ip,
});

const paymentLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: "Payment attempts limited. Please wait." },
  keyGenerator: (req) => req.user?.id || req.ip,
});

const aiSearchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: "AI search limit reached. Please wait." },
  keyGenerator: (req) => req.user?.id || req.ip,
});

const inMemoryFailedAttempts = new Map();
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000;

function bruteForceProtection(req, res, next) {
  const ip = req.ip;
  const now = Date.now();
  const record = inMemoryFailedAttempts.get(ip);

  if (record) {
    if (now - record.timestamp < LOCKOUT_DURATION) {
      if (record.attempts >= MAX_LOGIN_ATTEMPTS) {
        const waitTime = Math.ceil((LOCKOUT_DURATION - (now - record.timestamp)) / 1000);
        return res.status(429).json({
          error: "Too many login attempts. Please wait.",
          retryAfter: waitTime,
        });
      }
    } else {
      inMemoryFailedAttempts.delete(ip);
    }
  }
  next();
}

function recordFailedAttempt(req) {
  const ip = req.ip;
  const record = inMemoryFailedAttempts.get(ip) || { attempts: 0, timestamp: Date.now() };
  record.attempts += 1;
  record.timestamp = Date.now();
  inMemoryFailedAttempts.set(ip, record);
}

function clearFailedAttempts(req) {
  inMemoryFailedAttempts.delete(req.ip);
}

module.exports = {
  corsOrigin,
  csrfProtection,
  validationErrorHandler,
  loginValidators,
  registerValidators,
  listingValidators,
  messageValidators,
  chatLookupValidators,
  sanitizeInput,
  apiLimiter,
  searchLimiter,
  listingCreateLimiter,
  paymentLimiter,
  aiSearchLimiter,
  bruteForceProtection,
  recordFailedAttempt,
  clearFailedAttempts,
};