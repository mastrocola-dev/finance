import json

import pytest

from ingest.__main__ import main
from ingest.reader import UnsupportedFormat, inspect
from ingest.segment import CELL_LIMIT, PREVIEW_ROWS
from ingest.text import NoText
from tests.conftest import write_pdf


def sources(result):
    return [(segment['id'], segment['source']) for segment in result['segments']]


def test_messy_workbook_yields_one_table_per_block(household):
    result = inspect(household)
    assert result['format'] == 'xlsx'
    assert sources(result) == [
        ('table-1', '2026-10!A1:A1'),
        ('table-2', '2026-10!A3:C5'),
        ('table-3', '2026-10!F3:G4'),
        ('table-4', '2026-10!A8:D10'),
        ('table-5', "'Notas da casa'!B2:B2"),
    ]
    fixed = result['segments'][3]
    assert fixed['shape'] == {'rows': 3, 'columns': 4}
    assert fixed['preview'][1] == ['Aluguel', '2026-10-05', 2400, True]


def test_table_preview_is_bounded(tmp_path):
    path = tmp_path / 'longo.csv'
    path.write_text('\n'.join(f'{row},{"x" * 90}' for row in range(30)), encoding='utf-8')
    [segment] = inspect(path)['segments']
    assert segment['shape'] == {'rows': 30, 'columns': 2}
    assert len(segment['preview']) == PREVIEW_ROWS
    assert len(segment['preview'][0][1]) == CELL_LIMIT


def test_csv_with_semicolons_in_windows_encoding(fixtures):
    result = inspect(fixtures / 'extrato.csv')
    assert sources(result) == [('table-1', 'extrato!A1:D4'), ('table-2', 'extrato!A6:D6')]
    assert result['segments'][0]['preview'][0] == ['Data', 'Descrição', 'Valor', 'Saldo']
    assert result['segments'][1]['preview'] == [['Saldo final', None, None, '8.752,70']]


def test_json_arrays_become_tree_segments_with_samples(fixtures):
    result = inspect(fixtures / 'carteira.json')
    assert sources(result) == [
        ('tree-1', '$.accounts'),
        ('tree-2', '$.accounts[*].transactions'),
        ('tree-3', '$.accounts[*].transactions[*].tags'),
    ]
    accounts, transactions, _ = result['segments']
    assert accounts['preview'][0] == {'name': 'Conta conjunta', 'transactions': '[2 items]'}
    assert transactions['shape'] == {'items': 3, 'keys': ['date', 'description', 'amount', 'tags']}
    assert transactions['preview'][2]['description'] == 'Cinema'


def test_json_without_arrays_is_one_root_segment(tmp_path):
    path = tmp_path / 'resumo.json'
    path.write_text(json.dumps({'mês': '2026-10', 'saldo': 10.5}), encoding='utf-8')
    assert sources(inspect(path)) == [('tree-1', '$')]


def test_xml_repeated_elements_become_a_tree_segment(fixtures):
    result = inspect(fixtures / 'orcamento.xml')
    assert sources(result) == [('tree-1', '$.orcamento.despesas.despesa')]
    [segment] = result['segments']
    assert segment['shape']['items'] == 3
    assert segment['preview'][0] == {'@categoria': 'Alimentação', 'descricao': 'Feira', 'valor': '210.50'}


def test_ofx_statement_lists_transactions(fixtures):
    result = inspect(fixtures / 'extrato.ofx')
    path = '$.OFX.BANKMSGSRSV1.STMTTRNRS.STMTRS.BANKTRANLIST.STMTTRN'
    assert sources(result) == [('tree-1', path)]
    [segment] = result['segments']
    assert segment['shape']['items'] == 3
    assert segment['preview'][1] == {
        'TRNTYPE': 'CREDIT',
        'DTPOSTED': '20261003',
        'TRNAMT': '5000.00',
        'FITID': 'A2',
        'MEMO': 'Salario Empresa Ficticia',
    }


def test_text_passages_split_on_blank_lines(fixtures):
    result = inspect(fixtures / 'anotacoes.txt')
    assert sources(result) == [('text-1', 'L1'), ('text-2', 'L3-L4'), ('text-3', 'L6')]
    assert result['segments'][1]['preview'].startswith('Dia 2 paguei a internet')


def test_long_passages_are_cut_and_previews_bounded(tmp_path):
    path = tmp_path / 'longo.txt'
    path.write_text('\n'.join(f'linha {number} ' + 'y' * 20 for number in range(1, 51)), encoding='utf-8')
    result = inspect(path)
    assert sources(result) == [('text-1', 'L1-L40'), ('text-2', 'L41-L50')]
    assert len(result['segments'][0]['preview']) == 400


def test_pdf_text_layer_by_page_and_line(tmp_path):
    path = write_pdf(tmp_path / 'fatura.pdf', [['Fatura ficticia', 'Total 182,40'], ['Mercado 182,40']])
    result = inspect(path)
    assert sources(result) == [('text-1', 'p1:L1-L2'), ('text-2', 'p2:L1')]
    assert result['segments'][0]['preview'] == 'Fatura ficticia\nTotal 182,40'


def test_pdf_without_text_is_refused(tmp_path):
    with pytest.raises(NoText):
        inspect(write_pdf(tmp_path / 'scan.pdf', [[]]))


def test_unknown_format_is_refused(tmp_path):
    with pytest.raises(UnsupportedFormat):
        inspect(tmp_path / 'foto.heic')


def test_cli_prints_json(fixtures, capsys):
    assert main(['inspect', str(fixtures / 'anotacoes.txt')]) == 0
    printed = json.loads(capsys.readouterr().out)
    assert printed['file'] == 'anotacoes.txt'
    assert printed['segments'][0]['kind'] == 'text'


def test_cli_reports_errors(tmp_path, capsys):
    assert main(['inspect', str(tmp_path / 'ausente.csv')]) == 1
    assert capsys.readouterr().err.startswith('ingest: ')


def test_cli_serve_needs_a_folder(tmp_path, capsys):
    assert main(['serve', str(tmp_path / 'ausente')]) == 1
    assert 'is not a folder' in capsys.readouterr().err
