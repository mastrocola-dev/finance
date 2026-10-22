import re

RUN = re.compile(r'\d{5,}')
DAY = r'(?:19|20)\d\d(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])'
TIME = r'(?:[01]\d|2[0-3])[0-5]\d(?:[0-5]\d)?'
DATE = re.compile(f'{DAY}(?:{TIME})?')
CENTS = re.compile(r'[.,]\d\d(?!\d)')
VISIBLE = 4
LARGEST_AMOUNT = 10**8


def hide(digits: str) -> str:
    return '•' * (len(digits) - VISIBLE) + digits[-VISIBLE:]


def mask_text(text: str) -> str:
    def replace(match: re.Match[str]) -> str:
        digits = match.group()
        if DATE.fullmatch(digits) or CENTS.match(text, match.end()):
            return digits
        return hide(digits)

    return RUN.sub(replace, text)


def mask(value: object) -> object:
    if isinstance(value, str):
        return mask_text(value)
    if isinstance(value, bool):
        return value
    if isinstance(value, int) and abs(value) >= LARGEST_AMOUNT:
        return hide(str(abs(value)))
    if isinstance(value, dict):
        return {mask_text(str(key)): mask(item) for key, item in value.items()}
    if isinstance(value, list | tuple):
        return [mask(item) for item in value]
    return value
