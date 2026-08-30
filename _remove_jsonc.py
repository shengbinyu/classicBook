# -*- coding: utf-8 -*-
"""
_remove_jsonc.py  —  把 带注释的 JSONC 文件 原地 清除注释，变成 合法 JSON
处理 data/*.json 和 data/books/*.json （不递归）
用法:  python _remove_jsonc.py
"""
import re, os, glob
HERE = os.path.dirname(os.path.abspath(__file__))

def strip_jsonc(text: str) -> str:
    """去掉 /* */ 块注释 和 // 行注释，小心字符串内部 // /* 不处理。
       实现：逐字符状态机
    """
    out = []
    i, n = 0, len(text)
    in_str = False
    in_line = False
    in_block = False
    esc = False
    while i < n:
        c = text[i]
        nxt = text[i+1] if i+1 < n else ''
        if in_str:
            out.append(c)
            if esc:
                esc = False
            elif c == '\\':
                esc = True
            elif c == '"':
                in_str = False
            i += 1
            continue
        if in_line:
            if c == '\n':
                in_line = False
                out.append(c)
            i += 1
            continue
        if in_block:
            if c == '*' and nxt == '/':
                in_block = False
                i += 2
            else:
                i += 1
            continue
        # 普通 代码
        if c == '"':
            in_str = True
            out.append(c); i += 1; continue
        if c == '/' and nxt == '/':
            in_line = True
            i += 2; continue
        if c == '/' and nxt == '*':
            in_block = True
            i += 2; continue
        out.append(c); i += 1
    return ''.join(out)

TARGETS = [
    os.path.join(HERE, 'data', '*.json'),
    os.path.join(HERE, 'data', 'books', '*.json'),
]
file_count = 0
for pat in TARGETS:
    for fp in glob.glob(pat):
        if os.path.basename(fp).startswith('_'):
            continue  # 跳过 构建脚本 / 本脚本
        try:
            with open(fp, 'r', encoding='utf-8') as f:
                original = f.read()
        except Exception as e:
            print(f'❌ 读 {fp}: {e}')
            continue
        if ('//' not in original) and ('/*' not in original):
            print(f'  · skip (无注释)  {os.path.relpath(fp, HERE)}')
            continue
        cleaned = strip_jsonc(original)
        # 验证 parse
        try:
            import json
            json.loads(cleaned)
        except Exception as e:
            print(f'❌ 清理后 parse 失败  {os.path.relpath(fp, HERE)}  : {e}')
            continue
        with open(fp, 'w', encoding='utf-8') as f:
            f.write(cleaned)
        file_count += 1
        print(f'✅ 已去注释重写 {os.path.relpath(fp, HERE)}   ({len(original)}→{len(cleaned)} B)')
print(f'\n完成：处理 {file_count} 个文件')
