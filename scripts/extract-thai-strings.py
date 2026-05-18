"""Extract Thai-containing string literals from a TS/TSX file."""
import re, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

if len(sys.argv) < 2:
    print("usage: extract-thai-strings.py <file>")
    sys.exit(1)

with open(sys.argv[1], encoding='utf-8') as f:
    content = f.read()

THAI_RANGE = r'฀-๿'

# Triple-context patterns: double quotes, single quotes, backticks
patterns = [
    r'"([^"\\]*[' + THAI_RANGE + r'][^"\\]*)"',
    r"'([^'\\]*[" + THAI_RANGE + r"][^'\\]*)'",
    r'`([^`\\]*[' + THAI_RANGE + r'][^`\\]*)`',
]

strings = set()
for p in patterns:
    strings.update(re.findall(p, content))

# Also catch JSX text node content like `>ภาษา<` between tags
jsx_text = re.findall(r'>([^<]*[' + THAI_RANGE + r'][^<]*)<', content)
for t in jsx_text:
    t = t.strip()
    if t and not t.startswith('{') and not t.endswith('}'):
        strings.add(t)

for s in sorted(strings):
    print(repr(s))

print(f'\nTotal: {len(strings)} unique Thai-containing strings')
