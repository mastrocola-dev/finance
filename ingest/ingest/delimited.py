import csv
import io
from collections import Counter
from pathlib import Path

from ingest.segment import plain


def decode(data: bytes) -> str:
    try:
        return data.decode('utf-8-sig')
    except UnicodeDecodeError:
        return data.decode('cp1252', errors='replace')


def score(sample: str, candidate: str) -> int:
    widths = Counter(len(row) for row in csv.reader(io.StringIO(sample), delimiter=candidate) if row)
    lines, columns = max((lines, columns) for columns, lines in widths.items()) if widths else (0, 1)
    return lines * (columns - 1)


def delimiter(sample: str) -> str:
    return max(',;\t|', key=lambda candidate: score(sample, candidate))


def load_csv(path: Path) -> dict[str, list[list[object]]]:
    text = decode(path.read_bytes())
    rows = csv.reader(io.StringIO(text, newline=''), delimiter=delimiter(text[:8192]))
    return {path.stem: [[plain(value) for value in row] for row in rows]}
