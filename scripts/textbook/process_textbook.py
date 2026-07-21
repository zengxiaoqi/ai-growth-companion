#!/usr/bin/env python3
"""
人教版教材 PDF 智能提取脚本
============================
功能：
- 优先使用 Docling（布局感知，保留表格和公式）
- fallback 到 pypdf / pdfminer.six
- 后处理清洗（汉字间空格、特殊符号、断行合并）
- 章节识别（第N单元、第N章、N 标题、中文数字格式）
- 输出 JSON 到指定目录
"""

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Optional

# ── 提取器优先级：Docling > pypdf > pdfminer ──

EXTRACTOR_NAMES = {
    "docling": "docling (layout-aware)",
    "pypdf": "pypdf",
    "pdfminer": "pdfminer.six",
}


def extract_with_docling(pdf_path: str) -> Optional[dict]:
    """使用 Docling 提取 PDF（布局感知，保留表格和公式）"""
    try:
        from docling.document_converter import DocumentConverter
    except ImportError:
        return None

    try:
        converter = DocumentConverter()
        result = converter.convert(pdf_path)
        doc = result.document

        # 获取纯文本
        full_text = doc.text

        # 获取表格数据（Markdown 格式）
        table_markdowns = []
        for page in doc.pages:
            for table in page.tables:
                if table.data:
                    md = _table_to_markdown(table.data)
                    table_markdowns.append(md)

        # 获取页面级文本
        page_texts = []
        for page in doc.pages:
            page_texts.append(page.text)

        return {
            "full_text": full_text,
            "page_texts": page_texts,
            "table_markdowns": table_markdowns,
            "num_pages": len(doc.pages),
            "extractor": "docling",
        }
    except Exception as e:
        print(f"  [WARN] Docling 提取失败: {e}", file=sys.stderr)
        return None


def _table_to_markdown(table_data: list) -> str:
    """将 Docling 表格数据转为 Markdown 格式"""
    if not table_data:
        return ""
    lines = []
    col_widths = [max(len(str(row[i])) for row in table_data if i < len(row)) for i in range(len(table_data[0]))]
    for row_idx, row in enumerate(table_data):
        cells = [str(row[i]) if i < len(row) else "" for i in range(len(col_widths))]
        lines.append("| " + " | ".join(cells) + " |")
        if row_idx == 0:
            lines.append("| " + " | ".join("---" for _ in col_widths) + " |")
    return "\n".join(lines)


def extract_with_pypdf(pdf_path: str) -> Optional[dict]:
    """使用 pypdf 提取文本"""
    try:
        from pypdf import PdfReader
    except ImportError:
        return None

    try:
        reader = PdfReader(pdf_path)
        num_pages = len(reader.pages)
        page_texts = []
        for page in reader.pages:
            text = page.extract_text()
            page_texts.append(text if text else "")

        full_text = "\n\n".join(page_texts)
        return {
            "full_text": full_text,
            "page_texts": page_texts,
            "table_markdowns": [],
            "num_pages": num_pages,
            "extractor": "pypdf",
        }
    except Exception as e:
        print(f"  [WARN] pypdf 提取失败: {e}", file=sys.stderr)
        return None


def extract_with_pdfminer(pdf_path: str) -> Optional[dict]:
    """使用 pdfminer.six 提取文本"""
    try:
        from pdfminer.high_level import extract_text
        from pdfminer.pdfpage import PDFPage
    except ImportError:
        return None

    try:
        # 提取全部文本
        full_text = extract_text(pdf_path)

        # 获取页数
        with open(pdf_path, "rb") as f:
            num_pages = sum(1 for _ in PDFPage.get_pages(f))

        return {
            "full_text": full_text,
            "page_texts": [full_text],
            "table_markdowns": [],
            "num_pages": num_pages,
            "extractor": "pdfminer",
        }
    except Exception as e:
        print(f"  [WARN] pdfminer 提取失败: {e}", file=sys.stderr)
        return None


# ── 后处理清洗 ──


def clean_text(text: str) -> str:
    """后处理清洗：去除汉字间空格、修复特殊符号、合并断行"""
    text = _remove_cjk_spaces(text)
    text = _fix_special_symbols(text)
    text = _merge_broken_lines(text)
    text = _clean_whitespace(text)
    return text.strip()


def _remove_cjk_spaces(text: str) -> str:
    """
    去除汉字之间的不必要空格。
    - 保留数字/英文之间的空格
    - 去除汉字之间的空格："目 录" → "目录"
    - 去除汉字与标点之间的空格
    - 保留汉字与数字/英文之间的空格（如"第 1 单元" → "第1单元"）
    """
    # 汉字之间的空格：两个汉字或其间的标点间有空格，去掉空格
    text = re.sub(r'([\u4e00-\u9fff\u3400-\u4dbf]) +([\u4e00-\u9fff\u3400-\u4dbf])', r'\1\2', text)
    # 重复执行直到没有空格残留（处理连续三个汉字中间都有空格的情况）
    prev = None
    while prev != text:
        prev = text
        text = re.sub(r'([\u4e00-\u9fff\u3400-\u4dbf]) +([\u4e00-\u9fff\u3400-\u4dbf])', r'\1\2', text)

    # 汉字与中文标点之间的空格
    text = re.sub(r'([\u4e00-\u9fff]) +([，。！？、；：""''（）【】《》])', r'\1\2', text)
    text = re.sub(r'([，。！？、；：""''（）【】《》]) +([\u4e00-\u9fff])', r'\1\2', text)

    # 特殊：中文数字与"第""单元"之间的空格
    text = re.sub(r'第 +(\d+) +单元', r'第\1单元', text)
    text = re.sub(r'第 +(\d+) +章', r'第\1章', text)
    text = re.sub(r'第 +(\d+) +节', r'第\1节', text)

    # 数字与中文标点间的空格
    text = re.sub(r'(\d) +([。，！？、；：])', r'\1\2', text)

    return text


def _fix_special_symbols(text: str) -> str:
    """修复特殊符号"""
    # °C: 修复"。C"或"。 C"为"°C"
    text = re.sub(r'。C\b', '°C', text)
    text = re.sub(r'° C', '°C', text)

    # °: 修复"。"后跟空格和数字（温度）
    text = re.sub(r'。\s*(\d+)\s*C', r'°\1C', text)

    # 上标: cm2 → cm², m2 → m², cm3 → cm³
    text = re.sub(r'cm2(?![0-9])', 'cm²', text)
    text = re.sub(r'm2(?![0-9])', 'm²', text)
    text = re.sub(r'cm3(?![0-9])', 'cm³', text)
    text = re.sub(r'm3(?![0-9])', 'm³', text)

    return text


def _merge_broken_lines(text: str) -> str:
    """
    合并被断行的中文文本。
    - 如果一行末尾是中文，下一行开头是中文，说明是断行，合并
    - 保留段落分隔（空行）
    """
    lines = text.split('\n')
    merged = []
    i = 0
    while i < len(lines):
        line = lines[i]
        # 空行保留（段落分隔）
        if not line.strip():
            merged.append('')
            i += 1
            continue

        # 检查是否可以与下一行合并
        while i + 1 < len(lines):
            next_line = lines[i + 1]
            if not next_line.strip():
                break  # 空行分隔，段落结束

            curr_end = line.rstrip()[-1] if line.rstrip() else ''
            next_start = next_line.lstrip()[:1] if next_line.lstrip() else ''

            is_cjk = lambda c: '\u4e00' <= c <= '\u9fff' or '\u3400' <= c <= '\u4dbf'
            is_sentence_end = lambda c: c in '。！？）】》'

            if is_cjk(curr_end) and is_cjk(next_start):
                line = line.rstrip() + next_line.strip()
                i += 1
                continue
            elif not is_sentence_end(curr_end) and is_cjk(next_start):
                line = line.rstrip() + next_line.strip()
                i += 1
                continue
            break

        merged.append(line)
        i += 1

    return '\n'.join(merged)


def _clean_whitespace(text: str) -> str:
    """清理多余空白"""
    lines = [line.strip() for line in text.split('\n')]
    result = []
    prev_empty = False
    for line in lines:
        if line == '':
            if not prev_empty:
                result.append('')
            prev_empty = True
        else:
            result.append(line)
            prev_empty = False
    return '\n'.join(result)


# ── 章节识别 ──

# 人教版教材已知的单元/章节关键词
_KNOWN_UNIT_KEYWORDS = [
    "负数", "百分数", "圆柱", "圆锥", "比例", "鸽巢", "抽屉",
    "整理和复习", "数学广角", "生活与百分数", "自行车里的数学",
    "确定起跑线", "节约用水",
]

# 由数字+空格+单位词组成的假阳性模式
_MEASUREMENT_UNITS = {
    "cm", "dm", "m", "mm", "km", "kg", "g", "t",
    "L", "mL", "l", "ml", "元", "角", "分", "°",
    "h", "min", "s", "个点", "分线", "条腿",
    "个红球", "个黄球", "个棋子", "个抽屉",
}

# 单字量词列表（数字+空格+单字量词 → 不是标题）
_SINGLE_CHAR_QUANTIFIERS = set(
    "本个只条块件张把名位年月日时分秒元角分"
    "第种类组队行列排次回遍趟顿项些"
    "没是有在的了着过盒箱包袋瓶杯碗盘"
    "天周点页题问答她他它我你们"
    "上下左右前后里外大小多少长短高低"
    "红黄蓝绿白黑"
)


def detect_chapters(text: str, page_texts: list = None) -> list:
    """
    检测教材章节结构。
    使用两阶段策略：
    1. 从目录（TOC）提取真实的章节结构（仅搜索前5页）
    2. 在正文中补充匹配 `第N单元`、`第N章` 等明确格式
    """
    chapters = []
    seen_lines = set()  # 去重

    # ── 阶段1：从目录提取章节结构（仅搜索前5页）──
    toc_text = ""
    if page_texts:
        # 使用页面级文本，只取前5页（目录页）
        toc_text = "\n".join(page_texts[:5])
    else:
        # 如果没有 page_texts，取全文的前 5000 字符
        toc_text = text[:5000]
    toc_chapters = _extract_toc_chapters(toc_text)

    # ── 阶段2：在正文中查找明确格式 ──
    lines = text.split('\n')
    for line_idx, line in enumerate(lines):
        stripped = line.strip()
        if not stripped:
            continue

        chapter = None

        # 1. 第N单元（如"第1单元 负数"、"第一单元 负数"）
        m = re.match(r'^第([一二三四五六七八九十\d]+)单元[：\s]*(.*)', stripped)
        if m:
            chapter = {
                "type": "unit",
                "number": m.group(1),
                "title": m.group(2).strip() or stripped,
                "line": line_idx + 1,
                "raw": stripped,
            }

        # 2. 第N章
        if not chapter:
            m = re.match(r'^第([一二三四五六七八九十\d]+)章[：\s]*(.*)', stripped)
            if m:
                chapter = {
                    "type": "chapter",
                    "number": m.group(1),
                    "title": m.group(2).strip() or stripped,
                    "line": line_idx + 1,
                    "raw": stripped,
                }

        # 3. 第N节
        if not chapter:
            m = re.match(r'^第([一二三四五六七八九十\d]+)节[：\s]*(.*)', stripped)
            if m:
                chapter = {
                    "type": "section",
                    "number": m.group(1),
                    "title": m.group(2).strip() or stripped,
                    "line": line_idx + 1,
                    "raw": stripped,
                }

        # 4. 特殊章节标题（如"数学广角"、"整理和复习"）
        if not chapter:
            for kw in _KNOWN_UNIT_KEYWORDS:
                if stripped == kw:
                    chapter = {
                        "type": "special",
                        "number": "",
                        "title": kw,
                        "line": line_idx + 1,
                        "raw": stripped,
                    }
                    break
                if stripped.startswith(kw) and len(stripped) < 20:
                    chapter = {
                        "type": "special",
                        "number": "",
                        "title": kw,
                        "line": line_idx + 1,
                        "raw": stripped,
                    }
                    break

        if chapter:
            key = f"{chapter['type']}:{chapter['number']}:{chapter['title']}"
            if key not in seen_lines:
                seen_lines.add(key)
                chapters.append(chapter)

    return chapters


def _extract_toc_chapters(text: str) -> list:
    """
    从目录中提取人教版教材的章节结构。

    人教版教材目录格式（仅前几页）：
        1 负数 2
        2 百分数（二） 8
        3 圆柱与圆锥 16
        4 比例 56
        5 数学广角 105
        6 整理和复习 109

    由于 pypdf 提取的双栏目录会跨列合并，
    使用以下策略：
    1. 在行级别匹配 "数字 中文标题 数字"
    2. 从跨行的合并文本中提取 "数字 中文标题" 对
    3. 仅保留编号连续且合理的条目
    """
    chapters = []
    seen = set()
    lines = text.split('\n')

    # 先尝试行级匹配（最精确）
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        # 匹配 "数字 中文标题 数字" 的完整行
        m = re.match(r'^(\d+)\s+([\u4e00-\u9fff（）()、，《》—]+)\s+(\d+)$', stripped)
        if m:
            num = int(m.group(1))
            title = m.group(2).strip()
            page = int(m.group(3))
            if 1 <= num <= 12 and 1 <= page <= 200 and 2 <= len(title) <= 30:
                key = f"{num}:{title}"
                if key not in seen:
                    seen.add(key)
                    chapters.append({
                        "type": "toc_unit",
                        "number": str(num),
                        "title": title,
                        "page": page,
                        "raw": stripped,
                    })

    # 如果行级匹配找到了 3 个以上章节，说明质量不错，直接返回
    if len(chapters) >= 3:
        chapters.sort(key=lambda x: int(x['number']))
        return chapters

    # 否则尝试从合并文本中提取
    # 合并文本样例："2 百分数（二） 8圆柱与圆锥3 16"
    # 需要从中提取 "2 百分数（二）" 和 "3 圆柱与圆锥"
    # 模式：以数字开头，包含中文标题，后面跟着数字+中文（下一个条目）
    pattern = r'(\d+)\s+([\u4e00-\u9fff（）()]+)'
    for m in re.finditer(pattern, text):
        num = int(m.group(1))
        title = m.group(2).strip()
        start = m.start()
        end = m.end()

        # 检查这个数字+标题后面是否跟着另一个数字（页码或下一个条目）
        # 如果是双栏合并，格式可能是 "2 百分数（二） 8圆柱与圆锥3 16"
        # 我们需要提取 "2 百分数（二）" 和 "3 圆柱与圆锥"

        if not (1 <= num <= 12 and 2 <= len(title) <= 30):
            continue

        # 查看后面是否跟着数字（可能是页码或下一个条目编号）
        rest = text[end:end+20]
        next_num_match = re.match(r'\s*(\d+)', rest)

        # 如果标题本身不含 "单元"、"章"、"节"，必须满足：
        # 1. 标题是已知的章节关键词
        # 2. 或者标题后面跟着数字（页码）
        is_known = any(kw in title for kw in _KNOWN_UNIT_KEYWORDS)
        has_page = next_num_match and 1 <= int(next_num_match.group(1)) <= 200

        if not (is_known or has_page):
            continue

        key = f"{num}:{title}"
        if key in seen:
            continue
        seen.add(key)

        chapters.append({
            "type": "toc_unit",
            "number": str(num),
            "title": title,
            "page": 0,  # 从合并文本中无法精确提取页码
            "raw": m.group(0),
        })

    # 按章节编号排序
    chapters.sort(key=lambda x: int(x['number']))

    # 过滤：只保留编号连续的条目（从1开始）
    if chapters:
        expected = 1
        filtered = []
        for ch in chapters:
            if int(ch['number']) == expected:
                filtered.append(ch)
                expected += 1
            elif int(ch['number']) > expected:
                # 跳过缺失的编号，继续
                expected = int(ch['number']) + 1
                filtered.append(ch)
        # 如果过滤后还有至少 3 个章节，使用过滤结果
        if len(filtered) >= 3:
            chapters = filtered

    return chapters


# ── 主流程 ──


def extract_textbook(pdf_path: str, output_dir: str) -> dict:
    """提取教材文本并输出"""
    pdf_path = os.path.abspath(pdf_path)
    filename = os.path.basename(pdf_path)
    name_stem = os.path.splitext(filename)[0]
    slug = re.sub(r'[^\w\u4e00-\u9fff]+', '_', name_stem).strip('_')

    print(f"\n{'='*60}")
    print(f"📖 处理: {filename}")
    print(f"{'='*60}")

    # 1. 提取文本
    print("\n[1/4] 提取文本...")
    result = None
    extractor_used = None

    # 优先 Docling
    print("  → 尝试 Docling (layout-aware)...")
    result = extract_with_docling(pdf_path)
    if result:
        extractor_used = "docling"
        print(f"  ✅ Docling 提取成功: {result['num_pages']} 页, "
              f"{len(result.get('full_text', ''))} 字符, "
              f"{len(result.get('table_markdowns', []))} 个表格")

    # fallback pypdf
    if not result:
        print("  → 尝试 pypdf...")
        result = extract_with_pypdf(pdf_path)
        if result:
            extractor_used = "pypdf"
            print(f"  ✅ pypdf 提取成功: {result['num_pages']} 页")

    # fallback pdfminer
    if not result:
        print("  → 尝试 pdfminer.six...")
        result = extract_with_pdfminer(pdf_path)
        if result:
            extractor_used = "pdfminer"
            print(f"  ✅ pdfminer 提取成功: {result['num_pages']} 页")

    if not result:
        print("  ❌ 所有提取器均失败！", file=sys.stderr)
        sys.exit(1)

    full_text = result["full_text"]

    # 2. 后处理清洗
    print("\n[2/4] 后处理清洗...")
    cleaned_text = clean_text(full_text)
    print(f"  ✅ 清洗完成: {len(full_text)} → {len(cleaned_text)} 字符 "
          f"(减少 {len(full_text) - len(cleaned_text)} 字符)")

    # 3. 章节检测
    print("\n[3/4] 章节检测...")
    chapters = detect_chapters(cleaned_text, page_texts=result.get("page_texts"))
    print(f"  ✅ 检测到 {len(chapters)} 个章节:")
    for ch in chapters:
        print(f"    - [{ch['type']}] {ch['number']}: {ch['title']}")

    # 4. 输出
    print("\n[4/4] 输出结果...")
    output_path = os.path.join(output_dir, slug)
    os.makedirs(output_path, exist_ok=True)

    # 构建输出数据
    output_data = {
        "metadata": {
            "source_file": pdf_path,
            "filename": filename,
            "slug": slug,
            "extraction_method": extractor_used,
            "extractor_label": EXTRACTOR_NAMES.get(extractor_used, extractor_used),
            "num_pages": result["num_pages"],
            "chars_raw": len(full_text),
            "chars_cleaned": len(cleaned_text),
            "processing_time": time.strftime("%Y-%m-%d %H:%M:%S"),
            "tables_detected": len(result.get("table_markdowns", [])),
        },
        "chapters": chapters,
        "full_text": cleaned_text,
        "tables": result.get("table_markdowns", []),
    }

    # 写入 JSON
    json_path = os.path.join(output_path, "textbook.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)
    print(f"  ✅ JSON: {json_path}")

    # 写入纯文本
    txt_path = os.path.join(output_path, "full_text.txt")
    with open(txt_path, "w", encoding="utf-8") as f:
        f.write(cleaned_text)
    print(f"  ✅ TXT: {txt_path}")

    # 写入章节摘要
    summary_path = os.path.join(output_path, "chapters.txt")
    with open(summary_path, "w", encoding="utf-8") as f:
        f.write(f"教材: {filename}\n")
        f.write(f"提取方式: {output_data['metadata']['extractor_label']}\n")
        f.write(f"页数: {result['num_pages']}\n")
        f.write(f"原始字符: {len(full_text)}\n")
        f.write(f"清洗后字符: {len(cleaned_text)}\n")
        f.write(f"检测表格: {len(result.get('table_markdowns', []))}\n")
        f.write(f"\n检测到 {len(chapters)} 个章节:\n")
        f.write("-" * 40 + "\n")
        for ch in chapters:
            type_label = {
                "unit": "单元",
                "chapter": "章",
                "section": "节",
                "heading": "标题",
                "cn_heading": "中文标题",
                "special": "特殊章节",
            }.get(ch["type"], ch["type"])
            f.write(f"  [{type_label}] {ch['number']}: {ch['title']}\n")
    print(f"  ✅ 章节摘要: {summary_path}")

    print(f"\n{'='*60}")
    print(f"✅ 完成! 输出: {output_path}")
    print(f"{'='*60}\n")

    return output_data


# ── 命令行入口 ──


def main():
    parser = argparse.ArgumentParser(
        description="人教版教材 PDF 智能提取工具",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  python3 scripts/textbook/process_textbook.py \\
    --input /path/to/数学六年级下册.pdf \\
    --output /path/to/output/

  python3 scripts/textbook/process_textbook.py \\
    --input /path/to/数学六年级上册.pdf \\
    --output /path/to/output/ \\
    --verbose
        """,
    )
    parser.add_argument(
        "--input", "-i",
        required=True,
        help="输入 PDF 文件路径",
    )
    parser.add_argument(
        "--output", "-o",
        required=True,
        help="输出目录路径",
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="详细输出",
    )

    args = parser.parse_args()

    if not os.path.isfile(args.input):
        print(f"❌ 输入文件不存在: {args.input}", file=sys.stderr)
        sys.exit(1)

    if not args.input.lower().endswith(".pdf"):
        print(f"⚠️  输入文件不是 PDF 格式: {args.input}", file=sys.stderr)

    extract_textbook(args.input, args.output)


if __name__ == "__main__":
    main()