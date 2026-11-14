import io
import sys
import zipfile
from datetime import UTC, datetime
from pathlib import Path

from fpdf import FPDF
from openpyxl import Workbook
from openpyxl.writer.excel import ExcelWriter
from openpyxl.xml import LXML

HEADER = ['Item', 'Dia', 'Valor', 'Quem', 'Pago?']


def household_month(title, income, fixed, variable):
    blocks = [
        ('RECEITAS', 'Total receitas', income),
        ('FIXAS', 'Total fixas', fixed),
        ('VARIÁVEIS', 'Total variáveis', variable),
    ]
    rows = [[title], []]
    balance = 0
    for name, label, lines in blocks:
        total = round(sum(line[2] for line in lines), 2)
        balance += total if name == 'RECEITAS' else -total
        rows += [[name], HEADER, *lines, [label, None, total], []]
    return [*rows, ['SALDO DO MÊS', None, round(balance, 2)]]


HOUSEHOLD = {
    'Set-26': household_month(
        'Orçamento da casa - setembro/2026',
        [['Salário Marcio', 5, 6800, 'Marcio', 'sim'], ['Salário Gabriela', 5, 5900, 'Gabi', 'sim']],
        [
            ['Aluguel', 10, 2200, 'Conjunto', 'sim'],
            ['Condomínio', 10, 650, 'Conjunto', 'sim'],
            ['Internet', 15, 120, 'Conjunto', 'sim'],
            ['Parcela carro (2/36)', 20, 980, 'Marcio', 'sim'],
        ],
        [['Mercado', 8, 1210.3, 'Conjunto', 'sim'], ['Farmácia', 12, 64.5, 'Gabi', 'sim']],
    ),
    'Out-26': household_month(
        'Orçamento da casa - outubro/2026',
        [
            ['Salário Marcio', 5, 6800, 'Marcio', 'sim'],
            ['Salário Gabriela', 5, 5900, 'Gabi', 'sim'],
            ['Freela site', 20, 1200, 'Marcio', 'não'],
        ],
        [
            ['Aluguel', 10, 2200, 'Conjunto', 'sim'],
            ['Condomínio', 10, 650, 'Conjunto', 'sim'],
            ['Internet', 15, 120, 'Conjunto', 'sim'],
            ['Parcela carro (3/36)', 20, 980, 'Marcio', 'não'],
        ],
        [
            ['Mercado', 8, 1340.5, 'Conjunto', 'sim'],
            ['Farmácia', 12, 89.9, 'Gabi', 'sim'],
            ['Gasolina', 14, 310, 'Marcio', 'sim'],
            ['Restaurante', 18, 220, 'Conjunto', 'não'],
        ],
    ),
}

PLANNING = {
    'Nov-26': [
        ['Planejamento de novembro de 2026'],
        [],
        ['Receitas', None, None, None, 'Fixas', None, None, None, 'Variáveis'],
        ['Descrição', 'Dia', 'Valor', None, 'Descrição', 'Dia', 'Valor', None, 'Descrição', 'Quem', 'Valor'],
        ['Salário Marcio', 5, 6800, None, 'Aluguel', 10, 2200, None, 'Mercado', 'Conjunto', 1400],
        ['Salário Gabriela', 5, 5900, None, 'Condomínio', 10, 650, None, 'Farmácia', 'Conjunto', 150],
        ['Total', None, 12700, None, 'Internet', 15, 120, None, 'Lazer', 'Conjunto', 300],
        [None, None, None, None, 'Luz', 18, 210, None, 'Presentes', 'Gabi', 200],
        [None, None, None, None, 'Total', None, 3180, None, 'Total', None, 2050],
        [],
        [],
        ['Saldo previsto', None, 7470],
    ],
}


def monthly_sheet(title, fixed, card_mm, card_gma, income):
    blocks = [
        ('Fixas', ['Item', 'Dia', 'Valor', 'Quem'], fixed),
        ('Cartão MM', ['Item', 'Dia', 'Valor'], card_mm),
        ('Cartão GMA', ['Item', 'Dia', 'Valor'], card_gma),
        ('Receitas', ['Item', 'Dia', 'Valor', 'Quem'], income),
    ]
    height = max(len(lines) for _, _, lines in blocks) + 3
    grid = [[None] * 18 for _ in range(height)]
    column = 0
    for name, header, lines in blocks:
        rows = [[name], header, *lines, ['Total', None, round(sum(line[2] for line in lines), 2)]]
        for index, row in enumerate(rows):
            grid[index][column : column + len(row)] = row
        column += len(header) + 1
    spent = round(sum(line[2] for block in (fixed, card_mm, card_gma) for line in block), 2)
    earned = round(sum(line[2] for line in income), 2)
    share = round(spent / 2, 2)
    split = [['Divisão'], ['Quem', '%', 'Parte', 'Pagou', 'Acerto']]
    for who, card in (('MM', card_mm), ('GMA', card_gma)):
        paid = round(sum(line[2] for line in card) + sum(line[2] for line in fixed if line[3] == who), 2)
        split.append([who, 50, share, paid, round(paid - share, 2)])
    return [[title], [], *grid, [], *split, [], ['Saldo do mês', None, round(earned - spent, 2)]]


MONTHLY = {
    'Set-26': monthly_sheet(
        'Contas da casa - setembro/2026',
        [
            ['Aluguel', 10, 2200, 'Casa'],
            ['Condomínio', 10, 650, 'Casa'],
            ['Luz', 18, 210, 'Casa'],
            ['Internet', 15, 120, 'Casa'],
            ['Inglês', 5, 390, 'GMA'],
            ['Academia', 7, 119.9, 'MM'],
        ],
        [
            ['Supermercado Fictício', 3, 812.4],
            ['Posto Avenida', 9, 260],
            ['Restaurante Sabor', 14, 148.5],
            ['Streaming', 20, 55.9],
        ],
        [
            ['Mercadinho da Vila', 6, 233.7],
            ['Drogaria Fictícia', 11, 74.3],
            ['Farmácia Central', 22, 41.9],
            ['Transporte por app', 25, 63.2],
        ],
        [['Salário', 5, 6800, 'MM'], ['Salário', 5, 5900, 'GMA']],
    ),
    'Out-26': monthly_sheet(
        'Contas da casa - outubro/2026',
        [
            ['Aluguel', 10, 2200, 'Casa'],
            ['Condomínio', 10, 650, 'Casa'],
            ['Luz', 18, 198.4, 'Casa'],
            ['Internet', 15, 120, 'Casa'],
            ['Inglês', 5, 390, 'GMA'],
            ['Academia', 7, 119.9, 'MM'],
        ],
        [
            ['Supermercado Fictício', 2, 905.15],
            ['Posto Avenida', 8, 280],
            ['Presente aniversário', 16, 180],
            ['Streaming', 20, 55.9],
        ],
        [
            ['Mercadinho da Vila', 5, 198.4],
            ['Drogaria Fictícia', 12, 52.6],
            ['Pet shop', 19, 145],
            ['Transporte por app', 24, 71.8],
        ],
        [['Salário', 5, 6800, 'MM'], ['Salário', 5, 5900, 'GMA'], ['Freela site', 20, 1200, 'MM']],
    ),
}

STATEMENT = [
    [
        'Extrato de conta corrente - outubro de 2026 - página 1 de 2',
        'Titular: Gabriela - Conta Gabriela, final 4321',
        ('Data   Descrição', 'Valor (R$)'),
        ('01/10   Saldo anterior', '3.250,00'),
        ('05/10   Salário Empresa Fictícia', '5.900,00'),
        ('07/10   Academia Bem-Estar', '-129,90'),
        ('10/10   Farmácia Vida Fictícia', '-86,40'),
        ('15/10   Curso de inglês online', '-350,00'),
    ],
    [
        'Extrato de conta corrente - outubro de 2026 - página 2 de 2',
        ('Data   Descrição', 'Valor (R$)'),
        ('18/10   Restaurante Sabor Fictício', '-142,70'),
        ('22/10   Notebook parcela 4/10', '-289,00'),
        ('25/10   Transporte por aplicativo', '-47,80'),
        ('Total de créditos', '5.900,00'),
        ('Total de débitos', '1.045,80'),
        ('Saldo final em 31/10', '8.104,20'),
    ],
]


def workbook(sheets, created, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    book = Workbook()
    book.remove(book.active)
    for title, rows in sheets.items():
        sheet = book.create_sheet(title)
        for row in rows:
            sheet.append(row)
    book.properties.created = created
    book.properties.modified = created
    written = io.BytesIO()
    with zipfile.ZipFile(written, 'w', zipfile.ZIP_DEFLATED) as archive:
        ExcelWriter(book, archive).save()
    with zipfile.ZipFile(written) as source, zipfile.ZipFile(path, 'w', zipfile.ZIP_STORED) as target:
        for item in source.infolist():
            entry = zipfile.ZipInfo(item.filename, created.timetuple()[:6])
            target.writestr(entry, source.read(item))


def statement(pages, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    pdf = FPDF(format='A4')
    pdf.set_creation_date(datetime(2026, 10, 31, tzinfo=UTC))
    pdf.set_producer('')
    pdf.set_compression(False)
    pdf.set_auto_page_break(False)
    pdf.set_font('Helvetica', size=11)
    for lines in pages:
        pdf.add_page()
        for line in ['Banco Fictício S.A.', *lines]:
            text, value = line if isinstance(line, tuple) else (line, '')
            pdf.cell(130, 8, text)
            pdf.cell(40, 8, value, align='R', new_x='LMARGIN', new_y='NEXT')
    pdf.output(str(path))


def main(root):
    if not LXML:
        sys.exit('fixtures need lxml: run them through npm run eval:fixtures')
    cases = Path(root)
    workbook(HOUSEHOLD, datetime(2026, 10, 25), cases / 'household-xlsx' / 'orcamento-casa.xlsx')
    workbook(PLANNING, datetime(2026, 10, 25), cases / 'planning-xlsx' / 'planejamento-lado-a-lado.xlsx')
    workbook(MONTHLY, datetime(2026, 11, 1), cases / 'monthly-xlsx' / 'contas-da-casa.xlsx')
    statement(STATEMENT, cases / 'statement-pdf' / 'extrato-gabriela.pdf')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).parents[1] / 'cases')
