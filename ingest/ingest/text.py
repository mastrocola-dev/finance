from pathlib import Path

import pdfplumber

from ingest.delimited import decode
from ingest.segment import PREVIEW_TEXT, Segment, clip

PASSAGE_LINES = 40


class NoText(ValueError):
    pass


def lines_label(first: int, last: int) -> str:
    return f'L{first}' if first == last else f'L{first}-L{last}'


def passages(lines: list[str], prefix: str = '') -> list[Segment]:
    groups: list[list[tuple[int, str]]] = []
    current: list[tuple[int, str]] = []
    for number, line in enumerate(lines, 1):
        if line.strip():
            current.append((number, line.rstrip()))
        if current and (not line.strip() or len(current) == PASSAGE_LINES):
            groups.append(current)
            current = []
    if current:
        groups.append(current)
    return [
        Segment(
            'text',
            prefix + lines_label(group[0][0], group[-1][0]),
            {'lines': len(group)},
            clip('\n'.join(line for _, line in group), PREVIEW_TEXT),
        )
        for group in groups
    ]


def read_txt(path: Path) -> list[Segment]:
    return passages(decode(path.read_bytes()).splitlines())


def read_pdf(path: Path) -> list[Segment]:
    with pdfplumber.open(path) as document:
        pages = [(page.page_number, page.extract_text() or '') for page in document.pages]
    if not any(text.strip() for _, text in pages):
        raise NoText(f'{path.name} has no text layer')
    return [segment for number, text in pages for segment in passages(text.splitlines(), f'p{number}:')]
