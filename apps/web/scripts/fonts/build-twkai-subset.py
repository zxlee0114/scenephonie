#!/usr/bin/env python3
"""票券 18 —— PDF 楷體：全字庫正楷體（TW-Kai）的靜態 unicode-range subset。

GHSA 範本實物用標楷體，但標楷體是微軟授權的字型，不能放上伺服器嵌進 PDF。全字庫正楷體是
數位發展部以「政府資料開放授權條款第 1 版」／OFL-1.1 釋出的楷體，允許重製、改作、嵌入，條件是
註明出處（見產物目錄的 LICENSE.md）。

    https://www.cns11643.gov.tw/opendata/Fonts_Kai.zip（約 58 MB）
      → 取出 BMP 那一檔 TW-Kai-98_1.ttf（Ext-B／Plus 平面不收：劇本用不到，缺字落到 Noto Sans TC）
      → 依票券 29 那一份 105 段切分表（unicode-ranges.json）跑 pyftsubset 切 woff2
      → 產物 public/fonts/tw-kai/NNN.woff2 + generated fonts.css

切塊不是為了網頁載入（這份只給印 PDF 的 Chromium 用）：印表端從 `public/fonts` 回應字型請求，
Chromium 只會要這份稿真的用到的那幾塊 —— 每次印只讀幾百 KB，而不是整套字。

用法（環境同 build-noto-subset.py）：
    .venv/bin/python apps/web/scripts/fonts/build-twkai-subset.py --zip path/to/Fonts_Kai.zip
"""

from __future__ import annotations

import argparse
import concurrent.futures
import json
import subprocess
import zipfile
from pathlib import Path

FONT_FAMILY = "TW-Kai"
# zip 裡 BMP 那一檔。全字庫改版時檔名的版本號會跟著變，對不上就大聲失敗、改這裡。
TTF_NAME = "TW-Kai-98_1.ttf"
REPO_FONT_DIR = Path(__file__).resolve().parents[2] / "public" / "fonts" / "tw-kai"
RANGES_JSON = Path(__file__).resolve().parent / "unicode-ranges.json"


def extract_ttf(zip_path: Path, work: Path) -> Path:
    with zipfile.ZipFile(zip_path) as z:
        member = next((n for n in z.namelist() if n.endswith("/" + TTF_NAME) or n == TTF_NAME), None)
        if member is None:
            raise SystemExit(f"⚠ zip 裡沒有 {TTF_NAME}：{[n for n in z.namelist() if n.endswith('.ttf')]}")
        out = work / TTF_NAME
        out.write_bytes(z.read(member))
    print(f"• 取出 {member}  {out.stat().st_size:,} bytes")
    return out


def subset_one(ttf: Path, chunk: dict, out_dir: Path) -> tuple[int, int | None]:
    out = out_dir / f"{chunk['ordinal']:03d}.woff2"
    subprocess.run(
        [
            "pyftsubset",
            str(ttf),
            f"--unicodes={chunk['unicodeRange'].replace('U+', '').replace(' ', '')}",
            "--flavor=woff2",
            "--layout-features=*",
            "--no-hinting",
            "--desubroutinize",
            "--ignore-missing-unicodes",
            f"--output-file={out}",
        ],
        check=True,
        capture_output=True,
    )
    return chunk["ordinal"], out.stat().st_size


def emit_css(chunks: list[dict], sizes: dict[int, int]) -> str:
    lines = [
        "/* GENERATED —— 勿手改。重跑 apps/web/scripts/fonts/build-twkai-subset.py。",
        f" * 全字庫正楷體（{FONT_FAMILY}），{len(chunks)} 塊 unicode-range subset，只給印 PDF 用（票券 18）。",
        " * 來源：數位發展部，CNS11643中文標準交換碼全字庫網站，https://www.cns11643.gov.tw。",
        " */",
        "",
    ]
    for c in chunks:
        lines += [
            f"/* {c['ordinal']:03d} · {sizes[c['ordinal']] / 1024:.1f} KB */",
            "@font-face {",
            f"  font-family: '{FONT_FAMILY}';",
            "  font-style: normal;",
            "  font-weight: 400;",
            "  font-display: block;",
            f"  src: url('./{c['ordinal']:03d}.woff2') format('woff2');",
            f"  unicode-range: {c['unicodeRange']};",
            "}",
            "",
        ]
    return "\n".join(lines)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--zip", type=Path, required=True)
    ap.add_argument("--work", type=Path, default=Path("/tmp/twkaibuild"))
    ap.add_argument("--jobs", type=int, default=8)
    args = ap.parse_args()

    args.work.mkdir(parents=True, exist_ok=True)
    REPO_FONT_DIR.mkdir(parents=True, exist_ok=True)

    # 半形英數也用楷體自己的字形（半形等寬，跟標楷體一樣）—— 中英混排才協調（使用者驗收 2026-10-22）。
    chunks = json.loads(RANGES_JSON.read_text(encoding="utf-8"))["chunks"]
    ttf = extract_ttf(args.zip, args.work)

    for old in REPO_FONT_DIR.glob("*.woff2"):
        old.unlink()

    sizes: dict[int, int] = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.jobs) as pool:
        for ordinal, size in pool.map(lambda c: subset_one(ttf, c, REPO_FONT_DIR), chunks):
            sizes[ordinal] = size
    total = sum(sizes.values())
    print(f"• {len(sizes)} 塊 woff2，合計 {total:,} bytes（{total / 1024 / 1024:.2f} MiB）")

    (REPO_FONT_DIR / "fonts.css").write_text(emit_css(chunks, sizes), encoding="utf-8")
    print("✓ 完成")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
