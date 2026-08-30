/* reader.js — 阅读器核心
 * 路由：#/read/:bookId/:chapterId?
 *
 * 负责：
 *  - 克隆 index.html 中的阅读器模板插入视图
 *  - 加载章节 → 调用 parallel.render() 输出正文
 *  - 工具栏交互：prev/next、对照、横竖排、字号、主题、书签、注释旁栏、目录抽屉
 *  - 阅读进度保存（scroll）+ 书签（Ctrl+B）+ 翻章快捷键
 *  - 注释气泡点击展示
 */
import { h, APP, applyPreferences, showToast, escapeHtml } from "./main.js";
import * as Store from "./storage.js";
import {
  getBookMeta, getBookTOC, getChapter, getFirstChapterId,
  getChapterNeighbors, loadBookContent
} from "./data.js";
import { render as renderParallel, positionNotePopover } from "./parallel.js";

/* 对照循环顺序 */
const PARALLEL_ORDER = ["original","top-bottom","left-right","translation"];
const PARALLEL_LABEL = { original:"原文", translation:"译文", "top-bottom":"上下对照", "left-right":"左右对照" };

export default async function renderReader(ctx, mount){
  const bookId = ctx.params[0];
  const meta = await getBookMeta(bookId);
  if(!meta){
    mount.appendChild(h("div",{class:"empty-state"},
      h("div",{class:"es-title"},"未知书籍"),
      h("div",{}, h("a",{href:"#/catalog",class:"btn"},"返回书目"))));
    return;
  }
  if(meta.status !== "ready"){
    mount.appendChild(h("div",{class:"empty-state"},
      h("div",{class:"es-title"},"该典籍正文待录入"),
      h("div",{}, meta.title + " · 后续版本开放全文阅读，敬请期待。"),
      h("div",{style:"margin-top:10px;"}, h("a",{href:`#/book/${bookId}`,class:"btn"},"返回书籍详情"))
    ));
    return;
  }

  // 解析章节
  const firstId = await getFirstChapterId(bookId);
  let chapterId = ctx.params[1] || firstId || null;
  if(!chapterId){
    mount.appendChild(h("div",{class:"empty-state"}, "该书籍尚无章节"));
    return;
  }

  // 克隆阅读器模板，挂入 mount
  const tpl = document.getElementById("tpl-reader");
  if(!tpl){ mount.textContent = "模板缺失"; return; }
  const shell = tpl.content.firstElementChild.cloneNode(true);
  mount.appendChild(shell);

  /* ------- 元素引用 ------- */
  const body            = shell.querySelector("#reader-body");
  const toolbar         = shell.querySelector("#reader-toolbar");
  const chapterLabel    = shell.querySelector("#reader-chapter-label");
  const tocDrawer       = shell.querySelector("#reader-toc-drawer");
  const noteAside       = shell.querySelector("#reader-note-aside");
  const noteList        = shell.querySelector("#reader-note-list");
  const popover         = shell.querySelector("#reader-note-popover");
  const bookmarkDrawer  = shell.querySelector("#reader-bookmark-drawer");
  const bookmarkList    = shell.querySelector("#bookmark-list");
  const parallelBadge   = shell.querySelector("#tb-parallel-badge");
  const layoutBadge     = shell.querySelector("#tb-layout-badge");
  const floatPrev       = shell.querySelectorAll(".float-btn[data-action='prev']")[0];
  const floatNext       = shell.querySelectorAll(".float-btn[data-action='next']")[1];

  // 竖排 & 朱丝栏兼容
  const supportsVertical = window.CSS && CSS.supports &&
    (CSS.supports("writing-mode","vertical-rl") && CSS.supports("text-orientation","upright"));
  const prefersVertical = !!Store.getPref("layout") && Store.getPref("layout") === "vertical";
  if(prefersVertical && !supportsVertical){
    Store.setPref("layout","horizontal");
    showToast("当前浏览器对竖排支持有限，已自动切换横排");
  }

  /* ------- 同步偏好到 class ------- */
  const prefs = Store.getPref();
  applyBodyClasses();
  applyParallelBadges();
  // 旁栏开关
  if(prefs.noteAsideOpen) noteAside.hidden = false;

  /* ------- 章节载入（每次换章调用） ------- */
  let state = {
    book: meta,
    bookId, chapterId,
    toc: null,
    chapter: null,
    volume: null,
    volumeIndex: 0,
    chapterIndex: 0,
    noteList: []
  };
  await loadChapter();
  await renderTOCDrawer();
  renderBookmarks();
  // 保险：书签抽屉默认必关（克隆模板时 hidden 属性有时被 CSS/display:flex 覆盖，强制兜底）
  bookmarkDrawer.hidden = true;

  /* ------- 工具栏事件 ------- */
  toolbar.addEventListener("click", onToolbarAction);
  shell.querySelector(".reader-float")?.addEventListener("click",(e)=>{
    const a = e.target.closest("a.float-btn");
    if(!a) return;
    if(a.dataset.action === "prev") goPrev();
    if(a.dataset.action === "next") goNext();
  });
  bookmarkDrawer.addEventListener("click", (e) => {
    // 捕获阶段之前先处理：关闭按钮无论点到按钮本体还是里面的 span 图标，一律生效
    if(e.target.closest("[data-action='close-bookmark']")){
      e.preventDefault();
      e.stopPropagation();
      bookmarkDrawer.hidden = true;
      return;
    }
    const del = e.target.closest(".bm-del");
    if(del){
      e.stopPropagation();
      const id = del.closest(".bm-item")?.dataset.id;
      if(id){ Store.removeBookmark(id); showToast("书签已删除"); renderBookmarks(); }
      return;
    }
    const it = e.target.closest(".bm-item");
    if(it){
      const cid = it.dataset.chapter;
      const pid = it.dataset.pid || null;
      if(cid) goChapter(cid, pid);
      bookmarkDrawer.hidden = true;
    }
  });

  /* ------- 注释点击气泡 + 旁栏联动 ------- */
  body.addEventListener("click", (e) => {
    const mark = e.target.closest(".note-mark");
    if(mark){
      const idx = Number(mark.dataset.noteIdx);
      const info = state.noteList[idx];
      if(!info) return;
      showPopover(info, mark);
      // 旁栏高亮
      noteList.querySelectorAll(".note-item").forEach(el => el.classList.toggle("active", el.dataset.idx == idx));
      // 滚动旁栏到对应条目
      const asideItem = noteList.querySelector(`.note-item[data-idx="${idx}"]`);
      if(asideItem) asideItem.scrollIntoView({ behavior:"smooth", block:"nearest" });
      return;
    }
    // 点击段落其它位置 → 关闭气泡
    hidePopover();
  });
  noteAside.addEventListener("click", (e) => {
    const item = e.target.closest(".note-item");
    if(!item) return;
    const idx = Number(item.dataset.idx);
    const info = state.noteList[idx];
    if(!info) return;
    // 找到对应段落和注释 mark，滚动过去并高亮
    const para = body.querySelector(`.para-block[data-pid="${info.pid}"]`);
    if(para){
      para.classList.add("highlight");
      setTimeout(() => para.classList.remove("highlight"), 2500);
      scrollParaIntoView(para);
      const m = para.querySelector(`.note-mark[data-note-idx="${idx}"]`);
      if(m) showPopover(info, m);
    }
  });
  // 滚动时/空白点击 → 关闭气泡
  window.addEventListener("click", (e) => {
    if(e.target.closest("#reader-note-popover") || e.target.closest(".note-mark")) return;
    hidePopover();
  }, true);

  /* ------- 快捷键 ------- */
  window.addEventListener("keydown", readerKeydown);

  /* ------- 进度保存（debounce） ------- */
  let saveTimer = null;
  const saveScroll = () => {
    if(saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const horizontal = Store.getPref("layout") !== "vertical";
      const pos = horizontal
        ? { scrollTop: window.scrollY || document.documentElement.scrollTop }
        : { scrollLeft: body.scrollLeft };
      // 章节总数 / 当前章节在全书中的顺序（用于进度条）
      storeProgress(pos);
    }, 500);
  };
  window.addEventListener("scroll", saveScroll, { passive:true });
  body.addEventListener("scroll", saveScroll, { passive:true });
  // hashchange 时销毁监听器
  window.addEventListener("hashchange", () => {
    window.removeEventListener("keydown", readerKeydown);
    window.removeEventListener("scroll", saveScroll);
  }, { once: true });

  /* ------- 阅读器视图卸载清理（切换路由时） ------- */
  // 采用简单的 hashchange once，因为我们是 SPA 单页模式
  const oldScrollX = body.scrollLeft;

  /* ================================================================
   * 内部方法
   * ================================================================ */
  function readerKeydown(e){
    if(e.target && /input|textarea|select/i.test(e.target.tagName)) return;
    // Esc：关闭已开的抽屉 / 气泡
    if(e.key === "Escape"){
      let changed = false;
      if(bookmarkDrawer && !bookmarkDrawer.hidden){ bookmarkDrawer.hidden = true; changed = true; }
      if(popover && !popover.hidden){ hidePopover(); changed = true; }
      if(noteAside && !noteAside.hidden){ noteAside.hidden = true; changed = true; }
      if(changed){ e.preventDefault(); return; }
    }
    // ← / → 翻章（注意：输入法编辑时不拦截）
    if(e.key === "ArrowRight" && !e.ctrlKey && !e.metaKey && !e.altKey){
      e.preventDefault(); goNext();
    }else if(e.key === "ArrowLeft" && !e.ctrlKey && !e.metaKey && !e.altKey){
      e.preventDefault(); goPrev();
    }else if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b"){
      e.preventDefault(); addBookmarkHere();
    }
  }

  async function loadChapter(){
    const chInfo = await getChapter(bookId, chapterId);
    const neighbors = await getChapterNeighbors(bookId, chapterId);
    if(!chInfo || chInfo.flatIndex === -1 || !chInfo.chapter){
      // 不存在：回退第一章
      const fid = await getFirstChapterId(bookId);
      if(fid && fid !== chapterId){ chapterId = fid; return loadChapter(); }
      body.innerHTML = `<div class="empty-state">章节加载失败</div>`;
      return;
    }
    state.chapter = chInfo.chapter;
    state.volume = chInfo.volume;
    state.volumeIndex = chInfo.volumeIndex;
    state.chapterIndex = chInfo.chapterIndex;

    // 清空正文
    body.innerHTML = "";
    // 标题
    const header = document.createElement("header");
    header.className = "reader-header";
    header.innerHTML =
      `<div class="book">${escapeHtml(meta.title)} · ${escapeHtml(state.volume.name || "")}</div>` +
      `<h1 class="chapter">${escapeHtml(state.chapter.title || state.chapter.id)}</h1>`;
    body.appendChild(header);

    // 正文
    const paras = state.chapter.paragraphs || [];
    const parallelMode = Store.getPref("parallelMode") || "original";
    const rendered = renderParallel(paras, parallelMode, true);
    state.noteList = rendered.noteList;
    body.appendChild(rendered.fragment);

    // 工具栏章节标签
    chapterLabel.textContent = `${state.chapter.title || state.chapter.id}（${neighbors.index + 1}/${neighbors.total}）`;

    // 浮动按钮状态
    toolbar.querySelectorAll("[data-action='prev']").forEach(b => b.classList.toggle("disabled", !neighbors.prev));
    toolbar.querySelectorAll("[data-action='next']").forEach(b => b.classList.toggle("disabled", !neighbors.next));
    if(floatPrev) floatPrev.disabled = !neighbors.prev;
    if(floatNext) floatNext.disabled = !neighbors.next;

    // 旁栏汇览
    renderNoteAside();

    // 目录抽屉高亮
    tocDrawer?.querySelectorAll(".toc-chapter").forEach(el => {
      el.classList.toggle("active", el.dataset.cid === chapterId);
    });

    // 恢复滚动位置
    restoreScroll();

    // 更新 URL hash（防止用户从 bookId 仅指定书时进入，URL 缺少章节）
    if(location.hash !== `#/read/${bookId}/${chapterId}`){
      history.replaceState(null, "", `#/read/${bookId}/${chapterId}`);
    }

    // 保存章节级进度
    Store.setProgress(bookId, {
      chapterId,
      index: neighbors.index,
      totalChap: neighbors.total
    });
  }

  async function renderTOCDrawer(){
    const toc = await getBookTOC(bookId);
    state.toc = toc;
    if(!tocDrawer) return;
    tocDrawer.innerHTML = "";
    tocDrawer.appendChild(h("h4", {}, state.book.title));
    toc.forEach((v, vi) => {
      const g = h("div", { class: "toc-vol" + (vi === state.volumeIndex ? "" : " collapsed") });
      const head = h("div", { class: "toc-vol-title" },
        h("span",{},`${v.name}${v.subtitle ? " · " + v.subtitle : ""}`),
        h("span",{},`${v.chapters.length}章 `,
          h("span", { class:"chev" , "data-icon":"chevron-down" })
        )
      );
      head.addEventListener("click", () => g.classList.toggle("collapsed"));
      g.appendChild(head);
      const list = h("div", { class:"toc-vol-list" });
      (v.chapters || []).forEach(c => {
        const a = h("a", { class:"toc-chapter" + (c.id === chapterId ? " active" : ""),
          "data-cid": c.id }, c.title || c.id);
        a.addEventListener("click", (e) => {
          e.preventDefault();
          goChapter(c.id);
        });
        list.appendChild(a);
      });
      g.appendChild(list);
      tocDrawer.appendChild(g);
    });
  }

  function renderNoteAside(){
    if(!noteList) return;
    noteList.innerHTML = "";
    if(!state.noteList.length){
      noteList.appendChild(h("div",{style:"color:var(--fg-muted);font-family:var(--kai);font-size:13px;padding:6px 4px;"},"本章无注释"));
      return;
    }
    state.noteList.forEach(n => {
      const el = h("div", { class:"note-item", "data-idx": String(n.idx) },
        h("span",{class:"ref"}, n.numeral + " " + n.ref),
        h("div",{class:"txt"}, n.note)
      );
      noteList.appendChild(el);
    });
  }

  function renderBookmarks(){
    if(!bookmarkList) return;
    const all = Store.listBookmarks();
    const mine = all.filter(b => b.bookId === bookId);
    bookmarkList.innerHTML = "";
    if(!mine.length){
      bookmarkList.appendChild(h("div",{class:"bm-empty"},"本书暂无书签。阅读时按 Ctrl+B 快速添加书签，或点击工具栏「★」图标。"));
      return;
    }
    mine.forEach(bm => {
      const title = bm.label || (findChapterNameById(bm.chapterId) || bm.chapterId);
      const when = new Date(bm.createdAt).toLocaleString("zh-CN");
      const el = h("div",{class:"bm-item","data-id":bm.id,"data-chapter":bm.chapterId,"data-pid":bm.pid||""},
        h("div",{class:"bm-head"},
          h("span",{class:"bm-book"}, escapeHtml(state.book.title) + " · " + escapeHtml(title)),
          h("button",{class:"bm-del", title:"删除"}, "✕")
        ),
        bm.note ? h("div",{class:"bm-note"}, escapeHtml(bm.note)) : null,
        h("div",{class:"bm-time"}, when)
      );
      bookmarkList.appendChild(el);
    });
  }

  function findChapterNameById(cid){
    if(!state.toc) return null;
    for(const v of state.toc){
      const c = (v.chapters || []).find(x => x.id === cid);
      if(c) return `${v.name} · ${c.title}`;
    }
    return null;
  }

  /* ------- 工具栏动作 ------- */
  async function onToolbarAction(e){
    const a = e.target.closest("[data-action]");
    if(!a) return;
    const act = a.dataset.action;
    if(act === "prev") goPrev();
    else if(act === "next") goNext();
    else if(act === "toc"){
      if(tocDrawer){
        // 响应式：≤1023 用 .open 覆盖层；桌面用侧栏一直显示，这里做显示/隐藏切换
        if(window.innerWidth < 1024){
          tocDrawer.classList.toggle("open");
        }else{
          // 桌面：通过 grid 列宽 0 实现快速隐藏
          const wrap = shell.querySelector(".reader-body-wrap");
          wrap.style.gridTemplateColumns = tocDrawer.dataset.toggled === "1"
            ? "240px minmax(0,1fr) auto" : "0 minmax(0,1fr) auto";
          tocDrawer.style.overflow = tocDrawer.dataset.toggled === "1" ? "auto" : "hidden";
          tocDrawer.dataset.toggled = tocDrawer.dataset.toggled === "1" ? "0" : "1";
        }
      }
    }
    else if(act === "bookmark-list"){
      renderBookmarks();
      bookmarkDrawer.hidden = !bookmarkDrawer.hidden;
    }
    else if(act === "add-bookmark") addBookmarkHere();
    else if(act === "parallel"){
      const cur = Store.getPref("parallelMode") || "original";
      const next = PARALLEL_ORDER[(PARALLEL_ORDER.indexOf(cur)+1) % PARALLEL_ORDER.length];
      Store.setPref("parallelMode", next);
      applyBodyClasses();
      applyParallelBadges();
      // 重新渲染正文（保留滚动）
      const h_ = window.scrollY;
      const hz_ = body.scrollLeft;
      reRenderParagraphs();
      setTimeout(() => { window.scrollTo(0,h_); body.scrollLeft = hz_; }, 0);
      showToast("对照模式：" + PARALLEL_LABEL[next]);
    }
    else if(act === "layout"){
      const cur = Store.getPref("layout") || "horizontal";
      const next = cur === "horizontal" ? "vertical" : "horizontal";
      if(next === "vertical" && !supportsVertical){
        showToast("当前浏览器不支持竖排 CSS，已保留横排");
        return;
      }
      Store.setPref("layout", next);
      applyBodyClasses();
      applyParallelBadges();
      showToast(next === "vertical" ? "已切换为竖排阅读" : "已切换为横排阅读");
    }
    else if(act === "font-inc" || act === "font-dec"){
      const ORDER = ["S","M","L","XL"];
      const cur = Store.getPref("fontSize") || "L";
      const i = ORDER.indexOf(cur);
      const next = ORDER[Math.max(0, Math.min(ORDER.length-1, i + (act === "font-inc" ? 1 : -1)))];
      if(next === cur){ showToast("已是" + (act==="font-inc"?"最大":"最小") + "字号"); return; }
      Store.setPref("fontSize", next);
      APP.reloadPreferences();
      showToast(`字号 ${next}`);
    }
    else if(act === "note-aside"){
      noteAside.hidden = !noteAside.hidden;
      Store.setPref("noteAsideOpen", !noteAside.hidden);
      showToast(noteAside.hidden ? "已关闭注释旁栏" : "已打开本页注释汇览");
    }
  }

  function applyBodyClasses(){
    const p = Store.getPref();
    // 横/竖排
    body.classList.remove("layout-horizontal","layout-vertical");
    body.classList.add("layout-" + p.layout);
    // 对照
    body.classList.remove("parallel-original","parallel-translation","parallel-top-bottom","parallel-left-right");
    body.classList.add("parallel-" + p.parallelMode);
    // 朱丝栏（仅竖排 + 偏好开启）
    body.classList.toggle("zhusilan", p.layout === "vertical" && !!p.zhuSiLan);
  }
  function applyParallelBadges(){
    const p = Store.getPref();
    if(parallelBadge) parallelBadge.textContent = ({original:"原",translation:"译","top-bottom":"上/下","left-right":"左/右"})[p.parallelMode] || "原";
    if(layoutBadge) layoutBadge.textContent = p.layout === "vertical" ? "竖" : "横";
  }

  function reRenderParagraphs(){
    // 移除正文段落（保留 header）
    Array.from(body.querySelectorAll(".para-block")).forEach(n => n.remove());
    const p = Store.getPref();
    const rendered = renderParallel(state.chapter.paragraphs || [], p.parallelMode, true);
    state.noteList = rendered.noteList;
    body.appendChild(rendered.fragment);
    renderNoteAside();
  }

  /* ------- 翻章 ------- */
  async function goPrev(){
    const n = await getChapterNeighbors(bookId, chapterId);
    if(!n.prev){ showToast("已是卷首"); return; }
    goChapter(n.prev.id);
  }
  async function goNext(){
    const n = await getChapterNeighbors(bookId, chapterId);
    if(!n.next){ showToast("已是卷末"); return; }
    goChapter(n.next.id);
  }
  function goChapter(cid, pid){
    chapterId = cid;
    location.hash = `#/read/${bookId}/${cid}${pid ? "#" + pid : ""}`;
  }

  /* ------- 书签 ------- */
  function addBookmarkHere(){
    // 找当前可视的第一段落作为锚点
    const first = findFirstVisiblePid();
    const label = `${state.volume?.name || ""} · ${state.chapter?.title || state.chapter.id}`;
    const added = Store.addBookmark({
      bookId, chapterId, pid: first, label
    });
    showToast(`已添加书签「${label}${first?` · ${first}`:""}」`);
    renderBookmarks();
  }
  function findFirstVisiblePid(){
    const arr = Array.from(body.querySelectorAll(".para-block"));
    if(!arr.length) return null;
    for(const el of arr){
      const r = el.getBoundingClientRect();
      if(r.bottom > 120) return el.dataset.pid || null;
    }
    return arr[0].dataset.pid || null;
  }

  /* ------- Popover ------- */
  function showPopover(info, anchor){
    if(!popover) return;
    popover.hidden = false;
    popover.innerHTML =
      `<div class="hd">${info.numeral}　${escapeHtml(info.ref)}</div>` +
      `<div class="bd">${escapeHtml(info.note)}</div>`;
    positionNotePopover(popover, anchor);
  }
  function hidePopover(){
    if(popover) popover.hidden = true;
  }

  /* ------- 滚动恢复/保存 ------- */
  function storeProgress(extra){
    Store.setProgress(bookId, Object.assign({ chapterId }, extra || {}));
  }
  function restoreScroll(){
    // hash 里有 pid 就滚到该段
    const hashPid = (location.hash.split("#").pop().trim());
    let targetPid = null;
    if(hashPid && /^p\d+/.test(hashPid)) targetPid = hashPid;
    const prog = Store.getProgress(bookId);
    const horizontal = Store.getPref("layout") !== "vertical";

    // 先滚到段（如果有 pid）
    if(targetPid){
      const para = body.querySelector(`.para-block[data-pid="${targetPid}"]`);
      if(para) { scrollParaIntoView(para); return; }
    }
    if(prog?.chapterId === chapterId){
      requestAnimationFrame(() => {
        if(horizontal){
          window.scrollTo(0, prog.scrollTop || 0);
        }else{
          body.scrollLeft = prog.scrollLeft || 0;
        }
      });
    }else{
      // 章节变化：滚到顶部
      if(horizontal) window.scrollTo({ top: 0, behavior:"instant" });
      else { body.scrollLeft = 0; }
    }
  }
  function scrollParaIntoView(para){
    const horizontal = Store.getPref("layout") !== "vertical";
    if(horizontal){
      const top = para.getBoundingClientRect().top + window.scrollY - 100;
      window.scrollTo({ top, behavior:"smooth" });
    }else{
      // 竖排：按横向滚动左
      const left = para.getBoundingClientRect().left + body.scrollLeft - 80;
      body.scrollTo({ left, behavior:"smooth" });
    }
  }
}
