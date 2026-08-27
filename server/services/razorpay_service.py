"""Asynchronous adapter around the official Razorpay Python SDK."""

import asyncio
from typing import Any

import config
from exceptions import InvalidRequestError
from exceptions import PaymentFailedError
import razorpay


class RazorpayService:
  """Use Razorpay's official synchronous SDK without blocking FastAPI."""

  def _auth(self) -> tuple[str, str]:
    key_id = config.FLAGS["razorpay_key_id"].value
    key_secret = config.FLAGS["razorpay_key_secret"].value
    if not key_id or not key_secret:
      raise InvalidRequestError("Razorpay API credentials are not configured")
    return key_id, key_secret

  def _client(self) -> razorpay.Client:
    """Create an authenticated official SDK client."""
    return razorpay.Client(auth=self._auth())

  async def create_order(
    self, *, amount: int, currency: str, checkout_id: str
  ) -> dict[str, Any]:
    """Create the provider order that fixes amount and currency."""
    try:
      return await asyncio.to_thread(
        self._client().order.create,
        {
          "amount": amount,
          "currency": currency,
          "receipt": checkout_id,
          "notes": {"checkout_id": checkout_id},
        },
      )
    except (
      razorpay.errors.BadRequestError,
      razorpay.errors.GatewayError,
      razorpay.errors.ServerError,
    ) as exc:
      raise PaymentFailedError(
        f"Razorpay order creation failed: {exc}"
      ) from exc

  async def create_payment_link(
    self,
    *,
    amount: int,
    currency: str,
    checkout_id: str,
    expire_by: int,
  ) -> dict[str, Any]:
    """Create a Razorpay-hosted URL where the buyer can pay."""
    try:
      return await asyncio.to_thread(
        self._client().payment_link.create,
        {
          "amount": amount,
          "currency": currency,
          "accept_partial": False,
          "reference_id": checkout_id,
          "description": f"Payment for checkout {checkout_id}",
          "expire_by": expire_by,
          "notify": {"sms": False, "email": False},
          "reminder_enable": False,
          "notes": {"checkout_id": checkout_id},
        },
      )
    except (
      razorpay.errors.BadRequestError,
      razorpay.errors.GatewayError,
      razorpay.errors.ServerError,
    ) as exc:
      raise PaymentFailedError(
        f"Razorpay payment-link creation failed: {exc}"
      ) from exc

  async def fetch_payment(self, payment_id: str) -> dict[str, Any]:
    """Fetch payment state directly from Razorpay."""
    try:
      return await asyncio.to_thread(self._client().payment.fetch, payment_id)
    except (
      razorpay.errors.BadRequestError,
      razorpay.errors.GatewayError,
      razorpay.errors.ServerError,
    ) as exc:
      raise PaymentFailedError(
        f"Unable to verify Razorpay payment: {exc}"
      ) from exc

  async def fetch_payment_link(self, payment_link_id: str) -> dict[str, Any]:
    """Fetch the hosted link so localhost demos can reconcile without hooks."""
    try:
      return await asyncio.to_thread(
        self._client().payment_link.fetch, payment_link_id
      )
    except (
      razorpay.errors.BadRequestError,
      razorpay.errors.GatewayError,
      razorpay.errors.ServerError,
    ) as exc:
      raise PaymentFailedError(
        f"Unable to retrieve Razorpay payment link: {exc}"
      ) from exc

  @staticmethod
  def verify_checkout_signature(
    order_id: str, payment_id: str, signature: str
  ) -> bool:
    """Verify the signature returned by Razorpay Checkout."""
    try:
      client = RazorpayService()._client()
      return client.utility.verify_payment_signature(
        {
          "razorpay_order_id": order_id,
          "razorpay_payment_id": payment_id,
          "razorpay_signature": signature,
        }
      )
    except (InvalidRequestError, razorpay.errors.SignatureVerificationError):
      return False

  @staticmethod
  def verify_webhook_signature(raw_body: bytes, signature: str) -> bool:
    """Verify a webhook over the unmodified request body."""
    secret = config.FLAGS["razorpay_webhook_secret"].value
    if not secret:
      return False
    try:
      client = RazorpayService()._client()
      return client.utility.verify_webhook_signature(
        raw_body.decode("utf-8"), signature, secret
      )
    except (
      UnicodeDecodeError,
      InvalidRequestError,
      razorpay.errors.SignatureVerificationError,
    ):
      return False
