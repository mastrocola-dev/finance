import json
import re
from collections.abc import Iterator
from pathlib import Path
from xml.etree import ElementTree

from ingest.segment import CELL_LIMIT, PREVIEW_KEYS, PREVIEW_SAMPLES, Segment, clip

Branch = tuple[str, list[object]]


def step(path: str, key: str) -> str:
    if re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*', key):
        return f'{path}.{key}'
    return f'{path}[{json.dumps(key, ensure_ascii=False)}]'


def walk(nodes: list[object], path: str) -> Iterator[Branch]:
    items = [item for node in nodes if isinstance(node, list) for item in node]
    if items:
        yield path, items
        yield from walk(items, f'{path}[*]')
    objects = [node for node in nodes if isinstance(node, dict)]
    for key in dict.fromkeys(key for node in objects for key in node):
        yield from walk([node[key] for node in objects if key in node], step(path, key))


def bounded(value: object, depth: int = 2, limit: int = CELL_LIMIT) -> object:
    if isinstance(value, list):
        return f'[{len(value)} items]'
    if isinstance(value, dict):
        if depth == 0:
            return f'{{{len(value)} keys}}'
        return {key: bounded(value[key], depth - 1, limit) for key in list(value)[:PREVIEW_KEYS]}
    return clip(value, limit)


def resolve(root: object, tokens: list[str | int | None], path: str = '$') -> list[tuple[str, object]]:
    if not tokens:
        return [(path, root)]
    token, rest = tokens[0], tokens[1:]
    if token is None and isinstance(root, list):
        return [match for index, item in enumerate(root) for match in resolve(item, rest, f'{path}[{index}]')]
    if isinstance(token, int) and isinstance(root, list) and -1 < token < len(root):
        return resolve(root[token], rest, f'{path}[{token}]')
    if isinstance(token, str) and isinstance(root, dict) and token in root:
        return resolve(root[token], rest, step(path, token))
    return []


def tree_segments(root: object) -> list[Segment]:
    branches = list(walk([root], '$')) or [('$', [root])]
    return [
        Segment(
            'tree',
            path,
            {
                'items': len(items),
                'keys': list(dict.fromkeys(key for item in items if isinstance(item, dict) for key in item)),
            },
            [bounded(item) for item in items[:PREVIEW_SAMPLES]],
        )
        for path, items in branches
    ]


def attach(parent: dict, key: str, child: object) -> None:
    if key not in parent:
        parent[key] = child
    elif isinstance(parent[key], list):
        parent[key].append(child)
    else:
        parent[key] = [parent[key], child]


def local(tag: str) -> str:
    return tag.rsplit('}', 1)[-1]


def element(node: ElementTree.Element) -> object:
    text = (node.text or '').strip()
    if not len(node) and not node.attrib:
        return text or None
    value: dict = {f'@{local(name)}': attribute for name, attribute in node.attrib.items()}
    if text:
        value['#text'] = text
    for child in node:
        attach(value, local(child.tag), element(child))
    return value


def load_json(path: Path) -> object:
    return json.loads(path.read_text(encoding='utf-8-sig'))


def load_xml(path: Path) -> dict:
    root = ElementTree.parse(path).getroot()
    return {local(root.tag): element(root)}
