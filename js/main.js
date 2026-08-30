/* main.js — 入口：全局初始化 + hash 路由 + 导航菜单 + 主题/偏好应用
 * 视图模块都以 default 函数导出：render(ctx, mountEl)
 */
import * as Store from "./storage.js";
import { getCategoryTree, loadBooksMeta, getBookMeta, searchAll, getFirstChapterId } from "./data.js";

/* ---------- 主题 / 字号 / 字体 注入 ---------- */
const FONT_SIZE_MAP = {
  S:  { px: 16, lh: 1.9 },
  M:  { px: 17.5, lh: 1.9 },
  L:  { px: 19, lh: 1.85 },
  XL: { px: 21, lh: 1.8 }
};
const PARALLEL_BADGE  = { original:"原", translation:"译", "top-bottom":"上下", "left-right":"左右" };
const LAYOUT_BADGE    = { horizontal:"横", vertical:"竖" };

export function applyPreferences(){
  const p = Store.getPref();
  const root = document.documentElement;
  root.setAttribute("data-theme", p.theme);

  const fs = FONT_SIZE_MAP[p.fontSize] || FONT_SIZE_MAP.L;
  root.style.setProperty("--fs", fs.px + "px");
  root.style.setProperty("--lh", fs.lh);

  if(p.fontFamily === "kai"){
    root.style.setProperty("--serif","'STKaiti','KaiTi','Kaiti SC','Noto Serif CJK SC',serif");
  }else{
    root.style.setProperty("--serif","'Noto Serif CJK SC','Source Han Serif SC','Songti SC','SimSun','STSong',serif");
  }

  // 把 parallel/layout 写到 body，便于阅读器拿到最新状态
  document.body.dataset.parallel = p.parallelMode;
  document.body.dataset.layout   = p.layout;
}

/* ---------- 通用工具 ---------- */
export const h = (tag, attrs = {}, ...children) => {
  const el = document.createElement(tag);
  for(const [k,v] of Object.entries(attrs || {})){
    if(k === "class") el.className = v;
    else if(k === "html") el.innerHTML = v;
    else if(k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if(v !== null && v !== undefined && v !== false) el.setAttribute(k, v);
  }
  const append = (c) => {
    if(c == null || c === false) return;
    if(Array.isArray(c)){ c.forEach(append); return; }
    if(typeof c === "string" || typeof c === "number") el.appendChild(document.createTextNode(String(c)));
    else if(c instanceof Node) el.appendChild(c);
  };
  children.forEach(append);
  return el;
};

export function showToast(msg, ms = 2200){
  const wrap = document.getElementById("toast-wrap") || document.body;
  const t = h("div", { class: "toast", role: "status" }, msg);
  wrap.appendChild(t);
  setTimeout(() => t.remove(), ms + 300);
}

function escapeHtml(s){
  return String(s||"").replace(/[&<>"']/g, ch => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[ch]));
}
export { escapeHtml };

/* ---------- 导航菜单 ---------- */
async function initSiteNav(){
  const cat = await getCategoryTree();

  // 四库下拉
  const sikuMenu = document.getElementById("siku-menu");
  if(sikuMenu){
    sikuMenu.innerHTML = "";
    cat.siku.forEach(bu => {
      const grp = h("div", { class:"siku-group" });
      grp.appendChild(h("h4", {}, h("a", { href:`#/catalog/${bu.id}` }, bu.name)));
      (bu.children || []).forEach(lei => {
        if(lei.children && lei.children.length){
          grp.appendChild(h("a", { class:"siku-item", href:`#/catalog/${lei.id}` },
            lei.name + "  …"));
        }else{
          grp.appendChild(h("a", { class:"siku-item", href:`#/catalog/${lei.id}` }, lei.name));
        }
      });
      sikuMenu.appendChild(grp);
    });
  }
  // 朝代下拉
  const dynMenu = document.getElementById("dynasty-menu");
  if(dynMenu){
    dynMenu.innerHTML = "";
    cat.dynasties.forEach(d => dynMenu.appendChild(
      h("a", { href:`#/dynasty/${encodeURIComponent(d)}` }, d)
    ));
  }

  // dropdown 展开/收起
  document.querySelectorAll(".nav-dropdown").forEach(wrap => {
    const btn = wrap.querySelector("button");
    if(!btn) return;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const opened = wrap.classList.toggle("open");
      // 同时关闭其他
      document.querySelectorAll(".nav-dropdown.open").forEach(x => { if(x !== wrap) x.classList.remove("open"); });
      btn.setAttribute("aria-expanded", opened ? "true" : "false");
    });
  });
  document.addEventListener("click", () => {
    document.querySelectorAll(".nav-dropdown.open").forEach(x => x.classList.remove("open"));
  });

  // 移动端菜单展开
  document.getElementById("btn-menu-toggle")?.addEventListener("click", () => {
    document.querySelector(".nav-links")?.classList.toggle("open");
  });

  // 主题按钮：rice -> sepia -> night -> scroll 循环
  const themeOrder = ["rice","sepia","night","scroll"];
  document.getElementById("btn-theme")?.addEventListener("click", () => {
    const cur = Store.getPref("theme") || "rice";
    const next = themeOrder[(themeOrder.indexOf(cur) + 1) % themeOrder.length];
    Store.setPref("theme", next);
    applyPreferences();
    showToast(`主题已切换：${({rice:"宣纸",sepia:"护眼",night:"夜间",scroll:"古卷"})[next]}`);
  });

  // 搜索表单
  document.getElementById("search-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const input = document.getElementById("search-input");
    const q = (input?.value || "").trim();
    if(!q) return;
    location.hash = `#/search?q=${encodeURIComponent(q)}&scope=meta`;
  });

  // 键盘快捷键：Ctrl+/ 聚焦搜索
  document.addEventListener("keydown", (e) => {
    if((e.ctrlKey || e.metaKey) && e.key === "/"){
      e.preventDefault();
      document.getElementById("search-input")?.focus();
    }
  });
}

/* ---------- file:// 启动提示 ---------- */
function renderFileProtocolGuide(){
  const view = document.getElementById("view");
  if(!view) return;
  view.innerHTML = "";
  view.appendChild(h("div", { class:"start-guide" },
    h("h2", {}, "请通过本地 HTTP 服务打开本站"),
    h("p", {}, "本站使用 ES Modules 与 fetch 加载 JSON 数据，浏览器禁止直接双击 index.html（file:// 协议）访问。"),
    h("p", {}, "请在项目目录 ",
      h("code", {}, "d:\\TRAE\\classicBook"),
      " 下执行其中任意一条命令："
    ),
    h("code", {}, "python -m http.server 8080"),
    h("p", {}, "然后访问 ", h("code", {}, "http://localhost:8080/"), "。"),
    h("code", {}, "npx http-server -p 8080 -c-1"),
    h("p", {}, "然后访问 ", h("code", {}, "http://localhost:8080/"), "（需已安装 Node.js）。")
  ));
}

/* ---------- 加载指示器 ---------- */
let loadingCount = 0;
export function showLoading(show){
  const el = document.getElementById("init-loader");
  if(!el) return;
  loadingCount += show ? 1 : -1;
  if(loadingCount <= 0){ loadingCount = 0; el.style.display = "none"; }
  else el.style.display = "flex";
}

/* ---------- hash 路由 ---------- */
const routes = [];
function addRoute(regex, handler){ routes.push({ regex, handler }); }

function parseHash(){
  const raw = location.hash.replace(/^#/, "") || "/";
  // 形如 /search?q=xxx&scope=yyy
  const [pathname, searchStr] = raw.split("?");
  const params = new URLSearchParams(searchStr || "");
  return { pathname: pathname || "/", query: Object.fromEntries(params.entries()) };
}

async function dispatchRoute(){
  showLoading(true);
  document.getElementById("view").innerHTML = `<div style="padding:80px;text-align:center;"><div class="skeleton" style="width:60%;height:24px;margin:0 auto 14px;"></div><div class="skeleton" style="width:80%;height:14px;margin:0 auto 8px;"></div><div class="skeleton" style="width:78%;height:14px;margin:0 auto 8px;"></div></div>`;
  const { pathname, query } = parseHash();
  try{
    for(const r of routes){
      const m = pathname.match(r.regex);
      if(m){
        const ctx = { params: m.slice(1), query, pathname };
        const view = document.getElementById("view");
        view.innerHTML = "";
        // 关闭导航的抽屉 open 状态
        document.querySelector(".nav-links.open")?.classList.remove("open");
        // 跳转时关闭移动端阅读器浮动按钮（非 reader 视图）
        await r.handler(ctx, view);
        view.scrollTop = 0;
        window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
        return;
      }
    }
    // 404 → 首页
    location.hash = "#/";
  }catch(err){
    console.error(err);
    const view = document.getElementById("view");
    view.innerHTML = "";
    view.appendChild(h("div",{class:"empty-state"},
      h("div",{class:"es-title"},"典籍加载失败"),
      h("div",{}, err.message || String(err))
    ));
  }finally{
    showLoading(false);
  }
}

/* ---------- 视图：懒加载 import，拆分独立文件 ---------- */
async function viewHome(ctx, mount){
  const mod = await import("./home.js");
  return mod.default(ctx, mount);
}
async function viewCatalog(ctx, mount){
  const mod = await import("./catalog.js");
  return mod.default(ctx, mount);
}
async function viewBook(ctx, mount){
  const mod = await import("./book.js");
  return mod.default(ctx, mount);
}
async function viewReader(ctx, mount){
  const mod = await import("./reader.js");
  return mod.default(ctx, mount);
}
async function viewSearch(ctx, mount){
  const mod = await import("./search.js");
  return mod.default(ctx, mount);
}

function registerRoutes(){
  // 首页
  addRoute(/^\/?$/, viewHome);
  // 分类 /catalog /catalog/:id
  addRoute(/^\/catalog(?:\/([^/]+))?$/, viewCatalog);
  // 朝代 /dynasty/:name
  addRoute(/^\/dynasty\/([^/]+)$/, viewCatalog);
  // 书籍详情 /book/:id
  addRoute(/^\/book\/([^/]+)$/, viewBook);
  // 阅读 /read/:bookId /read/:bookId/:chapterId
  addRoute(/^\/read\/([^/]+)(?:\/([^/]+))?$/, viewReader);
  // 搜索 /search?q=&scope=
  addRoute(/^\/search$/, viewSearch);
}

/* ---------- 启动 ---------- */
async function bootstrap(){
  // file:// 协议立即提示，不再继续初始化
  if(location.protocol === "file:"){
    renderFileProtocolGuide();
    document.getElementById("init-loader").style.display = "none";
    return;
  }
  try{
    applyPreferences();
    await Promise.all([loadBooksMeta(), initSiteNav()]);
    registerRoutes();
    window.addEventListener("hashchange", dispatchRoute);
    await dispatchRoute();
  }catch(err){
    console.error(err);
    const view = document.getElementById("view");
    if(view) view.innerHTML = `<div class="empty-state"><div class="es-title">初始化失败</div><div>${escapeHtml(err.message || String(err))}</div></div>`;
    document.getElementById("init-loader").style.display = "none";
  }
}

// 导出给 reader.js 等模块使用
export const APP = {
  routes,
  Store,
  applyPreferences,
  FONT_SIZE_MAP,
  PARALLEL_BADGE,
  LAYOUT_BADGE,
  reloadPreferences: () => { applyPreferences(); },
  navigate(hash){ location.hash = hash; }
};
window.__CLASSIC__ = APP;

bootstrap();
