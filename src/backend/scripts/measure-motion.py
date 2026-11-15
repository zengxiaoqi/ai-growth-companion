#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
measure-motion.py — 逐帧量化"画面到底动没动"。

为什么不能只看全画面 MAE：1080p 里主画布只占一部分，大片纯色背景会把
"局部在动"稀释成"整体没动"。上轮"后段静帧率 98%"就是被这个口径带偏的——
它确实说明画面几乎不变，但没告诉我是"哪里不变"。

所以这里按三层拆：
  1) full   全画面灰度 MAE —— 沿用旧口径，方便和历史数字对齐
  2) 分区   主画布 / 字幕带 —— 定位"是谁在动"
  3) 分块   16x9 网格里有多少块真的在变（活跃块占比）—— 最接近眼睛的感受
     （眼睛感知的是"有几处地方在动"，不是"平均差了多少灰度级"）

用法：
  python scripts/measure-motion.py --dir ../video-remotion/out/seq-base
  python scripts/measure-motion.py --dir ... --scene-frames 200 --json out.json
"""
import argparse
import glob
import json
import os
import re
import sys

import numpy as np
from PIL import Image

# 静帧阈值：全画面平均灰度差 < 0.5 判定为"这一帧和上一帧没区别"。
# 沿用上轮口径，保证新旧数字可比。
STILL_MAE = 0.5
# 分块活跃阈值。1.5 个灰度级是"能看见的边缘移动"量级；
# 低于它的变化在手机小屏 + 压缩后基本不可见。
TILE_MAE = 1.5
GRID = (16, 9)
# 字幕带：底部 250px（胶囊底边 56 + padding + 两行 42px 文字）
SUB_TOP = 1080 - 250
# 主画布：标题 42 起，到图上元素底部 ~800
CANVAS_BOTTOM = 800
# "内容像素"判定：和底色灰度差超过 12 才算画面上有东西。
# 用它算"空画面"——切换时整屏淡出到浅底，只剩底色，就是观感里那一下"闪白"。
INK_DELTA = 12
BLANK_CONTENT_RATIO = 0.03
# 字幕带判定"有一次节奏"的阈值。逐字点亮单个字的灰度差约 150~200，
# 摊到 250px 高的字幕带约 0.1~0.2；整屏换字是 20+。用 0.05 才能把"逐字"数出来。
SUB_EVENT_MAE = 0.05


def load_gray(path):
    img = Image.open(path).convert("L")
    return np.asarray(img, dtype=np.float32)


def frame_index(path):
    """从文件名里取帧号。必须按数字排：Remotion 分两段渲出来的文件名补零位数不同
    （element-999 与 element-1000），字典序会把 1000 排到 999 前面，
    于是"相邻两帧"其实是隔了几百帧的两张，所有指标都会失真。"""
    m = re.search(r"(\d+)(?=\.[^.]+$)", os.path.basename(path))
    return int(m.group(1)) if m else 0


def list_frames(directory):
    files = glob.glob(os.path.join(directory, "*.png"))
    files.sort(key=frame_index)
    return files


def tile_active_map(prev, cur):
    """返回 (活跃块数, 总块数, 每块 mae 矩阵)"""
    h, w = cur.shape
    gh, gw = GRID[1], GRID[0]
    bh, bw = h // gh, w // gw
    diff = np.abs(cur - prev)
    # 裁到整除尺寸，避免 reshape 失败
    diff = diff[: bh * gh, : bw * gw]
    blocks = diff.reshape(gh, bh, gw, bw).mean(axis=(1, 3))
    return int((blocks >= TILE_MAE).sum()), gh * gw, blocks


def runs_of(flags):
    """把布尔序列切成连续段，返回每段长度"""
    out, n = [], 0
    for f in flags:
        if f:
            n += 1
        elif n:
            out.append(n)
            n = 0
    if n:
        out.append(n)
    return out


def content_ratio(gray):
    """画面里"有东西"的像素占比：以该帧出现最多的灰度值为底色（教学片背景是纯色），
    偏离底色超过 INK_DELTA 的算内容。切换时整屏淡出，这个值会掉到接近 0。"""
    hist = np.bincount(gray.astype(np.uint8).ravel(), minlength=256)
    base = float(hist.argmax())
    return float((np.abs(gray - base) > INK_DELTA).mean())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True)
    ap.add_argument("--scene-frames", type=int, default=200, help="每个场景的帧数，用于切场景边界")
    ap.add_argument("--json", default=None)
    ap.add_argument("--step", type=int, default=1, help="抽帧步长（默认逐帧）")
    args = ap.parse_args()

    files = list_frames(args.dir)
    if len(files) < 3:
        print("帧数不足：" + str(len(files)))
        return 1
    if args.step > 1:
        files = files[:: args.step]
    print("读取 %d 帧：%s" % (len(files), args.dir))

    rows = []
    prev = load_gray(files[0])
    for i in range(1, len(files)):
        cur = load_gray(files[i])
        d = np.abs(cur - prev)
        mae_full = float(d.mean())
        mae_canvas = float(d[:CANVAS_BOTTOM, :].mean())
        mae_sub = float(d[SUB_TOP:, :].mean())
        active, total, _ = tile_active_map(prev, cur)
        rows.append(
            {
                "frame": frame_index(files[i]),
                "mae": round(mae_full, 4),
                "maeCanvas": round(mae_canvas, 4),
                "maeSub": round(mae_sub, 4),
                "activeTiles": active,
                "activeRatio": round(active / total, 4),
                "content": round(content_ratio(cur), 4),
                "luma": round(float(cur.mean()), 2),
            }
        )
        prev = cur

    n = len(rows)
    full = np.array([r["mae"] for r in rows])
    canvas = np.array([r["maeCanvas"] for r in rows])
    sub = np.array([r["maeSub"] for r in rows])
    act = np.array([r["activeRatio"] for r in rows])

    # 场景内"中后段"：跳过每场景头 40 帧（入场动画）与末 40 帧（淡出），
    # 这段才是观众盯着看的正文。
    sf = args.scene_frames
    mid_idx = [i for i, r in enumerate(rows) if 40 <= (r["frame"] % sf) < sf - 40]
    mid = full[mid_idx] if mid_idx else full

    # 可感知变化事件：连续 mae>=1.0 的段，数个数 / 秒（30fps）
    events = runs_of([m >= 1.0 for m in full])
    seconds = n / 30.0

    # 场景切换窗口：每个边界前后 25 帧，找亮度极值（判断有没有"清空到底色再重开"）
    cuts = []
    for b in range(sf, n, sf):
        lo, hi = max(0, b - 25), min(n, b + 25)
        window = rows[lo:hi]
        if not window:
            continue
        luma = [w["luma"] for w in window]
        cuts.append(
            {
                "frame": b,
                "lumaMin": min(luma),
                "lumaMax": max(luma),
                "lumaSwing": round(max(luma) - min(luma), 2),
                "contentMin": round(min(w["content"] for w in window), 4),
                "blankFrames": sum(1 for w in window if w["content"] < BLANK_CONTENT_RATIO),
                "mae": round(float(np.mean([w["mae"] for w in window])), 3),
            }
        )

    content = np.array([r["content"] for r in rows])
    blank = content < BLANK_CONTENT_RATIO
    blanks = runs_of(blank)
    sub_events = runs_of([r["maeSub"] >= SUB_EVENT_MAE for r in rows])

    summary = {
        "frames": n,
        "stillRate": round(float((full < STILL_MAE).mean()), 4),
        "stillRateMid": round(float((mid < STILL_MAE).mean()), 4),
        "maeMean": round(float(full.mean()), 3),
        "maeMid": round(float(mid.mean()), 3),
        "maeCanvasMean": round(float(canvas.mean()), 3),
        "maeSubMean": round(float(sub.mean()), 3),
        # 字幕带对"全画面变化量"的真实贡献 = 局部 MAE × 面积占比 / 全画面 MAE
        "subContribution": round(float(sub.mean() * (250.0 / 1080.0) / (full.mean() + 1e-9)), 4),
        "subEventCount": len(sub_events),
        "subEventsPerSec": round(len(sub_events) / seconds, 2),
        "subMaxStillRun": max(runs_of([r["maeSub"] < SUB_EVENT_MAE for r in rows])) if (sub < SUB_EVENT_MAE).any() else 0,
        "activeRatioMean": round(float(act.mean()), 4),
        "activeRatioMid": round(float(act[mid_idx].mean()), 4) if mid_idx else None,
        "contentMean": round(float(content.mean()), 4),
        "blankFrames": int(blank.sum()),
        "blankRate": round(float(blank.mean()), 4),
        "longestBlank": max(blanks) if blanks else 0,
        "eventCount": len(events),
        "eventsPerSec": round(len(events) / seconds, 3),
        "maxStillRun": max(runs_of([m < STILL_MAE for m in full])) if (full < STILL_MAE).any() else 0,
        "cuts": cuts,
    }

    print("\n===== 动效量化 =====")
    print("帧数            : %d（%.1fs @30fps）" % (n, seconds))
    print("静帧率（全片）  : %.1f%%" % (summary["stillRate"] * 100))
    print("静帧率（场景中段）: %.1f%%" % (summary["stillRateMid"] * 100))
    print("最长静止连续段  : %d 帧（%.1fs）" % (summary["maxStillRun"], summary["maxStillRun"] / 30.0))
    print("全画面 MAE 均值 : %.3f（中段 %.3f）" % (summary["maeMean"], summary["maeMid"]))
    print("主画布 MAE      : %.3f" % summary["maeCanvasMean"])
    print("字幕带 MAE      : %.3f（对全画面变化量贡献 %.1f%%）" % (
        summary["maeSubMean"], summary["subContribution"] * 100))
    print("字幕节奏        : %d 次，%.2f 次/秒，最长无节奏 %d 帧（%.1fs）" % (
        summary["subEventCount"], summary["subEventsPerSec"],
        summary["subMaxStillRun"], summary["subMaxStillRun"] / 30.0))
    print("活跃块占比      : %.1f%%（中段 %.1f%%）" % (summary["activeRatioMean"] * 100, (summary["activeRatioMid"] or 0) * 100))
    print("有内容像素占比  : %.1f%%" % (summary["contentMean"] * 100))
    print("空画面          : %d 帧（%.1f%%），最长连续 %d 帧（%.2fs）" % (
        summary["blankFrames"], summary["blankRate"] * 100,
        summary["longestBlank"], summary["longestBlank"] / 30.0))
    print("可感知变化事件  : %d 次，%.2f 次/秒" % (summary["eventCount"], summary["eventsPerSec"]))
    for c in cuts:
        print("  切场景 @%d：亮度摆幅 %.1f（%.0f→%.0f），最空内容占比 %.1f%%，空白帧 %d，窗口内平均 MAE %.2f" % (
            c["frame"], c["lumaSwing"], c["lumaMin"], c["lumaMax"],
            c["contentMin"] * 100, c["blankFrames"], c["mae"]))

    if args.json:
        with open(args.json, "w", encoding="utf-8") as f:
            json.dump({"dir": args.dir, "summary": summary, "series": rows}, f, ensure_ascii=False, indent=1)
        print("\n明细已写入 " + args.json)
    return 0


if __name__ == "__main__":
    sys.exit(main())
