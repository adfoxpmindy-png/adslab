"""Audit specific dynamic translation key references."""
import json, sys
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

# Cases observed in code:
#   ai-settings-card.tsx:447 → t(`modes.${m}`) — translator scope is `settings.ai.persona`
#   audiences-client.tsx:284 → tPages(`subtype.${style.labelKey}`) — scope `pages.audiences`
#   audiences-client.tsx:2355 → tPages(`createConversion.${ev.labelKey}`)
#   audiences-client.tsx:1654 → tPages(`lookalike.${r.hintKey}`)
#   ai-campaign-builder-client.tsx:242 → tPages(`objective.${v}`)
#   ai-optimize-client.tsx:132 → tPages(`tab.${t}`)
#   ads-client.tsx:82 → tAds(`tab.${tab.labelKey}`)
#   ai/memory/page.tsx:80 → tPages(`actionType.${key}`)

# For each, list keys we expect and verify
import re

# Subtype labels (audiences.SUBTYPE_STYLE)
subtypes = ['customer', 'pixel', 'lookalike', 'engagement', 'app']

# Event labels (audiences.CONVERSION_EVENT_TYPES)
# Find from code:
content = open('src/components/tenant/audiences-client.tsx', encoding='utf-8').read()
# parse the CONVERSION_EVENT_TYPES array entries
events = re.findall(r'\b(event[A-Z][A-Za-z]+)\b', content)
events = sorted(set(events))

# Lookalike hint keys
hint_keys = ['ratioClosest', 'ratioClose', 'ratioMixed', 'ratioWidest']

# AI persona modes — find AI_PERSONA_OPTIONS
ai = open('src/components/tenant/ai-settings-card.tsx', encoding='utf-8').read()
mode_keys = re.findall(r'value:\s*"(\w+)"', ai)
# also check enum-based
mode_options = sorted(set(mode_keys))

# Objective values (ai-campaign-builder)
acb = open('src/components/tenant/ai-campaign-builder-client.tsx', encoding='utf-8').read()
obj_values = re.findall(r'OBJECTIVE_VALUES\s*=\s*\[(.*?)\]', acb, re.S)
if obj_values:
    objectives = sorted(set(re.findall(r'"([A-Z_]+)"', obj_values[0])))
else:
    # Try literal usage
    objectives = []

# Ads tab labels (ads-client)
ads_client = open('src/components/tenant/ads-client.tsx', encoding='utf-8').read() if __import__('os').path.exists('src/components/tenant/ads-client.tsx') else ''
ads_tabs = re.findall(r'labelKey:\s*"(\w+)"', ads_client)
ads_tabs = sorted(set(ads_tabs))

# Action types (ai/memory/page)
ai_mem = open('src/app/t/[tenantSlug]/ai/memory/page.tsx', encoding='utf-8').read()
ai_mem_decls = re.findall(r'actionType[A-Za-z]*\s*[:=]\s*"(\w+)"', ai_mem)
action_types = sorted(set(ai_mem_decls))

print('=== Verifying dynamic translation keys ===\n')

def check(prefix, keys, label):
    missing = [k for k in keys if f'{prefix}.{k}' not in th]
    status = '✓ OK' if not missing else f'✗ MISSING'
    print(f'{label}: {status} ({len(keys)} keys checked)')
    if missing:
        for k in missing:
            print(f'   missing: {prefix}.{k}')

check('pages.audiences.subtype', subtypes, 'Audience subtype labels')
check('pages.audiences.createConversion', events, 'Conversion event labels')
check('pages.audiences.lookalike', hint_keys, 'Lookalike ratio hints')
check('settings.ai.persona.modes', mode_options, 'AI persona modes')
print(f'AI persona option values found in code: {mode_options}')
print()
print(f'Ads tabs labelKey values found in code: {ads_tabs}')
check('ads.tab', ads_tabs, 'Ads tabs')
print()
print(f'AI memory actionType values found in code: {action_types}')
