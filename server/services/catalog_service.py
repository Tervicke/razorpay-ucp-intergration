"""Search the merchant's product catalog."""

from difflib import SequenceMatcher
import re

import config
import db
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

_WORDS = re.compile(r"[a-z0-9]+")


def _normalize(value: str) -> str:
  return " ".join(_WORDS.findall(value.casefold().replace("_", " ")))


def _score(query: str, product: db.Product) -> float:
  """Rank exact, substring, token, and typo-similar catalog matches."""
  product_id = _normalize(product.id)
  title = _normalize(product.title)
  description = _normalize(product.description or "")
  searchable = f"{product_id} {title} {description}".strip()

  if query in (product_id, title):
    return 1.0
  if query in title:
    return 0.95
  if query in product_id:
    return 0.9
  if query in description:
    return 0.85

  query_tokens = set(query.split())
  searchable_tokens = set(searchable.split())
  overlap = len(query_tokens & searchable_tokens) / max(len(query_tokens), 1)
  phrase_similarity = SequenceMatcher(None, query, searchable).ratio()
  word_similarity = max(
    (
      SequenceMatcher(None, query_word, product_word).ratio()
      for query_word in query_tokens
      for product_word in searchable_tokens
    ),
    default=0.0,
  )
  score = overlap * 0.7 + word_similarity * 0.2 + phrase_similarity * 0.1
  return min(0.84, score)


class CatalogService:
  """Read and rank products from the products database."""

  def __init__(self, products_session: AsyncSession):
    """Initialize catalog search with a products database session."""
    self.products_session = products_session

  async def search(self, query: str = "", limit: int = 10) -> dict:
    """Return products ordered by relevance to a natural-language query."""
    if not 1 <= limit <= 50:
      raise ValueError("limit must be between 1 and 50")

    products = list(
      (await self.products_session.execute(select(db.Product))).scalars().all()
    )
    normalized_query = _normalize(query)
    ranked = (
      [(1.0, product) for product in products]
      if not normalized_query
      else [
        (_score(normalized_query, product), product) for product in products
      ]
    )
    ranked = [match for match in ranked if match[0] >= 0.18]
    ranked.sort(key=lambda match: (-match[0], match[1].title.casefold()))

    results = [
      {
        "id": product.id,
        "title": product.title,
        "description": product.description,
        "price": product.price,
        "currency": config.get_default_currency(),
        "image_url": product.image_url,
        "score": round(score, 3),
      }
      for score, product in ranked[:limit]
    ]
    return {"query": query, "count": len(results), "products": results}
