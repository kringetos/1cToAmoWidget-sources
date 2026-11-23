"""Read-only artifact checks. Does not execute BSL or replace a 1C runtime test."""
from pathlib import Path
import hashlib
import json
import re
import struct
import zlib

ROOT = Path(__file__).resolve().parent


def page(data, offset):
    size, capacity, next_page = (int(v, 16) for v in data[offset:offset + 31].split())
    result = data[offset + 31:offset + 31 + min(size, capacity)]
    seen = {offset}
    while next_page != 0x7fffffff:
        if next_page in seen:
            raise ValueError("Cyclic container page chain")
        seen.add(next_page)
        offset = next_page
        _, capacity, next_page = (int(v, 16) for v in data[offset:offset + 31].split())
        result += data[offset + 31:offset + 31 + min(size - len(result), capacity)]
    if len(result) != size:
        raise ValueError("Incomplete container page")
    return result


def entries(data):
    if data[:4] != b"\xff\xff\xff\x7f":
        raise ValueError("Unexpected 1C container signature")
    table = page(data, 16)
    for offset in range(0, len(table), 12):
        header_at, data_at, _ = struct.unpack_from("<III", table, offset)
        name = page(data, header_at)[20:].decode("utf-16-le").rstrip("\0")
        content = page(data, data_at)
        yield name, content


def leaves(data, prefix="", compressed=True):
    for name, content in entries(data):
        if compressed:
            content = zlib.decompress(content, -15)
        path = prefix + name
        if content[:4] == b"\xff\xff\xff\x7f":
            yield from leaves(content, path + "/", compressed=False)
        else:
            yield path, content


def reverse_patch(after, patch):
    lines = after.splitlines(keepends=True)
    result = []
    cursor = 0
    rows = patch.splitlines(keepends=True)
    index = 0
    changes = []
    while index < len(rows):
        match = re.match(r"@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@", rows[index])
        if not match:
            index += 1
            continue
        old_at, old_count, new_at, new_count = [int(v or 1) for v in match.groups()]
        old, new = [], []
        index += 1
        while index < len(rows) and not rows[index].startswith("@@"):
            row = rows[index]
            if row.startswith((" ", "-")):
                old.append(row[1:])
            if row.startswith((" ", "+")):
                new.append(row[1:])
            if row.startswith(("+", "-")):
                changes.append(row.rstrip("\r\n"))
            index += 1
        assert len(old) == old_count and len(new) == new_count
        assert lines[new_at - 1:new_at - 1 + new_count] == new, "Patch does not match source"
        result.extend(lines[cursor:new_at - 1])
        result.extend(old)
        cursor = new_at - 1 + new_count
    result.extend(lines[cursor:])
    assert changes, "No patch hunks"
    return "".join(result), changes


def main():
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    checks = []
    for item in manifest["files"]:
        if not item["path"].startswith("extension/"):
            continue
        data = (ROOT / item["path"]).read_bytes()
        assert len(data) == item["bytes"], item["path"]
        assert hashlib.sha256(data).hexdigest() == item["sha256"], item["path"]
        checks.append("Manifest size and SHA-256: " + item["path"])

    source = (ROOT / "extension/TeMa_HTTPСервис.Module.bsl").read_bytes()
    cfe = (ROOT / "extension/ИнтеграцияAmoCRM_исправление_группы.cfe").read_bytes()
    matches = [name for name, content in leaves(cfe) if content == source]
    assert len(matches) == 1, "CFE must contain one exact copy of the source module"
    checks.append("CFE embedded module equals BSL byte-for-byte: " + matches[0])
    text = source.decode("utf-8-sig")
    patch = (ROOT / "extension/nomenclature-group.patch").read_bytes().decode("utf-8-sig")
    before, changes = reverse_patch(text, patch)
    function_pattern = r"(?m)^Функция\s+(\w+)\([^\n]*"
    names = re.findall(function_pattern, text)
    assert names == re.findall(function_pattern, before)
    target = "ГенерацияУПДСоздатьУПД"
    start = text.index("Функция " + target + "(")
    end = text.index("КонецФункции", start) + len("КонецФункции")
    old_start = before.index("Функция " + target + "(")
    old_end = before.index("КонецФункции", old_start) + len("КонецФункции")
    assert text[:start] == before[:old_start] and text[end:] == before[old_end:]
    checks.append("Relative to supplied patch baseline, only " + target + " changed")
    handler = text[start:end]
    group_read = handler.index("ГруппаНоменклатуры = НовСтрока.Номенклатура.НоменклатурнаяГруппа;")
    assign = handler.index("НовСтрока.Субконто = ГруппаНоменклатуры;")
    guard = handler.index("Если НЕ ЗначениеЗаполнено(ГруппаНоменклатуры) Тогда")
    write = handler.index("НоваяРеализация.Записать(")
    loop = handler.index("Для Каждого СтрокаЗаказа Из СсылкаНаЗаказ.Товары Цикл")
    loop_end = handler.index("КонецЦикла;", loop)
    assert loop < group_read < assign < guard < loop_end < write
    assert "Возврат ОшибкаJSON(Ответ, 400," in handler[guard:loop_end]
    assert "УчитыватьНДС" not in handler
    assert 'НоваяРеализация.СуммаВключаетНДС = Истина;' in handler
    assert len([line for line in changes if line.startswith("-")]) == 1
    checks.extend([
        "Group is read and assigned inside each goods iteration",
        "Empty-group guard returns 400 before the first document write",
        "Unsupported VAT attribute removed; SumIncludesVAT preserved",
    ])
    print(json.dumps({"checks": checks, "passed": len(checks),
                      "scope": "Static artifact checks only; patch baseline is reconstructed, not independently obtained"},
                     ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
