import csv
import io
from pathlib import Path

from ingest.segment import Segment, plain
from ingest.table import table_segments


def decode(data: bytes) -> str:
    try:
        return data.decode('utf-8-sig')
    except UnicodeDecodeError:
        return data.decode('cp1252', errors='replace')


def dialect(sample: str) -> type[csv.Dialect] | str:
    try:
        return csv.Sniffer().sniff(sample, delimiters=',;\t|')
    except csv.Error:
        return 'excel'


def read_csv(path: Path) -> list[Segment]:
    text = decode(path.read_bytes())
    rows = csv.reader(io.StringIO(text, newline=''), dialect(text[:8192]))
    return table_segments(path.stem, [[plain(value) for value in row] for row in rows])
