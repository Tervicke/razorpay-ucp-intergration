import os
import uuid
import webbrowser

import razorpay


client = razorpay.Client(
    auth=(
        os.environ["RAZORPAY_KEY_ID"],
        os.environ["RAZORPAY_KEY_SECRET"],
    )
)

payment_link = client.payment_link.create({
    "amount": 49900,  # ₹499 in paise
    "currency": "INR",
    "accept_partial": False,
    "reference_id": f"ucp_{uuid.uuid4().hex[:12]}",
    "description": "Test UCP flower-shop checkout",
    "customer": {
        "name": "Test Buyer",
        "email": "test@example.com",
        "contact": "+919403431809",
    },
    "notify": {
        "sms": False,
        "email": False,
    },
    "reminder_enable": False,
    "notes": {
        "ucp_checkout_id": "checkout_001",
        "merchant": "flower_shop",
    },
})

payment_url = payment_link["short_url"]

print("Payment Link ID:", payment_link["id"])
print("Status:", payment_link["status"])
print("Payment URL:", payment_url)

webbrowser.open(payment_url)
