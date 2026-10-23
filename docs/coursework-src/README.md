# Вихідні файли документів курсової

Звідси збираються Word-документи `docs/KR_SMART_RESTAURANT.docx` (пояснювальна записка) і `docs/KT1_SMART_RESTAURANT.docx` (КТ №1) та діаграми в `docs/diagrams`.

| Що | Де |
|---|---|
| Текст розділів (markdown) | `note/*.md`: `s1.md` — розділ 1 (спільний для КТ №1 і записки), `s2design.md` — 2.1–2.2, `note.md` — записка, `kt1.md` — КТ №1, `app*.md` — додатки |
| Рисунки зі скриншотами | `note/fig` (мобільні — склеєні по три з підписами а, б, в) |
| Діаграми | `diagrams/render.html` (SVG-рендерер) + `diagrams/uc-specs.js` (варіанти використання для кожної ролі) |
| Генератор Word | `note/build_docx.py` — оформлення за Додатком Г методички (Times New Roman 14, інтервал 1,15, поля, нумерація, ЗМІСТ, таблиці, рисунки, формули, лістинги) |

## Як перезібрати

```bash
# діаграми → docs/diagrams/*.png (Playwright із кореневого package.json)
node docs/coursework-src/diagrams/render.mjs

# документи → docs/*.docx (потрібні python-docx, Pillow, PyMuPDF і LibreOffice)
docs/coursework-src/note/build.sh
```

`build.sh` робить два проходи: LibreOffice рахує сторінки, потім номери підставляються у ЗМІСТ. Фрагменти коду для додатка А беруться безпосередньо з `backend/src`, тому лістинги завжди відповідають коду. Після редагування документа у Word зміст можна оновити: правою кнопкою по змісту → «Оновити поле».
