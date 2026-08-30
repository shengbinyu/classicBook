/* data.js —— 元数据/章节懒加载 + 多维筛选 + 搜索框架
 * 所有 API 都是 async（即使首屏数据用了内存缓存，也统一 Promise 风格以便未来接后端）
 */

const BASE = "data";
const CATEGORY_FILE = BASE + "/categories.json";
const BOOKS_FILE    = BASE + "/books.json";

const cache = {
  category: null,
  books:    null,      // Array<Meta>
  bookById: null,      // Map<string, Meta>
  content:  new Map()  // Map<bookId, Promise<Content>>
};

async function fetchJSON(url){
  const res = await fetch(url, { cache: "force-cache" });
  if(!res.ok) throw new Error(`HTTP ${res.status}  ${url}`);
  return res.json();
}

/** 加载分类树（一次） */
export async function getCategoryTree(){
  if(cache.category) return cache.category;
  cache.category = await fetchJSON(CATEGORY_FILE);
  return cache.category;
}

/** 加载书籍元数据（一次） */
export async function loadBooksMeta(){
  if(cache.books) return cache.books;
  const arr = await fetchJSON(BOOKS_FILE);
  // 过滤重复/非法条目（books.json 中不允许 duplicateOf）
  const clean = arr.filter(x => x && x.id && !x.duplicateOf);
  cache.books = clean;
  cache.bookById = new Map(clean.map(b => [b.id, b]));
  return clean;
}

export async function getBookMeta(id){
  await loadBooksMeta();
  return cache.bookById.get(id) || null;
}

/** 列出符合 filters 的书，返回分页对象（默认全部） */
export async function listBooks({
  category = null,     // 字符串：任一层级的分类名或分类 id（支持部分匹配）
  dynasty  = null,     // 字符串或数组
  author   = null,
  genre    = null,
  keyword  = null,     // 对 title / altTitles / tags / intro / author 做简单包含
  status   = null,     // "ready" | "planned" | null
  sort     = "default",// default | dynasty-asc | wordcount-desc | title-asc
  page     = 1,
  pageSize = 9999
} = {}){
  const arr = await loadBooksMeta();
  let out = arr.slice();
  if(status) out = out.filter(b => (b.status || "planned") === status);

  if(category){
    out = out.filter(b => {
      const path = (b.categoryPath || []).join("|");
      return path.includes(category) || (b.categoryPath || []).includes(category);
    });
  }
  if(dynasty){
    const list = Array.isArray(dynasty) ? dynasty : [dynasty];
    out = out.filter(b => list.some(d => b.dynasty && b.dynasty.includes(d)));
  }
  if(author){
    out = out.filter(b => (b.author || "").includes(author));
  }
  if(genre){
    out = out.filter(b => (b.genre || "").includes(genre) || (b.tags||[]).some(t => t.includes(genre)));
  }
  if(keyword){
    const k = keyword.trim().toLowerCase();
    out = out.filter(b => {
      const hay = [b.title, b.altTitles && b.altTitles.join(" "), b.author, b.intro, (b.tags||[]).join(" ")]
        .filter(Boolean).join(" ").toLowerCase();
      return hay.includes(k);
    });
  }

  // 排序
  const dynastyOrder = ["上古","夏","商","西周","春秋","战国","秦","西汉","东汉","三国","西晋","东晋","南北朝","隋","唐","五代","北宋","南宋","辽金","元","明","清","近代","民国"];
  const dIdx = (d) => {
    const i = dynastyOrder.findIndex(x => (d||"").includes(x) || x.includes(d||""));
    return i === -1 ? 999 : i;
  };
  switch(sort){
    case "dynasty-asc":  out.sort((a,b) => dIdx(a.dynasty) - dIdx(b.dynasty) || (a.title||"").localeCompare(b.title||"","zh")); break;
    case "wordcount-desc": out.sort((a,b) => (b.wordCount||0) - (a.wordCount||0)); break;
    case "title-asc":    out.sort((a,b) => (a.title||"").localeCompare(b.title||"","zh")); break;
    default:
      // default: ready 优先，再按 dynasty 升序
      out.sort((a,b) => {
        const sa = (a.status === "ready" ? 0 : 1), sb = (b.status === "ready" ? 0 : 1);
        if(sa !== sb) return sa - sb;
        return dIdx(a.dynasty) - dIdx(b.dynasty) || (a.title||"").localeCompare(b.title||"","zh");
      });
  }

  const total = out.length;
  const start = (page-1) * pageSize;
  const items = out.slice(start, start + pageSize);
  return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total/pageSize)) };
}

/** 加载某本书正文结构（懒加载并缓存 Promise，避免并发重复 fetch） */
export async function loadBookContent(bookId){
  const meta = await getBookMeta(bookId);
  if(!meta) throw new Error("未知书籍 id=" + bookId);
  if(cache.content.has(bookId)) return cache.content.get(bookId);
  if(meta.status !== "ready"){
    // planned 的书，返回空壳
    return Promise.resolve({ id: bookId, volumes: [], planned: true });
  }
  const p = fetchJSON(BASE + "/" + meta.contentFile).catch(err => {
    cache.content.delete(bookId);
    throw err;
  });
  cache.content.set(bookId, p);
  return p;
}

/** 获取目录树（按卷次） */
export async function getBookTOC(bookId){
  const content = await loadBookContent(bookId);
  if(!content.volumes || content.volumes.length === 0) return [];
  return content.volumes.map(v => ({
    id: v.id,
    name: v.name,
    subtitle: v.subtitle || "",
    chapters: (v.chapters || []).map(c => ({
      id: c.id,
      title: c.title,
      paragraphCount: (c.paragraphs || []).length
    }))
  }));
}

/** 找章节。返回 { chapter, volumeIndex, chapterIndex, flatIndex, totalChapters, chapterIdList } 或 null */
export async function getChapter(bookId, chapterId){
  const content = await loadBookContent(bookId);
  if(!content.volumes) return null;
  let flatIdx = 0;
  const chapterIdList = [];
  for(let vi = 0; vi < content.volumes.length; vi++){
    const vol = content.volumes[vi];
    for(let ci = 0; ci < (vol.chapters || []).length; ci++){
      const ch = vol.chapters[ci];
      chapterIdList.push(ch.id);
      if(ch.id === chapterId){
        return {
          chapter: ch,
          volume: vol,
          volumeIndex: vi,
          chapterIndex: ci,
          flatIndex: flatIdx
        };
      }
      flatIdx++;
    }
  }
  return { flatIndex: -1, chapterIdList };
}

/** 获取指定章节的邻居 id（上一章/下一章） */
export async function getChapterNeighbors(bookId, chapterId){
  const content = await loadBookContent(bookId);
  const arr = [];
  (content.volumes||[]).forEach(v => (v.chapters||[]).forEach(c => arr.push(c)));
  const i = arr.findIndex(c => c.id === chapterId);
  return {
    prev: i > 0 ? arr[i-1] : null,
    next: i >= 0 && i < arr.length-1 ? arr[i+1] : null,
    total: arr.length,
    index: i
  };
}

/** 找第一章（用于「开始阅读」） */
export async function getFirstChapterId(bookId){
  const toc = await getBookTOC(bookId);
  if(!toc.length || !toc[0].chapters.length) return null;
  return toc[0].chapters[0].id;
}

/** 简单搜索：
 *    scope = "meta" （默认，只查 meta 字段）
 *    scope = "full"（还要去正文里查 title + paragraphs）
 */
export async function searchAll(keyword, scope = "meta", limit = 50){
  const k = (keyword || "").trim();
  const result = [];
  if(!k) return result;
  const books = await loadBooksMeta();
  const kl = k.toLowerCase();
  const contain = (s) => s && String(s).toLowerCase().includes(kl);

  const pushResult = (type, book, extra = {}) => {
    result.push(Object.assign({
      type,
      bookId: book.id,
      bookTitle: book.title,
      bookAuthor: book.author,
      dynasty: book.dynasty,
      categoryPath: book.categoryPath
    }, extra));
  };

  for(const b of books){
    if(contain(b.title) || (b.altTitles||[]).some(contain)){
      pushResult("title", b, {
        chapterId: null,
        snippet: (b.intro || "").slice(0, 80)
      });
    }else if(contain(b.author)){
      pushResult("author", b, { chapterId: null, snippet: `${b.author} · ${b.dynasty}，${b.genre || ""}` });
    }else if((b.tags||[]).some(contain)){
      pushResult("tag", b, { chapterId: null, snippet: `标签命中：${(b.tags||[]).filter(x => contain(x)).join("、")}` });
    }
    if(result.length >= limit) break;
  }

  if(scope === "full"){
    // 只加载 status = ready 的内容；搜索篇目标题 + 原文/译文片段
    const readyBooks = books.filter(b => b.status === "ready");
    for(const b of readyBooks){
      if(result.length >= limit) break;
      try{
        const content = await loadBookContent(b.id);
        for(const v of content.volumes || []){
          for(const c of v.chapters || []){
            let hitInTitle = contain(c.title);
            let snippet = "";
            if(!hitInTitle){
              // 在段落里找第一个命中
              outer:
              for(const p of c.paragraphs || []){
                const s = [p.original, p.translation, (p.notes||[]).map(n=>n.ref+" "+n.note).join(" ")].join("\n");
                const idx = s.toLowerCase().indexOf(kl);
                if(idx >= 0){
                  const start = Math.max(0, idx - 12);
                  const end = Math.min(s.length, idx + k.length + 24);
                  snippet = s.slice(start, end).replace(/\n/g," / ");
                  break outer;
                }
              }
            }
            if(hitInTitle){
              snippet = (c.paragraphs?.[0]?.original || "").slice(0, 80);
            }
            if(hitInTitle || snippet){
              pushResult(hitInTitle ? "chapter" : "text", b, {
                chapterId: c.id,
                chapterTitle: c.title || v.name,
                volumeName: v.name,
                snippet: snippet || "（见正文）"
              });
              if(result.length >= limit) break;
            }
          }
          if(result.length >= limit) break;
        }
      }catch(e){
        console.warn("搜索加载书籍失败", b.id, e);
      }
    }
  }

  return result.slice(0, limit);
}

/** 所有已载入书籍的 id/title 映射 */
export function listLoadedMeta(){
  return cache.books || [];
}
