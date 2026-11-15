"""渲染侧验收：字幕逐字点亮到底发生在第几帧。

思路：字幕带里"已念的字"是纯白（≥238），"未念的字"是 28% 亮度（~120）。
亮像素总数每点亮一个字就跳一级台阶 → 跳变帧 = 实际点亮帧，
与 cues.json 里 TTS 报的时间戳逐字比对。

注意：入场前 0.4s 胶囊在淡入+上浮，亮像素数本身在爬坡，那一段的台阶是假的，
统计从 SUB_START 帧之后开始。

用法：
  python scripts/measure-subtitle-steps.py --dir ../video-remotion/out/sync-probe --json out.json
"""
import argparse
import json
import os
import re

import numpy as np
from PIL import Image

BRIGHT = 238
STEP_MIN_DELTA = 120
# 台阶检测与时间戳的配对容差：30fps 下 3 帧 = 100ms，肉眼不可分
TOL = 3
# 入场动画（0.4s 淡入 + 上浮）期间亮像素在爬坡，台阶检测不可信
SUB_START = 12


def list_frames(directory):
    files = [f for f in os.listdir(directory) if f.endswith(".png")]
    files.sort(key=lambda p: int(re.search(r"(\d+)(?=\.[^.]+$)", p).group(1)))
    return [os.path.join(directory, f) for f in files]


def find_capsule(img):
    """字幕胶囊包围盒。content-fit 宽度（最多 756px），一行里深色只占 ~40%，
    所以按"深色块"而不是"整行"定位；也不能用第 0 帧（那时 opacity=0）。"""
    g = np.asarray(img.convert("L"), dtype=np.uint8)
    h = g.shape[0]
    start = int(h * 0.72)
    mask = g[start:, 300:1620] < 110
    rows = np.where(mask.mean(axis=1) > 0.3)[0]
    if len(rows) == 0:
        raise SystemExit("subtitle capsule not found")
    band = mask[int(rows.min()):int(rows.max()) + 1, :]
    cols = np.where(band.mean(axis=0) > 0.3)[0]
    return start + int(rows.min()), start + int(rows.max()) + 1, 300 + int(cols.min()), 300 + int(cols.max()) + 1


def bright_counts(files, box):
    top, bottom, left, right = box
    out = []
    for path in files:
        g = np.asarray(Image.open(path).convert("L"), dtype=np.uint8)[top:bottom, left:right]
        out.append(int((g >= BRIGHT).sum()))
    return out


def detect_steps(counts, lo, hi):
    steps = []
    for i in range(max(1, lo), min(hi, len(counts))):
        if abs(counts[i] - counts[i - 1]) >= STEP_MIN_DELTA:
            steps.append(i)
    merged = []
    for s in steps:
        if merged and s - merged[-1] <= 2:
            continue
        merged.append(s)
    return merged


def report(label, detected, expected, lo, hi):
    """按容差配对：实测台阶与时间戳相差 ≤TOL 帧才算对上。

    两个字的发音间隔 <3 帧时，人眼看就是"同时亮"，台阶检测会合并成一个，
    这时后一个字记为"与上一个合并"，不当作错。
    """
    det = [s for s in detected if lo <= s < hi]
    exp = [s for s in expected if lo <= s < hi]
    print("")
    print("== %s（第 %d~%d 帧）==" % (label, lo, hi - 1))
    print("实测点亮帧:", det)
    print("TTS 时间戳:", exp)

    used = set()
    diffs, merged = [], []
    for frame in exp:
        best, best_dist = None, TOL + 1
        for s in det:
            if s in used:
                continue
            dist = abs(s - frame)
            if dist < best_dist:
                best, best_dist = s, dist
        if best is not None:
            used.add(best)
            diffs.append(best - frame)
        else:
            merged.append(frame)
    if diffs:
        print("逐字偏差（帧）:", diffs)
        worst = max(abs(d) for d in diffs)
        print(
            "对上 %d/%d 字，最大偏差 %d 帧（%.0f ms）%s"
            % (
                len(diffs),
                len(exp),
                worst,
                worst / 30 * 1000,
                "；合并（间隔<3帧，人眼看是同时亮）: %s" % merged if merged else "",
            )
        )
    else:
        print("没有任何台阶对上")
    return diffs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True)
    ap.add_argument("--json", default=None)
    args = ap.parse_args()

    frame_dir = os.path.join(args.dir, "frames") if os.path.isdir(os.path.join(args.dir, "frames")) else args.dir
    files = list_frames(frame_dir)
    if not files:
        raise SystemExit(f"no frames in {frame_dir}")
    meta = json.load(open(os.path.join(args.dir, "cues.json"), encoding="utf-8"))
    pages = meta["pages"]
    switch = pages[1]["starts"][0] - 6 if len(pages) > 1 else len(files)

    print("帧数          : %d（0~%d）" % (len(files), len(files) - 1))
    print("字幕页数      : %d，换页帧 %d" % (len(pages), switch))

    all_diffs = []
    for page_index, page in enumerate(pages[:2]):
        lo = 0 if page_index == 0 else switch
        hi = switch if page_index == 0 else len(files)
        if lo >= len(files):
            continue
        probe = Image.open(files[min(len(files) - 1, lo + max(SUB_START, (hi - lo) // 3))])
        box = find_capsule(probe)
        counts = bright_counts(files, box)
        detected = detect_steps(counts, 1, len(counts))
        start = SUB_START if page_index == 0 else lo + SUB_START
        print("")
        print("字幕胶囊      : x=%d..%d y=%d..%d" % (box[2], box[3], box[0], box[1]))
        all_diffs += report("第 %d 屏" % (page_index + 1), detected, page["starts"], start, hi)

    if all_diffs:
        worst = max(abs(d) for d in all_diffs)
        print("")
        print("===== 汇总 =====")
        print("逐字对齐：%d 个字，最大偏差 %d 帧（%.0f ms）" % (len(all_diffs), worst, worst / 30 * 1000))

    if args.json:
        out = os.path.abspath(args.json)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        json.dump({"pages": len(pages), "switch": switch, "diffsFrames": all_diffs}, open(out, "w", encoding="utf-8"), indent=2)
        print("json -> %s" % out)


if __name__ == "__main__":
    main()
