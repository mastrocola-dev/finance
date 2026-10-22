from collections import Counter
from collections.abc import Callable
from dataclasses import asdict, dataclass
from functools import lru_cache
from pathlib import Path

from ingest.delimited import load_csv
from ingest.ofx import load_ofx
from ingest.segment import Segment
from ingest.table import sheet_segments
from ingest.text import load_pdf, load_txt, text_segments
from ingest.tree import load_json, load_xml, tree_segments
from ingest.workbook import load_xlsx

LOADERS: dict[str, tuple[str, Callable[[Path], object]]] = {
    'xlsx': ('table', load_xlsx),
    'xlsm': ('table', load_xlsx),
    'csv': ('table', load_csv),
    'json': ('tree', load_json),
    'xml': ('tree', load_xml),
    'ofx': ('tree', load_ofx),
    'txt': ('text', load_txt),
    'pdf': ('text', load_pdf),
}

SEGMENTERS: dict[str, Callable[[object], list[Segment]]] = {
    'table': sheet_segments,
    'tree': tree_segments,
    'text': text_segments,
}


class UnsupportedFormat(ValueError):
    pass


@dataclass(frozen=True)
class Document:
    name: str
    format: str
    kind: str
    content: object


@lru_cache(maxsize=4)
def cached(path: Path, file_format: str, changed: int, size: int) -> Document:
    kind, loader = LOADERS[file_format]
    return Document(path.name, file_format, kind, loader(path))


def load(path: Path) -> Document:
    file_format = path.suffix.lower().removeprefix('.')
    if file_format not in LOADERS:
        raise UnsupportedFormat(f'{path.name}: format not supported')
    status = path.stat()
    return cached(path.resolve(), file_format, status.st_mtime_ns, status.st_size)


def segments(document: Document) -> list[dict]:
    counts: Counter[str] = Counter()
    result = []
    for segment in SEGMENTERS[document.kind](document.content):
        counts[segment.kind] += 1
        result.append({'id': f'{segment.kind}-{counts[segment.kind]}', **asdict(segment)})
    return result


def inspect(path: Path) -> dict:
    document = load(path)
    return {'file': document.name, 'format': document.format, 'segments': segments(document)}
