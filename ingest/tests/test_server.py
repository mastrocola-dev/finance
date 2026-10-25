import shutil
import sys
from pathlib import Path

import anyio
from mcp.client import Client
from mcp.client.stdio import StdioServerParameters

from ingest.server import build

ROOT = Path(__file__).parent.parent


async def session(server, steps):
    async with Client(server) as client:
        return [await client.call_tool(name, arguments) for name, arguments in steps]


def call(folder, name, arguments):
    [result] = anyio.run(session, build(folder), [(name, arguments)])
    return result


def test_tools_are_read_only(fixtures):
    async def tools():
        async with Client(build(fixtures)) as client:
            return (await client.list_tools()).tools

    listed = anyio.run(tools)
    assert sorted(tool.name for tool in listed) == ['apply_mapping', 'list_segments', 'read_segment']
    assert all(tool.annotations.read_only_hint and not tool.annotations.destructive_hint for tool in listed)


def test_list_segments_through_the_client(fixtures):
    result = call(fixtures, 'list_segments', {'file': 'extrato.ofx'})
    assert not result.is_error
    assert result.structured_content['format'] == 'ofx'
    assert [segment['id'] for segment in result.structured_content['segments']] == ['tree-1', 'tree-2']


def test_digit_runs_are_masked_in_every_tool(tmp_path):
    (tmp_path / 'contas.csv').write_text('Conta;Data;Valor\n0012345678;20261005;12345,67\n', encoding='utf-8')
    listed, read, mapped = anyio.run(
        session,
        build(tmp_path),
        [
            ('list_segments', {'file': 'contas.csv'}),
            ('read_segment', {'file': 'contas.csv', 'source': 'contas!A2:C2'}),
            ('apply_mapping', {'file': 'contas.csv', 'source': 'table-1', 'fields': {'account': 'A'}}),
        ],
    )
    masked = ['••••••5678', '20261005', '12345,67']
    assert listed.structured_content['segments'][0]['preview'][1] == masked
    assert read.structured_content['items'][0]['cells'] == masked
    assert mapped.structured_content['items'][1]['values'] == {'account': '••••••5678'}
    assert '0012345678' not in str([listed.content, read.content, mapped.content])


def test_mapping_through_the_client(fixtures):
    result = call(
        fixtures,
        'apply_mapping',
        {
            'file': 'extrato.ofx',
            'source': '$.OFX.BANKMSGSRSV1.STMTTRNRS.STMTRS.BANKTRANLIST.STMTTRN',
            'fields': {'date': 'DTPOSTED', 'amount': 'TRNAMT', 'memo': 'MEMO'},
        },
    )
    assert [item['values']['amount'] for item in result.structured_content['items']] == [
        '-182.40',
        '5000.00',
        '-64.90',
    ]


def test_files_outside_the_folder_are_refused(tmp_path, fixtures):
    folder = tmp_path / 'importar'
    folder.mkdir()
    shutil.copy(fixtures / 'anotacoes.txt', folder)
    (folder / 'atalho.txt').symlink_to(fixtures / 'anotacoes.txt')
    for file in ['../importar/../outro.txt', '/etc/hostname', 'atalho.txt', 'ausente.txt']:
        result = call(folder, 'read_segment', {'file': file, 'source': 'L1'})
        assert result.is_error
        assert 'no such file in the import folder' in result.content[0].text
    assert not call(folder, 'read_segment', {'file': 'anotacoes.txt', 'source': 'L1'}).is_error


def test_errors_come_back_as_tool_errors(fixtures):
    result = call(fixtures, 'read_segment', {'file': 'extrato.csv', 'source': 'extrato!A1:B'})
    assert result.is_error
    assert 'expected a range like Sheet!A1:F30' in result.content[0].text


def test_stdio_server_answers_an_mcp_client(fixtures):
    server = StdioServerParameters(
        command=sys.executable, args=['-m', 'ingest', 'serve', str(fixtures)], cwd=str(ROOT)
    )
    [result] = anyio.run(session, server, [('read_segment', {'file': 'anotacoes.txt', 'source': 'text-2'})])
    assert result.structured_content['items'][0] == {
        'source': 'L3',
        'text': 'Dia 2 paguei a internet, 119,90, no cartão do Marcio.',
    }
