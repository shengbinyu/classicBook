# -*- coding: utf-8 -*-
"""
_validate_all.py — 8 本核心 JSON 数据一致性 + 字段合法性校验
输出：控制台 报告；如有问题 exit 1，否则 exit 0 + 打印总览表
"""
import json, os, sys, traceback
BOOKS_DIR = os.path.dirname(os.path.abspath(__file__))

# 8 本 核心 （按 books.json 的 id）
CORE_EIGHT = ['daxue','zhongyong','xiaojing','daodejing','sunzi','zhuangzi-inner','lunyu','mengzi']
# 预期 章节数 （min, max, 允许 0=未知）
EXPECT = {
    'daxue': (1, 20),         # 大学 11 章（1 卷）
    'zhongyong': (1, 50),     # 中庸 33 章
    'xiaojing': (1, 30),      # 孝经 18 章
    'daodejing': (70, 90),    # 老子 81 章（分上道经下德经 2 卷 或 1 卷）
    'sunzi': (10, 20),        # 孙子 13 篇
    'zhuangzi-inner': (5, 12),# 庄子 内篇 7 篇
    'lunyu': (20, 20),        # 论语 20 篇 强制
    'mengzi': (10, 20),       # 孟子 14 卷（7 卷各上下 或 7 卷单独）
}

# 中文 名称 显示
CN = {
    'daxue':'《大学》',
    'zhongyong':'《中庸》',
    'xiaojing':'《孝经》',
    'daodejing':'《道德经》',
    'sunzi':'《孙子兵法》',
    'zhuangzi-inner':'《庄子·内篇》',
    'lunyu':'《论语》',
    'mengzi':'《孟子》',
}

report = []
rows = []
ok_all = True

def P(msg):
    print(msg)
    report.append(msg)

for bid in CORE_EIGHT:
    fp = os.path.join(BOOKS_DIR, bid + '.json')
    row = {'id': bid, 'name': CN.get(bid, bid), 'file': False, 'parse': False,
           'vols': 0, 'chaps': 0, 'paras': 0, 'trans_cov': 0, 'notes': 0, 'KB': 0, 'err': []}
    if not os.path.exists(fp):
        row['err'].append('文件不存在')
        rows.append(row); continue
    row['file'] = True
    row['KB'] = round(os.path.getsize(fp) / 1024, 1)
    try:
        with open(fp, 'r', encoding='utf-8') as f:
            obj = json.load(f)
    except Exception as e:
        row['err'].append(f'JSON parse 失败: {e}')
        rows.append(row); continue
    row['parse'] = True
    if obj.get('id') != bid:
        row['err'].append(f'obj.id 不匹配：{obj.get("id")} != {bid}')
    if 'volumes' not in obj or not isinstance(obj['volumes'], list) or len(obj['volumes']) < 1:
        row['err'].append('缺少 volumes 或 volumes 为空')
        rows.append(row); continue
    row['vols'] = len(obj['volumes'])
    chap_ids = set()
    for vi, vol in enumerate(obj['volumes']):
        if 'id' not in vol or 'name' not in vol:
            row['err'].append(f'vol[{vi}] 缺少 id/name')
        chs = vol.get('chapters') or []
        if not isinstance(chs, list) or len(chs) < 1:
            row['err'].append(f'vol[{vi}] chapters 为空')
            continue
        for ci, ch_ in enumerate(chs):
            for k in ('id','title','paragraphs'):
                if k not in ch_:
                    row['err'].append(f'vol[{vi}].chap[{ci}] 缺键 {k}')
                    continue
            cid = ch_['id']
            if cid in chap_ids:
                row['err'].append(f'vol[{vi}].chap[{ci}] 重复 chapter.id: {cid}')
            chap_ids.add(cid)
            paras = ch_.get('paragraphs') or []
            row['chaps'] += 1
            if not isinstance(paras, list):
                row['err'].append(f'vol[{vi}].ch[{cid}] paragraphs 非数组')
                continue
            pids_in_ch = set()
            for pi, p in enumerate(paras):
                row['paras'] += 1
                for k in ('pid','original','translation','notes'):
                    if k not in p:
                        row['err'].append(f'ch[{cid}] p[{pi}] 缺键 {k}')
                pid = p.get('pid','')
                if pid in pids_in_ch:
                    row['err'].append(f'ch[{cid}] 重复 pid: {pid}')
                pids_in_ch.add(pid)
                orig = (p.get('original') or '').strip()
                if not orig:
                    row['err'].append(f'ch[{cid}] p[{pi}] original 空')
                trans = (p.get('translation') or '').strip()
                if trans:
                    row['trans_cov'] += 1
                notes = p.get('notes')
                if not isinstance(notes, list):
                    row['err'].append(f'ch[{cid}] p[{pi}] notes 非数组')
                else:
                    row['notes'] += len(notes)
                    for ni, n in enumerate(notes):
                        for kk in ('pos','len','ref','note'):
                            if kk not in n:
                                row['err'].append(f'ch[{cid}] p[{pi}] note[{ni}] 缺键 {kk}')
                        if 'pos' in n and 'len' in n and orig:
                            if not (0 <= n['pos'] < len(orig)):
                                row['err'].append(f'ch[{cid}] p[{pi}] note[{ni}] pos {n["pos"]} 越界')
                            elif n['pos'] + n['len'] > len(orig):
                                row['err'].append(f'ch[{cid}] p[{pi}] note[{ni}] pos+len 越界')
    # 章节 数 范围 校验
    mn, mx = EXPECT.get(bid, (0, 10**9))
    if mn and row['chaps'] < mn:
        row['err'].append(f'章节数 {row["chaps"]} < 下限 {mn}')
    if mx and row['chaps'] > mx:
        row['err'].append(f'章节数 {row["chaps"]} > 上限 {mx}')

    # trans_cov%
    cov = (row['trans_cov'] / row['paras'] * 100) if row['paras'] else 0
    if cov < 50:
        row['err'].append(f'译文覆盖率仅 {cov:.1f}%')

    status = '✅' if not row['err'] else '❌'
    ok_all = ok_all and not row['err']
    P(f'\n## {bid} {CN.get(bid,"")}  {status}')
    if row['file']: P(f'  文件: {fp}  ({row["KB"]} KB)')
    if row['parse']:
        P(f'  volumes={row["vols"]}, chapters={row["chaps"]}, paragraphs={row["paras"]}')
        P(f'  译文 {row["trans_cov"]}/{row["paras"]} = {cov:.1f}%, 注释总数 {row["notes"]}')
    if row['err']:
        for e in row['err']:
            P(f'  ❌ {e}')
    rows.append(row)

# 汇总表
P('\n' + '=' * 130)
P('8 本核心 JSON 数据校验 汇总表')
P('=' * 130)
hdr = f'{"文件":<18}{"卷":>3}{"章":>5}{"段":>6}{"译文覆盖":>10}{"注释":>6}{"大小 KB":>10}  状态'
P(hdr)
P('-' * 130)
for r in rows:
    cov_pct = f'{r["trans_cov"]/max(1,r["paras"])*100:>5.1f}%'
    mark = '✅' if not r['err'] else '❌'
    parse_ok = r['parse']
    vols = r['vols'] if parse_ok else '-'
    chs = r['chaps'] if parse_ok else '-'
    pars = r['paras'] if parse_ok else '-'
    cov  = cov_pct if parse_ok else '-'
    nts  = r['notes'] if parse_ok else '-'
    P(f'{r["name"]:<16}{vols:>4}{chs:>5}{pars:>6}{cov:>10}{nts:>7}{r["KB"]:>10.1f}  {mark}')

P('\n' + '=' * 130)
if ok_all:
    P('🎉 全部 8 本核心 JSON 通过校验。')
    sys.exit(0)
else:
    bad = [r['name'] for r in rows if r['err']]
    P(f'⚠️  存在问题的书目：{", ".join(bad)}')
    sys.exit(1)
