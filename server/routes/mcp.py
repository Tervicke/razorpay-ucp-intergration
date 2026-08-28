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

"""MCP JSON-RPC transport for the UCP shopping service.

The tools are thin adapters over the same application functions used by the
REST routes. Both transports therefore share validation, idempotency, database
transactions, fulfillment, payment, Razorpay, and error behavior.
"""

import json
import logging
from typing import Annotated, Any
import uuid

import config
import dependencies
from exceptions import UcpError
from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import JSONResponse
import models
from pydantic import ValidationError
from routes import ucp_implementation
from services.cart_service import CartService
from services.catalog_service import CatalogService
from services.checkout_service import CheckoutService
from ucp_sdk.models.schemas.shopping.checkout_complete_request import (
  CheckoutCompleteRequest,
)

router = APIRouter()
logger = logging.getLogger(__name__)

MCP_PROTOCOL_VERSION = "2025-06-18"

_META_SCHEMA = {
  "type": "object",
  "description": "UCP request metadata. Reuse the idempotency key on retries.",
  "required": ["ucp-agent"],
  "properties": {
    "ucp-agent": {
      "type": "object",
      "required": ["profile"],
      "properties": {"profile": {"type": "string", "format": "uri"}},
      "additionalProperties": True,
    },
    "request-id": {"type": "string"},
    "idempotency-key": {"type": "string", "minLength": 1},
  },
  "additionalProperties": True,
}


def _schema(properties: dict[str, Any], required: list[str]) -> dict[str, Any]:
  return {
    "type": "object",
    "properties": {"meta": _META_SCHEMA, **properties},
    "required": ["meta", *required],
    "additionalProperties": False,
  }


_TOOLS: list[dict[str, Any]] = [
  {
    "name": "search_catalog",
    "description": (
      "Search the merchant catalog by product id, title, description, or "
      "approximate spelling. An empty query browses the full catalog."
    ),
    "inputSchema": _schema(
      {
        "query": {"type": "string", "default": ""},
        "limit": {
          "type": "integer",
          "minimum": 1,
          "maximum": 50,
          "default": 10,
        },
      },
      [],
    ),
  },
  {
    "name": "create_checkout",
    "description": "Create a UCP checkout using the merchant business logic.",
    "inputSchema": _schema(
      {"checkout": models.UnifiedCheckoutCreateRequest.model_json_schema()},
      ["checkout"],
    ),
  },
  {
    "name": "get_checkout",
    "description": "Get the current state of a UCP checkout.",
    "inputSchema": _schema({"id": {"type": "string", "minLength": 1}}, ["id"]),
  },
  {
    "name": "update_checkout",
    "description": "Update items, fulfillment, discounts, or buyer details.",
    "inputSchema": _schema(
      {
        "id": {"type": "string", "minLength": 1},
        "checkout": models.UnifiedCheckoutUpdateRequest.model_json_schema(),
      },
      ["id", "checkout"],
    ),
  },
  {
    "name": "complete_checkout",
    "description": (
      "Complete a checkout using its selected payment handler. Razorpay may "
      "return complete_in_progress with a hosted payment URL."
    ),
    "inputSchema": _schema(
      {
        "id": {"type": "string", "minLength": 1},
        "checkout": CheckoutCompleteRequest.model_json_schema(),
      },
      ["id", "checkout"],
    ),
  },
  {
    "name": "cancel_checkout",
    "description": "Cancel an open UCP checkout.",
    "inputSchema": _schema({"id": {"type": "string", "minLength": 1}}, ["id"]),
  },
  {
    "name": "create_cart",
    "description": "Create a UCP cart using the merchant business logic.",
    "inputSchema": _schema(
      {"cart": models.UnifiedCartCreateRequest.model_json_schema()}, ["cart"]
    ),
  },
  {
    "name": "get_cart",
    "description": "Get the current state of a UCP cart.",
    "inputSchema": _schema({"id": {"type": "string", "minLength": 1}}, ["id"]),
  },
  {
    "name": "update_cart",
    "description": "Replace the mutable state of a UCP cart.",
    "inputSchema": _schema(
      {
        "id": {"type": "string", "minLength": 1},
        "cart": models.UnifiedCartUpdateRequest.model_json_schema(),
      },
      ["id", "cart"],
    ),
  },
  {
    "name": "cancel_cart",
    "description": "Cancel an open UCP cart.",
    "inputSchema": _schema({"id": {"type": "string", "minLength": 1}}, ["id"]),
  },
]


def _result(request_id: Any, result: Any) -> JSONResponse:
  return JSONResponse({"jsonrpc": "2.0", "id": request_id, "result": result})


def _error(request_id: Any, code: int, message: str) -> JSONResponse:
  return JSONResponse(
    {
      "jsonrpc": "2.0",
      "id": request_id,
      "error": {"code": code, "message": message},
    }
  )


def _tool_result(data: Any, *, is_error: bool = False) -> dict[str, Any]:
  if hasattr(data, "model_dump"):
    data = data.model_dump(
      mode="json", by_alias=True, exclude_none=True, exclude_unset=False
    )
  result = {
    "content": [
      {
        "type": "text",
        "text": json.dumps(data, separators=(",", ":"), default=str),
      }
    ],
    "structuredContent": data,
  }
  if is_error:
    result["isError"] = True
  return result


def _common_headers(
  request: Request, meta: dict[str, Any], request_id: Any
) -> dependencies.CommonHeaders:
  agent = meta.get("ucp-agent")
  if not isinstance(agent, dict) or not isinstance(agent.get("profile"), str):
    raise ValueError('meta["ucp-agent"].profile is required')
  ucp_agent = request.headers.get("ucp-agent") or (
    f'profile="{agent["profile"]}";version="{config.get_server_version()}"'
  )
  return dependencies.CommonHeaders(
    x_api_key=request.headers.get("x-api-key"),
    ucp_agent=ucp_agent,
    request_signature=request.headers.get("request-signature"),
    request_id=str(meta.get("request-id") or request_id),
  )


def _idempotency_key(
  meta: dict[str, Any], name: str, request_id: Any, *, required: bool = False
) -> str:
  key = meta.get("idempotency-key")
  if isinstance(key, str) and key.strip():
    return key
  if required:
    raise ValueError(f'meta["idempotency-key"] is required for {name}')
  profile = meta["ucp-agent"]["profile"]
  return str(uuid.uuid5(uuid.NAMESPACE_URL, f"{profile}:{name}:{request_id}"))


async def _execute_tool(
  name: str,
  arguments: dict[str, Any],
  request: Request,
  request_id: Any,
  checkout_service: CheckoutService,
  cart_service: CartService,
  catalog_service: CatalogService,
) -> Any:
  """Validate a tool invocation and call the shared UCP application layer."""
  meta = arguments.get("meta")
  if not isinstance(meta, dict):
    raise ValueError("arguments.meta must be an object")

  common_headers = _common_headers(request, meta, request_id)
  await dependencies.validate_ucp_headers(common_headers.ucp_agent)

  if name == "search_catalog":
    query = arguments.get("query", "")
    limit = arguments.get("limit", 10)
    if not isinstance(query, str):
      raise ValueError("arguments.query must be a string")
    if not isinstance(limit, int) or isinstance(limit, bool):
      raise ValueError("arguments.limit must be an integer")
    return await catalog_service.search(query, limit)

  if name == "create_checkout":
    checkout = models.UnifiedCheckoutCreateRequest.model_validate(
      arguments.get("checkout")
    )
    return await ucp_implementation.create_checkout(
      checkout,
      common_headers,
      _idempotency_key(meta, name, request_id),
      checkout_service,
    )

  if name == "create_cart":
    cart = models.UnifiedCartCreateRequest.model_validate(arguments.get("cart"))
    return await ucp_implementation.create_cart(
      cart,
      common_headers,
      _idempotency_key(meta, name, request_id),
      cart_service,
    )

  checkout_id = arguments.get("id")
  if not isinstance(checkout_id, str) or not checkout_id:
    raise ValueError("arguments.id must be a non-empty string")

  if name == "get_checkout":
    return await ucp_implementation.get_checkout(
      checkout_id, common_headers, checkout_service
    )
  if name == "update_checkout":
    checkout = models.UnifiedCheckoutUpdateRequest.model_validate(
      arguments.get("checkout")
    )
    return await ucp_implementation.update_checkout(
      checkout_id,
      checkout,
      common_headers,
      _idempotency_key(meta, name, request_id),
      checkout_service,
    )
  if name == "complete_checkout":
    checkout = CheckoutCompleteRequest.model_validate(arguments.get("checkout"))
    return await ucp_implementation.complete_checkout(
      checkout_id,
      checkout,
      common_headers,
      _idempotency_key(meta, name, request_id, required=True),
      checkout_service,
    )
  if name == "cancel_checkout":
    return await ucp_implementation.cancel_checkout(
      checkout_id,
      common_headers,
      _idempotency_key(meta, name, request_id, required=True),
      checkout_service,
    )

  if name == "get_cart":
    return await ucp_implementation.get_cart(
      checkout_id, common_headers, cart_service
    )
  if name == "update_cart":
    cart = models.UnifiedCartUpdateRequest.model_validate(arguments.get("cart"))
    return await ucp_implementation.update_cart(
      checkout_id,
      cart,
      common_headers,
      _idempotency_key(meta, name, request_id),
      cart_service,
    )
  if name == "cancel_cart":
    return await ucp_implementation.cancel_cart(
      checkout_id,
      common_headers,
      _idempotency_key(meta, name, request_id, required=True),
      cart_service,
    )
  raise ValueError(f"Unknown tool: {name}")


@router.post("/mcp", dependencies=[Depends(dependencies.verify_signature)])
async def mcp_endpoint(
  request: Request,
  checkout_service: Annotated[
    CheckoutService, Depends(dependencies.get_checkout_service)
  ],
  cart_service: Annotated[CartService, Depends(dependencies.get_cart_service)],
  catalog_service: Annotated[
    CatalogService, Depends(dependencies.get_catalog_service)
  ],
) -> Response:
  """Handle MCP initialize, tool discovery, and checkout tool execution."""
  try:
    payload = await request.json()
  except Exception:
    return _error(None, -32700, "Parse error")

  if not isinstance(payload, dict):
    return _error(None, -32600, "Invalid Request")

  method = payload.get("method")
  request_id = payload.get("id")

  if (
    request_id is None
    and isinstance(method, str)
    and method.startswith("notifications/")
  ):
    return Response(status_code=202)

  if method == "initialize":
    return _result(
      request_id,
      {
        "protocolVersion": MCP_PROTOCOL_VERSION,
        "capabilities": {"tools": {"listChanged": False}},
        "serverInfo": {
          "name": "razorpay-ucp-shopping-server",
          "version": config.get_server_version(),
        },
      },
    )

  if method == "ping":
    return _result(request_id, {})

  if method == "tools/list":
    return _result(request_id, {"tools": _TOOLS})

  if method == "tools/call":
    params = payload.get("params")
    if not isinstance(params, dict):
      return _error(request_id, -32602, "params must be an object")
    name = params.get("name")
    arguments = params.get("arguments", {})
    if not isinstance(name, str) or not isinstance(arguments, dict):
      return _error(
        request_id, -32602, "params.name and params.arguments are required"
      )
    try:
      data = await _execute_tool(
        name,
        arguments,
        request,
        request_id,
        checkout_service,
        cart_service,
        catalog_service,
      )
      return _result(request_id, _tool_result(data))
    except (ValidationError, ValueError) as exc:
      return _error(request_id, -32602, str(exc))
    except UcpError as exc:
      return _result(
        request_id,
        _tool_result(
          {
            "code": exc.code,
            "message": exc.message,
            "status": exc.status_code,
            "severity": str(exc.severity),
          },
          is_error=True,
        ),
      )
    except Exception:
      logger.exception("Unhandled MCP tool failure for %s", name)
      return _result(
        request_id,
        _tool_result(
          {"code": "INTERNAL_ERROR", "message": "Tool execution failed"},
          is_error=True,
        ),
      )

  return _error(request_id, -32601, f"Method not found: {method}")
