"""Better missing-key audit: respect SCOPE — each t() call uses the closest preceding translator declaration."""
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

# Match: const <var> = (await)? (useTranslations|getTranslations)("ns")
# OR: const <var> = await getTranslations({ namespace: "ns" })
# OR: const <var> = await getTranslations({ locale, namespace: "ns" })
ASSIGN = re.compile(
    r'const\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*'
    r'(?:"([^"]+)"|\{\s*(?:locale[^}]*,\s*)?namespace:\s*"([^"]+)")'
)
# Pattern: identifier optionally followed by .raw/.rich, then ( "key" ...
CALL = re.compile(r'(\b\w+)(?:\.(?:raw|rich))?\s*\(\s*"([A-Za-z0-9._]+)"\s*[,)]')

# Words that are translators by name convention (heuristic):
TRANSLATOR_NAMES = {'t', 'tPages', 'tCommon', 'tStatus', 'tAds', 'tPosts', 'tBoost',
                    'tRules', 'tReports', 'tAudiences', 'tSettings', 'tBillingGate'}

missing = []
for fp in files_to_check:
    try:
        content = open(fp, encoding='utf-8').read()
    except Exception:
        continue

    # Collect translator declarations: list of (pos, varName, namespace)
    decls = []
    for m in ASSIGN.finditer(content):
        var = m.group(1)
        ns = m.group(2) or m.group(3)
        decls.append((m.start(), var, ns))

    if not decls:
        continue

    # For each call, find the latest preceding decl with the matching var name
    for m in CALL.finditer(content):
        pos = m.start()
        var = m.group(1)
        key = m.group(2)
        if key in ('th-TH', 'en-US', 'lo-LA', 'th', 'en', 'lo'): continue
        # find latest preceding decl with this var
        ns = None
        for dpos, dvar, dns in decls:
            if dpos < pos and dvar == var:
                ns = dns  # keep updating to find the latest
        if ns is None:
            continue
        full = f'{ns}.{key}'
        if full not in th:
            line = content[:pos].count('\n') + 1
            missing.append((fp, line, full))

missing = sorted(set(missing))
print(f'=== TRULY MISSING translation keys: {len(missing)} ===')
for fp, line, full in missing:
    in_en = '✓' if full in en else '✗'
    in_lo = '✓' if full in lo else '✗'
    print(f'  TH=✗ EN={in_en} LO={in_lo}  {fp}:{line}  {full}')

print(f'\nTH/EN/LO drift:')
print(f'  TH-only keys: {len(th - en - lo)}')
print(f'  EN-only keys: {len(en - th - lo)}')
print(f'  LO-only keys: {len(lo - th - en)}')
