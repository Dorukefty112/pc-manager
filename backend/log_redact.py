"""Log kayıtlarında JWT'leri maskeler.

WebSocket'ler ve iframe tabanlı sayfalar tarayıcı başlık gönderemediği için token'ı
URL'de (?token=...) taşıyor; uvicorn bu URL'leri erişim loguna olduğu gibi yazıyor.
Log dosyası/ekran görüntüsü paylaşıldığında oturum anahtarı sızmasın diye tüm log
kayıtları oluşturulurken maskelenir. Kayıt fabrikası global olduğu için uvicorn,
websockets ve kendi logger'larımızın hepsini kapsar.
"""
import logging
import re

_TOKEN_RE = re.compile(r"([?&]token=)[^&\s\"'#]+")
_installed = False


def scrub(value):
    if isinstance(value, str) and "token=" in value:
        return _TOKEN_RE.sub(r"\1***", value)
    return value


def install():
    global _installed
    if _installed:
        return
    _installed = True
    previous = logging.getLogRecordFactory()

    def factory(*args, **kwargs):
        record = previous(*args, **kwargs)
        record.msg = scrub(record.msg)
        if isinstance(record.args, tuple):
            record.args = tuple(scrub(a) for a in record.args)
        elif isinstance(record.args, dict):
            record.args = {k: scrub(v) for k, v in record.args.items()}
        return record

    logging.setLogRecordFactory(factory)
