// src/middleware/csrf.js
// CSRF protection middleware using double-submit cookie pattern

const csrfTokens = new Map();
const CSRF_SECRET = process.env.CSRF_SECRET || process.env.JWT_SECRET || "default-csrf-secret-change-in-production";
const TOKEN_SIZE = 32;

function generateToken() {
  const crypto = require("crypto");
  return crypto.randomBytes(TOKEN_SIZE).toString("hex");
}

function createCsrfToken(req, res, next) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    return next();
  }
  const existingToken = req.cookies?.csrf_token;
  if (existingToken && csrfTokens.has(existingToken)) {
    req.csrfToken = existingToken;
    return next();
  }
  const newToken = generateToken();
  csrfTokens.set(newToken, Date.now());
  setTimeout(() => csrfTokens.delete(newToken), 24 * 60 * 60 * 1000);
  req.csrfToken = newToken;
  res.setHeader("X-CSRF-Token", newToken);
  next();
}

function validateCsrfToken(req, res, next) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    return next();
  }
  const cookieToken = req.cookies?.csrf_token;
  const headerToken = req.headers["x-csrf-token"] || req.headers["x-xsrf-token"];
  const bodyToken = req.body?._csrf;
  const submittedToken = cookieToken || headerToken || bodyToken;
  if (!submittedToken) {
    return res.status(403).json({ error: "CSRF token missing" });
  }
  if (!csrfTokens.has(submittedToken)) {
    return res.status(403).json({ error: "Invalid or expired CSRF token" });
  }
  const tokenAge = Date.now() - csrfTokens.get(submittedToken);
  if (tokenAge > 24 * 60 * 60 * 1000) {
    csrfTokens.delete(submittedToken);
    return res.status(403).json({ error: "CSRF token expired" });
  }
  next();
}

function sameSiteStrict(req, res, next) {
  res.setHeader("Set-Cookie", `csrf_token=${req.csrfToken}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`);
  next();
}

module.exports = { createCsrfToken, validateCsrfToken, sameSiteStrict };