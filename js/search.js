/* search.js — 搜索结果页
 * 路由：#/search?q=&scope=
 *   scope: meta   → 仅查书籍元数据（书名/别名/作者/标签/简介）
 *   scope: fulltext → 进入正文搜 original / translation / 注释（对 8 本 ready 书懒加载逐章扫）
 *
 * 支持：搜索历史、命中片段关键词高亮（<mark>）、meta 命中复用 catalog 书籍卡片、全文命中跳转到 #/read/:bookId/:chapterId
 */
import { h, showToast, escapeHtml } from "./main.js";
import { listBooks, loadBooksMeta, getBookMeta, loadBookContent } from "./data.js";
import * as Store from "./storage.js";

/* 搜索页内置样式，避免依赖 catalog.css 之外的额外 class */
const SEARCH_STYLE = `
.search-wrap{max-width:1080px;margin:0 auto;padding:48px 24px 96px;}
.search-hero{margin-bottom:28px;}
.search-hero h2{font-size:24px;margin:0 0 14px;font-family:var(--kai);letter-spacing:.2em;color:var(--fg);}
.search-bar{display:flex;gap:8px;background:var(--paper-2);border:1px solid var(--ink-3);border-radius:10px;padding:6px 6px 6px 14px;align-items:center;box-shadow:0 1px 0 rgba(0,0,0,.02);}
.search-bar input{flex:1;border:0;outline:0;background:transparent;font-size:16px;padding:8px 6px;color:var(--fg);font-family:var(--serif);}
.search-bar button{background:var(--cinnabar);color:#fff;border:0;border-radius:8px;padding:8px 16px;font-size:14px;cursor:pointer;letter-spacing:.1em;}
.search-bar button:hover{background:var(--cinnabar-dark);}
.scope-tabs{display:flex;gap:4px;margin:14px 0 10px;}
.scope-tab{border:1px solid var(--ink-3);background:transparent;padding:6px 14px;border-radius:999px;font-size:13px;cursor:pointer;color:var(--fg-muted);}
.scope-tab.active{background:var(--ink-1);color:var(--fg);border-color:var(--ink-2);font-weight:600;}
.search-meta{font-size:13px;color:var(--fg-muted);margin:8px 0 18px;font-family:var(--kai);}
.search-meta .k{color:var(--cinnabar);font-weight:600;padding:0 2px;}
.history-row{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 18px;}
.history-tag{background:var(--paper-2);border:1px dashed var(--ink-3);border-radius:999px;padding:3px 10px;font-size:12px;color:var(--fg-muted);cursor:pointer;}
.history-tag:hover{border-color:var(--cinnabar);color:var(--cinnabar);}
.history-clear{font-size:12px;color:var(--fg-muted);cursor:pointer;margin-left:auto;}
.history-clear:hover{color:var(--cinnabar);}

/* 元数据命中：书籍卡片区 */
.book-grid{display:grid;grid-template-columns:repeat(auto-fill, minmax(240px,1fr));gap:18px;margin-top:10px;}
.book-card{background:var(--paper);border:1px solid var(--ink-3);border-radius:10px;padding:18px 16px;display:flex;gap:14px;position:relative;transition:.2s;}
.book-card:hover{box-shadow:0 6px 20px rgba(100,60,30,.08);transform:translateY(-1px);border-color:var(--ink-2);}
.book-card .cover{width:56px;height:76px;flex:0 0 56px;background:linear-gradient(160deg,var(--cover,#8b3a32),var(--cover-dark,#5e231f));border-radius:3px;display:flex;align-items:center;justify-content:center;color:#f7e6c2;font-family:"STKaiti","KaiTi","Noto Serif CJK SC",serif;font-size:28px;writing-mode:vertical-rl;letter-spacing:.15em;box-shadow:inset 0 0 0 1px rgba(255,255,255,.08),0 3px 8px rgba(0,0,0,.15);}
.book-card .meta{flex:1;min-width:0;}
.book-card .t{font-size:16px;font-weight:600;color:var(--fg);margin:0 0 3px;letter-spacing:.05em;}
.book-card .a{font-size:12px;color:var(--fg-muted);margin-bottom:6px;font-family:var(--kai);}
.book-card .intro{font-size:13px;color:var(--fg);opacity:.85;line-height:1.6;max-height:4.8em;overflow:hidden;}
.book-card .tags{margin-top:6px;display:flex;flex-wrap:wrap;gap:4px;}
.book-card .tag{background:var(--paper-2);border:1px solid var(--ink-3);border-radius:4px;padding:1px 6px;font-size:11px;color:var(--fg-muted);}

/* 全文命中 */
.hits-list{display:flex;flex-direction:column;gap:12px;}
.search-hit{background:var(--paper);border:1px solid var(--ink-3);border-left:3px solid var(--cinnabar);border-radius:8px;padding:14px 16px;transition:.2s;}
.search-hit:hover{box-shadow:0 4px 14px rgba(100,60,30,.08);}
.search-hit .hit-head{display:flex;align-items:center;gap:10px;margin-bottom:6px;flex-wrap:wrap;}
.search-hit .hit-book{font-size:14px;font-weight:600;color:var(--fg);}
.search-hit .hit-chapter{font-size:12px;color:var(--fg-muted);font-family:var(--kai);}
.search-hit .hit-book::after{content:" ·";color:var(--ink-2);}
.search-hit .hit-snippet{font-size:14px;line-height:1.75;color:var(--fg);}
.search-hit .hit-snippet mark{background:linear-gradient(transparent 62%, #f2c2a9 62%);color:inherit;padding:0 1px;font-weight:600;}
.search-hit .hit-act{margin-top:8px;}
.search-hit .hit-btn{display:inline-block;font-size:12px;color:var(--cinnabar);text-decoration:none;border:1px solid var(--cinnabar);border-radius:4px;padding:3px 10px;letter-spacing:.05em;}
.search-hit .hit-btn:hover{background:var(--cinnabar);color:#fff;}
.search-hit .type-badge{font-size:11px;background:var(--paper-2);border:1px solid var(--ink-3);border-radius:4px;padding:1px 6px;color:var(--fg-muted);margin-left:4px;}

.search-empty{text-align:center;padding:60px 20px;color:var(--fg-muted);}
.search-empty .big{font-size:48px;margin-bottom:12px;opacity:.4;}

/* scope=fulltext 的进度条 */
.search-progress{height:2px;background:var(--paper-2);border-radius:2px;overflow:hidden;margin:10px 0 18px;}
.search-progress .bar{height:100%;width:0;background:var(--cinnabar);transition:.3s;}
`;

export default async function renderSearch(ctx, mount){
  // 注入一次性样式（避免重复注入）
  if(!document.getElementById("search-style")){
    const st = document.createElement("style");
    st.id = "search-style";
    st.textContent = SEARCH_STYLE;
    document.head.appendChild(st);
  }

  const q     = (ctx.query.q     || "").trim();
  const scope = (ctx.query.scope === "fulltext") ? "fulltext" : "meta";

  /* ------- 组装 UI ------- */
  const wrap    = h("div", { class:"search-wrap" });
  const hero    = h("div", { class:"search-hero" });
  const results = h("div", { class:"search-results" });
  wrap.appendChild(hero);
  wrap.appendChild(results);
  mount.appendChild(wrap);

  hero.appendChild(h("h2", {}, "检索典籍"));

  // 搜索框
  const input = h("input", { type:"search", placeholder:"输入书名、作者、篇目或正文中的关键字…", value: q, id:"search-q-input" });
  const btn   = h("button", { type:"button" }, "搜 索");
  const bar   = h("div", { class:"search-bar" },
    h("span",{style:"color:var(--fg-muted);"}, "🔍"),
    input,
    btn
  );
  hero.appendChild(bar);

  // scope tabs
  const tabMeta = h("button", { class:"scope-tab" + (scope==="meta"?" active":"") , "data-scope":"meta" }, "元数据（书名/作者/标签）");
  const tabFull = h("button", { class:"scope-tab" + (scope==="fulltext"?" active":""), "data-scope":"fulltext" }, "全文检索（正文/译文/注释）");
  const tabs = h("div", { class:"scope-tabs" }, tabMeta, tabFull);
  hero.appendChild(tabs);

  // 搜索历史
  const histRow = h("div", { class:"history-row" });
  renderHistory(histRow, runSearch.bind(null, null));
  hero.appendChild(histRow);

  // 摘要区 + 全文进度条 + 结果
  const metaEl   = h("div", { class:"search-meta" });
  const progBar  = h("div", { class:"search-progress", "aria-hidden":"true" }, h("div",{class:"bar"}));
  const listWrap = h("div", { class:"list-wrap" });
  results.appendChild(metaEl);
  results.appendChild(progBar);
  results.appendChild(listWrap);

  // 进度条仅 fulltext 显示
  progBar.style.display = scope === "fulltext" ? "" : "none";

  /* ------- 事件绑定 ------- */
  const doSubmit = () => {
    const v = input.value.trim();
    if(!v){ input.focus(); return; }
    runSearch(v, scope);
  };
  btn.addEventListener("click", doSubmit);
  input.addEventListener("keydown", (e) => { if(e.key === "Enter") doSubmit(); });
  input.addEventListener("keydown", (e) => {
    if((e.ctrlKey||e.metaKey) && e.key === "/"){ e.preventDefault(); input.focus(); input.select(); }
  });
  tabs.addEventListener("click", (e) => {
    const b = e.target.closest(".scope-tab");
    if(!b) return;
    const sc = b.dataset.scope;
    const v = input.value.trim() || q;
    runSearch(v, sc);
  });

  // 首次载入：有 q 就执行
  if(q){
    setTimeout(() => runSearch(q, scope), 0);
  }else{
    metaEl.appendChild(h("span",{}, "请输入关键字开始检索。"));
    // 展示最近 5 本书（ready 状态）
    showRecentReady(listWrap);
    input.focus();
  }

  // Ctrl+/ 聚焦
  setTimeout(() => input.focus(), 0);

  /* ==============================================================
   * 核心：执行搜索
   * ============================================================== */
  async function runSearch(keyword, useScope){
    keyword = (keyword || input.value || "").trim();
    if(!keyword){ showToast("请输入关键字"); return; }
    useScope = useScope || "meta";

    // 同步 URL hash（无历史条目重复）
    const newHash = `#/search?q=${encodeURIComponent(keyword)}&scope=${useScope}`;
    if(location.hash !== newHash){ history.replaceState(null,"", newHash); }

    // 更新 tabs 状态
    tabMeta.classList.toggle("active", useScope === "meta");
    tabFull.classList.toggle("active", useScope === "fulltext");
    progBar.style.display = useScope === "fulltext" ? "" : "none";

    Store.addSearchHistory(keyword, useScope);
    renderHistory(histRow, runSearch);

    const t0 = performance.now();
    metaEl.innerHTML = "";
    listWrap.innerHTML = "";
    setProg(0);

    if(useScope === "meta"){
      const { items, total } = await listBooks({ keyword, status: "ready", sort: "default" });
      const ms = (performance.now() - t0).toFixed(0);
      metaEl.appendChild(h("span",{},
        "在元数据中搜",
        h("span",{class:"k"}, "「" + escapeHtml(keyword) + "」"),
        ` 共找到 ${items.length} 本 / ${total} 候选 （${ms} ms）`
      ));
      renderMetaHits(listWrap, items, keyword);
    }else{
      // 全文：懒加载 ready 书籍，逐章扫
      const hits = await searchFullText(keyword, 50, setProg);
      const ms = (performance.now() - t0).toFixed(0);
      metaEl.appendChild(h("span",{},
        "在全文中搜",
        h("span",{class:"k"}, "「" + escapeHtml(keyword) + "」"),
        ` 共 ${hits.length} 条命中 （${ms} ms）`
      ));
      setProg(100);
      renderFullTextHits(listWrap, hits, keyword);
    }
  }

  function setProg(p){
    const bar = progBar.querySelector(".bar");
    if(bar) bar.style.width = p + "%";
  }
}

/* ==============================================================
 * 子过程：历史、元数据命中、全文命中、空态
 * ============================================================== */

function renderHistory(container, onPick){
  if(!container) return;
  container.innerHTML = "";
  const hist = Store.getSearchHistory();
  if(hist.length){
    container.appendChild(h("span",{style:"font-size:12px;color:var(--fg-muted);margin-right:6px;font-family:var(--kai);"},"最近搜索："));
    hist.slice(0, 10).forEach(hx => {
      const t = h("button", { class:"history-tag", title: `${hx.scope==="fulltext"?"全文":"元数据"}搜索 · ${new Date(hx.at||0).toLocaleString("zh-CN")}` },
        hx.q
      );
      t.addEventListener("click", () => onPick(hx.q, hx.scope));
      container.appendChild(t);
    });
    const clr = h("button", { class:"history-clear", title:"清空历史" }, "清空历史");
    clr.addEventListener("click", () => { Store.clearSearchHistory(); renderHistory(container, onPick); showToast("已清空搜索历史"); });
    container.appendChild(clr);
  }
}

function renderMetaHits(container, books, keyword){
  if(!books.length){
    renderEmpty(container, "元数据中未找到匹配书籍，试试「全文检索」标签。");
    return;
  }
  const grid = h("div", { class:"book-grid" });
  for(const b of books){
    const card = h("div", { class:"book-card" });
    const cover = h("div", { class:"cover", title: b.title }, b.coverGlyph || b.title.slice(0,1));
    const meta  = h("div", { class:"meta" });
    meta.appendChild(h("div",{class:"t"}, h("a",{href:`#/book/${b.id}`, style:"color:inherit;text-decoration:none;"}, highlight(b.title, keyword))));
    meta.appendChild(h("div",{class:"a"},
      `${escapeHtml(b.author || "")} · ${escapeHtml(b.dynasty || "")} · ${escapeHtml(b.genre || "")}`
    ));
    meta.appendChild(h("div",{class:"intro", html: highlight(b.intro?.slice(0,88) || "", keyword).outerHTML ? "" : "" }));
    // 简介高亮：手动 innerHTML 兜底（上面 highlight 返回 span 时 outerHTML 可拿到）
    const introHtml = highlightWrap(b.intro?.slice(0,88) || "", keyword);
    meta.lastElementChild.innerHTML = introHtml;
    const tags = h("div",{class:"tags"});
    (b.tags||[]).slice(0,4).forEach(tg => tags.appendChild(h("span",{class:"tag"}, highlight(tg, keyword))));
    meta.appendChild(tags);
    card.appendChild(cover); card.appendChild(meta);
    grid.appendChild(card);
  }
  container.appendChild(grid);
}

function renderFullTextHits(container, hits, keyword){
  if(!hits.length){
    renderEmpty(container, "全文中未找到匹配片段。尝试更短的关键字或常见用词。");
    return;
  }
  const list = h("div", { class:"hits-list" });
  for(const hx of hits){
    const el = h("div", { class:"search-hit" });
    const head = h("div", { class:"hit-head" },
      h("span",{class:"hit-book"}, escapeHtml(hx.bookTitle)),
      hx.chapterTitle ? h("span",{class:"hit-chapter"}, escapeHtml(hx.volumeName ? hx.volumeName + " · " + hx.chapterTitle : hx.chapterTitle)) : null,
      h("span",{class:"type-badge"}, hx.type === "chapter" ? "篇名命中" : "正文命中")
    );
    const snip = h("div", { class:"hit-snippet" });
    snip.innerHTML = highlightWrap(hx.snippet || "", keyword);
    const act = h("div",{class:"hit-act"},
      h("a",{class:"hit-btn", href:`#/read/${hx.bookId}${hx.chapterId?"/"+hx.chapterId:""}`}, "前往阅读 →")
    );
    el.appendChild(head); el.appendChild(snip); el.appendChild(act);
    list.appendChild(el);
  }
  container.appendChild(list);
}

function renderEmpty(container, tip){
  const e = h("div", { class:"search-empty" },
    h("div",{class:"big"}, "🪶"),
    h("div",{}, tip || "没有找到相关结果")
  );
  container.appendChild(e);
}

async function showRecentReady(container){
  const { items } = await listBooks({ status: "ready", sort: "default", pageSize: 8 });
  if(!items.length) return;
  const lead = h("div",{style:"font-family:var(--kai);color:var(--fg-muted);font-size:13px;margin:0 0 10px;letter-spacing:.1em;"},"或从已开放的典籍开始：");
  container.appendChild(lead);
  renderMetaHits(container, items, "");
}

/* ==============================================================
 * 全文搜索：逐 ready 书籍加载内容，在章节 title/段落 original/translation/notes 中找
 * ============================================================== */
async function searchFullText(keyword, limit, onProgress){
  const out = [];
  const k = keyword.toLowerCase();
  if(!k) return out;

  const books = await loadBooksMeta();
  const ready = books.filter(b => b.status === "ready");
  const total = ready.length;
  let done = 0;

  for(const b of ready){
    if(out.length >= limit) break;
    try{
      const content = await loadBookContent(b.id);
      for(const v of content.volumes || []){
        for(const c of v.chapters || []){
          if(out.length >= limit) break;
          // 标题命中
          if((c.title||"").toLowerCase().includes(k)){
            out.push({
              type: "chapter",
              bookId: b.id, bookTitle: b.title,
              chapterId: c.id, chapterTitle: c.title, volumeName: v.name,
              snippet: (c.paragraphs?.[0]?.original || "").slice(0, 80)
            });
            continue;
          }
          // 段落命中
          for(const p of c.paragraphs || []){
            if(out.length >= limit) break;
            const joined = [p.original, p.translation, (p.notes||[]).map(n=>n.ref+"，"+n.note).join("；")].join("  ");
            const idx = joined.toLowerCase().indexOf(k);
            if(idx >= 0){
              const start = Math.max(0, idx - 14);
              const end   = Math.min(joined.length, idx + keyword.length + 40);
              let snippet = joined.slice(start, end);
              if(start > 0) snippet = "…" + snippet;
              if(end < joined.length) snippet = snippet + "…";
              out.push({
                type: "text",
                bookId: b.id, bookTitle: b.title,
                chapterId: c.id, chapterTitle: c.title, volumeName: v.name,
                snippet
              });
              break; // 一章只记录第一条命中
            }
          }
        }
      }
    }catch(e){
      console.warn("search load book fail", b.id, e);
    }finally{
      done++;
      if(onProgress) onProgress(Math.round(done/total*100));
    }
  }
  return out.slice(0, limit);
}

/* ==============================================================
 * 关键词高亮工具
 * ============================================================== */
function highlight(text, keyword){
  if(!keyword) return h("span",{}, text == null ? "" : String(text));
  return h("span",{html: highlightWrap(text, keyword)});
}
function highlightWrap(text, keyword){
  const s = text == null ? "" : String(text);
  if(!keyword) return escapeHtml(s);
  const esc = escapeHtml(s);
  const keys = [escapeHtml(keyword)];
  // 简单替换，忽略大小写
  return esc.replace(new RegExp("(" + keys[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "ig"),
    `<mark>$1</mark>`);
}
