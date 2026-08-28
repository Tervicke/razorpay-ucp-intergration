#   Copyright 2026 UCP Authors
#
#   Licensed under the Apache License, Version 2.0 (the "License");
#   you may not use this file except in compliance with the License.
#   You may obtain a copy of the License at
#
#       http://www.apache.org/licenses/LICENSE-2.0
#
#   Unless required by applicable law or agreed to in writing, software
#   distributed under the License is distributed on an "AS IS" BASIS,
#   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#   See the License for the specific language governing permissions and
#   limitations under the License.

"""Simple Happy Path Client Script for UCP SDK.

This script demonstrates a basic "happy path" user journey:
0. Discovery: Querying the merchant to see what they support.
1. Creating a new checkout session (cart).
2. Adding items to the checkout session.
3. Applying a discount code.
4. Triggering fulfillment option generation.
5. Selecting a fulfillment destination.
6. Selecting a fulfillment option.
7. Completing the checkout by processing a payment.

Usage:
  uv run simple_happy_path_client.py --server_url=http://localhost:8182
"""

import argparse
import sys
import json
import logging
from pathlib import Path
import time
import uuid
import httpx
import signing
from ucp_sdk.models.schemas.shopping import cart_create_request
from ucp_sdk.models.schemas.shopping import cart_update_request
from ucp_sdk.models.schemas.shopping import checkout_update_request
from ucp_sdk.models.schemas.shopping.types import buyer_create_request
from ucp_sdk.models.schemas.shopping.types import item_create_request
from ucp_sdk.models.schemas.shopping.types import item_update_request
from ucp_sdk.models.schemas.shopping.types import line_item_create_request
from ucp_sdk.models.schemas.shopping.types import line_item_update_request


# Set by main() when request signing is enabled; the profile URL published by
# the local key server, referenced by the UCP-Agent header so the merchant can
# discover the signing key.
_SIGNING_PROFILE_URL: str | None = None


def get_headers() -> dict[str, str]:
  """Generate necessary headers for UCP requests.

  When signing is enabled the UCP-Agent header points at the demo's local key
  server (the signature itself is added by the httpx auth flow). Otherwise it
  falls back to the historical placeholder and the legacy request-signature
  header, so the unsigned demo behaves exactly as before.
  """
  headers = {
    "idempotency-key": str(uuid.uuid4()),
    "request-id": str(uuid.uuid4()),
  }
  if _SIGNING_PROFILE_URL:
    headers["UCP-Agent"] = f'profile="{_SIGNING_PROFILE_URL}"'
  else:
    headers["UCP-Agent"] = 'profile="https://agent.example/profile"'
    headers["request-signature"] = "test"
  return headers


def remove_none_values(obj):
  """Recursively remove keys with None values from a dictionary or list."""
  if isinstance(obj, dict):
    return {k: remove_none_values(v) for k, v in obj.items() if v is not None}
  elif isinstance(obj, list):
    return [remove_none_values(v) for v in obj]
  else:
    return obj


def write_razorpay_checkout_page(
  filename: str, razorpay: dict[str, object]
) -> None:
  """Write a small browser page linking to Razorpay's hosted payment page."""
  payment_url = str(razorpay["payment_url"])
  page = f"""<!doctype html>
<html><head><meta charset="utf-8"><title>Razorpay UCP Checkout</title></head>
<body>
  <p><a href="{payment_url}">Pay securely with Razorpay</a></p>
</body></html>
"""
  Path(filename).write_text(page, encoding="utf-8")


def log_interaction(
  filename: str,
  method: str,
  url: str,
  headers: dict[str, str],
  json_body: dict[str, object] | None,
  response: httpx.Response,
  step_description: str,
  replacements: dict[str, str] | None = None,
  extractions: dict[str, str] | None = None,
):
  """Log the request and response to a markdown file."""
  replacements = replacements or {}

  extractions = extractions or {}

  with Path(filename).open("a", encoding="utf-8") as f:
    f.write(f"## {step_description}\n\n")

    # --- Request (Curl) ---
    # Apply replacements to URL
    display_url = url
    for val, var_name in replacements.items():
      if val in display_url:
        display_url = display_url.replace(val, f"${var_name}")

    curl_cmd = f"export RESPONSE=$(curl -s -X {method} {display_url} \\\n"

    # Headers
    # We generally don't tokenize headers in this simple script,
    # but could if needed.
    for k, v in headers.items():
      curl_cmd += f"  -H '{k}: {v}' \\\n"

    # Body
    if json_body:
      curl_cmd += "  -H 'Content-Type: application/json' \\\n"
      clean_body = remove_none_values(json_body)
      json_str = json.dumps(clean_body, indent=2)

      # Apply replacements to body
      for val, var_name in replacements.items():
        # Simple string replacement - safer to do on the JSON string
        # than traversing the dict for this doc-gen purpose.
        if val in json_str:
          json_str = json_str.replace(val, f"${var_name}")

      curl_cmd += f"  -d '{json_str}')\n"
    else:
      curl_cmd = curl_cmd.rstrip(" \\\n") + ")\n"

    f.write("### Request\n\n```bash\n" + curl_cmd + "```\n\n")

    # --- Response ---

    f.write("### Response\n\n")

    try:
      resp_json = response.json()
      clean_resp = remove_none_values(resp_json)
      f.write("```json\n" + json.dumps(clean_resp, indent=2) + "\n```\n\n")
    except json.JSONDecodeError:
      f.write(f"```\n{response.text}\n```\n\n")

    # --- Extract Variables ---
    if extractions:
      f.write("### Extract Variables\n\n```bash\n")
      for var_name, jq_expr in extractions.items():
        # We assume the user has the response in a variable or pipe.
        # For the snippet, we'll assume they pipe the previous curl output.
        f.write(f"export {var_name}=$(echo $RESPONSE | jq -r '{jq_expr}')\n")
      f.write("```\n\n")


def main() -> int:
  """Run the happy path client."""
  parser = argparse.ArgumentParser()

  parser.add_argument(
    "--server_url",
    default="http://localhost:8182",
    help="Base URL of the UCP Server",
  )

  parser.add_argument(
    "--export_requests_to",
    default=None,
    help="Path to export requests and responses as markdown.",
  )

  parser.add_argument(
    "--disable_signatures",
    action="store_true",
    help=(
      "Do not sign requests. By default the client signs every request with "
      "an ephemeral ES256 key and publishes the public key from a local "
      "profile server for the merchant to verify."
    ),
  )

  parser.add_argument(
    "--razorpay_payment_id",
    help="Payment ID returned by Razorpay Checkout (pay_...).",
  )
  parser.add_argument(
    "--razorpay_signature",
    help="Signature returned by Razorpay Checkout.",
  )
  parser.add_argument(
    "--wait_for_webhook_seconds",
    type=int,
    default=90,
    help=(
      "Wait this many seconds before retrieving the checkout once to check "
      "the Razorpay payment status (default: 90)."
    ),
  )
  parser.add_argument(
    "--prompt_for_razorpay_result",
    action="store_true",
    help=(
      "After preparing the Razorpay order, prompt for the payment ID and "
      "signature returned by an external Razorpay Checkout UI."
    ),
  )
  parser.add_argument(
    "--razorpay_checkout_html",
    help=(
      "Write a browser page that launches Razorpay Checkout for the newly "
      "created provider order."
    ),
  )

  args = parser.parse_args()

  # Configure Logging

  logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
  )

  logger = logging.getLogger(__name__)

  signer = None
  if not args.disable_signatures:
    global _SIGNING_PROFILE_URL
    signer, profile_server = signing.build_signer()
    profile_server.start()
    _SIGNING_PROFILE_URL = profile_server.profile_url
    logger.info(
      "Signing requests with an ephemeral ES256 key; publishing it at %s",
      _SIGNING_PROFILE_URL,
    )

  client = httpx.Client(base_url=args.server_url, auth=signer)

  # Clear the export file if it exists
  if args.export_requests_to:
    with Path(args.export_requests_to).open("w", encoding="utf-8") as f:
      f.write("""<!--
   Copyright 2026 UCP Authors

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.

Note:
   This file is automatically generated by running simple_happy_path_client.py.
   Do not modify manually.
-->
""")
      f.write("# UCP Happy Path Interaction Log\n\n")
      f.write("### Configuration\n\n")
      f.write(f"```bash\nexport SERVER_URL={args.server_url}\n```\n\n")
      f.write(
        "> **Note:** In the bash snippets below, `jq` is used to extract"
        " values from the JSON response.\n"
      )
      f.write(
        "> It is assumed that the response body of the previous `curl`"
        " command is captured in a variable named `$RESPONSE`.\n\n"
      )

  # Track dynamic values to replace in subsequent requests
  # Map: actual_value -> variable_name
  global_replacements: dict[str, str] = {args.server_url: "SERVER_URL"}

  try:
    # ==========================================================================

    # STEP 0: Discovery

    # ==========================================================================

    logger.info("STEP 0: Discovery - Asking merchant what they support...")

    url = "/.well-known/ucp"

    response = client.get(url)

    if args.export_requests_to:
      log_interaction(
        args.export_requests_to,
        "GET",
        f"{args.server_url}{url}",
        {},
        None,
        response,
        "Step 0: Discovery",
        replacements=global_replacements,
      )

    if response.status_code != 200:
      logger.error("Discovery failed: %s", response.text)

      return 1

    discovery_data = response.json()

    # Discovery profiles are wrapped in a top-level `ucp` object per the UCP
    # discovery schema; fall back to the root for flat/legacy profiles.
    ucp_data = discovery_data.get("ucp", discovery_data)

    supported_handlers = []
    for handlers in ucp_data.get("payment_handlers", {}).values():
      supported_handlers.extend(handlers)

    logger.info(
      "Merchant supports %d payment handlers:", len(supported_handlers)
    )

    for h in supported_handlers:
      logger.info(" - %s (%s)", h["id"], h["name"])

    # ==========================================================================

    # ==========================================================================
    # STEP 1: Create a Cart
    # ==========================================================================

    logger.info("\nSTEP 1: Creating a new Cart...")

    # We start with one item: "Red Rose"
    item1 = item_create_request.ItemCreateRequest(id="rose_bouquet")
    line_item1 = line_item_create_request.LineItemCreateRequest(
      quantity=1, item=item1
    )

    # We include the buyer
    buyer_request = buyer_create_request.BuyerCreateRequest(
      full_name="Aarav Sharma", email="aarav.sharma@example.com"
    )

    create_payload = cart_create_request.CartCreateRequest(
      line_items=[line_item1],
      buyer=buyer_request,
    )

    headers = get_headers()
    url = "/carts"

    json_body = create_payload.model_dump(
      mode="json", by_alias=True, exclude_none=True
    )

    response = client.post(
      url,
      json=json_body,
      headers=headers,
    )

    cart_data = response.json()
    cart_id = cart_data.get("id")

    # Extract IDs for documentation
    extractions = {}
    if cart_id:
      global_replacements[cart_id] = "CART_ID"
      extractions["CART_ID"] = ".id"

    if cart_data.get("line_items"):
      li_id = cart_data["line_items"][0]["id"]
      global_replacements[li_id] = "LINE_ITEM_1_ID"
      extractions["LINE_ITEM_1_ID"] = ".line_items[0].id"

    if args.export_requests_to:
      log_interaction(
        args.export_requests_to,
        "POST",
        f"{args.server_url}{url}",
        headers,
        json_body,
        response,
        "Step 1: Create Cart",
        replacements=global_replacements,
        extractions=extractions,
      )

    if response.status_code not in [200, 201]:
      logger.error("Failed to create cart: %s", response.text)
      return 1

    logger.info("Successfully created cart: %s", cart_id)
    logger.info("Current Total: %s cents", cart_data["totals"][-1]["amount"])

    # ==========================================================================
    # STEP 2: Add More Items (Update Cart)
    # ==========================================================================

    logger.info("\nSTEP 2: Adding a second item (Ceramic Pot)...")

    # Update Item 1 (Roses) - Keep quantity 1
    item1_update = item_update_request.ItemUpdateRequest(id="rose_bouquet")
    line_item1_update = line_item_update_request.LineItemUpdateRequest(
      id=cart_data["line_items"][0]["id"],
      quantity=1,
      item=item1_update,
    )

    # Add Item 2 (Ceramic Pot) - Quantity 2
    item2_update = item_update_request.ItemUpdateRequest(id="ceramic_planter")
    line_item2_update = line_item_update_request.LineItemUpdateRequest(
      quantity=2,
      item=item2_update,
    )

    # Construct the Update Payload
    update_payload = cart_update_request.CartUpdateRequest(
      id=cart_id,
      line_items=[line_item1_update, line_item2_update],
    )

    headers = get_headers()
    url = f"/carts/{cart_id}"

    json_body = update_payload.model_dump(
      mode="json", by_alias=True, exclude_none=True
    )

    response = client.put(
      url,
      json=json_body,
      headers=headers,
    )

    cart_data = response.json()
    extractions = {}

    if len(cart_data.get("line_items", [])) > 1:
      li_2_id = cart_data["line_items"][1]["id"]
      global_replacements[li_2_id] = "LINE_ITEM_2_ID"
      extractions["LINE_ITEM_2_ID"] = ".line_items[1].id"

    if args.export_requests_to:
      log_interaction(
        args.export_requests_to,
        "PUT",
        f"{args.server_url}{url}",
        headers,
        json_body,
        response,
        "Step 2: Add Items (Update Cart)",
        replacements=global_replacements,
        extractions=extractions,
      )

    if response.status_code != 200:
      logger.error("Failed to add items: %s", response.text)
      return 1

    logger.info("Successfully added items.")
    logger.info("New Total: %s cents", cart_data["totals"][-1]["amount"])
    logger.info("Item Count: %d", len(cart_data["line_items"]))

    # ==========================================================================
    # STEP 3: Apply Discount to Cart
    # ==========================================================================

    logger.info("\nSTEP 3: Applying Discount (10%% OFF) to Cart...")

    li_1 = next(
      li
      for li in cart_data["line_items"]
      if li["item"]["id"] == "rose_bouquet"
    )
    li_2 = next(
      li
      for li in cart_data["line_items"]
      if li["item"]["id"] == "ceramic_planter"
    )

    item1_update = item_update_request.ItemUpdateRequest(id="rose_bouquet")
    line_item1_update = line_item_update_request.LineItemUpdateRequest(
      id=li_1["id"],
      quantity=1,
      item=item1_update,
    )

    item2_update = item_update_request.ItemUpdateRequest(id="ceramic_planter")
    line_item2_update = line_item_update_request.LineItemUpdateRequest(
      id=li_2["id"],
      quantity=2,
      item=item2_update,
    )

    update_payload = cart_update_request.CartUpdateRequest(
      id=cart_id,
      line_items=[line_item1_update, line_item2_update],
    )

    update_dict = update_payload.model_dump(
      mode="json", by_alias=True, exclude_none=True
    )
    update_dict["discounts"] = {"codes": ["10OFF"]}

    headers = get_headers()
    url = f"/carts/{cart_id}"
    json_body = update_dict

    response = client.put(
      url,
      json=json_body,
      headers=headers,
    )

    if args.export_requests_to:
      log_interaction(
        args.export_requests_to,
        "PUT",
        f"{args.server_url}{url}",
        headers,
        json_body,
        response,
        "Step 3: Apply Discount to Cart",
        replacements=global_replacements,
      )

    if response.status_code != 200:
      logger.error("Failed to apply discount: %s", response.text)
      return 1

    cart_data = response.json()
    logger.info("Successfully applied discount to cart.")
    logger.info("New Total: %s cents", cart_data["totals"][-1]["amount"])

    discounts_applied = cart_data.get("discounts", {}).get("applied", [])
    if discounts_applied:
      logger.info(
        "Applied Discounts: %s", [d["code"] for d in discounts_applied]
      )
    else:
      logger.warning("No discounts applied!")

    # ==========================================================================
    # STEP 4: Convert Cart to Checkout (Create Checkout Session)
    # ==========================================================================

    logger.info("\nSTEP 4: Creating Checkout Session from Cart...")

    # We only need cart_id. The server will inherit everything else from
    # the cart as per UCP Cart-to-Checkout conversion specification.
    checkout_payload = {
      "cart_id": cart_id,
    }

    headers = get_headers()
    url = "/checkout-sessions"
    json_body = checkout_payload

    response = client.post(
      url,
      json=json_body,
      headers=headers,
    )

    checkout_data = response.json()
    checkout_id = checkout_data.get("id")

    extractions = {}
    if checkout_id:
      global_replacements[checkout_id] = "CHECKOUT_ID"
      extractions["CHECKOUT_ID"] = ".id"

    if args.export_requests_to:
      log_interaction(
        args.export_requests_to,
        "POST",
        f"{args.server_url}{url}",
        headers,
        json_body,
        response,
        "Step 4: Create Checkout Session from Cart",
        replacements=global_replacements,
        extractions=extractions,
      )

    if response.status_code not in [200, 201]:
      logger.error("Failed to create checkout from cart: %s", response.text)
      return 1

    logger.info(
      "Successfully created checkout session from cart: %s", checkout_id
    )
    logger.info(
      "Current Total: %s cents", checkout_data["totals"][-1]["amount"]
    )

    # ==========================================================================

    # STEP 5: Select Fulfillment Option

    # ==========================================================================

    logger.info("\nSTEP 5: Selecting Fulfillment Option...")

    # Ensure fulfillment options are generated

    if not checkout_data.get("fulfillment") or not checkout_data[
      "fulfillment"
    ].get("methods"):
      logger.info("STEP 5: Triggering fulfillment option generation...")

      # Re-construct line items for update to satisfy strict validation

      # We need IDs from the current session

      li_1 = next(
        li
        for li in checkout_data["line_items"]
        if li["item"]["id"] == "rose_bouquet"
      )

      li_2 = next(
        li
        for li in checkout_data["line_items"]
        if li["item"]["id"] == "ceramic_planter"
      )

      item1_update = item_update_request.ItemUpdateRequest(id="rose_bouquet")

      line_item1_update = line_item_update_request.LineItemUpdateRequest(
        id=li_1["id"],
        quantity=1,
        item=item1_update,
      )

      item2_update = item_update_request.ItemUpdateRequest(id="ceramic_planter")

      line_item2_update = line_item_update_request.LineItemUpdateRequest(
        id=li_2["id"],
        quantity=2,
        item=item2_update,
      )

      # Construct full update payload

      trigger_request = checkout_update_request.CheckoutUpdateRequest(
        id=checkout_id,
        line_items=[line_item1_update, line_item2_update],
        currency=checkout_data["currency"],
        payment=checkout_data.get("payment"),
        fulfillment={
          "methods": [
            {
              "id": "method_1",
              "type": "shipping",
              "line_item_ids": [li_1["id"], li_2["id"]],
            }
          ]
        },
      )

      trigger_payload = trigger_request.model_dump(
        mode="json", by_alias=True, exclude_none=True
      )

      url = f"/checkout-sessions/{checkout_id}"

      headers = get_headers()

      response = client.put(url, json=trigger_payload, headers=headers)

      checkout_data = response.json()

      # Extract Fulfillment Method ID (though not always needed if we have
      # just 1)

      extractions = {}

      if checkout_data.get("fulfillment") and checkout_data["fulfillment"].get(
        "methods"
      ):
        method_id = checkout_data["fulfillment"]["methods"][0]["id"]

        global_replacements[method_id] = "FULFILLMENT_METHOD_ID"

        extractions["FULFILLMENT_METHOD_ID"] = ".fulfillment.methods[0].id"

        # Also destinations

        destinations = checkout_data["fulfillment"]["methods"][0].get(
          "destinations", []
        )

        if destinations:
          # Assuming addr_1 is first

          dest_id = destinations[0]["id"]

          global_replacements[dest_id] = "DESTINATION_ID"

          extractions["DESTINATION_ID"] = (
            ".fulfillment.methods[0].destinations[0].id"
          )

      if args.export_requests_to:
        log_interaction(
          args.export_requests_to,
          "PUT",
          f"{args.server_url}{url}",
          headers,
          trigger_payload,
          response,
          "Step 5: Trigger Fulfillment",
          replacements=global_replacements,
          extractions=extractions,
        )

      if response.status_code == 200:
        checkout_data = response.json()

      else:
        logger.warning("Failed to trigger fulfillment: %s", response.text)

    if checkout_data.get("fulfillment") and checkout_data["fulfillment"].get(
      "methods"
    ):
      method = checkout_data["fulfillment"]["methods"][0]

      if method.get("destinations"):
        dest_id = method["destinations"][0]["id"]

        logger.info("STEP 6: Selecting destination: %s", dest_id)

        # 1. Select Destination to calculate options

        # We must send full payload again

        trigger_request.fulfillment = {
          "methods": [
            {
              "id": "method_1",
              "type": "shipping",
              "line_item_ids": [li_1["id"], li_2["id"]],
              "selected_destination_id": dest_id,
            }
          ]
        }

        payload = trigger_request.model_dump(
          mode="json", by_alias=True, exclude_none=True
        )

        url = f"/checkout-sessions/{checkout_id}"

        headers = get_headers()

        response = client.put(
          url,
          json=payload,
          headers=headers,
        )

        if args.export_requests_to:
          log_interaction(
            args.export_requests_to,
            "PUT",
            f"{args.server_url}{url}",
            headers,
            payload,
            response,
            "Step 6: Select Destination",
            replacements=global_replacements,
          )

        if response.status_code != 200:
          logger.error("Failed to select destination: %s", response.text)

          return 1

        checkout_data = response.json()

        # 2. Select Option

        method = checkout_data["fulfillment"]["methods"][0]

        if method.get("groups") and method["groups"][0].get("options"):
          option_id = method["groups"][0]["options"][0]["id"]

          logger.info("STEP 7: Selecting option: %s", option_id)

          trigger_request.fulfillment = {
            "methods": [
              {
                "id": "method_1",
                "type": "shipping",
                "line_item_ids": [li_1["id"], li_2["id"]],
                "selected_destination_id": dest_id,
                "groups": [
                  {
                    "id": "group_1",
                    "line_item_ids": [li_1["id"], li_2["id"]],
                    "selected_option_id": option_id,
                  }
                ],
              }
            ]
          }

          payload = trigger_request.model_dump(
            mode="json", by_alias=True, exclude_none=True
          )

          headers = get_headers()

          response = client.put(
            url,
            json=payload,
            headers=headers,
          )

          if args.export_requests_to:
            log_interaction(
              args.export_requests_to,
              "PUT",
              f"{args.server_url}{url}",
              headers,
              payload,
              response,
              "Step 7: Select Option",
              replacements=global_replacements,
            )

          if response.status_code != 200:
            logger.error("Failed to select option: %s", response.text)

            return 1

          checkout_data = response.json()

          logger.info("Fulfillment option selected.")

          logger.info(
            "Updated Total: %s cents", checkout_data["totals"][-1]["amount"]
          )

    # ==========================================================================

    # STEP 8: Complete Checkout (Payment)

    # ==========================================================================
    logger.info("\nSTEP 8: Processing Payment...")

    target_handler = "razorpay_mock_payment_handler"

    if not any(h["id"] == target_handler for h in supported_handlers):
      logger.error("Merchant does not support %s. Aborting.", target_handler)

      return 1

    # This first call prepares payment: the merchant validates fulfillment,
    # reserves stock and creates a Razorpay Order for its authoritative total.
    final_payload = {
      "payment": {
        "instruments": [
          {
            "id": "razorpay_checkout",
            "handler_id": target_handler,
            "type": "payment_link",
          }
        ]
      },
    }

    headers = get_headers()

    url = f"/checkout-sessions/{checkout_id}/complete"

    response = client.post(
      url,
      json=final_payload,
      headers=headers,
    )

    final_data = response.json()

    razorpay_data = final_data.get("payment", {}).get("razorpay", {})
    razorpay_order_id = razorpay_data.get("order_id")
    payment_url = razorpay_data.get("payment_url")
    extractions = {
      "RAZORPAY_PAYMENT_LINK_ID": ".payment.razorpay.payment_link_id",
      "RAZORPAY_PAYMENT_URL": ".payment.razorpay.payment_url",
      "RAZORPAY_KEY_ID": ".payment.razorpay.key_id",
      "PAYMENT_AMOUNT": ".payment.razorpay.amount",
      "PAYMENT_CURRENCY": ".payment.razorpay.currency",
    }

    if args.export_requests_to:
      log_interaction(
        args.export_requests_to,
        "POST",
        f"{args.server_url}{url}",
        headers,
        final_payload,
        response,
        "Step 8: Prepare Razorpay Payment",
        replacements=global_replacements,
        extractions=extractions,
      )

    if response.status_code != 200:
      logger.error("Payment failed: %s", response.text)

      return 1

    if final_data.get("status") != "complete_in_progress":
      logger.error("Expected complete_in_progress: %s", final_data)
      return 1
    if not payment_url:
      logger.error("Server did not return payment.razorpay.payment_url")
      return 1

    logger.info("Inventory reserved; checkout is awaiting captured payment.")
    logger.info("Razorpay key: %s", razorpay_data.get("key_id"))
    logger.info("Pay here: %s", payment_url)
    logger.info(
      "Amount: %s %s (currency subunits)",
      razorpay_data.get("amount"),
      razorpay_data.get("currency"),
    )
    if args.razorpay_checkout_html:
      write_razorpay_checkout_page(args.razorpay_checkout_html, razorpay_data)
      logger.info(
        "Razorpay Checkout page written to %s. Open it in a browser.",
        Path(args.razorpay_checkout_html).resolve(),
      )

    # Razorpay Checkout runs in a browser/app. It returns a payment ID and
    # signature; supplying both lets this script exercise immediate server-side
    # confirmation. Otherwise a configured webhook can finalize asynchronously.
    razorpay_payment_id = args.razorpay_payment_id
    razorpay_signature = args.razorpay_signature
    if args.prompt_for_razorpay_result:
      logger.info("Open the payment URL above and complete payment.")
      input("Press Enter after the hosted payment page reports success: ")
      args.wait_for_webhook_seconds = max(args.wait_for_webhook_seconds, 90)

    if bool(razorpay_payment_id) != bool(razorpay_signature):
      logger.error(
        "Provide both --razorpay_payment_id and --razorpay_signature."
      )
      return 1

    if razorpay_payment_id:
      if not razorpay_order_id:
        logger.error(
          "Direct confirmation requires an order ID; hosted Payment Links "
          "should finalize through the payment_link.paid webhook."
        )
        return 1
      logger.info("\nSTEP 9: Confirming Razorpay payment...")
      confirm_url = "/payments/razorpay/confirm"
      confirm_payload = {
        "razorpay_order_id": razorpay_order_id,
        "razorpay_payment_id": razorpay_payment_id,
        "razorpay_signature": razorpay_signature,
      }
      confirm_response = client.post(confirm_url, json=confirm_payload)
      if args.export_requests_to:
        log_interaction(
          args.export_requests_to,
          "POST",
          f"{args.server_url}{confirm_url}",
          {},
          confirm_payload,
          confirm_response,
          "Step 9: Confirm Razorpay Payment",
          replacements=global_replacements,
        )
      if confirm_response.status_code != 200:
        logger.error("Payment confirmation failed: %s", confirm_response.text)
        return 1
      final_data = confirm_response.json()

    elif args.wait_for_webhook_seconds > 0:
      logger.info(
        "Waiting %d seconds for Razorpay payment confirmation...",
        args.wait_for_webhook_seconds,
      )
      time.sleep(args.wait_for_webhook_seconds)

    # Retrieve the authoritative UCP checkout state exactly once after payment
    # processing/confirmation. For an asynchronous Payment Link this lets the
    # server reconcile Razorpay before returning the current checkout status.
    logger.info("\nSTEP 10: Retrieving final checkout status...")
    get_url = f"/checkout-sessions/{checkout_id}"
    get_response = client.get(get_url, headers=get_headers())
    if get_response.status_code != 200:
      logger.error("Get Checkout failed: %s", get_response.text)
      return 1
    final_data = get_response.json()
    logger.info("Retrieved Checkout Status: %s", final_data.get("status"))

    if final_data.get("status") != "completed":
      logger.info(
        "Payment is prepared but not completed. Complete Razorpay Checkout "
        "in a browser/app. Use --prompt_for_razorpay_result in an interactive "
        "run, or --wait_for_webhook_seconds with a configured webhook."
      )
      return 2

    logger.info("Payment captured and merchant order created.")
    logger.info("Checkout Status: %s", final_data["status"])
    logger.info("Order ID: %s", final_data["order"]["id"])
    logger.info("Order Permalink: %s", final_data["order"]["permalink_url"])

    # ==========================================================================

    # DONE

    # ==========================================================================

    logger.info("\nHappy Path completed successfully.")
    return 0

  except Exception:  # pylint: disable=broad-exception-caught
    logger.exception("An unexpected error occurred:")
    return 1

  finally:
    client.close()


if __name__ == "__main__":
  sys.exit(main())
