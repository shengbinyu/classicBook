# 经典阁 · 古人经典文献在线阅读

一个面向古人经典文献的在线阅读网站：**原文 · 白话译文 · 逐词注释**三合一，以传统中式美学（宣纸质感、朱丝栏、印章、云纹）呈现沉浸式阅读体验。

纯前端实现，无需后端与数据库，开箱即用。

---

## ✨ 特性

| 分类 | 能力 |
| --- | --- |
| 📚 典籍内容 | 8 本核心经典全文：原文 + 白话译文 + 逐词注释，JSON 100% 校验通过 |
| 🗂️ 浏览 | 四库分类（经/史/子/集）+ 朝代 + 多维筛选 + 书籍详情目录卷折叠 |
| 📖 阅读器 | 横排 / 竖排（writing-mode）+ 对照模式（原文译文并列）+ 主题切换 + 字号缩放 |
| 🔖 交互 | 书签抽屉、逐词注释气泡、最近阅读记忆、快捷键翻章/Ctrl+B 加书签 |
| 🔍 搜索 | 元数据搜索（书名/作者/朝代）+ 全文关键词搜索（带上下文片段） |
| 🎨 视觉 | 宣纸纹理、朱丝栏分界、词条用印、中式配色主题（日间/宣纸/夜间） |
| 📱 响应式 | 移动端 / 平板 / 桌面三档断点 |

---

## 🚀 快速开始

> 数据通过 `fetch()` 加载 JSON，出于浏览器安全策略**不能直接用 `file://` 打开**，需起一个本地 HTTP 服务。

**方式一：Python（最简单）**
```bash
# 项目根目录
python -m http.server 8080
# 浏览器打开 http://localhost:8080/index.html
```

**方式二：Node**
```bash
npx serve .
# 或
npx http-server .
```

**方式三：内置的无缓存开发服务器（推荐，避免改文件后老缓存）**
```bash
python _serve_nocache.py 9255 .
# 浏览器打开 http://127.0.0.1:9255/index.html
```

---

## 📁 目录结构

```
classicBook/
├─ index.html                  # SPA 入口：导航 + 各视图模板 + Toast 容器
├─ css/
│  ├─ main.css                 # 全局主题变量 / 四库巨卡 / 书卡 / 图标注入
│  ├─ reader.css               # 阅读器布局（横竖排、朱丝栏、对照、抽屉）
│  ├─ catalog.css              # 分类页筛选栏 / 书栅
│  └─ responsive.css           # 移动/平板/桌面断点
├─ js/
│  ├─ main.js                  # bootstrap + hash 路由 + 偏好（主题/字号/横竖/对照）
│  ├─ home.js                  # 首页：四库巨卡 + 最近阅读 + 今日推荐
│  ├─ catalog.js               # 分类 / 朝代浏览
│  ├─ book.js                  # 书籍详情 + 目录树
│  ├─ reader.js                # 阅读器核心（章节加载 / 对照渲染 / 书签 / 注释气泡）
│  ├─ parallel.js              # 原/译/对照 三模式渲染引擎
│  ├─ data.js                  # 元数据 + TOC + JSON 加载
│  ├─ storage.js               # localStorage 封装（偏好/最近阅读/书签/搜索历史）
│  └─ search.js                # 搜索页（meta / fulltext 双 scope）
├─ data/
│  ├─ categories.json          # 四库分类树
│  ├─ books.json               # 32 本书元数据
│  └─ books/                   # 8 本正文 JSON（见下）
├─ assets/
│  ├─ icons/                   # 13 个 SVG 图标
│  └─ decorations/             # 云纹 / 朱丝栏 / 印章等中式纹饰
├─ _serve_nocache.py           # 本地无缓存静态服务器
└─ _remove_jsonc.py            # JSONC(带注释)→合法 JSON 清理器
```

---

## 📚 已收录 8 本核心典籍

| 书名 | 卷 | 章 | 段 | 译文 | 注释 |
| --- | --- | --- | --- | --- | --- |
| 《大学》 | 1 | 11 | 22 | ✅ | ✅ |
| 《中庸》 | 1 | 33 | 64 | ✅ | ✅ |
| 《孝经》 | 1 | 18 | 19 | ✅ | ✅ |
| 《道德经》 | 2 | 81 | 81 | ✅ | ✅ |
| 《孙子兵法》 | 1 | 13 | 13 | ✅ | ✅ |
| 《庄子·内篇》 | 7 | 7 | 13 | ✅ | ✅ |
| 《论语》 | 2 | 20 | 218 | ✅ | ✅ |
| 《孟子》 | 14 | 14 | 260 | ✅ | ✅ |

> `data/books.json` 中另收录 24 部已列入规划的作品（史记选、楚辞、文选、世说新语、资治通鉴、唐宋诗/词选、四大名著等），正文将持续补入。

---

## 🛠️ 数据格式

每本书一个 JSON，结构如下：

```jsonc
{
  "id": "lunyu",
  "volumes": [
    {
      "id": "v1",
      "name": "上论",
      "chapters": [
        {
          "id": "xueer",
          "title": "学而第一",
          "paragraphs": [
            {
              "pid": "xueer-1",
              "original": "子曰：「学而时习之，不亦说乎？」",
              "translation": "孔子说：学了道理按时去践行，不也是喜悦吗？",
              "notes": [
                { "pos": 0, "len": 2, "ref": "子曰", "note": "孔子说" }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

- `notes.pos` = 注释字在 `original` 中的起始偏移（0 基），点击原文高亮字词弹出注释。
- 校验脚本：`data/books/_validate_all.py`（结构、必填键、偏移、译文覆盖率全检）。

---

## 🔧 数据维护脚本

| 脚本 | 用途 |
| --- | --- |
| `data/books/_validate_all.py` | 校验 8 本 JSON 结构 / 字段 / 偏移 / 译文覆盖率 |
| `data/books/_build_lunyu.py` | 一键（重新）生成《论语》20 篇 JSON |
| `data/books/_fix_mengzi.py` | 修复《孟子》注释偏移并补齐空译文 |
| `_remove_jsonc.py` | 批量清除 JSON 中的 `/* */`、`//` 注释，输出合法 JSON |
| `_serve_nocache.py` | 启动本地无缓存 HTTP 服务，便于开发预览 |

---

## 🧭 技术栈

- **原生** ES6 Modules，零依赖、无需构建
- CSS 变量 主题系统（日间 / 宣纸 / 夜间）
- localStorage 持久化用户偏好 / 阅读进度 / 书签 / 搜索历史
- hash 路由（`#/book/<id>`、`#/read/<book>/<chapter>`、`#/catalog/<cat>`、`#/search`）

---

## 📄 License

内容相关文本整理自公有领域典籍；代码部分按需自行选用开源协议。