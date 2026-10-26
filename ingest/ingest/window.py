import json
import re
from collections.abc import Callable

from ingest.address import BadAddress, parse_lines, parse_path, parse_range
from ingest.reader import Document, segments
from ingest.segment import clip
from ingest.table import Box, address
from ingest.tree import bounded, header, resolve

READ_ROWS = 50
MAX_ROWS = 200
RESULT_CHARACTERS = 20_000
VALUE_CHARACTERS = 200
LINE_CHARACTERS = 1_000
SEGMENT_ID = re.compile(r'(table|tree|text)-\d+')

Build = Callable[[int], dict | None]


def target(document: Document, source: str) -> str:
    if not SEGMENT_ID.fullmatch(source):
        return source
    for segment in segments(document):
        if segment['id'] == source:
            return segment['source']
    raise BadAddress(f'{source}: no such segment in {document.name}')


def window(source: str, count: int, build: Build, offset: int, limit: int, maximum: int) -> dict:
    offset = max(0, offset)
    end = min(count, offset + max(1, min(limit, maximum)))
    items: list[dict] = []
    size = 0
    index = offset
    while index < end:
        item = build(index)
        if item is not None:
            size += len(json.dumps(item, ensure_ascii=False, default=str))
            if items and size > RESULT_CHARACTERS:
                break
            items.append(item)
        index += 1
    return {
        'source': source,
        'total': count,
        'offset': offset,
        'items': items,
        'next': index if index < count else None,
    }


def value_at(grid: list[list[object]], row: int, column: int) -> object:
    values = grid[row] if row < len(grid) else []
    return values[column] if column < len(values) else None


def table_range(sheets: dict[str, list[list[object]]], source: str) -> tuple[str, list[list[object]], Box]:
    sheet, (top, left, bottom, right) = parse_range(source)
    if sheet not in sheets:
        raise BadAddress(f'{source}: no sheet named {sheet}')
    grid = sheets[sheet]
    width = max((len(values) for values in grid), default=0)
    if top >= len(grid) or left >= width:
        raise BadAddress(f'{source}: outside the used area of {sheet}')
    return sheet, grid, (top, left, min(bottom, len(grid) - 1), min(right, width - 1))


def tree_items(root: object, source: str) -> list[tuple[str, object]]:
    matches = resolve(root, parse_path(source))
    if not matches:
        raise BadAddress(f'{source}: nothing at this path')
    return [
        expanded
        for path, value in matches
        for expanded in (
            [(f'{path}[{index}]', item) for index, item in enumerate(value)]
            if isinstance(value, list)
            else [(path, value)]
        )
    ]


def read_table(document: Document, source: str) -> tuple[int, Build]:
    sheet, grid, (top, left, bottom, right) = table_range(document.content, source)

    def build(index: int) -> dict:
        row = top + index
        cells = [clip(value_at(grid, row, column), VALUE_CHARACTERS) for column in range(left, right + 1)]
        return {'source': address(sheet, (row, left, row, right)), 'cells': cells}

    return bottom - top + 1, build


def read_tree(document: Document, source: str) -> tuple[int, Build]:
    head = header(document.content, VALUE_CHARACTERS) if source == '$' else None
    if head:
        return 1, lambda index: {'source': '$', 'value': head}
    items = tree_items(document.content, source)
    return len(items), lambda index: {
        'source': items[index][0],
        'value': bounded(items[index][1], 3, VALUE_CHARACTERS),
    }


def read_text(document: Document, source: str) -> tuple[int, Build]:
    prefix, first, last = parse_lines(source)
    lines = document.content.get(prefix)
    if lines is None or first > len(lines):
        raise BadAddress(f'{source}: outside the text of {document.name}')
    last = min(last, len(lines))
    return last - first + 1, lambda index: {
        'source': f'{prefix}L{first + index}',
        'text': clip(lines[first + index - 1], LINE_CHARACTERS),
    }


READERS = {'table': read_table, 'tree': read_tree, 'text': read_text}


def read_segment(document: Document, source: str, offset: int = 0, limit: int = READ_ROWS) -> dict:
    source = target(document, source)
    count, build = READERS[document.kind](document, source)
    return {'kind': document.kind, **window(source, count, build, offset, limit, MAX_ROWS)}
