"""Tests for Razorpay signature verification."""

import hashlib
import hmac

from absl.testing import absltest
import config
from services.razorpay_service import RazorpayService


class RazorpayServiceTest(absltest.TestCase):
  """Verify signatures are exact and resistant to payload changes."""

  def test_checkout_signature(self) -> None:
    """Checkout signatures bind both provider identifiers."""
    config.FLAGS["razorpay_key_secret"].value = "checkout-secret"
    signature = hmac.new(
      b"checkout-secret", b"order_1|pay_1", hashlib.sha256
    ).hexdigest()
    self.assertTrue(
      RazorpayService.verify_checkout_signature("order_1", "pay_1", signature)
    )
    self.assertFalse(
      RazorpayService.verify_checkout_signature("order_1", "pay_2", signature)
    )

  def test_webhook_signature_uses_raw_body(self) -> None:
    """Even whitespace changes invalidate the raw-body signature."""
    config.FLAGS["razorpay_webhook_secret"].value = "webhook-secret"
    raw_body = b'{"event":"payment.captured"}'
    signature = hmac.new(
      b"webhook-secret", raw_body, hashlib.sha256
    ).hexdigest()
    self.assertTrue(
      RazorpayService.verify_webhook_signature(raw_body, signature)
    )
    self.assertFalse(
      RazorpayService.verify_webhook_signature(raw_body + b" ", signature)
    )


if __name__ == "__main__":
  absltest.main()
