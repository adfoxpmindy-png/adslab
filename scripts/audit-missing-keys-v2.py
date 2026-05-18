"""Better missing-key audit: skip false positives from toLocaleString('th-TH') etc."""
import os, re, json, sys
sys.stdout.reconfigure(encoding='utf-8')

def flatten(d, prefix=''):
    keys = set()
    for k, v in d.items():
        p = f'{prefix}.{k}' if prefix else k
        if isinstance(v, dict):
            keys.update(flatten(v, p))
        else:
            keys.add(p)
    return keys

th = flatten(json.load(open('messages/th.json', encoding='utf-8')))
en = flatten(json.load(open('messages/en.json', encoding='utf-8')))
lo = flatten(json.load(open('messages/lo.json', encoding='utf-8')))

files_to_check = []
for root, dirs, files in os.walk('src'):
    dirs[:] = [d for d in dirs if not d.startswith('.') and d != 'generated']
    for f in files:
        if f.endswith(('.ts', '.tsx')):
            files_to_check.append(os.path.join(root, f))

# Better: pair each useTranslations/getTranslations with the t variable name it assigns to.
# const tFoo = useTranslations("ns.X")  →  tFoo("key") → ns.X.key
ASSIGN = re.compile(r'const\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*(?:"([^"]+)"|\{\s*(?:locale[^}]*,\s*)?namespace:\s*"([^"]+)")')
# match `tFoo("key")` or `tFoo.raw("key")` or `tFoo.rich("key", ...)`
CALL = re.compile(r'(\w+)\.(?:raw|rich)?\s*\(\s*"([A-Za-z0-9._]+)"\s*[,)]')
PLAIN_CALL = re.compile(r'(\w+)\s*\(\s*"([A-Za-z0-9._]+)"\s*[,)]')

missing = []
for fp in files_to_check:
    try:
        content = open(fp, encoding='utf-8').read()
    except Exception:
        continue
    # Find all translator var assignments
    vars_to_ns = {}  # var → namespace
    for m in ASSIGN.finditer(content):
        var = m.group(1)
        ns = m.group(2) or m.group(3)
        vars_to_ns[var] = ns
    if not vars_to_ns:
        continue
    # For each call where var matches a translator
    for m in CALL.finditer(content):
        var = m.group(1)
        key = m.group(2)
        if var not in vars_to_ns: continue
        # Skip locale codes
        if key in ('th-TH','en-US','lo-LA','th','en','lo'): continue
        full = f'{vars_to_ns[var]}.{key}'
        if full not in th:
            line = content[:m.start()].count('\n') + 1
            missing.append((fp, line, full))
    for m in PLAIN_CALL.finditer(content):
        var = m.group(1)
        key = m.group(2)
        if var not in vars_to_ns: continue
        if key in ('th-TH','en-US','lo-LA','th','en','lo'): continue
        full = f'{vars_to_ns[var]}.{key}'
        if full not in th:
            # avoid duplicate from CALL regex (which matches t.raw too)
            line = content[:m.start()].count('\n') + 1
            entry = (fp, line, full)
            if entry not in missing:
                missing.append(entry)

# Dedupe
missing = sorted(set(missing))
print(f'=== TRULY MISSING translation keys: {len(missing)} ===')
for fp, line, full in missing:
    in_en = '✓' if full in en else '✗'
    in_lo = '✓' if full in lo else '✗'
    print(f'  TH=✗ EN={in_en} LO={in_lo}  {fp}:{line}  {full}')

# Also check th vs en+lo mismatch
mismatch_en = th - en
mismatch_lo = th - lo
print(f'\nKeys in TH but not in EN: {len(mismatch_en)}')
for k in sorted(mismatch_en)[:10]: print(f'  {k}')
print(f'\nKeys in TH but not in LO: {len(mismatch_lo)}')
for k in sorted(mismatch_lo)[:10]: print(f'  {k}')
