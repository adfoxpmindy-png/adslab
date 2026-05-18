"""Find translation key references in code that don't exist in messages JSON."""
import os, re, json, sys
sys.stdout.reconfigure(encoding='utf-8')

# Load messages
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

# In code, we have these patterns:
#   useTranslations("namespace") + t("key") or t(`key.${var}`)
#   getTranslations("namespace") + same
#   getTranslations({ locale, namespace: "ns" }) + same
#   useTranslations() + t("full.path")
#   t.raw("key")
#   t.rich("key", {...})
# We'll extract: namespace pattern from imports, then key calls.

# Walk src/
files_to_check = []
for root, dirs, files in os.walk('src'):
    dirs[:] = [d for d in dirs if not d.startswith('.') and d != 'generated']
    for f in files:
        if f.endswith(('.ts', '.tsx')):
            files_to_check.append(os.path.join(root, f))

# Pattern for useTranslations / getTranslations calls
NS_PATTERN = re.compile(r'(?:useTranslations|getTranslations)\(\s*(?:"([^"]+)"|\{\s*(?:locale[^}]*,\s*)?namespace:\s*"([^"]+)")', re.M)
T_CALL_PATTERN = re.compile(r'(?<![A-Za-z_])t\w*\.?(?:raw|rich)?\(\s*[`"]([^`"${]+)[`"]')

issues = []
for fp in files_to_check:
    try:
        content = open(fp, encoding='utf-8').read()
    except Exception:
        continue
    namespaces = []
    for m in NS_PATTERN.finditer(content):
        ns = m.group(1) or m.group(2)
        namespaces.append(ns)
    if not namespaces:
        # no useTranslations / getTranslations — skip checking t() in this file
        # (might be helper accepting `t` as a param — can't easily verify)
        continue
    # For each t() call, see which namespace it falls under
    # We'll just check that key exists under SOMETHING.
    for m in T_CALL_PATTERN.finditer(content):
        key = m.group(1)
        # Skip if it has ${} interpolation (dynamic key)
        if '$' in key:
            continue
        # Build candidate full paths: namespace + "." + key
        full_paths = [f'{ns}.{key}' for ns in namespaces]
        # Or just key itself (if a translator at root)
        full_paths.append(key)
        # Check exists in TH (canonical)
        if not any(p in th for p in full_paths):
            line_no = content[:m.start()].count('\n') + 1
            issues.append((fp, line_no, key, namespaces))

print(f'Possible missing translation keys: {len(issues)}')
for fp, line, key, ns in issues[:40]:
    print(f'  {fp}:{line}  t({key!r})  ns={ns}')

# Also check inverse: keys defined in JSON but never referenced
all_referenced = set()
for fp in files_to_check:
    try:
        content = open(fp, encoding='utf-8').read()
    except Exception:
        continue
    nss = []
    for m in NS_PATTERN.finditer(content):
        nss.append(m.group(1) or m.group(2))
    for m in T_CALL_PATTERN.finditer(content):
        key = m.group(1)
        if '$' in key: continue
        for ns in nss:
            all_referenced.add(f'{ns}.{key}')
        all_referenced.add(key)

# Static check is fragile — just give a count
print(f'\nKey usage stats: th has {len(th)} keys; ~{len(all_referenced & th)} referenced statically (dynamic keys not counted)')
