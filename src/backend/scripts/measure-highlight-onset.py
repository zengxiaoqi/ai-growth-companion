#!/usr/bin/env python3
"""
量"哪个节点在第几帧亮起来"：直接读画面，不看代码推理。

原理：节点被点亮时，它下方的标签胶囊底色会变成强调色（GraphBadge 的 active 态），
未点亮时是白底。所以按强调色数像素，就能得到逐帧的亮/不亮二值序列，
onset = 第一帧亮起来的帧号。它应该等于旁白念到这个词的帧（挂词）或
等于时钟走到该节点一半的帧（不挂词）。

坐标只对 relation=cycle 成立，与模板 layoutGraph 的 cycle 分支同步
（cx=960 cy=500 rx=322 ry=196 size=232）。改布局要同步改这里。
"""
import argparse
import json
import os
import sys

import numpy as np
from PIL import Image

CYCLE = {"cx": 960, "cy": 500, "rx": 322, "ry": 196, "size": 232}
# chain：横向等距，节点等大（与模板 chain 分支同步）
CHAIN = {"cy": 500, "size": 244, "max_spacing": 528, "span": 1600}
# 标签胶囊相对卡片底边的位置：marginTop 10 + 胶囊高约 46
PILL_TOP = 8
PILL_BOTTOM = 64
PILL_HALF_W = 130
# 胶囊面积约 120×46，全亮时强调色像素约 4k；这一步只是去掉抗锯齿与圆角的边
LIT_PIXELS = 400


def list_frames(directory):
    frames = []
    for name in os.listdir(directory):
        if name.startswith("element-") and name.endswith(".png"):
            frames.append((int(name[len("element-"):-len(".png")]), os.path.join(directory, name)))
    frames.sort(key=lambda item: item[0])
    return frames


def node_center(index, count, relation="cycle"):
    if relation == "chain":
        spacing = min(CHAIN["max_spacing"], CHAIN["span"] / max(1, count - 1))
        return (960 - ((count - 1) * spacing) / 2 + index * spacing, CHAIN["cy"])
    angle = -np.pi / 2 + (index / count) * np.pi * 2
    return (
        CYCLE["cx"] + np.cos(angle) * CYCLE["rx"],
        CYCLE["cy"] + np.sin(angle) * CYCLE["ry"],
    )


def accent_rgb(hex_color):
    value = hex_color.lstrip("#")
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))


def onset_series(paths, box, rgb, tolerance=42):
    x0, y0, x1, y1 = box
    lit = []
    for _, path in paths:
        patch = np.asarray(Image.open(path).convert("RGB").crop((x0, y0, x1, y1)), dtype=np.int16)
        hit = np.all(np.abs(patch - np.array(rgb, dtype=np.int16)) <= tolerance, axis=2)
        lit.append(int(hit.sum()))
    return lit


def to_lit_sets(series_list, order, threshold=LIT_PIXELS):
    """逐帧 → 这一帧亮着的节点 id 集合"""
    sets = []
    for f in range(len(series_list[0])):
        lit = {order[i] for i, series in enumerate(series_list) if series[f] >= threshold}
        sets.append(lit)
    return sets


def stable_onset(series, threshold=LIT_PIXELS, run=4):
    """
    亮起帧 = 第一次进入"连续 run 帧都亮"的位置。

    卡片入场时会在过渡帧里短暂露出强调色（缩放/描边扫过胶囊区域），
    单看第一次超阈值会把这种瞬态当成"亮起"，实测会差出 70 帧。
    """
    streak = 0
    for f, value in enumerate(series):
        streak = streak + 1 if value >= threshold else 0
        if streak >= run:
            return f - run + 1
    return None


def arrivals(series, threshold=LIT_PIXELS):
    """亮起次数：从"不亮"变成"亮"的次数。循环光点会一圈圈反复经过，次数 > 1"""
    count = 0
    prev = series[0] >= threshold
    for value in series[1:]:
        now = value >= threshold
        if now and not prev:
            count += 1
        prev = now
    return count + (1 if series[0] >= threshold else 0)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dir", required=True)
    parser.add_argument("--meta", required=True)
    parser.add_argument("--accent", default="#4d96ff")
    # 场景收尾有几帧整体淡出（画面亮度趋近背景白），此时读数没有意义，不计入统计
    parser.add_argument("--skip-tail", type=int, default=10)
    parser.add_argument("--relation", default="cycle", choices=["cycle", "chain"])
    parser.add_argument("--json")
    args = parser.parse_args()

    meta = json.load(open(args.meta, encoding="utf-8"))
    nodes = meta["nodes"]
    anchors = meta.get("anchors") or {}
    rgb = accent_rgb(args.accent)
    paths = list_frames(args.dir)

    print(f"场景：{meta['title']}   {len(paths)} 帧   强调色 {args.accent}")
    print("—" * 76)
    print(f"{'节点':<8}{'亮起帧':<10}{'旁白念到帧':<12}{'偏差':<10}{'亮起次数':<10}")
    print("—" * 76)

    rows = []
    series_all = []
    for index, node in enumerate(nodes):
        cx, cy = node_center(index, len(nodes), args.relation)
        size = CYCLE["size"] if args.relation == "cycle" else CHAIN["size"]
        top = int(cy + size / 2) + PILL_TOP
        box = (int(cx - PILL_HALF_W), top, int(cx + PILL_HALF_W), top + PILL_BOTTOM)
        lit = onset_series(paths, box, rgb)
        series_all.append(lit)
        onset_index = stable_onset(lit)
        onset = None if onset_index is None else paths[onset_index][0]
        anchor = (anchors.get(node["id"]) or {}).get("start")
        delta = "" if onset is None or anchor is None else f"{onset - anchor:+d}f"
        row = {
            "id": node["id"],
            "label": node["label"],
            "onset": onset,
            "anchor": anchor,
            "delta": None if onset is None or anchor is None else onset - anchor,
            "times": arrivals(lit),
            "litFrames": lit,
        }
        rows.append(row)
        print(f"{node['label']:<8}{str(onset):<10}{str(anchor):<12}{delta:<10}{row['times']:<10}")

    # 对拍命中率：每帧"应该亮着的"= 旁白最近一次念到的那个节点。
    # 光点若跟着旁白走，这个集合应当一直与画面一致；跟着时钟走则只在偶然时一致。
    order = [node["id"] for node in nodes]
    lit_sets = to_lit_sets(series_all, order)
    spoken = sorted(
        (anchor, node["id"]) for node in nodes for anchor in [(anchors.get(node["id"]) or {}).get("start")] if anchor is not None
    )
    match = 0
    single = 0
    counted = 0
    mismatches = []
    for f, frames_lit in enumerate(lit_sets):
        frame_no = paths[f][0]
        if args.skip_tail and f >= len(lit_sets) - args.skip_tail:
            break
        expected = None
        for at, node_id in spoken:
            if at <= frame_no:
                expected = node_id
            else:
                break
        if expected is None:
            continue
        counted += 1
        if len(frames_lit) == 1:
            single += 1
        if frames_lit == {expected}:
            match += 1
        elif len(mismatches) < 6:
            mismatches.append((frame_no, expected, sorted(frames_lit)))
    print("—" * 76)
    if counted:
        print(f"对拍命中率（亮着的节点 == 旁白最近念到的节点）：{match}/{counted} = {match / counted * 100:.1f}%")
        print(f"只有一个节点亮着的帧：{single}/{counted} = {single / counted * 100:.1f}%")
        if mismatches:
            print(f"错配样例（帧, 应该亮, 实际亮）：{mismatches}")

    if args.json:
        json.dump(
            {"nodes": rows, "matchRate": (match / counted) if counted else None, "counted": counted, "accent": args.accent},
            open(args.json, "w", encoding="utf-8"),
            ensure_ascii=False,
        )
        print(f"明细已写入 {args.json}")


if __name__ == "__main__":
    sys.exit(main())
