import re
from pathlib import Path

from ingest.delimited import decode
from ingest.segment import Segment
from ingest.tree import attach, tree_segments

TAG = re.compile(r'<(/?)([A-Za-z0-9._]+)>([^<]*)')


def parse(text: str) -> dict:
    root: dict = {}
    stack: list[tuple[str, dict]] = [('', root)]
    for closing, name, content in TAG.findall(text):
        value = content.strip()
        if closing:
            if any(open_name == name for open_name, _ in stack[1:]):
                while stack.pop()[0] != name:
                    pass
        elif value:
            attach(stack[-1][1], name, value)
        else:
            child: dict = {}
            attach(stack[-1][1], name, child)
            stack.append((name, child))
    return root


def read_ofx(path: Path) -> list[Segment]:
    return tree_segments(parse(decode(path.read_bytes())))
