import pytest

from ingest.address import BadAddress
from ingest.mapping import apply_mapping
from ingest.reader import load
from ingest.window import read_segment
from tests.conftest import write_pdf

OFX = '$.OFX.BANKMSGSRSV1.STMTTRNRS.STMTRS.BANKTRANLIST.STMTTRN'


def sources(result):
    return [item['source'] for item in result['items']]


def test_read_a_table_range_in_windows(household):
    document = load(household)
    first = read_segment(document, '2026-10!A8:D10', limit=2)
    assert first['kind'] == 'table'
    assert first['total'] == 3
    assert first['items'][1] == {'source': '2026-10!A9:D9', 'cells': ['Aluguel', '2026-10-05', 2400, True]}
    assert first['next'] == 2
    rest = read_segment(document, '2026-10!A8:D10', offset=first['next'])
    assert sources(rest) == ['2026-10!A10:D10']
    assert rest['next'] is None


def test_segment_ids_and_quoted_sheets_resolve(household):
    document = load(household)
    assert read_segment(document, 'table-2')['source'] == '2026-10!A3:C5'
    notes = read_segment(document, "'Notas da casa'!B2")
    assert notes['items'] == [{'source': "'Notas da casa'!B2:B2", 'cells': ['Planilha fictícia']}]


def test_ranges_are_clamped_to_the_used_area(household):
    result = read_segment(load(household), '2026-10!F3:Z900')
    assert result['total'] == 8
    assert result['items'][0]['cells'] == ['Total receitas', 6200.5]


def test_read_a_tree_path_by_item(fixtures):
    document = load(fixtures / 'carteira.json')
    result = read_segment(document, 'tree-2')
    assert sources(result) == [
        '$.accounts[0].transactions[0]',
        '$.accounts[0].transactions[1]',
        '$.accounts[1].transactions[0]',
    ]
    assert result['items'][0]['value']['tags'] == '[1 items]'
    [item] = read_segment(document, '$.accounts[1].transactions[0]')['items']
    assert item['value']['description'] == 'Cinema'


def test_read_text_lines_by_page(tmp_path):
    document = load(
        write_pdf(tmp_path / 'fatura.pdf', [['Fatura ficticia'], ['Mercado 182,40', 'Total 182,40']])
    )
    result = read_segment(document, 'p2:L1-L9')
    assert result['items'] == [
        {'source': 'p2:L1', 'text': 'Mercado 182,40'},
        {'source': 'p2:L2', 'text': 'Total 182,40'},
    ]


def test_windows_are_bounded_by_size(tmp_path):
    path = tmp_path / 'longo.txt'
    path.write_text('\n'.join('z' * 900 for _ in range(100)), encoding='utf-8')
    result = read_segment(load(path), 'L1-L100', limit=1000)
    assert 0 < len(result['items']) < 30
    assert result['next'] == len(result['items'])


@pytest.mark.parametrize(
    'source', ['2026-10!A1:B', 'Outra!A1:B2', '2026-10!C3:A1', '2026-10!A900:B901', 'table-9', '$.x', 'L1']
)
def test_bad_table_addresses_are_refused(household, source):
    with pytest.raises(BadAddress):
        read_segment(load(household), source)


def test_bad_tree_paths_are_refused(fixtures):
    with pytest.raises(BadAddress):
        read_segment(load(fixtures / 'carteira.json'), '$.accounts[7]')


def test_table_mapping_skips_headers_and_empty_rows(fixtures):
    result = apply_mapping(
        load(fixtures / 'extrato.csv'),
        'table-1',
        {'date': 'A', 'description': 'B', 'amount': 'C'},
        skip_rows=1,
    )
    assert result['total'] == 3
    assert result['items'][1] == {
        'source': 'extrato!A3:D3',
        'values': {'date': '03/10/2026', 'description': 'Salário Empresa Fictícia', 'amount': '5.000,00'},
    }


def test_tree_mapping_reads_relative_paths(fixtures):
    result = apply_mapping(
        load(fixtures / 'orcamento.xml'),
        'tree-1',
        {'category': '["@categoria"]', 'amount': 'valor', 'note': 'x'},
    )
    assert result['items'][1] == {
        'source': '$.orcamento.despesas.despesa[1]',
        'values': {'category': 'Transporte', 'amount': '300.00', 'note': None},
    }


def test_mapping_columns_must_be_inside_the_range(household):
    with pytest.raises(BadAddress):
        apply_mapping(load(household), '2026-10!A8:D10', {'amount': 'E'})


def test_text_has_no_mapping(fixtures):
    with pytest.raises(BadAddress):
        apply_mapping(load(fixtures / 'anotacoes.txt'), 'text-2', {'amount': 'A'})
