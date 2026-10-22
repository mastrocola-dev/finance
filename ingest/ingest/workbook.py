from pathlib import Path

from openpyxl import load_workbook

from ingest.segment import plain


def load_xlsx(path: Path) -> dict[str, list[list[object]]]:
    workbook = load_workbook(path, read_only=True, data_only=True)
    try:
        return {
            sheet.title: [[plain(value) for value in row] for row in sheet.iter_rows(values_only=True)]
            for sheet in workbook.worksheets
        }
    finally:
        workbook.close()
