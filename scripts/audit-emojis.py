import os, re, sys
sys.stdout.reconfigure(encoding='utf-8')
pat = re.compile(r'[⌀-⏿␀-␿─-➿⬀-⯿\U0001f000-\U0001faff]')
total = 0
files = 0
for root, _, fs in os.walk('src'):
    if 'generated' in root: continue
    for f in fs:
        if not (f.endswith('.tsx') or f.endswith('.ts')): continue
        p = os.path.join(root, f)
        try:
            content = open(p, encoding='utf-8').read()
        except Exception:
            continue
        m = pat.findall(content)
        if m:
            total += len(m)
            files += 1
            print(f'{len(m):4d}  {p}  -- {sorted(set(m))}')
print(f'src/ (excl generated): {total} emojis in {files} files')

j_total = 0
for n in ('th', 'en', 'lo'):
    content = open(f'messages/{n}.json', encoding='utf-8').read()
    c = len(pat.findall(content))
    j_total += c
    print(f'messages/{n}.json: {c}')
print(f'JSON total: {j_total}')
