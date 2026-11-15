#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""扫"字幕整条消失"的帧：字幕带里一个胶囊底板的暗像素都没有，说明这一刻屏幕上没有字幕。

为什么单独扫这个：逐字跟读按"屏"换页，换页时透明度从 0 淡入，会有 1~4 帧
整条字幕看不见。逐帧差异指标看不出来（面积小），但观众看到的是"字幕闪了一下"。

用法：python scripts/scan-subtitle-gaps.py --dir ../video-remotion/out/seq-beat
"""
import argparse
import glob
import os
import re

import numpy as np
from PIL import Image

# 字幕带：底部 220px；胶囊底板 rgb(11,24,33) 压到 0.78 后灰度约 55，阈值取 120 足够分开
BAND_TOP = 860
DARK = 120


def runs(nums):
    out, cur, prev = [], 0, None
    for x in nums:
        if prev is not None and x == prev + 1:
            cur += 1
        else:
            if cur:
                out.append(cur)
            cur = 1
        prev = x
    if cur:
        out.append(cur)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True)
    args = ap.parse_args()

    files = glob.glob(os.path.join(args.dir, "*.png"))
    # 按帧号排，不按字典序：分段渲染出来的文件名补零位数不同，字典序会乱序
    files.sort(key=lambda p: int(re.search(r"(\d+)(?=\.[^.]+$)", os.path.basename(p)).group(1)))
    if not files:
        print("没有帧：" + args.dir)
        return 1

    gaps = []
    for p in files:
        gray = np.asarray(Image.open(p).convert("L"), dtype=np.uint8)[BAND_TOP:, :]
        if int((gray < DARK).sum()) == 0:
            idx = int(os.path.basename(p).split("-")[1].split(".")[0])
            gaps.append(idx)

    dist = runs(gaps)
    print("%s" % args.dir)
    print("  字幕整条消失：%d 帧（占 %.1f%%）" % (len(gaps), 100.0 * len(gaps) / len(files)))
    print("  连段：%s" % (dist if dist else "无"))
    if gaps:
        print("  位置：%s" % gaps[:24])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
