#!/usr/bin/env python3
"""
锚点开/关两臂的逐帧像素差异：直接回答"画面从第几帧开始跟着旁白走"。

两臂只有一处不同（动作进度的时间基），所以差异出现的帧 = 动作被推迟到的那个词
的发音帧。差异只出现在带符号/带 swell 的节点框里，就是"没有波及其他区域"的证据。

坐标只对 relation=cycle 成立（与模板 layoutGraph cycle 分支同步）。
"""
import argparse
import json
import os
import sys

import numpy as np
from PIL import Image

NODE_LAYOUT = {"cx": 960, "cy": 500, "rx": 322, "ry": 196, "size": 232}
BOX_HALF = 150
NOISE_FLOOR = 0.8  # 灰阶差小于这个值视为渲染噪声（二次渲染抖动 ≈ 1 灰阶）


def list_frames(directory):
    frames = []
    for name in os.listdir(directory):
        if name.startswith("element-") and name.endswith(".png"):
            frames.append((int(name[len("element-"):-len(".png")]), os.path.join(directory, name)))
    frames.sort(key=lambda item: item[0])
    return frames


def node_center(index, count):
    angle = -np.pi / 2 + (index / count) * np.pi * 2
    return (
        NODE_LAYOUT["cx"] + np.cos(angle) * NODE_LAYOUT["rx"],
        NODE_LAYOUT["cy"] + np.sin(angle) * NODE_LAYOUT["ry"],
    )


def series(on_paths, off_paths, box):
    x0, y0, x1, y1 = box
    out = []
    for (_, pa), (_, pb) in zip(on_paths, off_paths):
        a = np.asarray(Image.open(pa).convert("L").crop((x0, y0, x1, y1)), dtype=np.float32)
        b = np.asarray(Image.open(pb).convert("L").crop((x0, y0, x1, y1)), dtype=np.float32)
        out.append(float(np.abs(a - b).mean()))
    return np.asarray(out, dtype=np.float64)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--on", required=True)
    parser.add_argument("--off", required=True)
    parser.add_argument("--meta", required=True)
    parser.add_argument("--json")
    args = parser.parse_args()

    meta = json.load(open(args.meta, encoding="utf-8"))
    nodes = meta["nodes"]
    anchors = meta.get("anchors") or {}
    on_paths = list_frames(args.on)
    off_paths = list_frames(args.off)
    if len(on_paths) != len(off_paths):
        raise SystemExit("两臂帧数不一致")

    print(f"场景：{meta['title']}   {len(on_paths)} 帧   旁白：{meta['narration'][:30]}…")
    print("—" * 88)
    print(f"{'节点':<8}{'动作窗':<12}{'差异起始帧':<12}{'锚词帧':<10}{'起始误差':<10}{'差异峰值':<10}")
    print("—" * 88)
    rows = []
    for index, node in enumerate(nodes):
        cx, cy = node_center(index, len(nodes))
        box = (int(cx - BOX_HALF), int(cy - BOX_HALF), int(cx + BOX_HALF), int(cy + BOX_HALF))
        diff = series(on_paths, off_paths, box)
        window = anchors.get(node["id"])
        onset = None
        for f in range(len(diff)):
            if diff[f] > NOISE_FLOOR:
                onset = f
                break
        peak = float(diff.max())
        row = {"id": node["id"], "label": node["label"], "onset": onset, "peak": peak, "window": window}
        rows.append(row)
        if window:
            delta = "" if onset is None else f"{onset - window['start']:+d}f"
            print(f"{node['label']:<8}{str(window['start']) + '-' + str(window['end']):<12}"
                  f"{str(onset):<12}{window['start']:<10}{delta:<10}{peak:.2f}")
        else:
            print(f"{node['label']:<8}{'无锚点(两臂同)':<12}{str(onset):<12}{'-':<10}{'-':<10}{peak:.2f}")

    # 全画面差异：只该出现在带动作的节点上，背景与字幕必须为 0
    full = series(on_paths, off_paths, (0, 0, 1920, 1080))
    print("—" * 88)
    print(f"全画面差异：峰值 {full.max():.2f} 灰阶，非零帧 {int((full > NOISE_FLOOR).sum())}/{len(full)}")

    if args.json:
        json.dump({"nodes": rows, "fullCanvas": full.tolist()}, open(args.json, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        print(f"明细已写入 {args.json}")


if __name__ == "__main__":
    sys.exit(main())
