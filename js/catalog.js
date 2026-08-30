/* catalog.js — 分类浏览视图
 *  /catalog  /catalog/:id  /dynasty/:name
 *  左侧分类树 + 顶部筛选条 + 书卡网格
 */
import { h, escapeHtml } from "./main.js";
import { getCategoryTree, listBooks } from "./data.js";
import { renderBookGrid } from "./home.js";

const PAGE_SIZE = 24;

export default async function renderCatalog(ctx, mount){
  const [cat, initialResp] = await Promise.all([
    getCategoryTree(),
    listBooks({ page: 1, pageSize: PAGE_SIZE })
  ]);

  // 当前激活项（从路径）
  const rawId = ctx.params?.[0] || null;
  const pathname = ctx.pathname || "";
  const isDynasty = pathname.startsWith("/dynasty/");
  const initDynasty = isDynasty ? decodeURIComponent(rawId || "") : null;
  const initCat = !isDynasty ? rawId : null;

  const state = {
    category: initCat,
    dynasty: initDynasty,
    author: null,
    genre: null,
    keyword: null,
    status: null,
    page: 1,
    pageSize: PAGE_SIZE
  };

  /* ========== 布局 ========== */
  const layout = h("div", { class:"catalog-layout" });

  // 左侧分类树
  const aside = buildCategoryTree(cat, state, () => {
    state.page = 1;
    refresh();
  });
  layout.appendChild(aside);

  // 右侧：标题 + 筛选条 + 结果
  const right = h("div");
  const head = h("div", { class:"page-head" },
    h("div", {},
      h("h1", {}, buildPageTitle(state, cat)),
      h("div", { class:"sub" }, "筛选结果：",
        h("span", { id:"rs-total" }, String(initialResp.total)))
    ),
    h("div", { class:"btn-group", style:"display:flex;gap:8px;" },
      h("button", { class:"btn", id:"btn-status-ready", "data-status":"ready" }, "已收录"),
      h("button", { class:"btn", id:"btn-status-all", "data-status":"" }, "全部书目")
    )
  );
  right.appendChild(head);

  // 筛选条
  const filterBar = h("div", { class:"filter-bar" });
  // 朝代
  const dyRow = h("div", { class:"filter-row" },
    h("span", { class:"filter-label" }, "朝代"),
    h("span", { class:"chip", "data-dy": "" }, "不限")
  );
  cat.dynasties.forEach(d => dyRow.appendChild(h("span", { class:"chip", "data-dy": d }, d)));
  filterBar.appendChild(dyRow);
  // 状态：ready/planned
  const stRow = h("div", { class:"filter-row" },
    h("span", { class:"filter-label" }, "收录"),
    h("span", { class:"chip active", "data-st": "" }, "全部"),
    h("span", { class:"chip", "data-st": "ready" }, "已收录"),
    h("span", { class:"chip", "data-st": "planned" }, "后续录入")
  );
  filterBar.appendChild(stRow);
  // 标签 chip（从全部书的 genre/tags 中取常见）
  const genreRow = h("div", { class:"filter-row" },
    h("span", { class:"filter-label" }, "体裁")
  );
  const genres = ["四书","五经","语录","诸子","哲理","兵书","诗歌","散文","史传","经解"];
  genreRow.appendChild(h("span", { class:"chip", "data-ge": "" }, "不限"));
  genres.forEach(g => genreRow.appendChild(h("span", { class:"chip", "data-ge": g }, g)));
  filterBar.appendChild(genreRow);
  right.appendChild(filterBar);

  // 结果网格 + 分页
  const resultBox = h("div", { id:"result-box" });
  resultBox.appendChild(renderBookGrid(initialResp.items));
  right.appendChild(resultBox);

  const pagerWrap = h("div", { id:"pager-wrap", style:"margin-top:20px;" });
  pagerWrap.appendChild(buildPager(initialResp));
  right.appendChild(pagerWrap);

  layout.appendChild(right);
  mount.appendChild(layout);

  /* ========== 事件绑定 ========== */
  // chip: 朝代
  dyRow.querySelectorAll(".chip").forEach(ch => {
    ch.addEventListener("click", () => {
      const v = ch.dataset.dy || null;
      state.dynasty = v;
      state.page = 1;
      markChipActive(dyRow, ch);
      refresh();
    });
    if((ch.dataset.dy || "") === (state.dynasty || "")) ch.classList.add("active");
  });
  // chip: 收录状态
  stRow.querySelectorAll(".chip").forEach(ch => {
    ch.addEventListener("click", () => {
      const v = ch.dataset.st || null;
      state.status = v;
      state.page = 1;
      markChipActive(stRow, ch);
      refresh();
    });
    if((ch.dataset.st || "") === (state.status || "")) ch.classList.add("active");
  });
  // chip: 体裁
  genreRow.querySelectorAll(".chip").forEach(ch => {
    ch.addEventListener("click", () => {
      const v = ch.dataset.ge || null;
      state.genre = v;
      state.page = 1;
      markChipActive(genreRow, ch);
      refresh();
    });
  });
  // 顶部按钮：状态快捷
  right.querySelector("#btn-status-ready").addEventListener("click", () => {
    state.status = "ready"; state.page = 1;
    syncChipByVal(stRow, "ready");
    refresh();
  });
  right.querySelector("#btn-status-all").addEventListener("click", () => {
    state.status = null; state.page = 1;
    syncChipByVal(stRow, "");
    refresh();
  });

  // 初始同步顶部快捷按钮
  if(state.status === "ready") syncChipByVal(stRow, "ready");

  /* ========== 刷新 ========== */
  async function refresh(){
    resultBox.innerHTML = `<div class="skeleton" style="height:260px;margin-bottom:12px;"></div><div class="book-grid"></div>`;
    const resp = await listBooks({ ...state });
    document.getElementById("rs-total").textContent = String(resp.total);
    resultBox.innerHTML = "";
    if(resp.total === 0){
      resultBox.appendChild(h("div", { class:"empty-state" },
        h("div", { class:"es-title" }, "未有匹配"),
        h("div", {}, "试试放宽筛选条件，或更换朝代、分类。")
      ));
    }else{
      resultBox.appendChild(renderBookGrid(resp.items));
    }
    pagerWrap.innerHTML = "";
    pagerWrap.appendChild(buildPager(resp));
    // 绑定分页
    pagerWrap.querySelectorAll("button[data-page]").forEach(btn => {
      btn.addEventListener("click", () => {
        state.page = Number(btn.dataset.page);
        refresh();
        window.scrollTo({ top: mount.offsetTop - 80, behavior:"smooth" });
      });
    });
  }
}

function markChipActive(rowEl, chipEl){
  rowEl.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
  chipEl.classList.add("active");
}
function syncChipByVal(rowEl, val){
  rowEl.querySelectorAll(".chip").forEach(c => {
    c.classList.toggle("active", (c.dataset.dy ?? c.dataset.st ?? c.dataset.ge ?? "") === (val || ""));
  });
}

function buildPageTitle(state, cat){
  const parts = [];
  if(state.category){
    parts.push(findCategoryLabel(cat, state.category) || state.category);
  }
  if(state.dynasty){
    parts.push(state.dynasty);
  }
  if(state.genre){
    parts.push(state.genre);
  }
  return parts.length ? parts.join(" · ") : "全目总览";
}

function findCategoryLabel(cat, id){
  // 在 categories.json 中按 id 找
  const siku = cat.siku || [];
  // 深度优先
  const stack = siku.slice();
  while(stack.length){
    const n = stack.shift();
    if(n.id === id) return n.name;
    (n.children||[]).forEach(x => stack.unshift(x));
  }
  // 按 name 包含匹配
  for(const b of siku){
    if(id === b.id || b.name.includes(id)) return b.name;
    for(const c of (b.children||[])){
      if(c.id === id || c.name.includes(id)) return c.name;
      for(const d of (c.children||[])){
        if(d.id === id || d.name.includes(id)) return d.name;
      }
    }
  }
  return null;
}

/* ---------- 分类树 ---------- */
function buildCategoryTree(cat, state, onChange){
  const wrap = h("aside", { class:"category-tree" },
    h("h3", {}, "四库分类"),
    h("span", { class:"ct-sub", style:"display:inline-block;margin-bottom:8px;" }, "全部书目")
  );
  wrap.querySelector(".ct-sub").addEventListener("click", () => {
    state.category = null;
    markSubActive(wrap, null);
    onChange();
  });
  if(!state.category) markSubActive(wrap, null, true);

  for(const bu of cat.siku){
    const hasSubSub = (bu.children || []).some(c => c.children && c.children.length);
    const grp = h("div", { class:"ct-group" + (hasSubSub ? "" : " collapsed") });
    const label = h("div", { class:"ct-label" },
      h("span", {}, bu.name, h("span", { class:"ct-count", style:"margin-left:6px;" }, countBuBooks(bu, cat))),
      h("span", { class:"chev", "data-icon":"chevron-down" })
    );
    label.addEventListener("click", (e) => {
      // 点大类：同时激活该分类 + 展开
      state.category = bu.id;
      onChange();
      // 展开/收起
      if(e.offsetX > label.clientWidth - 26){
        // 点了右侧 chevron 区域，只做折叠
      }
      grp.classList.toggle("collapsed");
    });
    grp.appendChild(label);

    const children = h("div", { class:"ct-children" });
    (bu.children || []).forEach(lei => {
      const sub = h("a", { class:"ct-sub", href:"#/catalog/" + lei.id }, lei.name);
      sub.addEventListener("click", (e) => {
        e.preventDefault();
        state.category = lei.id;
        onChange();
        location.hash = `#/catalog/${lei.id}`;
        markSubActive(wrap, lei.id);
      });
      children.appendChild(sub);
      if(state.category === lei.id) sub.classList.add("active");

      // 三级
      (lei.children || []).forEach(shu => {
        const s3 = h("a", { class:"ct-sub3" }, shu.name);
        s3.addEventListener("click", (e) => {
          e.preventDefault();
          state.category = shu.name; // 用名字作为 category 筛选
          onChange();
          markSubActive(wrap, shu.name, true);
        });
        children.appendChild(s3);
        if(state.category === shu.name){
          s3.style.color = "var(--cinnabar)";
          s3.style.fontWeight = "700";
        }
      });
    });
    grp.appendChild(children);
    if(state.category === bu.id){
      grp.classList.remove("collapsed");
    }
    wrap.appendChild(grp);
  }
  return wrap;
}

function countBuBooks(bu){
  // 近似：categories 内部计数，不精确也不影响展示
  const flat = [];
  (bu.children||[]).forEach(c => { flat.push(c.name); (c.children||[]).forEach(cc => flat.push(cc.name)); });
  return "";
}

function markSubActive(wrap, valueOrId, deep3){
  wrap.querySelectorAll(".ct-sub").forEach(el => el.classList.remove("active"));
  // 「全部书目」条目：没有 data-id，使用 null 匹配
  if(valueOrId == null){
    // 找第一个 .ct-sub（不是子分类）
    const allLink = wrap.querySelector(".ct-sub");
    if(allLink && allLink.textContent.trim().includes("全部书目")) allLink.classList.add("active");
  }
}

/* ---------- 分页 ---------- */
function buildPager(resp){
  const { totalPages, page, total } = resp;
  const wrap = h("div", { class:"pager" });
  const prev = h("button", { disabled: page <= 1 ? "disabled" : null, "data-page": String(page-1) }, "上一页");
  wrap.appendChild(prev);
  const pages = buildPageList(page, totalPages);
  for(const p of pages){
    if(p === "..."){
      wrap.appendChild(h("button", { disabled:"disabled" }, "…"));
    }else{
      const cls = (p === page) ? "active" : "";
      wrap.appendChild(h("button", { "data-page": String(p), class: cls }, String(p)));
    }
  }
  const next = h("button", { disabled: page >= totalPages ? "disabled" : null, "data-page": String(page+1) }, "下一页");
  wrap.appendChild(next);
  wrap.appendChild(h("span", { style:"color:var(--fg-muted);margin-left:10px;font-family:var(--kai);font-size:12px;align-self:center;" },
    `共 ${total} 条 / ${totalPages} 页`));
  return wrap;
}
function buildPageList(cur, total){
  if(total <= 7) return Array.from({length: total}, (_, i) => i+1);
  const list = [1];
  const s = Math.max(2, cur - 1);
  const e = Math.min(total-1, cur + 1);
  if(s > 2) list.push("...");
  for(let i = s; i <= e; i++) list.push(i);
  if(e < total-1) list.push("...");
  list.push(total);
  return list;
}
