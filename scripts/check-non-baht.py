"""Read source file directly; report Thai strings excluding ฿ (U+0E3F)."""
import re, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

with open(sys.argv[1], encoding='utf-8') as f:
    content = f.read()

THAI_RANGE = '฀-๿'
BAHT = '฿'

patterns = [
    r'"([^"\\]*[' + THAI_RANGE + r'][^"\\]*)"',
    r"'([^'\\]*[" + THAI_RANGE + r"][^'\\]*)'",
    r'`([^`\\]*[' + THAI_RANGE + r'][^`\\]*)`',
]

strings = set()
for p in patterns:
    strings.update(re.findall(p, content))

jsx_text = re.findall(r'>([^<]*[' + THAI_RANGE + r'][^<]*)<', content)
for t in jsx_text:
    t = t.strip()
    if t and not t.startswith('{') and not t.endswith('}'):
        strings.add(t)

# Filter: must contain at least one Thai char other than ฿
def has_non_baht_thai(s):
    for c in s:
        if '฀' <= c <= '๿' and c != BAHT:
            return True
    return False

bad = [s for s in strings if has_non_baht_thai(s)]
for s in sorted(bad):
    print(repr(s))
print(f'\nNON-฿ Thai strings: {len(bad)} / total flagged: {len(strings)}')
