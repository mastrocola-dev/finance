import json
import re

from ingest.table import Box

RANGE = re.compile(
    r"(?:'(?P<quoted>(?:[^']|'')+)'|(?P<plain>[^!']+))!(?P<start>[A-Z]+\d+)(?::(?P<end>[A-Z]+\d+))?"
)
CELL = re.compile(r'([A-Z]+)(\d+)')
TOKEN = re.compile(r'\.([A-Za-z_][A-Za-z0-9_]*)|\[(\*|\d+|"(?:[^"\\]|\\.)*")\]')
LINES = re.compile(r'(?P<prefix>p\d+:)?L(?P<first>\d+)(?:-L(?P<last>\d+))?')

Token = str | int | None


class BadAddress(ValueError):
    pass


def column_index(letters: str) -> int:
    index = 0
    for letter in letters:
        index = index * 26 + ord(letter) - 64
    return index - 1


def cell_position(reference: str) -> tuple[int, int]:
    letters, digits = CELL.fullmatch(reference).groups()
    if int(digits) < 1:
        raise BadAddress(f'{reference}: rows start at 1')
    return int(digits) - 1, column_index(letters)


def parse_range(source: str) -> tuple[str, Box]:
    match = RANGE.fullmatch(source)
    if match is None:
        raise BadAddress(f'{source}: expected a range like Sheet!A1:F30')
    sheet = match['plain'] or match['quoted'].replace("''", "'")
    top, left = cell_position(match['start'])
    bottom, right = cell_position(match['end'] or match['start'])
    if bottom < top or right < left:
        raise BadAddress(f'{source}: range must go from top left to bottom right')
    return sheet, (top, left, bottom, right)


def parse_path(source: str) -> list[Token]:
    if not source.startswith('$'):
        raise BadAddress(f'{source}: expected a path like $.items[0]')
    tokens: list[Token] = []
    position = 1
    while position < len(source):
        match = TOKEN.match(source, position)
        if match is None:
            raise BadAddress(f'{source}: cannot read the path at character {position + 1}')
        key, index = match.groups()
        if key is not None:
            tokens.append(key)
        elif index == '*':
            tokens.append(None)
        elif index.startswith('"'):
            tokens.append(json.loads(index))
        else:
            tokens.append(int(index))
        position = match.end()
    return tokens


def parse_lines(source: str) -> tuple[str, int, int]:
    match = LINES.fullmatch(source)
    if match is None:
        raise BadAddress(f'{source}: expected lines like L3-L9 or p2:L1-L4')
    first = int(match['first'])
    last = int(match['last'] or first)
    if first < 1 or last < first:
        raise BadAddress(f'{source}: lines start at 1 and go forward')
    return match['prefix'] or '', first, last
