import os

# Testler config.json olmadan varsayılan şifreyle ("pcmanager") giriş yapar. Üretimde
# kurulum sihirbazı bitmeden giriş kapalıdır (auth.is_configured); bunu yalnızca
# test sürecinde atlıyoruz. Kapıyı doğrulayan testler değişkeni kendileri kaldırır.
os.environ.setdefault("PCMANAGER_ALLOW_DEFAULT_PASSWORD", "1")
