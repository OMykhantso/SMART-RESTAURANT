import json, re, sys
import pymupdf
d = pymupdf.open(sys.argv[1])
toc = json.load(open(sys.argv[2] if len(sys.argv) > 2 else 'toc.json'))
norm = lambda s: re.sub(r'[\s​]+', ' ', s).strip()
texts = [norm(p.get_text()) for p in d]
toc_page = next(i for i, t in enumerate(texts) if t.startswith('ЗМІСТ'))
pages, start = {}, toc_page + 1
for t in toc:
    m = re.match(r'^(РОЗДІЛ \d+)\. (.*)$', t)
    a = re.match(r'^Додаток ([А-ЯҐЄІЇ])\. (.*)$', t)
    key = norm(f'{m.group(1)} {m.group(2)}' if m else f'ДОДАТОК {a.group(1)} {a.group(2)}' if a else t)[:40]
    found = next((i for i in range(start, len(texts)) if key in texts[i]), None)
    if found is None:
        print('NOT FOUND', t)
        continue
    pages[t] = found + 1
    start = found
json.dump(pages, open(sys.argv[3] if len(sys.argv) > 3 else 'pages.json', 'w'), ensure_ascii=False)
print('total pages', d.page_count)
