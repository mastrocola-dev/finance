from dataclasses import dataclass
from datetime import date, datetime, time
from decimal import Decimal

PREVIEW_ROWS = 5
PREVIEW_COLUMNS = 12
PREVIEW_SAMPLES = 3
PREVIEW_KEYS = 20
PREVIEW_TEXT = 400
CELL_LIMIT = 40


@dataclass(frozen=True)
class Segment:
    kind: str
    source: str
    shape: dict
    preview: object


def clip(value: object, limit: int = CELL_LIMIT) -> object:
    if isinstance(value, str) and len(value) > limit:
        return value[: limit - 1] + '…'
    return value


def plain(value: object) -> object:
    if isinstance(value, datetime):
        return value.date().isoformat() if value.time() == time() else value.isoformat()
    if isinstance(value, date | time):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, str):
        return value.strip() or None
    return value
