"""REST product catalog endpoints."""

from typing import Annotated

import dependencies
from fastapi import APIRouter, Depends, Query
from services.catalog_service import CatalogService

router = APIRouter(prefix="/products", tags=["Catalog"])


@router.get("/search")
async def search_catalog(
  catalog_service: Annotated[
    CatalogService, Depends(dependencies.get_catalog_service)
  ],
  q: Annotated[
    str,
    Query(description="Natural-language, title, description, or product ID"),
  ] = "",
  limit: Annotated[int, Query(ge=1, le=50)] = 10,
) -> dict:
  """Search products with ranked exact, keyword, and fuzzy matching."""
  return await catalog_service.search(q, limit)
