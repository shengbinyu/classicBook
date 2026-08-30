/* home.js — 首页视图
 * 四库巨卡 / 最近阅读 / 朝代时间轴 / 推荐书目
 */
import { h, showToast } from "./main.js";
import { getCategoryTree, listBooks, getBookMeta } from "./data.js";
import * as Store from "./storage.js";

export default async function renderHome(ctx, mount){
  const [cat, booksReadyResp] = await Promise.all([
    getCategoryTree(),
    listBooks({ sort:"default", status:null, pageSize: 50 })
  ]);

  // 推荐书目：ready 的 8 本 + planned 的若干，共 12
  const recommended = booksReadyResp.items.slice(0, 12);

  // 最近阅读
  const recent = Store.allRecentProgress(5);
  const recentWithMeta = [];
  for(const r of recent){
    const meta = await getBookMeta(r.bookId);
    if(meta) recentWithMeta.push({ meta, progress: r });
  }

  // 按朝代收集收录情况（用于时间轴样式）
  const dyHas = new Set(booksReadyResp.items.filter(b => b.status === "ready").map(b => b.dynasty));

  /* ============== 页面骨架 ============== */
  const wrap = h("div", { class:"home-wrap" });

  // 页头标题 + 子标题
  wrap.appendChild(h("div", { class:"page-head" },
    h("div", {},
      h("h1", {}, "典籍阁 · 古人经典在线"),
      h("div", { class:"sub" }, "以四库分类为纲，收录圣贤之书，配以注译，对照而读，横卷皆宜。")
    ),
    h("a", { class:"btn btn-primary", href:"#/catalog" }, "入阁阅览 →")
  ));

  // 四库巨卡
  const sikuGrid = h("div", { class:"siku-grid" });
  const sikuBrief = {
    jing: "《四库全书总目》经部类十：易、书、诗、礼、春秋、孝经、五经总义、四书、乐、小学。",
    shi: "史部类十有五：正史、编年、纪事本末、别史、杂史、诏令奏议、传记、史钞、载记、时令、地理、职官、政书、目录、史评。",
    zi:  "子部类十有四：儒家、兵家、法家、农家、医家、天文算法、术数、艺术、谱录、杂家、类书、小说家、释家、道家。",
    ji:  "集部类五：楚辞、别集、总集、诗文评、词曲。百世之华章，词人之翰藻，皆聚于此。"
  };
  cat.siku.forEach(bu => {
    const buBooks = booksReadyResp.items.filter(b => (b.categoryPath || [])[0] === bu.name);
    const readyCount = buBooks.filter(b => b.status === "ready").length;
    const plannedCount = buBooks.length;
    const dataAttr = bu.id;

    const card = h("div", { class:"siku-card", "data-siku": dataAttr },
      h("div", { class:"siku-vertical" }, bu.name),
      h("div", { class:"siku-foot" },
        h("div", { class:"siku-en" }, "· " + sikuBrief[bu.id]?.slice(0, 22) + " …"),
        h("div", { class:"siku-count" },
          readyCount ? `已入 ${readyCount}` : "",
          plannedCount ? `  共 ${plannedCount} 部` : ""
        )
      )
    );
    card.addEventListener("click", () => location.hash = `#/catalog/${bu.id}`);
    sikuGrid.appendChild(card);
  });
  wrap.appendChild(sikuGrid);

  // 最近阅读
  const recentTitle = h("h2", { class:"section-title" }, "最近阅读");
  wrap.appendChild(recentTitle);
  if(recentWithMeta.length === 0){
    wrap.appendChild(h("div", { class:"empty-state" },
      h("div", { class:"es-title" }, "尚未开卷"),
      h("div", {}, "今日读经一卷，胜却尘事千般。点击下方书目开始阅读 →")
    ));
  }else{
    const row = h("div", { class:"recent-row" });
    for(const { meta, progress } of recentWithMeta){
      const bookChapter = progress.chapterId ? `上次：${chapterHint(meta.id, progress.chapterId)}` : "";
      const percent = (progress.totalChap && progress.index != null)
        ? Math.round((progress.index + 1) / progress.totalChap * 100)
        : null;
      const item = h("a", { class:"recent-item", href: progress.chapterId
        ? `#/read/${meta.id}/${progress.chapterId}`
        : `#/book/${meta.id}` },
        h("div", { class:"recent-cover" }, meta.coverGlyph || "典"),
        h("div", { class:"recent-info" },
          h("div", { class:"recent-title" }, meta.title,
            h("span", { style:"margin-left:8px;color:var(--fg-muted);font-size:12px;font-weight:400;" },
              meta.author + " · " + meta.dynasty)
          ),
          h("div", { class:"recent-chapter" }, bookChapter || (meta.tags?.slice(0,3).join(" · ") || "")),
          h("div", { class:"recent-progress" },
            percent != null ? h("span", { style:`width:${percent}%` }) : h("span", { style:"width:28%" })
          )
        )
      );
      row.appendChild(item);
    }
    wrap.appendChild(row);
  }

  // 朝代时间轴
  wrap.appendChild(h("h2", { class:"section-title" }, "历代典籍一览"));
  const axis = h("div", { class:"dynasty-axis" });
  cat.dynasties.forEach(d => {
    const has = dyHas.has(d);
    const cls = "dy-item" + (has ? " has" : "");
    const el = h("span", { class: cls }, d);
    if(has){
      el.addEventListener("click", () => location.hash = `#/dynasty/${encodeURIComponent(d)}`);
      el.title = `点击查看：${d} 时期的典籍`;
    }
    axis.appendChild(el);
  });
  wrap.appendChild(axis);

  // 推荐区
  wrap.appendChild(h("h2", { class:"section-title" }, "今日推荐 · 八本已入阁"));
  wrap.appendChild(renderBookGrid(recommended));

  mount.appendChild(wrap);
}

function chapterHint(bookId, chapterId){
  // 静态 hint（仅用于最近阅读显示，避免二次请求）
  const m = {
    daxue: "大学", zhongyong:"中庸", lunyu:"论语", mengzi:"孟子",
    daodejing:"道德经", sunzi:"孙子兵法", "zhuangzi-inner":"庄子·内篇", xiaojing:"孝经"
  };
  return `《${m[bookId] || ""}》 ${chapterId.replace(/-/g," ")}`;
}

/* ---------- 书卡网格（可复用） ---------- */
export function renderBookGrid(books){
  const grid = h("div", { class:"book-grid" });
  for(const b of books){
    grid.appendChild(renderBookCard(b));
  }
  return grid;
}

export function renderBookCard(b){
  const planned = b.status !== "ready";
  const cat = (b.categoryPath || [])[0] || "jing";
  const catCls = "cat-" + ({ "经部":"jing","史部":"shi","子部":"zi","集部":"ji" })[cat] || "";
  const card = h("div", {
    class: `book-card ${catCls} ${planned ? "planned" : ""}`,
    title: b.title + " · " + (b.author||"佚名")
  });
  // 左侧朱红书签条上的分类名（取经/史/子/集 首字）
  const firstCat = (b.categoryPath||[])[0] ? (b.categoryPath[0][0]) : "經";
  card.appendChild(h("div", { class:"bc-category" }, firstCat));
  if(planned) card.appendChild(h("span", { class:"planned-tag" }, "后续录入"));
  card.appendChild(h("div", { class:"bc-glyph" }, b.coverGlyph || "典"));
  card.appendChild(h("div", { class:"bc-title" }, b.title));
  card.appendChild(h("div", { class:"bc-author" },
    (b.author || "佚名") + " · " + (b.dynasty || " ")));
  const meta = h("div", { class:"bc-meta" });
  (b.tags || []).slice(0,3).forEach(t => meta.appendChild(h("span", {}, t)));
  if(planned) meta.appendChild(h("span", {}, b.volumes + "卷"));
  else meta.appendChild(
    h("span", {}, b.volumes + "卷 · " + b.chapters + (b.chapters > 1 ? "章" : "章")));
  card.appendChild(meta);
  card.addEventListener("click", () => {
    location.hash = `#/book/${b.id}`;
  });
  return card;
}
