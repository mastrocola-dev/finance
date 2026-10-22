import pytest

from ingest.mask import mask, mask_text


@pytest.mark.parametrize(
    ('text', 'masked'),
    [
        ('conta 12345-6', 'conta •2345-6'),
        ('cartão 4111111111111111', 'cartão ••••••••••••1111'),
        ('CPF 12345678909 e agência 1234', 'CPF •••••••8909 e agência 1234'),
        ('20261003', '20261003'),
        ('20261020120000', '20261020120000'),
        ('20261399', '••••1399'),
        ('saldo 12345,67', 'saldo 12345,67'),
        ('total 15000.00', 'total 15000.00'),
        ('ref 12345.678', 'ref •2345.678'),
        ('1234', '1234'),
    ],
)
def test_runs_of_five_digits_keep_only_the_last_four(text, masked):
    assert mask_text(text) == masked


def test_mask_walks_results_and_keeps_amounts():
    result = mask({'99887766': ['nota 556677', 2400, 119.9, True, None], 'id': 123456789012})
    assert result == {'••••7766': ['nota ••6677', 2400, 119.9, True, None], 'id': '••••••••9012'}
