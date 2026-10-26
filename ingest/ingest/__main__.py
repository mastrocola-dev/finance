import argparse
import json
import sys
from pathlib import Path

from ingest.reader import inspect
from ingest.server import build


def main(arguments: list[str]) -> int:
    parser = argparse.ArgumentParser(prog='python -m ingest')
    commands = parser.add_subparsers(dest='command', required=True)
    commands.add_parser('inspect', help='print the segments of a file as JSON').add_argument(
        'file', type=Path
    )
    commands.add_parser('serve', help='serve read-only MCP tools over stdio for one folder').add_argument(
        'folder', type=Path
    )
    options = parser.parse_args(arguments)
    if options.command == 'serve':
        if not options.folder.is_dir():
            print(f'ingest: {options.folder} is not a folder', file=sys.stderr)
            return 1
        build(options.folder).run()
        return 0
    try:
        result = inspect(options.file)
    except (OSError, ValueError) as error:
        print(f'ingest: {error}', file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
