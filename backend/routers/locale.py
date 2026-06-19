import json
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(tags=["locale"])
LOCALE_FILE = Path(__file__).parent.parent / "locales" / "frontend.json"

@router.get("/api/locale/{lang}")
def get_locale(lang: str):
    allowed = ["tr", "en"]
    if lang not in allowed:
        lang = "tr"
    file_path = Path(__file__).parent.parent / "locales" / f"frontend_{lang}.json"
    if file_path.exists():
        return json.loads(file_path.read_text(encoding="utf-8"))
    return {}
