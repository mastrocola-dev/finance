from collections import Counter
from collections.abc import Callable
from dataclasses import asdict
from pathlib import Path

from ingest.delimited import read_csv
from ingest.ofx import read_ofx
from ingest.segment import Segment
from ingest.text import read_pdf, read_txt
from ingest.tree import read_json, read_xml
from ingest.workbook import read_xlsx

READERS: dict[str, Callable[[Path], list[Segment]]] = {
    'xlsx': read_xlsx,
    'xlsm': read_xlsx,
    'csv': read_csv,
    'json': read_json,
    'xml': read_xml,
    'txt': read_txt,
    'ofx': read_ofx,
    'pdf': read_pdf,
}


class UnsupportedFormat(ValueError):
    pass


def inspect(path: Path) -> dict:
    file_format = path.suffix.lower().removeprefix('.')
    reader = READERS.get(file_format)
    if reader is None:
        raise UnsupportedFormat(f'{path.name}: format not supported')
    counts: Counter[str] = Counter()
    segments = []
    for segment in reader(path):
        counts[segment.kind] += 1
        segments.append({'id': f'{segment.kind}-{counts[segment.kind]}', **asdict(segment)})
    return {'file': path.name, 'format': file_format, 'segments': segments}
