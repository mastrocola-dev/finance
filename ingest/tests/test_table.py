import pytest

from ingest.table import address, blocks, column_name


@pytest.mark.parametrize(('index', 'name'), [(0, 'A'), (25, 'Z'), (26, 'AA'), (701, 'ZZ'), (702, 'AAA')])
def test_column_names(index, name):
    assert column_name(index) == name


def test_addresses_quote_sheet_names_with_spaces_and_quotes():
    assert address('2026-10', (0, 0, 29, 5)) == '2026-10!A1:F30'
    assert address("Gabi's sheet", (2, 1, 2, 1)) == "'Gabi''s sheet'!B3:B3"


def test_blocks_split_on_empty_rows_and_columns():
    grid = [
        ['a', 'b', None, 'x'],
        ['c', None, None, 'y'],
        [None, None, None, None],
        [None, 'd', 'e'],
    ]
    assert blocks(grid) == [(0, 0, 1, 1), (0, 3, 1, 3), (3, 1, 3, 2)]


def test_blocks_recurse_inside_a_column_band():
    grid = [
        ['a', None, 'x'],
        [None, None, 'y'],
        ['b', None, 'z'],
    ]
    assert blocks(grid) == [(0, 0, 0, 0), (0, 2, 2, 2), (2, 0, 2, 0)]


def test_empty_grid_has_no_blocks():
    assert blocks([[None, None], []]) == []


def test_a_single_row_stays_whole_across_gaps():
    assert blocks([['Total', None, None, 10]]) == [(0, 0, 0, 3)]
