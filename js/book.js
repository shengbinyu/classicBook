/* book.js — 书籍详情视图 /book/:id */
import { h, showToast } from "./main.js";
import { getBookMeta, getBookTOC, getFirstChapterId, getChapter } from "./data.js";
import * as Store from "./storage.js";

export default async function renderBook(ctx, mount){
  const id = ctx.params[0];
  const meta = await getBookMeta(id);
  if(!meta){
    mount.appendChild(h("div",{class:"empty-state"},
      h("div",{class:"es-title"},"未找到该书"),
      h("div",{}, h("a",{href:"#/catalog",class:"btn"}, "返回书目总览"))
    ));
    return;
  }
  const isPlanned = meta.status !== "ready";

  let toc = [];
  let firstChapterId = null;
  if(!isPlanned){
    [toc, firstChapterId] = await Promise.all([
      getBookTOC(id),
      getFirstChapterId(id)
    ]);
  }

  // 阅读进度
  const progress = Store.getProgress(id);
  const bms = Store.bookmarksByBook(id);

  /* ==== 页面骨架 ==== */
  const detail = h("section", { class:"book-detail" });

  // 头部
  const head = h("div", { class:"bd-head" });
  const planned = meta.status !== "ready";
  // 封面
  const cover = h("div", { class:"bd-cover" }, h("span", { class:"glyph" }, meta.coverGlyph || "典"));
  if(planned){
    cover.style.opacity = ".65";
    cover.appendChild(h("span",{style:"position:absolute;top:6px;right:8px;padding:2px 8px;border-radius:999px;background:var(--fg-muted);color:#fff;font-size:11px;font-family:var(--kai);"},"后续录入"));
  }
  head.appendChild(cover);
  // 基本信息
  const info = h("div", { class:"bd-info" });
  info.appendChild(h("h1", {}, meta.title,
    meta.altTitles && meta.altTitles.length ? h("small",{style:"font-size:13px;color:var(--fg-muted);margin-left:10px;font-weight:400;"},
      "又名 " + meta.altTitles.join("、")) : null
  ));
  const sub = h("div", { class:"bd-sub" });
  const row = (l, v) => h("span", {}, h("b", {}, l), "：", v || "—");
  sub.appendChild(row("作者", meta.author));
  sub.appendChild(row("朝代", meta.dynasty));
  sub.appendChild(row("体裁", meta.genre));
  sub.appendChild(row("版本", meta.edition));
  info.appendChild(sub);
  // 标签
  const tags = h("div", { class:"bd-tags" });
  (meta.categoryPath||[]).forEach(c => tags.appendChild(h("span", { class:"tag blue" }, c)));
  (meta.tags||[]).forEach(t => tags.appendChild(h("span", { class:"tag" }, t)));
  if(meta.status === "ready") tags.appendChild(h("span", { class:"tag ready" }, "全文已录入 · 带注译"));
  else tags.appendChild(h("span", { class:"tag planned" }, "后续录入 · 敬请期待"));
  info.appendChild(tags);
  // 统计：卷 / 章 / 字数 / 书签数
  const stats = h("div", { class:"bd-stats" });
  stats.appendChild(statCell(meta.volumes || 0, "卷次"));
  stats.appendChild(statCell(meta.chapters || 0, "章次"));
  stats.appendChild(statCell(meta.wordCount ? `${(meta.wordCount/1000).toFixed(1)}K` : "—", "字数"));
  stats.appendChild(statCell(bms.length, "我已书签"));
  info.appendChild(stats);
  // 操作按钮
  const acts = h("div", { class:"bd-actions" });
  if(meta.status === "ready"){
    acts.appendChild(h("a", {
      class:"btn btn-primary",
      href: (progress && progress.chapterId)
        ? `#/read/${meta.id}/${progress.chapterId}`
        : `#/read/${meta.id}/${firstChapterId || ""}`
    }, progress?.chapterId ? "继续阅读上次位置" : "开始阅读"));
    if(progress?.chapterId){
      acts.appendChild(h("a",{class:"btn", href:`#/read/${meta.id}/${firstChapterId}`},"从卷首重读"));
    }
  }else{
    acts.appendChild(h("button",{class:"btn","disabled":"disabled"},"正文待录入"));
  }
  acts.appendChild(h("a",{class:"btn", href:"#/catalog"},"返回书目"));
  info.appendChild(acts);
  // 译文/注释声明
  if(meta.status === "ready"){
    info.appendChild(h("div", { class:"bd-notice" },
      "📜 译文与字词注：采择古注（朱熹《四书章句集注》、王弼《老子注》、十一家《孙子注》等）摘要，兼采现代通行白话释义整理而成，",
      h("strong",{},"仅供学习参考"),
      "。如有疑义请查对原文与权威版本。"
    ));
  }
  head.appendChild(info);
  detail.appendChild(head);

  // 提要
  detail.appendChild(h("div", { class:"bd-toc-section" },
    h("h2", {}, "内容提要"),
    h("div", { style:"padding:0 4px;font-family:var(--kai);font-size:15px;line-height:2;color:var(--fg-soft);" }, meta.intro || "")
  ));
  if(meta.authorBrief){
    detail.appendChild(h("div",{class:"bd-toc-section"},
      h("h2",{},"作者小传"),
      h("div",{style:"padding:0 4px;font-family:var(--kai);font-size:15px;line-height:2;color:var(--fg-soft);"},
        h("strong",{style:"color:var(--fg);"},meta.author + "："), meta.authorBrief)
    ));
  }

  // 最近书签（仅展示该书，支持跳转）
  if(bms.length){
    detail.appendChild(h("div",{class:"bd-toc-section"},
      h("h2",{}, "我的书签（", String(bms.length), "）"),
      ...bms.slice(0, 5).map(bm => {
        const label = bm.label || `${chapterName(bm.chapterId)}${bm.pid?" · 第"+pidNum(bm.pid)+"段":""}`;
        return h("a",{
          class:"bd-ch",
          style:"display:block;border:1px solid var(--line);background:var(--bg-2);margin-bottom:6px;padding:6px 10px;border-radius:4px;cursor:pointer;color:var(--fg-soft);",
          href: `#/read/${meta.id}/${bm.chapterId}${bm.pid?`#${bm.pid}`:""}`
        }, label, " — ", h("small", { style:"color:var(--fg-muted);" }, bm.note || ""));
      })
    ));
  }

  // 目录树
  const sec = h("div", { class:"bd-toc-section" });
  sec.appendChild(h("h2",{},
    "章节目录",
    meta.status === "ready" && toc.length ? h("small",{style:"margin-left:10px;color:var(--fg-muted);font-weight:400;font-size:13px;"},
      `共 ${sumChapters(toc)} 章`) : null
  ));
  if(meta.status !== "ready"){
    sec.appendChild(h("div",{class:"empty-state"},
      h("div",{class:"es-title"},"目录未录入"),
      h("div",{},"该典籍正文与目录将在后续版本中收录。")
    ));
  }else if(!toc.length){
    sec.appendChild(h("div",{class:"empty-state"},"目录加载中…"));
  }else{
    toc.forEach((v, vi) => {
      const volEl = h("div", { class:"bd-volume" + (vi >= 1 ? " collapsed" : "") });
      const head = h("div", { class:"bd-volume-head" },
        h("span", {}, v.name + (v.subtitle ? "　·　" + v.subtitle : "")),
        h("span", {},
          h("span", { class:"vcount" }, (v.chapters||[]).length + " 章"),
          h("span", { class:"chev", style:"display:inline-block;width:14px;height:14px;margin-left:8px;" , "data-icon":"chevron-down" })
        )
      );
      head.addEventListener("click", () => volEl.classList.toggle("collapsed"));
      volEl.appendChild(head);
      const grid = h("div", { class:"bd-chapter-grid" });
      (v.chapters || []).forEach(c => {
        const cls = "bd-ch" +
          (progress?.chapterId === c.id ? " current" : "") +
          (isChapterRead(id, v.id, c.id) ? " read" : "");
        const el = h("a",{ class:cls, href:`#/read/${meta.id}/${c.id}` }, c.title || c.id);
        grid.appendChild(el);
      });
      volEl.appendChild(grid);
      sec.appendChild(volEl);
    });
  }
  detail.appendChild(sec);

  mount.appendChild(detail);
}

function statCell(num, label){
  return h("div",{class:"bd-stat"},
    h("div",{class:"num"}, String(num)),
    h("div",{class:"lbl"}, label)
  );
}
function sumChapters(toc){ return toc.reduce((s,v)=>s + ((v.chapters||[]).length), 0); }
function isChapterRead(){ return false; /* 预留：后续读取进度时可以扩展 */ }
function chapterName(cid){ return cid; }
function pidNum(pid){
  const m = /^p(\d+)/.exec(pid || "");
  return m ? m[1] : "";
}
