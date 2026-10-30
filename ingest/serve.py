import sys

from ingest.__main__ import main

if __name__ == '__main__':
    sys.exit(main(['serve', *sys.argv[1:]]))
