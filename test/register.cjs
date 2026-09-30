/**
 * Test bootstrap.
 *
 * Compiled test code is plain CommonJS, so the three things Next.js normally provides
 * have to be supplied by hand:
 *
 *   - `@/…`               the path alias
 *   - `server-only`       a marker package that throws when imported outside a server
 *   - `stripe`            replaced with a recorder, so domain logic can be tested
 *                        without network access or real money
 *
 * Patching CommonJS resolution is enough, which keeps the test setup dependency-free.
 */
const Module = require("node:module")
const path = require("node:path")

// `src/lib/stripe.ts` validates its configuration before constructing a client, and
// the SDK is replaced below, so these only need to be well-formed. They are test
// values, and the platform defaults to test mode so nothing looks like real money.
process.env.STRIPE_SECRET_KEY ??= "sk_test_testonly"
process.env.STRIPE_SECRET_KEY_TEST ??= "sk_test_testonly"
process.env.TOLLBOOTH_FEE_BPS ??= "100"
process.env.TOLLBOOTH_FEE_FIXED ??= "0"
process.env.NODE_ENV = "test"

const ROOT = path.resolve(__dirname, "..")
const BUILD = path.join(ROOT, ".test-build")
const original = Module._resolveFilename

Module._resolveFilename = function (request, ...rest) {
  if (request === "server-only") return path.join(BUILD, "test", "stubs", "server-only.js")
  if (request === "stripe") return path.join(BUILD, "test", "fakes", "stripe.js")
  if (request.startsWith("@/")) return original.call(this, path.join(BUILD, "src", request.slice(2)), ...rest)
  return original.call(this, request, ...rest)
}
