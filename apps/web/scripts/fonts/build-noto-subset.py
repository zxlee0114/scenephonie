#!/usr/bin/env python3
"""票券 29 —— Noto Sans TC Regular 400 的靜態 105 塊 unicode-range subset 管線。

規格 §7.11 / research/cjk-webfont-loading.md 定案的主線：

    google/fonts 的 NotoSansTC[wght].ttf
      → fonttools varLib.instancer wght=400        （glyf 靜態 TTF，比 CFF 省 ~31%）
      → 依 Google css2 端點公開的 105 段 unicode-range 表跑 pyftsubset 切 105 塊 woff2
      → 產物 public/fonts/noto-sans-tc/NNN.woff2 + generated fonts.css（font-display: swap）

**否決動態 subset**（研究 §2.2）：編輯器用字無法預先窮舉，subset URL 獨一無二使 CDN
命中率趨近 0，還把往返延遲搬到打字上。靜態分塊付的 6–8 倍體積是保險費。

切分表不是 Google 的黑箱 —— 抓下來存進 `unicode-ranges.json`，之後不需要網路即可重跑
（除非要換字型版本）。詳見同目錄 README.md。

用法：
    python3 -m venv .venv && .venv/bin/pip install "fonttools[woff]" brotli
    .venv/bin/python apps/web/scripts/fonts/build-noto-subset.py [--work DIR] [--jobs N]

需要網路的只有 `--fetch`（預設開）：抓 12MB 的可變字型與 Google css2。帶 `--no-fetch`
時會沿用 --work 目錄裡既有的 `NotoSansTC-wght.ttf` 與 repo 內的 `unicode-ranges.json`。
"""

from __future__ import annotations

import argparse
import concurrent.futures
import json
import re
import subprocess
import sys
import urllib.request
from datetime import date
from pathlib import Path

# google/fonts 的可變字型（glyf）。research §3.2：從這裡 instance 到 400 再壓 woff2，
# 比 noto-cjk 的 CFF OTF 小 31%。
VF_URL = "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/notosanstc/NotoSansTC%5Bwght%5D.ttf"
# Chrome UA 才會讓 css2 端點回 woff2 + 105 段切分（其他 UA 回 ttf 單檔）。
CSS2_URL = "https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400&display=swap"
CHROME_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

FONT_FAMILY = "Noto Sans TC"
REPO_FONT_DIR = Path(__file__).resolve().parents[2] / "public" / "fonts" / "noto-sans-tc"
RANGES_JSON = Path(__file__).resolve().parent / "unicode-ranges.json"

# 首屏 preload 的塊數（research §3.6：拉丁四塊 + 最高頻 5 塊 CJK ≈ 185 KB 覆蓋 94% 字元）。
PRELOAD_TOP_CJK = 5

FACE_RE = re.compile(r"@font-face\s*{(.*?)}", re.S)
URL_RE = re.compile(r"url\((https://[^)]+?\.woff2)\)")
RANGE_RE = re.compile(r"unicode-range:\s*([^;]+);")
# CJK 塊的 URL 尾綴 `.<freq>.woff2`；freq 大 = 高頻（research §3.3）。拉丁族的塊沒有這個尾綴。
FREQ_RE = re.compile(r"\.(\d+)\.woff2$")
# Google 在拉丁族塊前面放 `/* latin */` 之類的註解。
NAME_RE = re.compile(r"/\*\s*([a-z0-9-]+)\s*\*/\s*$", re.I)


def fetch(url: str, ua: str | None = None) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": ua} if ua else {})
    with urllib.request.urlopen(req, timeout=60) as resp:  # noqa: S310 (信任的固定端點)
        return resp.read()


def parse_css(css: str) -> list[dict]:
    """回傳依 CSS 檔案順序（＝級聯優先序）排列的塊清單。"""
    chunks: list[dict] = []
    for i, m in enumerate(FACE_RE.finditer(css)):
        body = m.group(1)
        url = URL_RE.search(body).group(1)
        rng = " ".join(RANGE_RE.search(body).group(1).split())
        freq_m = FREQ_RE.search(url)
        preceding = css[: m.start()]
        name_m = NAME_RE.search(preceding.rstrip())
        chunks.append(
            {
                "ordinal": i + 1,  # 1..105，檔案順序 = 級聯順序
                "freqIndex": int(freq_m.group(1)) if freq_m else None,
                "name": name_m.group(1) if (name_m and not freq_m) else None,
                "unicodeRange": rng,
            }
        )
    return chunks


def load_or_fetch_ranges(work: Path, do_fetch: bool) -> tuple[list[dict], dict]:
    if do_fetch:
        css = fetch(CSS2_URL, CHROME_UA).decode("utf-8")
        (work / "notosanstc.css").write_text(css, encoding="utf-8")
        chunks = parse_css(css)
        meta = {
            "source": CSS2_URL,
            "sourceUserAgent": CHROME_UA,
            "fetchedOn": date.today().isoformat(),
            "chunkCount": len(chunks),
            "note": (
                "Google Fonts css2 端點公開的 105 段 unicode-range 切分表（依字頻排序）。"
                "存進 repo 當切分表，重跑 subset 不需要網路。research/cjk-webfont-loading.md §3.3。"
            ),
            "chunks": chunks,
        }
        RANGES_JSON.write_text(
            json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        return chunks, meta

    meta = json.loads(RANGES_JSON.read_text(encoding="utf-8"))
    return meta["chunks"], meta


def instance_400(work: Path, do_fetch: bool) -> Path:
    vf = work / "NotoSansTC-wght.ttf"
    if do_fetch or not vf.exists():
        print(f"↓ 抓可變字型 {VF_URL}")
        vf.write_bytes(fetch(VF_URL))
    static = work / "NotoSansTC-400.ttf"
    print("• instancer wght=400 …")
    subprocess.run(
        [sys.executable, "-m", "fontTools.varLib.instancer", str(vf), "wght=400", "-o", str(static)],
        check=True,
        capture_output=True,
    )
    print(f"  → {static.name}  {static.stat().st_size:,} bytes")
    return static


def subset_one(static: Path, chunk: dict, out_dir: Path) -> tuple[int, int]:
    out = out_dir / f"{chunk['ordinal']:03d}.woff2"
    subprocess.run(
        [
            "pyftsubset",
            str(static),
            f"--unicodes={chunk['unicodeRange'].replace('U+', '').replace(' ', '')}",
            "--flavor=woff2",
            "--layout-features=*",
            "--no-hinting",
            "--desubroutinize",
            f"--output-file={out}",
        ],
        check=True,
        capture_output=True,
    )
    return chunk["ordinal"], out.stat().st_size


def pick_preload(chunks: list[dict]) -> list[int]:
    latin_family = [c["ordinal"] for c in chunks if c["freqIndex"] is None]
    cjk_by_freq = sorted(
        (c for c in chunks if c["freqIndex"] is not None),
        key=lambda c: c["freqIndex"],
        reverse=True,
    )
    return sorted(latin_family + [c["ordinal"] for c in cjk_by_freq[:PRELOAD_TOP_CJK]])


def emit_css(chunks: list[dict], sizes: dict[int, int], preload: list[int]) -> str:
    lines = [
        "/* GENERATED —— 勿手改。重跑 apps/web/scripts/fonts/build-noto-subset.py。",
        f" * {FONT_FAMILY} Regular 400，{len(chunks)} 塊 unicode-range subset（票券 29）。",
        " * font-display: swap —— 編輯器分塊載入持續發生在打字過程中，swap 是唯一不會",
        " * 「按鍵後空白」或「同頁字型永久混排」的值（research §4.2）。",
        f" * preload 目標（高頻塊，見 <head>）：{preload}",
        " */",
        "",
    ]
    for c in chunks:
        tag = c["name"] or f"freq {c['freqIndex']}"
        kb = sizes[c["ordinal"]] / 1024
        lines += [
            f"/* {c['ordinal']:03d} · {tag} · {kb:.1f} KB */",
            "@font-face {",
            f"  font-family: '{FONT_FAMILY}';",
            "  font-style: normal;",
            "  font-weight: 400;",
            "  font-display: swap;",
            f"  src: url('./{c['ordinal']:03d}.woff2') format('woff2');",
            f"  unicode-range: {c['unicodeRange']};",
            "}",
            "",
        ]
    return "\n".join(lines)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--work", type=Path, default=Path("/tmp/notobuild"))
    ap.add_argument("--jobs", type=int, default=8)
    ap.add_argument("--no-fetch", dest="fetch", action="store_false")
    args = ap.parse_args()

    args.work.mkdir(parents=True, exist_ok=True)
    REPO_FONT_DIR.mkdir(parents=True, exist_ok=True)

    chunks, meta = load_or_fetch_ranges(args.work, args.fetch)
    if len(chunks) != 105:
        print(f"⚠ 預期 105 塊，實際 {len(chunks)} —— Google 改了切分表，檢查後再繼續。")
        return 1
    print(f"• 切分表 {len(chunks)} 塊（來源 {meta['fetchedOn']}）")

    static = instance_400(args.work, args.fetch)

    for old in REPO_FONT_DIR.glob("*.woff2"):
        old.unlink()

    sizes: dict[int, int] = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.jobs) as pool:
        for ordinal, size in pool.map(lambda c: subset_one(static, c, REPO_FONT_DIR), chunks):
            sizes[ordinal] = size
    total = sum(sizes.values())
    print(f"• {len(sizes)} 塊 woff2，合計 {total:,} bytes（{total / 1024 / 1024:.2f} MiB）")

    preload = pick_preload(chunks)
    (REPO_FONT_DIR / "fonts.css").write_text(emit_css(chunks, sizes, preload), encoding="utf-8")
    # 小檔，單一事實來源：layout.tsx 讀它產生 <link rel="preload">，不必 import 整份切分表。
    (REPO_FONT_DIR / "preload.json").write_text(
        json.dumps(
            {
                "note": "GENERATED —— 高頻塊的檔名（不含副檔名）。build-noto-subset.py 產出。",
                "files": [f"{o:03d}" for o in preload],
                "bytes": sum(sizes[o] for o in preload),
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    preload_bytes = sum(sizes[o] for o in preload)
    print(f"• fonts.css 寫出；preload {len(preload)} 塊 = {preload_bytes / 1024:.0f} KB → {preload}")

    # 把 preload 清單也塞回 unicode-ranges.json，讓 layout.tsx 有單一事實來源可讀。
    meta["preloadOrdinals"] = preload
    for c in meta["chunks"]:
        c["bytes"] = sizes[c["ordinal"]]
    RANGES_JSON.write_text(
        json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print("✓ 完成")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
