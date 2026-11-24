# build.py｜把 index.html 和 css/、js/、data/ 合成「單一 HTML 檔」，方便直接寄送或放到 GitHub Pages
# 用法：python tools/build.py                 → 產生 dist/SOP統整中心.html（完整網頁，雙擊即可開）
#       python tools/build.py --artifact      → 另外產生 dist/artifact.html（Claude 線上頁面用的格式，不含 <html> 外框）
# 只會內嵌本機檔案；字型與 Word 產生器（docx）仍從網路載入。
import re, sys
from pathlib import Path

SRC = Path(__file__).resolve().parents[1]
DIST = SRC / "dist"


def inline(html):
    def css(m):
        return "<style>\n" + (SRC / m.group(1)).read_text(encoding="utf-8") + "</style>"

    def js(m):
        code = (SRC / m.group(1)).read_text(encoding="utf-8").replace("</script", "<\\/script")
        return "<script>\n" + code + "</script>"

    parts = re.split(r"(<!--.*?-->)", html, flags=re.S)        # 註解裡的範例不處理
    for i, part in enumerate(parts):
        if not part.startswith("<!--"):
            part = re.sub(r'<link rel="stylesheet" href="(?!https?:)([^"]+)">', css, part)
            parts[i] = re.sub(r'<script src="(?!https?:)([^"]+)"></script>', js, part)
    return "".join(parts)


def main():
    html = inline((SRC / "index.html").read_text(encoding="utf-8"))
    DIST.mkdir(exist_ok=True)
    out = DIST / "SOP統整中心.html"
    out.write_text(html, encoding="utf-8")
    print("已產生", out.relative_to(SRC).as_posix(), f"({len(html.encode()) // 1024} KB)")
    if "--artifact" in sys.argv:
        head = re.search(r"<head>(.*?)</head>", html, re.S).group(1)
        body = re.search(r"<body>(.*?)</body>", html, re.S).group(1)
        head = re.sub(r'<meta charset="utf-8">\n|<meta name="viewport"[^>]*>\n', "", head)
        art = re.sub(r"(<title>.*?</title>)", r'\1\n<meta name="claude:viewport-fit-sides" content="cover">', head, count=1)
        (DIST / "artifact.html").write_text(art.strip() + "\n" + body.strip() + "\n", encoding="utf-8")
        print("已產生 dist/artifact.html")


if __name__ == "__main__":
    main()
