"""Metadata surface for Alembic autogenerate.

`app.models` imports every model, so importing it here guarantees autogenerate
sees the full schema. Miss a model and autogenerate will cheerfully write a
migration that drops its table.
"""
import app.models  # noqa: F401  (registers every mapper)
from app.models.base import Base

# Pin storage options on every table in one place rather than repeating
# __table_args__ on sixteen models. Without this, tables inherit the *database*
# default charset — so a schema created without "CHARACTER SET utf8mb4" would
# silently produce latin1 tables and corrupt any non-ASCII text on write.
for _table in Base.metadata.tables.values():
    _table.kwargs.setdefault("mysql_engine", "InnoDB")
    _table.kwargs.setdefault("mysql_charset", "utf8mb4")
    _table.kwargs.setdefault("mysql_collate", "utf8mb4_unicode_ci")

__all__ = ["Base"]
