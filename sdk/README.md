# @tollbooth/sdk

Zero-dependency client for the [Tollbooth](https://tollbooth.axxes.club) payment API. One `POST` to start a checkout, one signed webhook to hear about it.

```bash
npm install @tollbooth/sdk
```

```js
import { Tollbooth } from "@tollbooth/sdk"

const tollbooth = new Tollbooth({ apiKey: process.env.TOLLBOOTH_KEY })

const payment = await tollbooth.checkout.create({
  price: "vip_ticket",
  customer_email: "buyer@example.com",
  reference: "order_1234",
  success_url: "https://yoursite.com/thanks",
})

return Response.redirect(payment.checkout_url, 303)
```

The SDK adds an `Idempotency-Key` to every write and retries only what is safe to retry (network errors, `429`, `5xx`). It never retries a `402` or a `404`.

Requires Node 18+ (or any runtime with `fetch` and Web Crypto: Bun, Deno, Cloudflare Workers, modern browsers).
