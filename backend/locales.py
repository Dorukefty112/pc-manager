import json
from pathlib import Path

LOCALES_DIR = Path(__file__).parent / "locales"
_cache = {}

def get_locale(lang: str = "tr") -> dict:
    if lang in _cache:
        return _cache[lang]
    file_path = LOCALES_DIR / f"{lang}.json"
    if file_path.exists():
        data = json.loads(file_path.read_text(encoding="utf-8"))
        _cache[lang] = data
        return data
    return {}

def t(key: str, lang: str = "tr") -> str:
    translations = get_locale(lang)
    return translations.get(key, key)

def reload_locales():
    _cache.clear()
