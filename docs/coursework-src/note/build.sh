#!/usr/bin/env bash
# Збирає КТ №1 і пояснювальну записку у docs/*.docx (потрібні python-docx, Pillow, PyMuPDF, LibreOffice).
# Два проходи: спершу LibreOffice рахує сторінки, потім номери сторінок підставляються у ЗМІСТ.
set -euo pipefail
cd "$(dirname "$0")"
build() { # $1 — md, $2 — вихідний docx, $3 — додаткові прапорці
  python3 build_docx.py "$1" "$2" $3 > /dev/null
  soffice --headless --convert-to pdf --outdir . "$2" > /dev/null 2>&1
  local pdf; pdf="$(basename "${2%.docx}").pdf"
  python3 pages.py "$pdf" toc.json pages.json > /dev/null
  python3 build_docx.py "$1" "$2" --pages pages.json $3
  rm -f "$pdf" toc.json pages.json
}
python3 - <<'PY'
# Додаток А: фрагменти коду беруться безпосередньо з репозиторію
import pathlib
src = pathlib.Path('../../../backend/src')
def block(title, rel, a, b):
    code = '\n'.join((src / rel).read_text(encoding='utf-8').split('\n')[a - 1:b]).rstrip()
    return f"Лістинг {title}\n\n```ts\n// backend/src/{rel} (рядки {a}–{b})\n{code}\n```\n\n"
out = ("### Додаток А. Фрагменти програмного коду\n\nНаведено найважливіші фрагменти власної реалізації, які характеризують "
       "архітектуру, бізнес-логіку та компоненти підвищеної складності. Повний код — у Git-репозиторії проєкту.\n\n")
out += block('А.1 – Автомати станів замовлення в залі та доставки', 'lib/stateMachine.ts', 37, 92)
out += block('А.2 – Перевірка допустимості переходу та прав актора', 'lib/stateMachine.ts', 134, 158)
out += block('А.3 – Декларативний маршрут: автентифікація, RBAC, валідація zod і реєстр для OpenAPI', 'lib/router.ts', 49, 89)
out += block('А.4 – Штрафна функція вибору столика (booking engine)', 'modules/booking/engine.ts', 75, 141)
out += block('А.5 – Ідемпотентна оплата карткою через sandbox-шлюз', 'modules/payments/payments.service.ts', 123, 175)
out += block('А.6 – Шина подій між Restaurant API і Delivery API (PostgreSQL LISTEN/NOTIFY)', 'lib/bus.ts', 32, 83)
out += block('А.7 – Визначення зони доставки за геолокацією', 'delivery/geo.ts', 25, 58)
pathlib.Path('appA.md').write_text(out, encoding='utf-8')
PY
build kt1.md ../../KT1_SMART_RESTAURANT.docx --kt1
build note.md ../../KR_SMART_RESTAURANT.docx ""
