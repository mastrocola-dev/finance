import csv
import io
from pathlib import Path

from ingest.segment import plain


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


def load_csv(path: Path) -> dict[str, list[list[object]]]:
    text = decode(path.read_bytes())
    rows = csv.reader(io.StringIO(text, newline=''), dialect(text[:8192]))
    return {path.stem: [[plain(value) for value in row] for row in rows]}
