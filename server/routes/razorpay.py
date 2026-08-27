"""Razorpay confirmation, reconciliation, and webhook endpoints."""

from typing import Annotated, Any

import db
import dependencies
from fastapi import APIRouter, Body, Depends, Header, HTTPException, Request
from models import UnifiedCheckout
from services.checkout_service import CheckoutService
from services.razorpay_service import RazorpayService

router = APIRouter(tags=["Razorpay"])


@router.post(
  "/payments/razorpay/confirm",
  response_model=UnifiedCheckout,
  response_model_exclude_none=True,
)
async def confirm_payment(
  body: Annotated[dict[str, str], Body(...)],
  checkout_service: Annotated[
    CheckoutService, Depends(dependencies.get_checkout_service)
  ],
) -> UnifiedCheckout:
  """Confirm the signed browser result and finalize only if captured."""
  required = {"razorpay_order_id", "razorpay_payment_id", "razorpay_signature"}
  if not required.issubset(body):
    raise HTTPException(
      status_code=422, detail="Missing Razorpay result fields"
    )
  return await checkout_service.confirm_razorpay_payment(
    body["razorpay_order_id"],
    body["razorpay_payment_id"],
    body["razorpay_signature"],
  )


@router.post("/webhooks/razorpay", status_code=200)
async def razorpay_webhook(
  request: Request,
  checkout_service: Annotated[
    CheckoutService, Depends(dependencies.get_checkout_service)
  ],
  signature: Annotated[str | None, Header(alias="X-Razorpay-Signature")] = None,
  event_id: Annotated[str | None, Header(alias="X-Razorpay-Event-Id")] = None,
) -> dict[str, Any]:
  """Verify and idempotently process captured-payment notifications."""
  raw_body = await request.body()
  if not signature or not RazorpayService.verify_webhook_signature(
    raw_body, signature
  ):
    raise HTTPException(status_code=401, detail="Invalid Razorpay signature")
  payload = await request.json()
  webhook_id = event_id or signature
  if await checkout_service.transactions_session.get(
    db.ProcessedWebhook, webhook_id
  ):
    return {"status": "already_processed"}

  event_type = payload.get("event")
  if event_type == "payment_link.paid":
    event_payload = payload.get("payload", {})
    payment_link = event_payload.get("payment_link", {}).get("entity", {})
    payment = event_payload.get("payment", {}).get("entity", {})
    order = event_payload.get("order", {}).get("entity", {})
    attempt = await db.get_payment_attempt_by_provider_order(
      checkout_service.transactions_session, payment_link.get("id", "")
    )
    if not attempt or not order.get("id") or not payment.get("id"):
      raise HTTPException(
        status_code=422, detail="Malformed payment-link event"
      )
    attempt.provider_order_id = order["id"]
    await checkout_service.transactions_session.flush()
    await checkout_service.finalize_razorpay_payment(order["id"], payment["id"])
  elif event_type in {"payment.captured", "order.paid"}:
    payment = payload.get("payload", {}).get("payment", {}).get("entity", {})
    provider_order_id = payment.get("order_id")
    provider_payment_id = payment.get("id")
    if not provider_order_id or not provider_payment_id:
      raise HTTPException(status_code=422, detail="Malformed Razorpay payload")
    await checkout_service.finalize_razorpay_payment(
      provider_order_id, provider_payment_id
    )
  elif event_type == "payment.failed":
    payment = payload.get("payload", {}).get("payment", {}).get("entity", {})
    provider_order_id = payment.get("order_id")
    if provider_order_id:
      await checkout_service.fail_razorpay_payment(
        provider_order_id, payment.get("id")
      )

  checkout_service.transactions_session.add(
    db.ProcessedWebhook(
      id=webhook_id,
      event_type=event_type or "unknown",
      created_at=str(payload.get("created_at", "")),
    )
  )
  await checkout_service.transactions_session.commit()
  return {"status": "processed"}
