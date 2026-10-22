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


def text_segments(pages: dict[str, list[str]]) -> list[Segment]:
    return [segment for prefix, lines in pages.items() for segment in passages(lines, prefix)]


def load_txt(path: Path) -> dict[str, list[str]]:
    return {'': decode(path.read_bytes()).splitlines()}


def load_pdf(path: Path) -> dict[str, list[str]]:
    with pdfplumber.open(path) as document:
        pages = {f'p{page.page_number}:': (page.extract_text() or '').splitlines() for page in document.pages}
    if not any(line.strip() for lines in pages.values() for line in lines):
        raise NoText(f'{path.name} has no text layer')
    return pages
