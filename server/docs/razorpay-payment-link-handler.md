# Razorpay Payment Link Payment Handler

- Handler name: `dev.mock.razorpay_payment_handler`
- Handler ID used by this sample: `razorpay_mock_payment_handler`
- Handler version: `2026-04-08`
- Instrument type: `hosted_checkout`
- Provider: Razorpay Payment Links

> This document specifies the project-specific Razorpay handler implemented by
> `server/`. It is not an official Razorpay UCP specification. The
> document follows the UCP `2026-08-25` payment-handler template, while the
> sample server currently advertises UCP and handler version `2026-04-08`.

## Introduction

This handler lets a UCP Business accept payment through a Razorpay-hosted
Payment Link. The Platform selects the handler when completing a checkout. The
Business calculates the authoritative amount from the checkout, reserves the
inventory, creates a single-use payment attempt and returns the hosted payment
URL.

Because the buyer completes payment outside the UCP request, completion is
asynchronous:

```text
Platform                 Business                    Razorpay
   |                         |                           |
   | Complete Checkout       |                           |
   |------------------------>| create Payment Link       |
   |                         |-------------------------->|
   | complete_in_progress    |                           |
   | + payment_url           |                           |
   |<------------------------|                           |
   |                                                     |
   | Buyer opens payment_url and pays                    |
   |---------------------------------------------------->|
   |                         | payment_link.paid webhook |
   |                         |<--------------------------|
   |                         | verify captured payment   |
   |                         | create order              |
   | Get Checkout            |                           |
   |------------------------>|                           |
   | completed + order       |                           |
   |<------------------------|                           |
```

### Key Benefits

- The Platform never handles raw card, bank-account or UPI credentials.
- The Business remains authoritative for checkout amount and currency.
- Payment capture is verified server-to-server before the order is created.
- Webhook processing and UCP idempotency prevent duplicate finalization.

### Integration Guide

| Participant | Integration section |
|---|---|
| Business | [Business Integration](#business-integration) |
| Platform | [Platform Integration](#platform-integration) |
| Razorpay | [Razorpay Integration](#razorpay-integration) |

## Participants

| Participant | Role | Prerequisites |
|---|---|---|
| Business | Advertises the handler, creates Payment Links, verifies provider state and creates the order | Razorpay account, API keys and webhook secret |
| Platform | Discovers the handler, submits the hosted-checkout instrument, presents the payment URL and retrieves the final checkout | UCP Checkout client and ability to open HTTPS URLs |
| Razorpay | Hosts the buyer payment experience and reports provider payment state | Business activated/onboarded with Razorpay |
| Buyer | Chooses a payment method and pays on the Razorpay-hosted page | A payment method accepted by the Business's Razorpay account |

In this specification, **Business** corresponds to Razorpay's usual
**merchant** terminology.

## Business Integration

### Prerequisites

Before advertising this handler, the Business MUST:

1. Create and activate a Razorpay account.
2. Obtain a Key ID and Key Secret for the intended Razorpay mode.
3. Configure automatic capture, or otherwise ensure a payment reaches
   `captured` before treating it as paid.
4. Configure an HTTPS webhook endpoint for the required payment events.
5. Generate a webhook secret independent from the Razorpay API Key Secret.
6. Store all secrets only in server-side secret storage.

Prerequisites output:

| Field | Description |
|---|---|
| `RAZORPAY_KEY_ID` | Razorpay API key identifier. It may be returned as public runtime data when needed by a browser integration. |
| `RAZORPAY_KEY_SECRET` | Server-only API credential. It MUST NOT appear in UCP discovery or checkout responses. |
| `RAZORPAY_WEBHOOK_SECRET` | Server-only secret used to validate the raw webhook body. It MUST NOT appear in UCP discovery or checkout responses. |
| Razorpay account identity | The Business/merchant account associated with the API credentials. This sample does not expose it as a UCP `PaymentIdentity`. |

In this sample these values are loaded from the server `.env` file. They are
operational credentials, not buyer-supplied UCP payment credentials.

### Handler Configuration

Businesses advertise support in `ucp.payment_handlers`.

#### Handler Schema

The sample does not currently publish a handler JSON Schema at a stable HTTPS
URL. Until one is published, the declaration is project-local and must not be
presented as an official `com.razorpay` handler.

The intended schema has these UCP contexts:

| Config variant | Context | Purpose |
|---|---|---|
| `business_config` | Business discovery | Advertises public environment and Payment Link support. |
| `platform_config` | Platform discovery | Declares that the Platform can present a hosted payment URL and retrieve checkout state. |
| `response_config` | Checkout responses | Returns the created Payment Link and its payment state for one checkout. |

#### Business Config Fields

The current sample advertises an empty `config`. A publishable handler should
define the following public fields; none is secret.

| Field | Type | Required | Description |
|---|---|---|---|
| `environment` | string | Yes | `test` or `production`. |
| `flow` | string | Yes | Constant `payment_link`. |
| `supported_currencies` | array of strings | Yes | ISO 4217 currencies accepted by this handler instance. |
| `accept_partial` | boolean | Yes | Whether partial payment is accepted. This implementation requires `false`. |
| `key_id` | string | No | Public Razorpay Key ID, if a browser flow needs it. Never the Key Secret. |

#### Response Config Fields

The current server returns these values under `payment.razorpay` after Complete
Checkout:

| Field | Type | Required | Description |
|---|---|---|---|
| `payment_link_id` | string | Yes | Razorpay Payment Link identifier, normally prefixed with `plink_`. |
| `payment_url` | URI | Yes | HTTPS URL the buyer opens to pay. |
| `key_id` | string | No | Public Razorpay Key ID. |
| `amount` | integer | Yes | Authoritative checkout total in currency subunits. |
| `currency` | string | Yes | ISO 4217 checkout currency. |
| `status` | string | Yes | Provider attempt state; initially `created`. |

`payment.razorpay` is a sample-specific response extension. A production
`2026-08-25` handler should define and negotiate a custom payment Action for
the hosted URL instead of relying on an undeclared response member.

#### Example Handler Declaration

This is the declaration used by the current sample:

```json
{
  "ucp": {
    "version": "2026-04-08",
    "payment_handlers": {
      "dev.mock.razorpay_payment_handler": [
        {
          "id": "razorpay_mock_payment_handler",
          "name": "razorpay_mock_payment_handler",
          "version": "2026-04-08",
          "spec": "https://merchant.example/ucp/razorpay-payment-link-handler",
          "config": {}
        }
      ]
    }
  }
}
```

For a production specification, the `name`, `spec` and `schema` authorities
MUST be owned by the specification publisher. Do not use `com.razorpay` unless
Razorpay publishes or approves that specification.

### Processing Payments

Upon receiving a matching instrument, the Business MUST:

1. **Validate the handler.** Confirm `instrument.handler_id` equals an
   advertised handler ID and `instrument.type` is `hosted_checkout`.
2. **Enforce idempotency.** Bind processing to the UCP idempotency key and the
   request body. A retry with identical input returns the stored result; reuse
   with different input fails.
3. **Validate checkout readiness.** Validate the selected fulfillment
   destination and option before accepting completion.
4. **Calculate the amount.** Read exactly one authoritative `total` from the
   server-side checkout. Never accept amount or currency from the payment
   instrument.
5. **Reserve inventory atomically.** Create a time-limited reservation before
   creating the external payment attempt.
6. **Create the Payment Link.** Send amount, currency, checkout ID/reference,
   expiry and `accept_partial: false` to Razorpay.
7. **Persist the attempt.** Store the checkout ID, Payment Link ID, amount,
   currency, reservation ID and state in the transaction database.
8. **Return accepted completion.** Return HTTP 200 with checkout status
   `complete_in_progress`, no `order`, and the hosted payment information.
9. **Verify asynchronous success.** On a signed webhook or reconciliation GET,
   fetch the provider payment and require all of the following:
   - payment status is `captured`;
   - `captured` is `true`;
   - Razorpay order ID matches the stored attempt;
   - amount and currency exactly match the stored attempt;
   - the inventory reservation is still active.
10. **Finalize exactly once.** Consume the reservation, mark the attempt
    captured, create the merchant order and set checkout status `completed`.

Example Complete Checkout request:

```http
POST /checkout-sessions/checkout_123/complete
Idempotency-Key: 36b83812-d52a-43e7-8b66-a6e6170b639b
Content-Type: application/json

{
  "payment": {
    "instruments": [
      {
        "id": "razorpay_checkout",
        "handler_id": "razorpay_mock_payment_handler",
        "type": "hosted_checkout"
      }
    ]
  }
}
```

Accepted asynchronous response:

```json
{
  "id": "checkout_123",
  "status": "complete_in_progress",
  "currency": "INR",
  "payment": {
    "razorpay": {
      "payment_link_id": "plink_example",
      "payment_url": "https://rzp.io/i/example",
      "amount": 125000,
      "currency": "INR",
      "status": "created"
    }
  }
}
```

Final Get Checkout response after verified capture:

```json
{
  "id": "checkout_123",
  "status": "completed",
  "currency": "INR",
  "order": {
    "id": "order_merchant_123",
    "permalink_url": "https://merchant.example/orders/order_merchant_123"
  }
}
```

## Platform Integration

### Prerequisites

The Platform does not need Razorpay API credentials. Before using this handler,
it MUST:

1. Support UCP Checkout discovery and Complete/Get Checkout operations.
2. Be able to present or open an HTTPS Razorpay Payment Link for the buyer.
3. Treat the Business's checkout state as authoritative.
4. Preserve the Complete Checkout idempotency key for lost-response recovery.

Prerequisites output:

| Field | Description |
|---|---|
| Platform UCP profile | Describes the Platform's supported UCP capabilities. |
| Hosted-navigation support | Ability to open `payment_url` without inspecting payment credentials. |

No Razorpay access token or secret is issued to the Platform in this flow.

### Handler Configuration

#### Platform Config Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `supports_hosted_navigation` | boolean | Yes | Platform can present an HTTPS provider page to the buyer. |
| `supports_get_checkout` | boolean | Yes | Platform can retrieve the authoritative state after asynchronous processing. |

The current sample client does not publish a separate platform handler config;
these requirements are behavioural.

### Payment Protocol

#### Step 1: Discover Handler

Read `/.well-known/ucp` and select the entry whose handler ID is
`razorpay_mock_payment_handler` and whose available instrument type is
`hosted_checkout`.

#### Step 2: Prepare the Instrument

Construct a reference-only instrument:

```json
{
  "id": "razorpay_checkout",
  "handler_id": "razorpay_mock_payment_handler",
  "type": "hosted_checkout"
}
```

The instrument MUST NOT contain an amount, Razorpay API secret or raw payment
credential.

#### Step 3: Complete Checkout

Submit the instrument once using Complete Checkout. A response with
`complete_in_progress` means the operation was accepted, not that funds were
captured.

The Platform MUST NOT start another Complete Checkout operation while this
state is active. An identical retry with the original idempotency key is only
for recovery when the original response was lost.

#### Step 4: Present Hosted Payment

Open the returned `payment_url` for the buyer. Treat it as an untrusted external
navigation unless it is HTTPS and belongs to an allowlisted Razorpay host.

#### Step 5: Retrieve Final Checkout

After the buyer completes the provider flow, call Get Checkout. The Business
may reconcile the Payment Link with Razorpay before returning its response.

- `completed` with `order`: payment was verified and the merchant order exists.
- `complete_in_progress`: payment has not yet been authoritatively finalized.
- `canceled`: the checkout or reservation is no longer valid.

Production Platforms should use bounded backoff until checkout `expires_at`.
The sample happy-path client deliberately performs one Get Checkout after its
configured wait.

## Payment Action

The current implementation models hosted navigation using the project-specific
`payment.razorpay.payment_url` response field. Its gated effect is order
completion: the checkout cannot become `completed` until Razorpay reports a
captured matching payment.

| Action | When emitted | Gated effect | Requirements |
|---|---|---|---|
| Open `payment_url` | Complete Checkout creates a Payment Link | Captured payment and order creation | HTTPS Razorpay URL, single checkout binding, expiry aligned with inventory reservation |

For formal UCP `2026-08-25` conformance, this must be represented by an Action
declared by a negotiated extension, with an Action ID, expiry, trusted URL
rules, completion observation and fallback behaviour.

## Razorpay Integration

### Prerequisites

The Business configures Razorpay out-of-band through the Razorpay Dashboard and
API. Razorpay does not participate in UCP discovery.

### Payment Link

The Business creates a Standard Payment Link with:

- the checkout total in the currency's smallest unit;
- the checkout currency;
- `accept_partial: false`;
- the checkout ID as `reference_id` and in `notes`;
- an expiry no later than the inventory reservation expiry;
- notifications and reminders configured according to Business policy.

### Webhooks

The Business endpoint accepts these events used by the sample:

| Event | Behaviour |
|---|---|
| `payment_link.paid` | Resolve the Payment Link, Razorpay order and payment, then verify and finalize. |
| `payment.captured` | Verify the captured payment and finalize. |
| `order.paid` | Verify the associated captured payment and finalize. |
| `payment.failed` | Mark the attempt failed and release held inventory. |

Webhook delivery alone is not sufficient evidence of payment. The Business
verifies the signature, deduplicates the event and fetches payment state from
Razorpay before completing the UCP checkout.

## Error Handling

| Condition | Required behaviour |
|---|---|
| Handler ID or instrument type is unsupported | Reject as an invalid request before creating a provider attempt. |
| Razorpay credentials are missing | Return an unrecoverable configuration error; do not reserve inventory permanently. |
| Checkout has no single valid final total | Reject the request; do not create a Payment Link. |
| Stock cannot be reserved | Return an out-of-stock result and roll back the attempt. |
| Razorpay link creation fails | Roll back the reservation and local transaction. |
| Payment remains unpaid | Keep `complete_in_progress` until expiry or cancellation policy applies. |
| Payment data mismatches amount, currency or order | Do not create an order; retain evidence for investigation and release inventory according to failure policy. |
| Reservation expired before capture | Do not create an order automatically; use a defined refund/manual-recovery policy. |
| Duplicate webhook | Return success without finalizing twice. |

## Security Considerations

| Requirement | Description |
|---|---|
| Secret isolation | API Key Secret and webhook secret remain server-side and never appear in UCP payloads, logs or discovery. |
| Authoritative amount | The Business derives amount and currency from its persisted checkout, never from the Platform instrument or browser. |
| Attempt binding | Razorpay `reference_id`/`notes`, local attempt and inventory reservation bind the provider payment to one checkout. |
| Capture verification | Order creation requires a fetched provider payment with matching order, amount, currency and captured state. |
| Webhook signature | Validate `X-Razorpay-Signature` over the exact raw request body before parsing or processing it. |
| Webhook idempotency | Deduplicate using `X-Razorpay-Event-Id` when provided and persist processed event IDs. |
| Event ordering | Do not assume Razorpay events arrive once or in chronological order. |
| URL handling | Only present HTTPS payment URLs returned by the authenticated Razorpay API and enforce a provider-host allowlist in production. |
| Reservation expiry | Align provider-link expiry and inventory-hold expiry; define refund/manual recovery for late capture races. |
| Logging | Redact API secrets, signatures and sensitive buyer/payment information. |

## References

- [UCP Payment Handler Template](https://ucp.dev/2026-08-25/specification/payment/template/)
- [UCP Payment Handler Guide](https://ucp.dev/2026-08-25/specification/payment/guide/)
- [UCP Checkout specification](https://ucp.dev/2026-08-25/specification/shopping/checkout/)
- [Razorpay Payment Links APIs](https://razorpay.com/docs/api/payments/payment-links/)
- [Razorpay Payment Link webhook events](https://razorpay.com/docs/webhooks/payment-links/)
- [Razorpay payment webhook events](https://razorpay.com/docs/webhooks/payments/)
- [Razorpay webhook validation](https://razorpay.com/docs/webhooks/validate-test/)

## Implementation Mapping

| Responsibility | Sample implementation |
|---|---|
| Handler discovery | `server/routes/discovery_profile.json` |
| Complete Checkout route injection | `server/routes/ucp_implementation.py` |
| Reservation and Payment Link creation | `server/services/checkout_service.py::_prepare_razorpay_payment` |
| Provider API adapter | `server/services/razorpay_service.py` |
| Webhook and browser confirmation routes | `server/routes/razorpay.py` |
| Payment attempts and inventory reservations | `server/db.py` |
| Happy-path Platform client | `client_scripts/simple_happy_path_razorpay_client.py` |
