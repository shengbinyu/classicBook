/* storage.js — localStorage 四域封装
 * 域：preferences / readingProgress / bookmarks / searchHistory
 * 统一加版本号，便于后续迁移。
 */
const STORAGE_PREFIX = "classic_";
const STORAGE_VER = "v1";

const DOMAIN_DEFAULTS = {
  preferences: {
    theme: "rice",                // rice / sepia / night / scroll
    fontSize: "L",                // S / M / L / XL
    layout: "horizontal",         // horizontal / vertical
    parallelMode: "original",     // original / translation / top-bottom / left-right
    fontFamily: "serif",          // serif / kai
    noteAsideOpen: false,         // 注释旁栏默认关闭
    zhuSiLan: true,               // 竖排时显示朱丝栏
    pinyin: false,                // 难字注音（本期 UI 预留）
    scrollProgress: true
  },
  readingProgress: {},
  // bookmarks: [{ id, bookId, chapterId, volumeId, pid?, label, note, createdAt }]
  bookmarks: [],
  // searchHistory: [{ q, scope, at }]
  searchHistory: []
};

function keyOf(domain){
  return STORAGE_PREFIX + domain + "_" + STORAGE_VER;
}

/** 读一个域；返回深拷贝对象，出错或缺失返回默认值 */
export function loadDomain(domain){
  if(!(domain in DOMAIN_DEFAULTS)){
    throw new Error("[storage] unknown domain: " + domain);
  }
  const def = DOMAIN_DEFAULTS[domain];
  try{
    const raw = localStorage.getItem(keyOf(domain));
    if(!raw) return JSON.parse(JSON.stringify(def));
    const parsed = JSON.parse(raw);
    // 合并默认值（防止新增字段后为 undefined）
    if(def && typeof def === "object" && !Array.isArray(def) && parsed && typeof parsed === "object"){
      return Object.assign(JSON.parse(JSON.stringify(def)), parsed);
    }
    return parsed;
  }catch(e){
    console.warn("[storage] loadDomain failed, fallback to default:", domain, e);
    return JSON.parse(JSON.stringify(def));
  }
}

/** 写一个域 */
export function saveDomain(domain, value){
  if(!(domain in DOMAIN_DEFAULTS)){
    throw new Error("[storage] unknown domain: " + domain);
  }
  try{
    localStorage.setItem(keyOf(domain), JSON.stringify(value));
  }catch(e){
    console.warn("[storage] saveDomain failed:", domain, e);
  }
}

/** 对 preferences 的快捷操作 */
export function getPref(key){
  const prefs = loadDomain("preferences");
  return key ? prefs[key] : prefs;
}
export function setPref(keyOrObj, value){
  const prefs = loadDomain("preferences");
  if(typeof keyOrObj === "object"){
    Object.assign(prefs, keyOrObj);
  }else{
    prefs[keyOrObj] = value;
  }
  saveDomain("preferences", prefs);
  return prefs;
}

/** 书签增删查 */
export function listBookmarks(){
  return loadDomain("bookmarks") || [];
}
export function addBookmark(bm){
  const list = listBookmarks();
  const item = Object.assign({
    id: "bm_" + Date.now().toString(36) + Math.random().toString(36).slice(2,6),
    createdAt: Date.now()
  }, bm);
  list.unshift(item);
  saveDomain("bookmarks", list);
  return item;
}
export function removeBookmark(id){
  const list = listBookmarks().filter(x => x.id !== id);
  saveDomain("bookmarks", list);
  return list;
}
export function bookmarksByBook(bookId){
  return listBookmarks().filter(x => x.bookId === bookId);
}

/** 阅读进度 */
export function getProgress(bookId){
  const all = loadDomain("readingProgress");
  return all[bookId] || null;
}
export function setProgress(bookId, obj){
  const all = loadDomain("readingProgress");
  all[bookId] = Object.assign({}, all[bookId], obj, { lastReadAt: Date.now() });
  saveDomain("readingProgress", all);
  return all[bookId];
}
export function allRecentProgress(limit = 5){
  const all = loadDomain("readingProgress");
  return Object.entries(all)
    .map(([bookId, v]) => ({ bookId, ...v }))
    .sort((a,b) => (b.lastReadAt||0) - (a.lastReadAt||0))
    .slice(0, limit);
}

/** 搜索历史 */
export function addSearchHistory(q, scope){
  q = (q || "").trim();
  if(!q) return;
  const list = loadDomain("searchHistory");
  const idx = list.findIndex(x => x.q === q);
  if(idx >= 0) list.splice(idx, 1);
  list.unshift({ q, scope: scope || "meta", at: Date.now() });
  saveDomain("searchHistory", list.slice(0, 10));
}
export function getSearchHistory(){
  return loadDomain("searchHistory") || [];
}
export function clearSearchHistory(){
  saveDomain("searchHistory", []);
}
