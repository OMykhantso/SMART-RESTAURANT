"""Markdown → .docx за вимогами методички (Додаток Г): A4, Times New Roman 14, інтервал 1,15,
поля 2/2/2/2,5 см, абзац 1 см, розділи з нової сторінки, нумерація сторінок праворуч унизу.

python3 build_docx.py <in.md> <out.docx> [--pages pages.json] [--kt1]

Розмітка (крім звичайного markdown):
  @include file.md                         — вставити інший файл
  ## АНОТАЦІЯ                              — сторінка перед змістом (не входить у зміст)
  ## РОЗДІЛ 1. НАЗВА                       — «РОЗДІЛ 1» і назва з нового рядка
  ### Додаток А. Назва                     — «ДОДАТОК А» і назва, з нової сторінки
  !fig 2.3 | path | Підпис [| ширина, см]  — рисунок «Рис. 2.3. Підпис»
  !eq (2.1) | формула                      — формула по центру з номером праворуч
  Таблиця 1.1 – Назва  + markdown-таблиця  — «Таблиця 1.1» праворуч курсивом, назва по центру
  ```lang … ```                            — лістинг (Courier New 9, інтервал 13,5 пт: ≤ 55 рядків на сторінці)
  @abbr                                    — перелік скорочень із abbr.txt (лише ті, що є в тексті)
  ~ текст                                  — рядок переліку без абзацного відступу
"""
import json
import os
import re
import sys

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK, WD_LINE_SPACING, WD_TAB_ALIGNMENT, WD_TAB_LEADER
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor
from PIL import Image

args = [a for a in sys.argv[1:] if not a.startswith('--')]
SRC, OUT = args[0], args[1]
PAGES = {}
if '--pages' in sys.argv:
    PAGES = json.load(open(sys.argv[sys.argv.index('--pages') + 1]))
KT = next((a[4:] for a in sys.argv if a in ('--kt1', '--kt2', '--kt3')), None)
KT1 = KT is not None
BASE = os.path.dirname(os.path.abspath(SRC))
FONT, MONO = 'Times New Roman', 'Courier New'
TEXT_W = 21 - 2.5 - 2  # ширина тексту, см
C = WD_ALIGN_PARAGRAPH.CENTER


def set_rfonts(rpr, name=FONT):
    rf = rpr.find(qn('w:rFonts'))
    if rf is None:
        rf = OxmlElement('w:rFonts')
        rpr.insert(0, rf)
    for a in list(rf.attrib):
        if a.endswith('Theme'):
            del rf.attrib[a]
    for a in ('w:ascii', 'w:hAnsi', 'w:cs', 'w:eastAsia'):
        rf.set(qn(a), name)


# ───────────────────────────── стилі ─────────────────────────────
doc = Document()
st = doc.styles
normal = st['Normal']
normal.font.name = FONT
normal.font.size = Pt(14)
set_rfonts(normal.element.get_or_add_rPr())
pf = normal.paragraph_format
pf.line_spacing = 1.15
pf.space_before = Pt(0)
pf.space_after = Pt(0)
pf.first_line_indent = Cm(1)
pf.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
lang = OxmlElement('w:lang')
lang.set(qn('w:val'), 'uk-UA')
normal.element.get_or_add_rPr().append(lang)

for lvl in (1, 2, 3):
    h = st[f'Heading {lvl}']
    h.font.name = FONT
    h.font.size = Pt(14)
    h.font.bold = True
    h.font.italic = False
    h.font.color.rgb = RGBColor(0, 0, 0)
    set_rfonts(h.element.get_or_add_rPr())
    hp = h.paragraph_format
    hp.line_spacing = 1.15
    hp.keep_with_next = True
    # «одна стрічка» між заголовками і між підрозділами: 14 пт × 1,15 ≈ 16 пт
    hp.space_after = Pt(16) if lvl == 1 else Pt(8)
    hp.space_before = Pt(0) if lvl == 1 else Pt(16)
    if lvl == 1:
        hp.alignment = C
        hp.first_line_indent = Cm(0)
        hp.page_break_before = True
    else:
        hp.alignment = WD_ALIGN_PARAGRAPH.LEFT
        hp.first_line_indent = Cm(1)

sec = doc.sections[0]
sec.page_width, sec.page_height = Cm(21), Cm(29.7)
sec.top_margin = sec.bottom_margin = sec.right_margin = Cm(2)
sec.left_margin = Cm(2.5)
sec.footer_distance = Cm(1)
sec.different_first_page_header_footer = True  # без номера на титульному аркуші


def fld(par, instr, text='1'):
    for kind, val in (('begin', None), ('instr', instr), ('separate', None), ('text', text), ('end', None)):
        if kind == 'text':
            par.add_run(val)
            continue
        r = par.add_run()
        if kind == 'instr':
            t = OxmlElement('w:instrText')
            t.set(qn('xml:space'), 'preserve')
            t.text = val
            r._r.append(t)
        else:
            e = OxmlElement('w:fldChar')
            e.set(qn('w:fldCharType'), kind)
            r._r.append(e)


fp = sec.footer.paragraphs[0]
fp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
fp.paragraph_format.first_line_indent = Cm(0)
fld(fp, 'PAGE')

# ───────────────────────────── хелпери тексту ─────────────────────────────
INLINE = re.compile(r'(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)')


def add_inline(par, text, bold=False, size=None, italic=False):
    for part in INLINE.split(text):
        if not part:
            continue
        b, it, mono = bold, italic, False
        if part.startswith('**') and part.endswith('**'):
            part, b = part[2:-2], True
        elif part.startswith('`') and part.endswith('`'):
            part, mono = part[1:-1], True
        elif part.startswith('*') and part.endswith('*') and len(part) > 2:
            part, it = part[1:-1], True
        r = par.add_run(part)
        r.bold = b or None
        r.italic = it or None
        if mono:
            r.font.name = MONO
            set_rfonts(r._r.get_or_add_rPr(), MONO)
            r.font.size = Pt((size or 14) - 2)
        elif size:
            r.font.size = Pt(size)
    return par


def para(text='', align=None, indent=True, bold=False, italic=False, size=None, before=0, after=0, keep=False, left=None):
    p = doc.add_paragraph()
    f = p.paragraph_format
    if align is not None:
        f.alignment = align
    if not indent:
        f.first_line_indent = Cm(0)
    if left is not None:
        f.left_indent = Cm(left)
    f.space_before, f.space_after = Pt(before), Pt(after)
    if keep:
        f.keep_with_next = True
    if text:
        add_inline(p, text, bold=bold, size=size, italic=italic)
    return p


def page_break():
    doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)


# елементи w:pPr, які за схемою OOXML ідуть ПІСЛЯ w:shd
_AFTER_SHD = {qn(f'w:{t}') for t in ('tabs', 'suppressAutoHyphens', 'kinsoku', 'wordWrap', 'overflowPunct', 'topLinePunct', 'autoSpaceDE',
                                      'autoSpaceDN', 'bidi', 'adjustRightInd', 'snapToGrid', 'spacing', 'ind', 'contextualSpacing',
                                      'mirrorIndents', 'suppressOverlap', 'jc', 'textDirection', 'textAlignment', 'outlineLvl', 'rPr')}


def shade(ppr, fill):
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), fill)
    for child in ppr:
        if child.tag in _AFTER_SHD:
            child.addprevious(shd)
            return
    ppr.append(shd)


# ───────────────────────────── таблиці ─────────────────────────────
ZW = '​'


def breakable(text):
    text = re.sub(r'\S{10,}', lambda m: m.group(0).replace('_', '_' + ZW), text)
    return re.sub(r'\S{18,}', lambda m: m.group(0).replace('/', '/' + ZW), text)


def col_widths(rows, size):
    cw = 0.215 * size / 12
    n = len(rows[0])
    minw, avg = [], []
    for c in range(n):
        words = [w for r in rows for w in re.split(r'[\s​]+', r[c].replace('**', '').replace('`', '')) if w]
        lw = max((len(w) for w in words), default=1)
        minw.append(min(lw * cw * 1.08 + 0.4, TEXT_W * 0.4))
        body = rows[1:] or rows
        avg.append(sum(len(r[c]) for r in body) / len(body))
    if sum(minw) > TEXT_W:
        k = TEXT_W / sum(minw)
        return [m * k for m in minw]
    rem = TEXT_W - sum(minw)
    tot = sum(avg) or 1
    return [m + rem * a / tot for m, a in zip(minw, avg)]


def set_cell_margins(table, cm=0.12):
    tblPr = table._tbl.tblPr
    mar = OxmlElement('w:tblCellMar')
    for side in ('top', 'left', 'bottom', 'right'):
        el = OxmlElement(f'w:{side}')
        el.set(qn('w:w'), str(int(cm * 567 if side in ('left', 'right') else 20)))
        el.set(qn('w:type'), 'dxa')
        mar.append(el)
    look = tblPr.find(qn('w:tblLook'))
    if look is not None:
        look.addprevious(mar)
    else:
        tblPr.append(mar)


def add_table(rows):
    ncols = len(rows[0])
    size = 12 if ncols <= 5 else 11
    t = doc.add_table(rows=len(rows), cols=ncols)
    t.style = st['Table Grid']
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    t.autofit = False
    set_cell_margins(t)
    rows = [[breakable(c) for c in r] for r in rows]
    widths = col_widths(rows, size)
    center_cols = {j for j in range(ncols) if all(r[j].strip() in ('✓', '–', '-', '') or len(r[j].strip()) <= 2 for r in rows[1:])}
    for i, row in enumerate(rows):
        tr = t.rows[i]
        cs = OxmlElement('w:cantSplit')
        cs.set(qn('w:val'), 'true')
        tr._tr.get_or_add_trPr().append(cs)
        if i == 0:
            h = OxmlElement('w:tblHeader')
            h.set(qn('w:val'), 'true')
            tr._tr.get_or_add_trPr().append(h)
        for j, txt in enumerate(row):
            cell = tr.cells[j]
            cell.width = Cm(widths[j])
            p = cell.paragraphs[0]
            f = p.paragraph_format
            f.first_line_indent = Cm(0)
            f.line_spacing = 1.0
            f.alignment = C if (i == 0 or j in center_cols) else WD_ALIGN_PARAGRAPH.LEFT
            if i < len(rows) - 1:
                f.keep_with_next = True  # таблиця цілком на одній сторінці з назвою
            add_inline(p, txt, bold=(i == 0), size=size)
    for j, gc in enumerate(t._tbl.tblGrid.findall(qn('w:gridCol'))):
        gc.set(qn('w:w'), str(int(widths[j] * 567)))
    para(after=0)


# ───────────────────────────── рисунки, формули, лістинги ─────────────────────────────
def add_figure(num, path, caption, width=None):
    path = path if os.path.isabs(path) else os.path.join(BASE, path)
    w, h = Image.open(path).size
    width_cm = float(width) if width else TEXT_W
    if h / w * width_cm > 22:  # разом із підписом — не більше сторінки
        width_cm = 22 * w / h
    p = para(align=C, indent=False, before=6, keep=True)
    p.add_run().add_picture(path, width=Cm(width_cm))
    para(f'Рис. {num}. {caption}', align=C, indent=False, before=6, after=10)


def add_equation(num, text):
    p = para(indent=False, before=4, after=4, align=WD_ALIGN_PARAGRAPH.LEFT)
    p.paragraph_format.tab_stops.add_tab_stop(Cm(TEXT_W / 2), WD_TAB_ALIGNMENT.CENTER)
    p.paragraph_format.tab_stops.add_tab_stop(Cm(TEXT_W), WD_TAB_ALIGNMENT.RIGHT)
    p.add_run('\t')
    add_inline(p, text, italic=True)
    p.add_run('\t' + num)


def add_code(lines):
    for k, ln in enumerate(lines):
        p = doc.add_paragraph()
        f = p.paragraph_format
        f.first_line_indent = Cm(0)
        f.left_indent = Cm(0.2)
        f.alignment = WD_ALIGN_PARAGRAPH.LEFT
        # методичка: у лістингах не більше 55 рядків на сторінці; 728 пт висоти / 13,5 пт = 53 рядки
        f.line_spacing = Pt(13.5)
        f.line_spacing_rule = WD_LINE_SPACING.EXACTLY
        f.space_before = Pt(4) if k == 0 else Pt(0)
        f.space_after = Pt(6) if k == len(lines) - 1 else Pt(0)
        if k < len(lines) - 1 and len(lines) <= 30:
            f.keep_with_next = True
        shade(p._p.get_or_add_pPr(), 'F2F2F2')
        r = p.add_run(ln.replace('\t', '  ') or ' ')
        r.font.name = MONO
        set_rfonts(r._r.get_or_add_rPr(), MONO)
        r.font.size = Pt(9)


# ───────────────────────────── розбір markdown ─────────────────────────────
def read_lines(path):
    out = []
    for ln in open(path, encoding='utf-8').read().split('\n'):
        m = re.match(r'^@include (.+)$', ln.strip())
        if m:
            out.extend(read_lines(os.path.join(os.path.dirname(path), m.group(1).strip())))
        else:
            out.append(ln)
    return out


def normalize(src):
    """Апостроф U+02BC → U+2019 (його розпізнає перевірка правопису Word), тире — «–»; код у лістингах не змінюється."""
    out, in_code = [], False
    for ln in src:
        if ln.startswith('```'):
            in_code = not in_code
        # тире як у прикладах методички («Таблиця 1.1 – Назва»): одне коротке тире з пробілами
        out.append(ln if in_code else ln.replace('ʼ', '’').replace('—', '–'))
    return out


def expand_abbr(src):
    """@abbr — перелік скорочень і термінів, які справді трапляються в тексті документа (abbr.txt)."""
    if '@abbr' not in src:
        return src
    text, in_code = [], False
    for ln in src:
        if ln.startswith('```'):
            in_code = not in_code
        elif not in_code and ln != '@abbr':
            text.append(ln)
    text = '\n'.join(text)
    entries = []
    for row in open(os.path.join(BASE, 'abbr.txt'), encoding='utf-8'):
        if row.startswith('#') or '|' not in row:
            continue
        key, meaning = [x.strip() for x in row.split('|', 1)]
        probes = [x.strip() for x in key.split('/')] if key not in ('UI/UX', 'HTTP/HTTPS') else [key.split('/')[0]]
        if any(re.search(r'(?<![\w-])' + re.escape(pr) + r'(?![\w])', text, re.I if pr[0].islower() or pr[1:].islower() else 0) for pr in probes):
            entries.append((key, meaning))
    rank = lambda k: (0 if re.match(r'[А-ЯҐЄІЇа-яґєії]', k) else 2 if k[0].isdigit() else 1, k.lower())
    out = []
    for ln in src:
        if ln == '@abbr':
            out.extend(f'~ {k} – {m}' for k, m in sorted(entries, key=lambda e: rank(e[0])))
        else:
            out.append(ln)
    return out


CITE = re.compile(r'\[(\d+(?:\s*[,–-]\s*\d+)*)\]')


def number_sources(src):
    """@sources — список джерел із sources-all.md: лише процитовані, у порядку першого посилання (вимога методички)."""
    if '@sources' not in src:
        return src
    master = {}
    for row in open(os.path.join(BASE, 'sources-all.md'), encoding='utf-8'):
        m = re.match(r'^(\d+)\. (.*)$', row.strip())
        if m:
            master[int(m.group(1))] = m.group(2)
    order, in_code = [], False
    for ln in src:
        if ln.startswith('```'):
            in_code = not in_code
        elif not in_code:
            for m in CITE.finditer(ln):
                for n in map(int, re.findall(r'\d+', m.group(1))):
                    if n in master and n not in order:
                        order.append(n)
    new = {old: i + 1 for i, old in enumerate(order)}
    out, in_code = [], False
    for ln in src:
        if ln.startswith('```'):
            in_code = not in_code
        if ln == '@sources':
            out += ['## СПИСОК ВИКОРИСТАНИХ ДЖЕРЕЛ', '']
            out += [f'{new[o]}. {master[o]}' for o in order]
            continue
        if not in_code:
            ln = CITE.sub(lambda m: '[' + re.sub(r'\d+', lambda d: str(new.get(int(d.group()), d.group())), m.group(1)) + ']', ln)
        out.append(ln)
    return out


lines = normalize(expand_abbr(number_sources(read_lines(SRC))))
blocks = []
i = 0
while i < len(lines):
    ln = lines[i]
    if ln.startswith('```'):
        code = []
        i += 1
        while i < len(lines) and not lines[i].startswith('```'):
            code.append(lines[i])
            i += 1
        i += 1
        blocks.append(('code', code))
        continue
    if not ln.strip():
        i += 1
        continue
    if ln.startswith('|'):
        rows = []
        while i < len(lines) and lines[i].startswith('|'):
            cells = [c.strip() for c in lines[i].strip().strip('|').split('|')]
            if not all(re.fullmatch(r':?-{3,}:?', c) for c in cells):
                rows.append(cells)
            i += 1
        blocks.append(('table', rows))
        continue
    m = re.match(r'^(#{1,4}) (.*)$', ln)
    if m:
        blocks.append((f'h{len(m.group(1))}', m.group(2).strip()))
    elif ln.startswith('!fig '):
        parts = [x.strip() for x in ln[5:].split('|')]
        blocks.append(('fig', parts))
    elif ln.startswith('!eq '):
        num, text = [x.strip() for x in ln[4:].split('|', 1)]
        blocks.append(('eq', (num, text)))
    elif re.match(r'^(\d+)\. ', ln):
        m = re.match(r'^(\d+)\. (.*)$', ln)
        blocks.append(('ol', (m.group(1), m.group(2))))
    elif ln.startswith('- '):
        blocks.append(('ul', ln[2:]))
    elif ln.startswith('~ '):
        blocks.append(('def', ln[2:]))
    else:
        blocks.append(('p', ln.strip()))
    i += 1

# ───────────────────────────── титульний аркуш (Додаток А методички) ─────────────────────────────
for line in ('Міністерство освіти і науки України', 'Національний університет «Львівська політехніка»',
             'Інститут комп’ютерних наук та інформаційних технологій'):
    para(line, align=C, indent=False)
para('Кафедра систем віртуальної реальності', align=C, indent=False, before=28)
para('КУРСОВА РОБОТА', align=C, indent=False, bold=True, size=16, before=120)
para('«Інтернет-проєкт»', align=C, indent=False)
para('на тему:', align=C, indent=False, before=6)
para('«Інформаційна система ресторану SMART RESTAURANT з онлайн-бронюванням, QR check-in, замовленням зі смартфона, оплатою та доставкою»',
     align=C, indent=False, bold=True)
KT_TITLES = {
    '1': 'Контрольна точка № 1. Аналіз та проєктування',
    '2': 'Контрольна точка № 2. База даних, Backend/API та Web',
    '3': 'Контрольна точка № 3. Mobile, інтеграція та ADVANCED-компоненти',
}
if KT:
    para(KT_TITLES[KT], align=C, indent=False, before=14)


def right_block(text, before=0):
    p = para(text, align=WD_ALIGN_PARAGRAPH.LEFT, indent=False, before=before)
    p.paragraph_format.left_indent = Cm(9)
    return p


right_block('Керівник курсової роботи', before=80 if KT1 else 96)
right_block('доцент, к.т.н. Машевська М. В.')
right_block('«___» ____________ 2026 р.')
right_block('Розробив студент гр. КН-41', before=14)
right_block('Миханцьо О. М.')
para('Львів 2026', align=C, indent=False, before=70)

# ───────────────────────────── анотація ─────────────────────────────
blocks = [b for b in blocks if b[0] != 'h1']
if blocks and blocks[0] == ('h2', 'АНОТАЦІЯ'):
    j = 1
    page_break()
    para('АНОТАЦІЯ', align=C, indent=False, bold=True, after=16)
    while j < len(blocks) and blocks[j][0] != 'h2':
        para(blocks[j][1])
        j += 1
    blocks = blocks[j:]

# ───────────────────────────── зміст ─────────────────────────────
APPX = re.compile(r'^Додаток ([А-ЯҐЄІЇ])\. (.*)$')
toc = []
for k, v in blocks:
    if k == 'h2':
        toc.append((1, v))
    elif k == 'h3':
        toc.append((2, v))
    elif k == 'h4':
        toc.append((3, v))

page_break()
para('ЗМІСТ', align=C, indent=False, bold=True, after=16)
for idx, (lvl, text) in enumerate(toc):
    par = doc.add_paragraph()
    if idx == 0:
        for kind, val in (('begin', None), ('instr', ' TOC \\o "1-3" \\h \\z \\u '), ('separate', None)):
            r = par.add_run()
            if kind == 'instr':
                t = OxmlElement('w:instrText')
                t.set(qn('xml:space'), 'preserve')
                t.text = val
                r._r.append(t)
            else:
                e = OxmlElement('w:fldChar')
                e.set(qn('w:fldCharType'), kind)
                r._r.append(e)
    f = par.paragraph_format
    f.first_line_indent = Cm(0)
    f.left_indent = Cm({1: 0, 2: 0.5, 3: 1.0}[lvl])
    f.alignment = WD_ALIGN_PARAGRAPH.LEFT
    f.tab_stops.add_tab_stop(Cm(TEXT_W), WD_TAB_ALIGNMENT.RIGHT, WD_TAB_LEADER.DOTS)
    par.add_run(text + '\t' + str(PAGES.get(text, '')))
    if idx == len(toc) - 1:
        r = par.add_run()
        e = OxmlElement('w:fldChar')
        e.set(qn('w:fldCharType'), 'end')
        r._r.append(e)

# ───────────────────────────── тіло ─────────────────────────────
prev_kind = None
in_refs = False
for k, v in blocks:
    last, prev_kind = prev_kind, k
    if k == 'h2':
        in_refs = v.startswith('СПИСОК')
        h = doc.add_heading(level=1)
        m = re.match(r'^(РОЗДІЛ \d+)\. (.*)$', v)
        if m:
            h.add_run(m.group(1))
            h.add_run().add_break()
            h.add_run(m.group(2))
        else:
            h.add_run(v)
        continue
    if k in ('h3', 'h4'):
        m = APPX.match(v) if k == 'h3' else None
        if m:
            # Додаток: з нової сторінки, по центру, «ДОДАТОК А» і назва з нового рядка
            h = doc.add_heading(level=2)
            hf = h.paragraph_format
            hf.alignment = C
            hf.first_line_indent = Cm(0)
            hf.space_before = Pt(0)
            hf.space_after = Pt(16)
            if last != 'h2':
                hf.page_break_before = True
            h.add_run(f'ДОДАТОК {m.group(1)}')
            h.add_run().add_break()
            h.add_run(m.group(2))
            continue
        h = doc.add_heading(v, level=2 if k == 'h3' else 3)
        if last in ('h2', 'h3', 'h4'):
            h.paragraph_format.space_before = Pt(0)
        continue
    if k == 'fig':
        add_figure(v[0], v[1], v[2], v[3] if len(v) > 3 else None)
        continue
    if k == 'eq':
        add_equation(*v)
        continue
    if k == 'code':
        add_code(v)
        continue
    if k == 'p' and re.match(r'^Таблиця [А-ЯҐЄІЇ\d]+\.\d+ – ', v):
        num, name = re.match(r'^Таблиця ([А-ЯҐЄІЇ\d]+\.\d+) – (.*)$', v).groups()
        para(f'Таблиця {num}', align=WD_ALIGN_PARAGRAPH.RIGHT, indent=False, italic=True, before=8, keep=True)
        para(name, align=C, indent=False, bold=True, after=4, keep=True)
        continue
    if k == 'p' and re.match(r'^Лістинг [А-ЯҐЄІЇ]\.\d+ – ', v):
        para(v, indent=False, bold=True, before=10, keep=True, align=WD_ALIGN_PARAGRAPH.LEFT)
        continue
    if k == 'table':
        add_table(v)
        continue
    if k == 'ol' and in_refs:
        n, txt = v
        para(f'{n}. ' + txt, align=WD_ALIGN_PARAGRAPH.LEFT)
        continue
    if k == 'ol':
        n, txt = v
        para(f'{n}) ' + txt)
        continue
    if k == 'ul':
        para('– ' + v)
        continue
    if k == 'def':
        para(v, align=WD_ALIGN_PARAGRAPH.LEFT, indent=False)
        continue
    para(v)

zoom = doc.settings.element.find(qn('w:zoom'))
if zoom is not None:
    zoom.set(qn('w:percent'), '100')
doc.save(OUT)
json.dump([t for _, t in toc], open(os.path.join(BASE, 'toc.json'), 'w'), ensure_ascii=False)
print('saved', OUT, 'toc entries', len(toc))
