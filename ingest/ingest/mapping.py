from ingest.address import BadAddress, column_index, parse_path
from ingest.reader import Document
from ingest.table import address
from ingest.tree import bounded, resolve
from ingest.window import VALUE_CHARACTERS, Build, table_range, target, tree_items, value_at, window

MAPPING_ROWS = 500
MAX_MAPPING_ROWS = 2000
MAX_FIELDS = 30


def check_fields(fields: dict[str, str]) -> None:
    if not fields or len(fields) > MAX_FIELDS:
        raise BadAddress(f'a mapping needs between 1 and {MAX_FIELDS} fields')


def map_table(document: Document, source: str, fields: dict[str, str], skip_rows: int) -> tuple[int, Build]:
    sheet, grid, (top, left, bottom, right) = table_range(document.content, source)
    columns = {}
    for field, letters in fields.items():
        if not letters.isalpha() or not letters.isupper() or not left <= column_index(letters) <= right:
            raise BadAddress(f'{field}: column {letters} is not inside {source}')
        columns[field] = column_index(letters)
    first = top + max(0, skip_rows)

    def build(index: int) -> dict | None:
        row = first + index
        values = {field: value_at(grid, row, column) for field, column in columns.items()}
        if all(value is None for value in values.values()):
            return None
        return {'source': address(sheet, (row, left, row, right)), 'values': values}

    return max(0, bottom - first + 1), build


def relative(path: str) -> list[str | int | None]:
    return parse_path('$' + path if path.startswith('[') else '$.' + path)


def map_tree(document: Document, source: str, fields: dict[str, str], skip_rows: int) -> tuple[int, Build]:
    items = tree_items(document.content, source)
    paths = {field: relative(path) for field, path in fields.items()}

    def build(index: int) -> dict:
        path, item = items[index]
        values = {}
        for field, tokens in paths.items():
            matches = resolve(item, tokens)
            values[field] = bounded(matches[0][1], 1, VALUE_CHARACTERS) if matches else None
        return {'source': path, 'values': values}

    return len(items), build


def map_text(document: Document, source: str, fields: dict[str, str], skip_rows: int) -> tuple[int, Build]:
    raise BadAddress(f'{source}: text has no columns or paths, read it with read_segment')


MAPPERS = {'table': map_table, 'tree': map_tree, 'text': map_text}


def apply_mapping(
    document: Document,
    source: str,
    fields: dict[str, str],
    skip_rows: int = 0,
    offset: int = 0,
    limit: int = MAPPING_ROWS,
) -> dict:
    check_fields(fields)
    source = target(document, source)
    count, build = MAPPERS[document.kind](document, source, fields, skip_rows)
    return {'kind': document.kind, **window(source, count, build, offset, limit, MAX_MAPPING_ROWS)}
