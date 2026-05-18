/**
 * ==========================================
 * API-Level Security Dry Run Tests
 * Tests the actual Express backend behavior
 * ==========================================
 */

const http = require("http");

// Start the server (with a test DB)
const app = require("./src/index");

// Wait for server to start
setTimeout(() => {
  runTests();
}, 3000);

async function runTests() {
  console.log("\n🔍 Running API-Level Security Tests...\n");
  
  const port = process.env.PORT || 5000;
  const baseUrl = `http://localhost:${port}`;
  
  // Test 1: CORS Headers
  console.log("📋 Test: CORS Headers");
  try {
    const response = await fetch(`${baseUrl}/api/listings/categories`);
    const corsHeader = response.headers.get("access-control-allow-origin");
    console.log(`  Access-Control-Allow-Origin: ${corsHeader || "Not set"}`);
    
    // Check that CORS is properly configured
    if (!corsHeader || corsHeader === "*") {
      console.log("  ⚠️  WARNING: CORS might allow all origins");
    } else {
      console.log("  ✅ CORS is configured");
    }
  } catch (err) {
    console.log(`  ❌ Error: ${err.message}`);
  }
  
  // Test 2: Security Headers
  console.log("\n📋 Test: Security Headers");
  try {
    const response = await fetch(`${baseUrl}/api/listings/categories`);
    
    const securityHeaders = {
      "X-Frame-Options": response.headers.get("x-frame-options"),
      "X-Content-Type-Options": response.headers.get("x-content-type-options"),
      "Referrer-Policy": response.headers.get("referrer-policy"),
      "Strict-Transport-Security": response.headers.get("strict-transport-security"),
      "Permissions-Policy": response.headers.get("permissions-policy")
    };
    
    let headersOk = true;
    for (const [header, value] of Object.entries(securityHeaders)) {
      if (value) {
        console.log(`  ✅ ${header}: ${value}`);
      } else {
        console.log(`  ⚠️  ${header}: Not set`);
        headersOk = false;
      }
    }
    
    if (headersOk) {
      console.log("  ✅ All security headers present");
    }
  } catch (err) {
    console.log(`  ❌ Error: ${err.message}`);
  }
  
  // Test 3: Rate Limit Headers
  console.log("\n📋 Test: Rate Limit Headers");
  try {
    const response = await fetch(`${baseUrl}/api/listings/categories`);
    const rateLimit = response.headers.get("x-ratelimit-limit");
    const rateRemaining = response.headers.get("x-ratelimit-remaining");
    
    if (rateLimit) {
      console.log(`  ✅ Rate Limit: ${rateLimit}`);
      console.log(`  ✅ Remaining: ${rateRemaining}`);
    } else {
      console.log("  ⚠️  Rate limit headers not set (might need auth for some routes)");
    }
  } catch (err) {
    console.log(`  ❌ Error: ${err.message}`);
  }
  
  // Test 4: Invalid Listing ID
  console.log("\n📋 Test: Invalid Listing ID Handling");
  try {
    const response = await fetch(`${baseUrl}/api/listings/invalid-id`);
    const body = await response.json();
    
    if (response.status === 400 || response.status === 404) {
      console.log(`  ✅ Invalid ID properly rejected (status: ${response.status})`);
      console.log(`  Response: ${JSON.stringify(body)}`);
    } else {
      console.log(`  ⚠️  Invalid ID accepted or unexpected status: ${response.status}`);
    }
  } catch (err) {
    console.log(`  ❌ Error: ${err.message}`);
  }
  
  // Test 5: Missing Auth Token
  console.log("\n📋 Test: Missing Auth Token");
  try {
    const response = await fetch(`${baseUrl}/api/listings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Test" })
    });
    
    if (response.status === 401 || response.status === 403) {
      console.log(`  ✅ Auth required (status: ${response.status})`);
    } else {
      console.log(`  ⚠️  Unexpected status: ${response.status}`);
    }
  } catch (err) {
    console.log(`  ❌ Error: ${err.message}`);
  }
  
  // Test 6: Webhook CSRF Bypass
  console.log("\n📋 Test: Webhook CSRF Bypass");
  try {
    // Try to access a webhook endpoint without CSRF token
    const response = await fetch(`${baseUrl}/api/payments/paystack/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ test: "data" })
    });
    
    // Should NOT return 403 (CSRF should be bypassed for webhooks)
    if (response.status !== 403) {
      console.log(`  ✅ Webhook CSRF bypass working (status: ${response.status})`);
    } else {
      console.log(`  ⚠️  Webhook blocked by CSRF (status: ${response.status})`);
    }
  } catch (err) {
    console.log(`  ❌ Error: ${err.message}`);
  }
  
  console.log("\n✅ API-Level Security Tests Complete!");
  
  // Close the server
  process.exit(0);
}
