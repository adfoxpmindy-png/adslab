import os, re, sys
sys.stdout.reconfigure(encoding='utf-8')
THAI = re.compile(r'[฀-๿]')
LAO = re.compile(r'[຀-໿]')
EMOJI = re.compile(r'[☀-➿\U0001f300-\U0001faff\U0001f000-\U0001f02f]')

SKIP_DIRS = {'node_modules', '.next', '.git', 'dist', 'build', '.vercel'}
SKIP_FILES = {'package-lock.json', 'pnpm-lock.yaml'}

thai_files = []
emoji_files = []
for root, dirs, files in os.walk('.'):
    dirs[:] = [d for d in dirs if d not in SKIP_DIRS and not d.startswith('.')]
    for f in files:
        if f in SKIP_FILES: continue
        if f.endswith(('.png','.jpg','.jpeg','.gif','.svg','.ico','.woff','.woff2','.ttf','.zip','.pdf','.mp4','.mp3')): continue
        p = os.path.join(root, f)
        try:
            content = open(p, encoding='utf-8').read()
        except (UnicodeDecodeError, PermissionError):
            continue
        t = THAI.findall(content)
        l = LAO.findall(content)
        e = EMOJI.findall(content)
        if t or l:
            thai_files.append((len(t), len(l), p))
        if e:
            emoji_files.append((len(e), p))

thai_files.sort(reverse=True)
emoji_files.sort(reverse=True)

def normpath(p):
    return p.replace(os.sep, '/')

print('=== Thai/Lao OUTSIDE src/messages (potential UX issues): ===')
for t, l, p in thai_files:
    n = normpath(p)
    if '/src/' in n or n.startswith('src/'): continue
    if 'messages/' in n: continue
    if n.endswith('.md'): continue
    if 'scripts/' in n: continue
    print(f'  Thai={t:4d} Lao={l:3d}  {p}')

print()
print('=== Docs/markdown Thai (informational): ===')
docs = [(t,l,p) for t,l,p in thai_files if p.endswith('.md')]
for t, l, p in docs[:20]:
    print(f'  Thai={t:4d}  {p}')

print()
print('=== Emoji files (outside src + messages + memory + scripts): ===')
for n, p in emoji_files:
    np = normpath(p)
    if '/src/' in np or np.startswith('src/'): continue
    if 'messages/' in np: continue
    if 'memory/' in np or 'memory\\' in np: continue
    if 'scripts/' in np: continue
    if np.endswith('.md'): continue
    print(f'  Emoji={n:3d}  {p}')
