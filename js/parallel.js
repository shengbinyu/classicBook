/* parallel.js — 对照阅读渲染引擎
 * 四种模式：
 *   original        仅原文
 *   translation     仅译文
 *   top-bottom      上下叠加 原文→译文
 *   left-right      左右双栏 原文 | 译文
 *
 * 输入 paragraphs[] 形如：
 *   { pid, original, translation, notes:[{pos,len,ref,note}] }
 *
 * 返回 { frag: DocumentFragment, bind(ctx) }
 *   bind 用于让调用者（reader.js）注入注释点击回调与旁栏内容。
 *
 * 输出 DOM：
 *   每个段落为 <div class="para-block" data-pid=xxx>
 *     原文段落 <p class="para-original">（含 <sup class="note-mark"> 注释标记）
 *     译文段落 <p class="para-translation">
 */
import { h, escapeHtml } from "./main.js";

const NUMERAL = ["①","②","③","④","⑤","⑥","⑦","⑧","⑨","⑩","⑪","⑫","⑬","⑭","⑮","⑯","⑰","⑱","⑲","⑳",
                 "㉑","㉒","㉓","㉔","㉕","㉆","㉇","㉈","㉉","㉊","㉋","㉌","㉍","㉎","㉏"];

/**
 * @param {Array} paragraphs
 * @param {string} mode  parallel mode: original/translation/top-bottom/left-right
 * @param {boolean} showNotes 是否显示内联注释标记
 */
export function render(paragraphs, mode = "original", showNotes = true){
  const frag = document.createDocumentFragment();
  const noteList = [];  // 本页所有注释汇览，按段落顺序输出

  for(let i = 0; i < paragraphs.length; i++){
    const p = paragraphs[i];
    if(!p) continue;
    const block = document.createElement("div");
    block.className = "para-block";
    block.dataset.pid = p.pid || ("p" + (i+1));

    // 原文段（含注标记）
    const origEl = document.createElement("p");
    origEl.className = "para-original";
    origEl.innerHTML = renderOriginalWithNotes(p, showNotes, noteList);

    // 译文段
    const transEl = document.createElement("p");
    transEl.className = "para-translation";
    transEl.textContent = p.translation || "";

    block.appendChild(origEl);
    block.appendChild(transEl);
    frag.appendChild(block);
  }

  return { fragment: frag, noteList };
}

/**
 * 渲染原文，把 notes 按 pos 插入。注意：pos 必须是代码单元（UTF-16）偏移，和 original 严格对应。
 * 若 note.pos / note.len 越界或不匹配 ref，则安全回退为不插入标记。
 */
function renderOriginalWithNotes(paragraph, showNotes, noteList){
  const text = paragraph.original || "";
  const notes = (paragraph.notes || []).slice().sort((a,b) => (a.pos|0) - (b.pos|0));
  if(!showNotes || !notes.length) return escapeHtml(text);

  let out = "";
  let cursor = 0;
  let countForThisPara = 0;
  for(const n of notes){
    const pos = n.pos | 0;
    const len = (n.len | 0) || (n.ref ? n.ref.length : 1);
    if(pos < cursor || pos >= text.length) continue;
    // 先输出 [cursor, pos) 原文
    out += escapeHtml(text.slice(cursor, pos));
    // 截取被注字/词
    const slice = text.slice(pos, pos + len);
    // 校验与 ref 是否匹配（如不匹配，也尝试用 slice 作为 ref）
    const realRef = (slice === n.ref) ? n.ref : slice;
    // 记录条目序号（在本页面整体 noteList 中的 index）
    const idx = noteList.length;
    const numeral = NUMERAL[idx] || (`[${idx+1}]`);
    countForThisPara++;
    // 输出：原字/词 + 注释上标
    //    不使用 <ruby> 以避免竖排下 ruby 布局错乱；用 <b> 包裹原字（红色下划线标明注释）
    out += `<b class="note-word" style="border-bottom:1px dashed var(--cinnabar);">${escapeHtml(realRef)}</b>`;
    out += `<sup class="note-mark" data-note-idx="${idx}" title="${escapeHtml(realRef)}：${escapeHtml(n.note)}">${numeral}</sup>`;
    noteList.push({
      pid: paragraph.pid,
      idx,
      numeral,
      ref: realRef,
      note: n.note
    });
    cursor = pos + len;
  }
  if(cursor < text.length) out += escapeHtml(text.slice(cursor));
  return out;
}

/** 根据 DOM 中 .note-mark 位置，给气泡定位 */
export function positionNotePopover(popoverEl, anchorEl){
  if(!popoverEl || !anchorEl) return;
  const aRect = anchorEl.getBoundingClientRect();
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  popoverEl.style.display = "block";
  // 先显示后量尺寸
  const pw = popoverEl.offsetWidth;
  const ph = popoverEl.offsetHeight;
  let left = aRect.left + aRect.width/2 - pw/2;
  let top  = aRect.bottom + 6;
  if(left < 6) left = 6;
  if(left + pw > viewportW - 6) left = viewportW - pw - 6;
  if(top + ph > viewportH - 6){
    // 翻到上方
    top = aRect.top - ph - 6;
    if(top < 6) top = 6;
  }
  popoverEl.style.left = Math.round(left) + "px";
  popoverEl.style.top  = Math.round(top) + "px";
}
