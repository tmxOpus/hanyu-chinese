"""Докачивает порядок черт для всех иероглифов сайта в папку strokes/.

Запуск из корня проекта:  python3 scripts/fetch-strokes.py
Иероглифы берутся из js/dictionary.js и js/course/*.js. Уже скачанные файлы не трогаются.
"""
import glob
import json
import os
import urllib.parse
import urllib.request
import concurrent.futures as cf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCES = ["js/dictionary.js"] + glob.glob(os.path.join(ROOT, "js/course/*.js"))


def han_chars():
    chars = set()
    for path in SOURCES:
        full = path if os.path.isabs(path) else os.path.join(ROOT, path)
        with open(full, encoding="utf-8") as f:
            chars.update(c for c in f.read() if "一" <= c <= "鿿")
    return sorted(chars)


def local_name(ch):
    return os.path.join(ROOT, "strokes", "%04x.json" % ord(ch))


def download(ch):
    url = "https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0/" + urllib.parse.quote(ch) + ".json"
    for _ in range(3):
        try:
            with urllib.request.urlopen(url, timeout=30) as r:
                return ch, r.read().decode("utf-8")
        except Exception:
            pass
    return ch, None


def main():
    os.makedirs(os.path.join(ROOT, "strokes"), exist_ok=True)
    missing = [c for c in han_chars() if not os.path.exists(local_name(c))]
    print("нужно докачать:", len(missing))
    failed = []
    with cf.ThreadPoolExecutor(12) as ex:
        for ch, body in ex.map(download, missing):
            if body is None:
                failed.append(ch)
                continue
            json.loads(body)  # проверяем, что это корректный JSON
            with open(local_name(ch), "w", encoding="utf-8") as f:
                f.write(body)
    print("не удалось:", "".join(failed) or "нет")


if __name__ == "__main__":
    main()
