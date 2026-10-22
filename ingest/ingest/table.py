import re

from ingest.segment import PREVIEW_COLUMNS, PREVIEW_ROWS, Segment, clip

Cell = tuple[int, int]
Box = tuple[int, int, int, int]


def column_name(index: int) -> str:
    name = ''
    index += 1
    while index:
        index, rest = divmod(index - 1, 26)
        name = chr(65 + rest) + name
    return name


def sheet_reference(sheet: str) -> str:
    if re.fullmatch(r'[A-Za-z0-9_.-]+', sheet):
        return sheet
    return "'" + sheet.replace("'", "''") + "'"


def address(sheet: str, box: Box) -> str:
    top, left, bottom, right = box
    return f'{sheet_reference(sheet)}!{column_name(left)}{top + 1}:{column_name(right)}{bottom + 1}'


def runs(indexes: set[int]) -> list[set[int]]:
    groups: list[list[int]] = []
    for index in sorted(indexes):
        if groups and index == groups[-1][-1] + 1:
            groups[-1].append(index)
        else:
            groups.append([index])
    return [set(group) for group in groups]


def cut(cells: set[Cell]) -> list[Box]:
    bands = runs({row for row, _ in cells})
    if len(bands) > 1:
        return [box for band in bands for box in cut({cell for cell in cells if cell[0] in band})]
    columns = runs({column for _, column in cells})
    if len(columns) > 1 and len(bands[0]) > 1:
        return [box for group in columns for box in cut({cell for cell in cells if cell[1] in group})]
    rows = [row for row, _ in cells]
    used = [column for _, column in cells]
    return [(min(rows), min(used), max(rows), max(used))]


def blocks(grid: list[list[object]]) -> list[Box]:
    cells = {
        (row, column)
        for row, values in enumerate(grid)
        for column, value in enumerate(values)
        if value is not None
    }
    return sorted(cut(cells)) if cells else []


def cell(grid: list[list[object]], row: int, column: int) -> object:
    values = grid[row]
    return values[column] if column < len(values) else None


def table_segments(sheet: str, grid: list[list[object]]) -> list[Segment]:
    segments = []
    for box in blocks(grid):
        top, left, bottom, right = box
        preview = [
            [clip(cell(grid, row, column)) for column in range(left, min(right + 1, left + PREVIEW_COLUMNS))]
            for row in range(top, min(bottom + 1, top + PREVIEW_ROWS))
        ]
        shape = {'rows': bottom - top + 1, 'columns': right - left + 1}
        segments.append(Segment('table', address(sheet, box), shape, preview))
    return segments


def sheet_segments(sheets: dict[str, list[list[object]]]) -> list[Segment]:
    return [segment for sheet, grid in sheets.items() for segment in table_segments(sheet, grid)]
