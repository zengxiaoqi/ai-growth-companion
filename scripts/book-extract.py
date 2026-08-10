#!/usr/bin/env python3
"""
book-extract.py — Extract content from a book file and output structured JSON.

This is a lightweight Python extractor that:
1. Reads the input file (PDF/EPUB/DOCX/TXT/MD/RTF)
2. Extracts text content
3. Detects chapter structure
4. Outputs JSON suitable for the book-skill DB tables

Usage:
    python3 book-extract.py --file /path/to/book.pdf --id 123
    python3 book-extract.py --file /path/to/book.pdf --id 123 --output /path/to/output.json

Output JSON schema:
{
    "title": "Book Title",
    "author": "Author Name",
    "description": "Brief description",
    "ageGroup": "3-4",
    "chapters": [
        {"index": 1, "title": "Chapter 1", "summary": "...", "content": "..."}
    ],
    "terms": [
        {"term": "keyword", "definition": "definition", "chapterRef": "ch01"}
    ],
    "patterns": [
        {"name": "Pattern Name", "description": "description", "category": "category"}
    ]
}
"""

import argparse
import json
import os
import re
import sys
import tempfile
from pathlib import Path


def extract_text_pdf(file_path: str) -> str:
    """Extract text from PDF using available tools."""
    # Try pdftotext first (fastest)
    try:
        import subprocess
        result = subprocess.run(
            ["pdftotext", file_path, "-"],
            capture_output=True, text=True, timeout=60
        )
        if result.returncode == 0 and len(result.stdout.strip()) > 50:
            return result.stdout
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    # Try pdfminer
    try:
        from pdfminer.high_level import extract_text
        text = extract_text(file_path)
        if text and len(text.strip()) > 50:
            return text
    except ImportError:
        pass

    # Try pypdf
    try:
        from pypdf import PdfReader
        reader = PdfReader(file_path)
        text = "\n".join(page.extract_text() for page in reader.pages)
        if text and len(text.strip()) > 50:
            return text
    except ImportError:
        pass

    raise RuntimeError("No PDF extraction tool available. Install pdftotext, pdfminer, or pypdf.")


def extract_text_epub(file_path: str) -> str:
    """Extract text from EPUB."""
    # Try ebook-convert first
    try:
        import subprocess
        with tempfile.NamedTemporaryFile(suffix=".txt", delete=False) as tmp:
            tmp_path = tmp.name
        result = subprocess.run(
            ["ebook-convert", file_path, tmp_path, "--txt-version", "1"],
            capture_output=True, text=True, timeout=120
        )
        if result.returncode == 0:
            with open(tmp_path, "r", encoding="utf-8", errors="replace") as f:
                text = f.read()
            os.unlink(tmp_path)
            if text and len(text.strip()) > 50:
                return text
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    # Try ebooklib
    try:
        import ebooklib
        from ebooklib import epub
        from bs4 import BeautifulSoup

        book = epub.read_epub(file_path)
        texts = []
        for item in book.get_items():
            if item.get_type() == ebooklib.ITEM_DOCUMENT:
                soup = BeautifulSoup(item.get_content(), "html.parser")
                texts.append(soup.get_text())
        text = "\n\n".join(texts)
        if text and len(text.strip()) > 50:
            return text
    except ImportError:
        pass

    raise RuntimeError("No EPUB extraction tool available. Install ebook-convert or ebooklib+beautifulsoup4.")


def extract_text_docx(file_path: str) -> str:
    """Extract text from DOCX."""
    try:
        import subprocess
        # Try ebook-convert
        with tempfile.NamedTemporaryFile(suffix=".txt", delete=False) as tmp:
            tmp_path = tmp.name
        result = subprocess.run(
            ["ebook-convert", file_path, tmp_path],
            capture_output=True, text=True, timeout=120
        )
        if result.returncode == 0:
            with open(tmp_path, "r", encoding="utf-8", errors="replace") as f:
                text = f.read()
            os.unlink(tmp_path)
            if text and len(text.strip()) > 50:
                return text
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    # Try python-docx
    try:
        import docx
        doc = docx.Document(file_path)
        text = "\n".join(p.text for p in doc.paragraphs)
        if text and len(text.strip()) > 50:
            return text
    except ImportError:
        pass

    raise RuntimeError("No DOCX extraction tool available.")


def extract_text_rtf(file_path: str) -> str:
    """Extract text from RTF."""
    try:
        import subprocess
        # Try textutil (macOS) or libreoffice
        for cmd, args in [
            (["textutil", "-convert", "txt", "-stdout", file_path], 30),
            (["libreoffice", "--headless", "--convert-to", "txt:Text", "--outdir", "/tmp", file_path], 120),
        ]:
            try:
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=args)
                if result.returncode == 0:
                    text = result.stdout
                    if text and len(text.strip()) > 50:
                        return text
            except (FileNotFoundError, subprocess.TimeoutExpired):
                continue
    except FileNotFoundError:
        pass

    # Fallback: read as text and strip RTF markers
    with open(file_path, "r", encoding="utf-8", errors="replace") as f:
        text = f.read()
    # Strip basic RTF
    text = re.sub(r"\\[a-z]+", " ", text)
    text = re.sub(r"\{|\}", "", text)
    text = re.sub(r"\s+", " ", text)
    if len(text.strip()) > 50:
        return text

    raise RuntimeError("No RTF extraction tool available.")


def extract_text(file_path: str) -> str:
    """Extract text from any supported format."""
    ext = Path(file_path).suffix.lower()

    if ext == ".pdf":
        return extract_text_pdf(file_path)
    elif ext == ".epub":
        return extract_text_epub(file_path)
    elif ext == ".docx":
        return extract_text_docx(file_path)
    elif ext == ".rtf":
        return extract_text_rtf(file_path)
    elif ext in (".txt", ".md"):
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            return f.read()
    else:
        raise ValueError(f"Unsupported format: {ext}")


def detect_chapters(text: str) -> list[dict]:
    """
    Detect chapter structure from text.
    Looks for common chapter heading patterns.
    """
    chapters = []
    lines = text.split("\n")

    # Chapter heading patterns (Chinese + English)
    chapter_patterns = [
        re.compile(r"^第[一二三四五六七八九十百千零\d]+[章节篇课部分]\s*(.*)$"),  # 第一章 标题
        re.compile(r"^第\s*\d+\s*[章节篇课部分]\s*(.*)$"),  # 第 1 章 标题
        re.compile(r"^Chapter\s+\d+\s*[.:]?\s*(.*)$", re.IGNORECASE),  # Chapter 1
        re.compile(r"^Lesson\s+\d+\s*[.:]?\s*(.*)$", re.IGNORECASE),  # Lesson 1
        re.compile(r"^Unit\s+\d+\s*[.:]?\s*(.*)$", re.IGNORECASE),  # Unit 1
        re.compile(r"^Part\s+[IVXLCDM]+\s*[.:]?\s*(.*)$", re.IGNORECASE),  # Part I
        re.compile(r"^\d+\.\s+(.+)$"),  # 1. Title
    ]

    current_chapter = None
    current_lines = []
    chapter_idx = 0

    for line in lines:
        matched = False
        for pattern in chapter_patterns:
            m = pattern.match(line.strip())
            if m:
                # Save previous chapter
                if current_chapter is not None:
                    content = "\n".join(current_lines).strip()
                    chapters.append({
                        "index": chapter_idx,
                        "title": current_chapter,
                        "content": content,
                        "summary": content[:2000] if content else "",
                    })
                    chapter_idx += 1

                current_chapter = m.group(1).strip() or line.strip()
                current_lines = []
                matched = True
                break

        if not matched:
            current_lines.append(line)

    # Save last chapter
    if current_chapter is not None:
        content = "\n".join(current_lines).strip()
        chapters.append({
            "index": chapter_idx,
            "title": current_chapter,
            "content": content,
            "summary": content[:2000] if content else "",
        })

    return chapters


def extract_terms(text: str) -> list[dict]:
    """
    Extract key terms from text.
    Simple heuristic: look for bold/emphasized terms and definitions.
    """
    terms = []
    # Look for patterns like "keyword: definition" or "keyword — definition"
    patterns = [
        re.compile(r"[•·\-*]\s*\*{0,2}([A-Za-z\u4e00-\u9fff][A-Za-z\u4e00-\u9fff\s\-]+?)\*{0,2}\s*[：:]\s*(.{10,200})"),
        re.compile(r"([A-Za-z\u4e00-\u9fff][A-Za-z\u4e00-\u9fff\s\-]+?)\s*[—–-]\s*(.{10,200})"),
        re.compile(r"\"([^\"]{2,50})\"\s*(?:指|是|表示|means|is|refers to)\s*(.{10,200})"),
    ]

    seen = set()
    for pattern in patterns:
        for m in pattern.finditer(text):
            term = m.group(1).strip()
            definition = m.group(2).strip()
            if term.lower() not in seen and len(term) >= 2:
                seen.add(term.lower())
                terms.append({"term": term, "definition": definition, "chapterRef": ""})

    return terms[:50]  # Limit to 50 terms


def extract_patterns(text: str) -> list[dict]:
    """
    Extract patterns/techniques from text.
    """
    patterns = []
    # Look for pattern-like descriptions
    pattern_re = re.compile(
        r"(?:Pattern|模式|技巧|方法|Method|Strategy|Algorithm|技术)[：:]\s*(.{10,100})"
        r"(?:\n(.{10,300}))?"
    )

    for m in pattern_re.finditer(text):
        name = m.group(1).strip()
        desc = (m.group(2) or "").strip()
        if name and len(name) >= 2:
            patterns.append({
                "name": name,
                "description": desc or name,
                "category": "general",
            })

    return patterns[:20]  # Limit to 20 patterns


def extract_metadata(text: str) -> dict:
    """Extract title and author from text."""
    lines = text.strip().split("\n")
    title = ""
    author = ""

    # First non-empty line is often the title
    for line in lines[:10]:
        line = line.strip()
        if line and len(line) < 100:
            title = line
            break

    # Look for author
    author_patterns = [
        re.compile(r"(?:作者|Author|By|by)[：:]\s*(.+)"),
        re.compile(r"^(.{2,30})\s*(?:著|编著|编|主编|著者)"),
    ]
    for line in lines[:30]:
        for pattern in author_patterns:
            m = pattern.search(line.strip())
            if m:
                author = m.group(1).strip()
                break
        if author:
            break

    return {"title": title, "author": author}


def main():
    parser = argparse.ArgumentParser(description="Extract content from a book file")
    parser.add_argument("--file", required=True, help="Path to the book file")
    parser.add_argument("--id", type=int, default=0, help="Book ID (for logging)")
    parser.add_argument("--output", help="Output JSON file path (default: stdout)")
    args = parser.parse_args()

    file_path = args.file
    if not os.path.exists(file_path):
        print(json.dumps({"error": f"File not found: {file_path}"}))
        sys.exit(1)

    # Extract text
    text = extract_text(file_path)
    if not text or len(text.strip()) < 50:
        print(json.dumps({"error": "Extracted text is too short or empty"}))
        sys.exit(1)

    # Analyze
    metadata = extract_metadata(text)
    chapters = detect_chapters(text)
    terms = extract_terms(text)
    patterns = extract_patterns(text)

    # If no chapters detected, create a single chapter with all content
    if not chapters:
        chapters = [{
            "index": 1,
            "title": "全部内容",
            "content": text[:50000],
            "summary": text[:2000],
        }]

    # Limit content size per chapter (prevent token overflow)
    for ch in chapters:
        if len(ch.get("content", "")) > 30000:
            ch["content"] = ch["content"][:30000]
        if len(ch.get("summary", "")) > 2000:
            ch["summary"] = ch["summary"][:2000]

    result = {
        "title": metadata.get("title", Path(file_path).stem),
        "author": metadata.get("author", ""),
        "description": f"从 {Path(file_path).name} 提取的 {len(chapters)} 章节内容",
        "ageGroup": "",
        "chapters": chapters,
        "terms": terms,
        "patterns": patterns,
    }

    output = json.dumps(result, ensure_ascii=False, indent=2)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(output)
        print(json.dumps({"status": "ok", "id": args.id, "chapters": len(chapters), "terms": len(terms), "patterns": len(patterns)}))
    else:
        print(output)


if __name__ == "__main__":
    main()