function makeId(){
  if(window.crypto && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return "id-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,10);
}

// Default banks, in the required default display order.
const DEFAULT_BANKS = [
  {id:"default-bankak",name:"بنك الخرطوم",appName:"بنكك",code:"04",prefix:"040",suffix:"0001",len:7},
  // Account numbers are 11 digits (01000 + 6 digits). "01000" is constant, so users may enter only the last 6 digits.
  {id:"default-masrafak",name:"بنك المزارع التجاري",appName:"مصرفك",code:"22",prefix:"220",accPrefix:"01000",suffix:"",len:6},
  {id:"default-fawry",name:"بنك فيصل الإسلامي",appName:"فوري",code:"02",prefix:"02",suffix:"0001",len:8},
  {id:"default-O-cash",name:"بنك أم درمان الوطني",appName:"أوكاش",code:"24",prefix:"24",suffix:"00001",len:7},
  {id:"default-makashi",name:"خدمة ماي كاشي",appName:"MyCashi",code:"30",prefix:"070",suffix:"89",len:9,manualOnly:true},
  {id:"default-blue-nile",name:"بنك النيل الأزرق",appName:"مشرق",code:"15",prefix:"150000",suffix:"",len:8},
  {id:"default-islamic-sudanese",name:"البنك الإسلامي السوداني",appName:"أمين بلس",code:"14",prefix:"140",suffix:"00001",len:6},
  {id:"default-agricultural",name:"البنك الزراعي السوداني",appName:"الزراعي موبايل",code:"03",prefix:"03",suffix:"01001",len:7},
  {id:"default-french",name:"البنك الفرنسي السوداني",appName:"",code:"11",prefix:"110",suffix:"00001",len:6},
  {id:"default-salam",name:"بنك السلام السوداني",appName:"",code:"18",prefix:"180",suffix:"00001",len:6},
  {id:"default-baraka",name:"بنك البركة السوداني",appName:"",code:"07",prefix:"070",suffix:"00001",len:6},
  {id:"default-animal",name:"بنك الثروة الحيوانية",appName:"",code:"09",prefix:"090",suffix:"00001",len:6},
  {id:"default-industrial",name:"بنك التنمية الصناعية",appName:"",code:"13",prefix:"130",suffix:"00001",len:6},
  {id:"default-united-capital",name:"بنك المال المتحد",appName:"",code:"17",prefix:"170",suffix:"00001",len:6},
  {id:"default-workers",name:"بنك العمال الوطني",appName:"وطني",code:"",prefix:"",suffix:"",len:14,manualOnly:true},
  {id:"default-sah",name:"بنك النيل",appName:"ساهل",code:"",prefix:"",suffix:"",len:14,manualOnly:true},
    {id:"sah",name:"sah-صح",appName:"sah",code:"31",prefix:"",suffix:"",len:14},
  {id:"default-real-estate",name:"البنك العقاري التجاري",appName:"تطبيق البنك",code:"",prefix:"",suffix:"",len:14,manualOnly:true}
];

// "default-order" = order was not changed manually; "custom" = user ordered banks by hand.
const ORDER_KEY = "bban_banks_order";
// Old bank ids that are now merged into a single bank.
const BANK_ID_ALIASES = {"default-masrafak-220":"default-masrafak"};

function readJSON(key, fallback){
  try{
    const v = JSON.parse(localStorage.getItem(key) || "null");
    return v === null ? fallback : v;
  }catch(e){ return fallback; }
}

const storedBanks = readJSON("bban_banks", null);
const isFirstInstall = !Array.isArray(storedBanks);
let banks = isFirstInstall ? DEFAULT_BANKS.map(b=>({...b})) : storedBanks.filter(b=>b && b.id);
let savedAccounts = readJSON("bban_saved_accounts", []);
if(!Array.isArray(savedAccounts)) savedAccounts = [];

// Migrate legacy app-only labels to official bank names, preserving user data where possible.
const LEGACY_BANK_MIGRATIONS = {
  "default-bankak": {name:"بنك الخرطوم",appName:"بنكك",code:"04"},
  "default-fawry": {name:"بنك فيصل الإسلامي",appName:"فوري",code:"02"},
  "default-O-cash": {name:"بنك أم درمان الوطني",appName:"أوكاش",code:"24"},
  "default-islamic-sudanese": {name:"البنك الإسلامي السوداني",appName:"أمين بلس",code:"14"},
  "default-masrafak": {name:"بنك المزارع التجاري",appName:"مصرفك",code:"22"},
  "default-sah": {name:"بنك النيل",appName:"ساهل",code:"",prefix:"",suffix:"",len:14,manualOnly:true},
  "default-makashi": {name:"خدمة ماي كاشي",appName:"MyCashi",code:"",prefix:"",suffix:"",len:14,manualOnly:true}
};

function sameRules(b, prefix, suffix, len){
  return (b.prefix||"") === prefix && (b.suffix||"") === suffix && Number(b.len) === len;
}

// Removes duplicate/legacy bank entries (standalone "بنكك", old Mazaree' formats).
// Never removes custom banks. Returns a map {oldBankId: newBankId} for remapping saved accounts.
function normalizeBanks(){
  const idMap = {...BANK_ID_ALIASES};
  const out = [];
  const seen = new Set();
  banks.forEach(b=>{
    if(!b || !b.id) return;
    const nm = (b.name || "").trim();
    let target = BANK_ID_ALIASES[b.id] || null;
    if(!target){
      if(b.id !== "default-bankak" && nm === "بنكك" && sameRules(b,"040","0001",7)) target = "default-bankak";
      else if(b.id !== "default-masrafak"
        && (nm === "بنك المزارع التجاري" || nm.startsWith("بنك المزارع التجاري (الصيغة"))
        && (sameRules(b,"222","",11) || sameRules(b,"220","01000",6))) target = "default-masrafak";
    }
    if(target){ idMap[b.id] = target; return; }
    if(seen.has(b.id)) return;
    seen.add(b.id);
    out.push(b);
  });
  banks = out;
  return idMap;
}

// Banks with a constant account prefix (accPrefix) accept the short account (len digits)
// or the full account (accPrefix + len digits). The short form is what we store.
function normalizeAccount(bank, account){
  const acc = String(account || "");
  const ap = bank && bank.accPrefix;
  if(ap && acc.length === Number(bank.len) + ap.length && acc.startsWith(ap)) return acc.slice(ap.length);
  return acc;
}

function isValidAccountLen(bank, account){
  if(!bank) return false;
  const n = String(account || "").length;
  if(n === Number(bank.len)) return true;
  const ap = bank.accPrefix;
  return !!ap && n === Number(bank.len) + ap.length && String(account).startsWith(ap);
}

function normalizeSavedAccounts(){
  let changed = false;
  savedAccounts.forEach(a=>{
    if(!a) return;
    const b = banks.find(x=>x.id === a.bankId);
    const n = normalizeAccount(b, a.account);
    if(n !== a.account){ a.account = n; changed = true; }
  });
  return changed;
}

function remapAccountBankIds(idMap){
  let changed = false;
  savedAccounts.forEach(a=>{
    if(a && idMap[a.bankId] && idMap[a.bankId] !== a.bankId){ a.bankId = idMap[a.bankId]; changed = true; }
  });
  return changed;
}

// Default banks first (in DEFAULT_BANKS order), then every other (custom) bank in its current order.
function applyDefaultOrder(){
  const defIds = new Set(DEFAULT_BANKS.map(d=>d.id));
  const defaults = DEFAULT_BANKS.map(d=>banks.find(b=>b.id===d.id)).filter(Boolean);
  banks = [...defaults, ...banks.filter(b=>!defIds.has(b.id))];
}

(function initBanks(){
  Object.entries(LEGACY_BANK_MIGRATIONS).forEach(([id, patch])=>{
    const existing = banks.find(b=>b.id===id);
    if(existing) Object.assign(existing, patch);
  });
  const idMap = normalizeBanks();
  DEFAULT_BANKS.forEach(def=>{
    const existing = banks.find(b=>b.id===def.id);
    if(!existing) banks.push({...def});
    // Refresh built-in bank rules while retaining the user's bank record identity.
    else Object.assign(existing, def);
  });
  // Apply the default order once (first install / first run of this version).
  // After the user orders banks manually ("custom") it is never reordered again.
  if(!localStorage.getItem(ORDER_KEY)){
    applyDefaultOrder();
    localStorage.setItem(ORDER_KEY, "default");
  }
  localStorage.setItem("bban_banks", JSON.stringify(banks));
  const remapped = remapAccountBankIds(idMap);
  const normalized = normalizeSavedAccounts();
  if(remapped || normalized) localStorage.setItem("bban_saved_accounts", JSON.stringify(savedAccounts));
})();

let editId = null;
let vaultEditId = null;
let currentSearchQuery = "";

const $ = id => document.getElementById(id);
const saveBanks = ()=>localStorage.setItem("bban_banks",JSON.stringify(banks));
const saveSavedAccounts = ()=>localStorage.setItem("bban_saved_accounts", JSON.stringify(savedAccounts));

// Utility: Clean whitespace and non-digits (preserving standard digits only)
function sanitizeDigits(val){
  return String(val || "").replace(/\D/g, "");
}

// Modal Handler
let onModalConfirmCallback = null;
function showConfirmModal(title, sub, confirmText = "حذف", onConfirm = null, variant = "danger"){
  $("modalTitle").textContent = title;
  $("modalSub").textContent = sub;
  $("modalConfirm").textContent = confirmText;
  const isDanger = variant === "danger";
  $("modalIcon").textContent = isDanger ? "🗑" : "🔄";
  $("modalIcon").classList.toggle("info", !isDanger);
  $("modalConfirm").className = isDanger ? "btn danger" : "btn primary";
  onModalConfirmCallback = onConfirm;
  $("appModal").classList.add("show");
  $("appModal").setAttribute("aria-hidden", "false");
}

function hideConfirmModal(){
  $("appModal").classList.remove("show");
  $("appModal").setAttribute("aria-hidden", "true");
  onModalConfirmCallback = null;
}

// Close modals by tapping the dimmed backdrop or pressing Escape
["appModal","qrModal"].forEach(id=>{
  $(id).addEventListener("click", e=>{
    if(e.target !== $(id)) return;
    if(id === "appModal") hideConfirmModal(); else hideQrModal();
  });
});
document.addEventListener("keydown", e=>{
  if(e.key !== "Escape") return;
  if($("appModal").classList.contains("show")) hideConfirmModal();
  if($("qrModal").classList.contains("show")) hideQrModal();
});

$("modalCancel").onclick = hideConfirmModal;
$("modalConfirm").onclick = ()=>{
  if(onModalConfirmCallback) onModalConfirmCallback();
  hideConfirmModal();
};

// QR Modal Handler
let qrModalCurrentText = "";
function showQrModal(title, sub, textToEncode, displayText){
  $("qrModalTitle").textContent = title;
  $("qrModalSub").textContent = sub;
  $("qrModalNum").textContent = displayText || textToEncode;
  qrModalCurrentText = textToEncode;
  if(window.QRGenerator){
    $("qrModalGraphic").innerHTML = window.QRGenerator.generateSVG(textToEncode, 200);
  }
  $("qrModal").classList.add("show");
  $("qrModal").setAttribute("aria-hidden", "false");
}

function hideQrModal(){
  $("qrModal").classList.remove("show");
  $("qrModal").setAttribute("aria-hidden", "true");
  qrModalCurrentText = "";
}

$("qrModalClose").onclick = hideQrModal;
$("qrModalCopy").onclick = async ()=>{
  if(!qrModalCurrentText) return;
  await copyTextToClipboard(qrModalCurrentText, "تم نسخ الرقم بنجاح");
};

// ---- Custom bank dropdown (replaces the native <select>; the select stays hidden as the value holder)
const selectValueDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
const CHECK_SVG = '<svg class="cs-check" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CHEV_SVG = '<svg class="cs-chev" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const openDropdowns = new Set();

function bankLabelHTML(b){
  return `<span class="cs-name">${esc(b.name)}</span>${b.appName ? `<span class="bank-app-badge cs-badge">${esc(b.appName)}</span>` : ""}`;
}

function createBankDropdown(sel){
  const wrap = document.createElement("div");
  wrap.className = "cs";
  wrap.innerHTML = `<button type="button" class="cs-trigger" aria-haspopup="listbox" aria-expanded="false"><span class="cs-label"></span>${CHEV_SVG}</button><div class="cs-panel" role="listbox" tabindex="-1"></div>`;
  sel.parentNode.insertBefore(wrap, sel);
  sel.classList.add("cs-native");
  sel.tabIndex = -1;
  sel.setAttribute("aria-hidden", "true");

  const trigger = wrap.querySelector(".cs-trigger");
  const label = wrap.querySelector(".cs-label");
  const panel = wrap.querySelector(".cs-panel");
  let active = -1;

  function sync(){
    const b = banks.find(x=>x.id === selectValueDesc.get.call(sel));
    label.innerHTML = b ? bankLabelHTML(b) : `<span class="cs-placeholder">اختر بنكاً</span>`;
    panel.querySelectorAll(".cs-item").forEach(el=>{
      const on = el.dataset.id === selectValueDesc.get.call(sel);
      el.classList.toggle("selected", on);
      el.setAttribute("aria-selected", on ? "true" : "false");
    });
  }
  function render(){
    panel.innerHTML = banks.length ? banks.map(b=>`<div class="cs-item" role="option" data-id="${esc(b.id)}">${bankLabelHTML(b)}${CHECK_SVG}</div>`).join("") : `<div class="cs-empty">لا توجد بنوك</div>`;
    sync();
  }
  function items(){ return Array.from(panel.querySelectorAll(".cs-item")); }
  function setActive(i){
    const list = items();
    if(!list.length) return;
    active = Math.max(0, Math.min(list.length - 1, i));
    list.forEach((el, k)=>el.classList.toggle("active", k === active));
    list[active].scrollIntoView({block:"nearest"});
  }
  function open(){
    if(wrap.classList.contains("open") || !banks.length) return;
    openDropdowns.forEach(d=>d.close());
    wrap.classList.add("open");
    trigger.setAttribute("aria-expanded", "true");
    const r = trigger.getBoundingClientRect();
    const below = window.innerHeight - r.bottom, above = r.top;
    wrap.classList.toggle("up", below < 260 && above > below);
    const list = items();
    setActive(Math.max(0, list.findIndex(el=>el.classList.contains("selected"))));
    openDropdowns.add(api);
  }
  function close(){
    wrap.classList.remove("open", "up");
    trigger.setAttribute("aria-expanded", "false");
    items().forEach(el=>el.classList.remove("active"));
    openDropdowns.delete(api);
  }
  function choose(id){
    const changed = selectValueDesc.get.call(sel) !== id;
    selectValueDesc.set.call(sel, id);
    sync();
    close();
    if(changed) sel.dispatchEvent(new Event("change", {bubbles:true}));
  }

  trigger.addEventListener("click", ()=>wrap.classList.contains("open") ? close() : open());
  panel.addEventListener("click", e=>{
    const el = e.target.closest(".cs-item");
    if(el) choose(el.dataset.id);
  });
  trigger.addEventListener("keydown", e=>{
    const isOpen = wrap.classList.contains("open");
    if(e.key === "ArrowDown" || e.key === "ArrowUp"){
      e.preventDefault();
      if(!isOpen) open(); else setActive(active + (e.key === "ArrowDown" ? 1 : -1));
    } else if(e.key === "Enter" || e.key === " "){
      e.preventDefault();
      if(!isOpen) open();
      else { const el = items()[active]; if(el) choose(el.dataset.id); else close(); }
    } else if(e.key === "Escape" || e.key === "Tab"){
      if(isOpen){ if(e.key === "Escape") e.preventDefault(); close(); }
    }
  });
  // Keep the dropdown label in sync when code assigns select.value programmatically
  Object.defineProperty(sel, "value", {
    configurable:true,
    get(){ return selectValueDesc.get.call(this); },
    set(v){ selectValueDesc.set.call(this, v); sync(); }
  });

  const api = {render, sync, close, wrap};
  return api;
}

document.addEventListener("pointerdown", e=>{
  openDropdowns.forEach(d=>{ if(!d.wrap.contains(e.target)) d.close(); });
});

const bankDD = createBankDropdown($("bankSelect"));
const vaultDD = createBankDropdown($("vBank"));

function bankOptionsHTML(){
  return banks.map(b=>`<option value="${esc(b.id)}">${esc(b.name)}${b.appName ? " — " + esc(b.appName) : ""}</option>`).join("");
}

function renderBanks(){
  const sel = $("bankSelect");
  const currVal = sel.value;
  sel.innerHTML = bankOptionsHTML();
  if(banks.some(b=>b.id===currVal)) sel.value = currVal;
  bankDD.render();

  $("bankList").innerHTML = banks.length ? banks.map((b,i)=>`
    <div class="item" data-id="${esc(b.id)}">
      <div class="bank-item-title"><b>${esc(b.name)}</b>${b.appName ? `<span class="bank-app-badge">${esc(b.appName)}</span>` : ""}<span class="mono">${b.manualOnly ? "أدخل BBAN المكوّن من 14 رقماً من التطبيق" : `${esc(b.prefix)}${b.accPrefix ? " + " + esc(b.accPrefix) : ""} + الحساب${b.suffix ? " + " + esc(b.suffix) : ""} — الحساب ${b.len} أرقام`}</span></div>
      <div class="actions">
        <span class="order-btns">
          <button class="btn secondary btn-icon" onclick="moveBank('${b.id}',-1)" ${i===0?"disabled":""} aria-label="تحريك للأعلى" title="تحريك للأعلى"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 15l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
          <button class="btn secondary btn-icon" onclick="moveBank('${b.id}',1)" ${i===banks.length-1?"disabled":""} aria-label="تحريك للأسفل" title="تحريك للأسفل"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        </span>
        <button class="btn secondary" onclick="editBank('${b.id}')">تعديل</button>
        <button class="btn danger" onclick="deleteBank('${b.id}')">حذف</button>
      </div>
    </div>`).join("") : `<div class="empty">لا توجد بنوك.</div>`;
  updateHint();
  updateAccountCounter();
}

// Manual ordering: swap with neighbour, persist, and refresh every bank list
window.moveBank = (id, dir)=>{
  const i = banks.findIndex(b=>b.id===id);
  const j = i + dir;
  if(i < 0 || j < 0 || j >= banks.length) return;
  [banks[i], banks[j]] = [banks[j], banks[i]];
  localStorage.setItem(ORDER_KEY, "custom");
  saveBanks();
  renderBanks();
  initSavedPage();
  const row = Array.from($("bankList").children).find(el=>el.dataset.id===id);
  if(row){
    row.classList.add("moved");
    setTimeout(()=>row.classList.remove("moved"), 700);
    const btn = row.querySelectorAll(".btn-icon:not(:disabled)");
    const pick = dir < 0 ? btn[0] : btn[btn.length-1];
    if(pick) pick.focus({preventScroll:true});
  }
};

// Text shown under the account field: the number of digits the user should enter
function accountHintText(b){
  if(!b) return "أضف بنكاً من صفحة البنوك.";
  if(b.manualOnly) return "عدد الأرقام المطلوب: 14 رقماً (رقم BBAN كاملاً كما يظهر في تطبيق البنك).";
  if(b.accPrefix) return `عدد الأرقام المطلوب: ${b.len} أرقام فقط، أو الرقم كاملاً ${Number(b.len) + b.accPrefix.length} رقماً.`;
  return `عدد الأرقام المطلوب: ${b.len} أرقام.`;
}

function updateHint(){
  const b = banks.find(x=>x.id===$("bankSelect").value);
  $("bankHint").textContent = accountHintText(b);
  const accountLabel = $("accountLabel");
  if(accountLabel) accountLabel.textContent = b && b.manualOnly ? "رقم BBAN من التطبيق" : "رقم الحساب";
}

function updateSelectedBankApp(){}

// Counter text/state shared by generator and saved-accounts forms
function setCounter(counter, b, acc){
  const reqLen = b ? Number(b.len) : 0;
  const full = b && b.accPrefix ? reqLen + b.accPrefix.length : 0;
  counter.textContent = full ? `${acc.length} / ${reqLen} أو ${full}` : `${acc.length} / ${reqLen}`;
  counter.classList.remove("done", "overflow");
  if(!reqLen) return;
  if(isValidAccountLen(b, acc)) counter.classList.add("done");
  else if(acc.length > (full || reqLen) || (full && acc.length === full)) counter.classList.add("overflow");
}

function updateAccountCounter(){
  setCounter($("accountCounter"), banks.find(x=>x.id===$("bankSelect").value), $("account").value);
}

// Auto-sanitize and live calculation on account input
$("account").addEventListener("input", (e)=>{
  const clean = sanitizeDigits(e.target.value);
  if(e.target.value !== clean) e.target.value = clean;
  updateAccountCounter();

  const b = banks.find(x=>x.id===$("bankSelect").value);
  if(b && isValidAccountLen(b, clean)){
    doGenerate(false); // Live auto calculate
  } else {
    $("result").style.display = "none"; // incomplete/empty account: hide the result
  }
});

$("account").addEventListener("keydown", (e)=>{
  if(e.key === "Enter") doGenerate(true);
});

$("bankSelect").addEventListener("change", ()=>{
  updateSelectedBankApp();
  updateHint();
  updateAccountCounter();
  const b = banks.find(x=>x.id===$("bankSelect").value);
  const acc = $("account").value.trim();
  if(b && isValidAccountLen(b, acc)) doGenerate(false);
  else $("result").style.display = "none";
});

function calculateBBAN(bank, account){
  if(bank.manualOnly) return account;
  return bank.prefix + (bank.accPrefix || "") + normalizeAccount(bank, account) + bank.suffix;
}

function doGenerate(showWarningToasts = true){
  const b = banks.find(x=>x.id===$("bankSelect").value);
  const acc = $("account").value.trim();
  if(!b){
    if(showWarningToasts) showToast("لا يوجد بنك", "أضف بنكاً أولاً من صفحة البنوك.", "!");
    return;
  }
  if(!/^\d+$/.test(acc)){
    if(showWarningToasts) showToast("رقم الحساب غير صحيح", "استخدم الأرقام فقط دون مسافات أو رموز.", "!");
    return;
  }
  if(!isValidAccountLen(b, acc)){
    if(showWarningToasts) showToast("الطول غير صحيح", b.manualOnly ? "ألصق BBAN كاملاً بطول 14 رقماً." : accountHintText(b), "!");
    return;
  }

  const out = calculateBBAN(b, acc);
  $("resultNum").textContent = out;

  if(window.QRGenerator){
    $("qrOutput").innerHTML = window.QRGenerator.generateSVG(out, 170);
  }

  $("result").style.display = "block";
}

$("generate").onclick = ()=>doGenerate(true);

async function copyTextToClipboard(text, successMsg = "تم النسخ بنجاح"){
  try{
    if(navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
    else{
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      if(!document.execCommand("copy")) throw new Error("copy failed");
      ta.remove();
    }
    showToast(successMsg, "الرقم جاهز للصق والمشاركة");
    return true;
  }catch(e){
    showToast("تعذر النسخ", "اضغط مطولًا على الرقم لنسخه يدويًا", "!");
    return false;
  }
}

$("copyBtn").onclick = async ()=>{
  const text = $("resultNum").textContent;
  if(!text) return;
  const ok = await copyTextToClipboard(text, "تم نسخ BBAN بنجاح");
  if(ok){
    $("copyBtn").textContent = "تم النسخ ✓";
    setTimeout(()=>$("copyBtn").textContent = "📋 نسخ BBAN", 1200);
  }
};

$("shareBtn").onclick = async ()=>{
  const b = banks.find(x=>x.id===$("bankSelect").value);
  const acc = $("account").value.trim();
  const bban = $("resultNum").textContent;
  if(!b || !acc || !bban) return;

  const text = `تفاصيل الحساب البنكي:\n🏦 البنك: ${b.name}${b.appName ? ` — التطبيق: ${b.appName}` : ""}\n🔢 رقم الحساب: ${acc}\n💳 رقم BBAN:\n${bban}`;
  if(navigator.share){
    try{ await navigator.share({title: "رقم BBAN", text}); }catch(e){}
  } else {
    await copyTextToClipboard(text, "تم نسخ بطاقة الحساب للمشاركة");
  }
};

$("toggleQrBtn").onclick = ()=>{
  const qrBox = $("resultQr");
  const isHidden = qrBox.classList.contains("hidden");
  if(isHidden){
    qrBox.classList.remove("hidden");
    $("toggleQrBtn").textContent = "إخفاء رمز QR";
  } else {
    qrBox.classList.add("hidden");
    $("toggleQrBtn").textContent = "📱 رمز QR";
  }
};

// Reset Default Banks
$("resetBanks").onclick = ()=>{
  showConfirmModal(
    "استعادة البنوك الافتراضية",
    "هل تريد استعادة قائمة البنوك الأساسية؟ سيتم تحديث بيانات البنوك الافتراضية وإعادتها إلى الترتيب الافتراضي مع الاحتفاظ بالبنوك المخصصة التي أضفتها وحساباتك المحفوظة.",
    "استعادة",
    ()=>{
      const idMap = normalizeBanks();
      DEFAULT_BANKS.forEach(def=>{
        const idx = banks.findIndex(b=>b.id === def.id || (b.name || "").trim() === def.name);
        if(idx !== -1){
          banks[idx] = {...def};
        } else {
          banks.push({...def});
        }
      });
      applyDefaultOrder();
      localStorage.setItem(ORDER_KEY, "default");
      remapAccountBankIds(idMap);
      normalizeSavedAccounts();
      saveSavedAccounts();
      saveBanks();
      renderBanks();
      initSavedPage();
      showToast("تمت الاستعادة", "تمت استعادة قائمة البنوك الافتراضية بنجاح.");
    },
    "restore"
  );
};

// Banks Management
function isDuplicateBankName(name, excludeId){
  const norm = name.trim().toLowerCase();
  return banks.some(b => b.id !== excludeId && (b.name || "").trim().toLowerCase() === norm);
}

["bPrefix", "bSuffix"].forEach(id=>{
  $(id).addEventListener("input", e=>{
    const c = sanitizeDigits(e.target.value);
    if(e.target.value !== c) e.target.value = c;
  });
});

$("saveBank").onclick = ()=>{
  const data = {
    name: $("bName").value.trim(),
    appName: $("bAppName").value.trim(),
    code: $("bCode").value.trim(),
    prefix: sanitizeDigits($("bPrefix").value.trim()),
    suffix: sanitizeDigits($("bSuffix").value.trim()),
    len: Number($("bLen").value)
  };
  const lenOk = Number.isInteger(data.len) && data.len > 0;
  if(!data.name || !lenOk){
    showToast("بيانات غير مكتملة", "أدخل اسم البنك وطول رقم الحساب بصورة صحيحة.", "!");
    return;
  }
  if(isDuplicateBankName(data.name, editId)){
    showToast("اسم البنك مكرر", "يوجد بنك آخر بنفس الاسم بالفعل.", "!");
    return;
  }
  const wasEdit = !!editId;
  if(editId){
    Object.assign(banks.find(b=>b.id===editId), data);
    editId = null;
    $("cancelEdit").classList.add("hidden");
  } else {
    banks.push({id: makeId(), ...data});
  }
  saveBanks();
  clearBankForm();
  renderBanks();
  initSavedPage();
  showToast(wasEdit ? "تم حفظ التعديل" : "تم حفظ البنك", wasEdit ? "تم تحديث بيانات البنك بنجاح." : "تمت إضافة البنك إلى القائمة.");
};

function clearBankForm(){
  ["bName","bAppName","bCode","bPrefix","bSuffix","bLen"].forEach(x=>$(x).value = "");
}

window.editBank = id=>{
  const b = banks.find(x=>x.id===id);
  if(!b) return;
  editId = id;
  $("bName").value = b.name;
  $("bAppName").value = b.appName || "";
  $("bCode").value = b.code;
  $("bPrefix").value = b.prefix;
  $("bSuffix").value = b.suffix;
  $("bLen").value = b.len;
  $("cancelEdit").classList.remove("hidden");
  window.scrollTo({top:0, behavior:"smooth"});
};

window.deleteBank = id=>{
  if(banks.length === 1){
    showToast("لا يمكن الحذف", "يجب أن يبقى بنك واحد على الأقل.", "!");
    return;
  }
  const linkedCount = savedAccounts.filter(a=>a.bankId===id).length;
  const sub = linkedCount > 0
    ? `تحذير: هناك ${linkedCount} حسابات محفوظة مرتبطة بهذا البنك. هل تريد المتابعة وحذف البنك؟`
    : "هل أنت متأكد من حذف هذا البنك من القائمة؟";
  showConfirmModal("حذف البنك", sub, "حذف", ()=>{
    banks = banks.filter(b=>b.id!==id);
    saveBanks();
    renderBanks();
    initSavedPage();
    showToast("تم حذف البنك", "تمت إزالة البنك من القائمة.");
  });
};

$("cancelEdit").onclick = ()=>{
  editId = null;
  clearBankForm();
  $("cancelEdit").classList.add("hidden");
};

// Navigation Tabs
document.querySelectorAll(".tab").forEach(btn=>btn.onclick=()=>{
  document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
  btn.classList.add("active");
  document.querySelectorAll(".panel").forEach(x=>x.classList.add("hidden"));
  $(btn.dataset.tab).classList.remove("hidden");
  if(btn.dataset.tab === "banks") renderBanks(); 
  if(btn.dataset.tab === "saved") initSavedPage();
});

function esc(s){
  return String(s??"").replace(/[&<>"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
}

// Decoder / Reverse Lookup
// Accepts a BBAN or an IBAN (2 letters + 2 check digits + BBAN). For an IBAN the first 4 characters are dropped.
function cleanDecodeInput(v){
  return String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

$("decodeInput").addEventListener("input", (e)=>{
  const c = cleanDecodeInput(e.target.value);
  if(e.target.value !== c) e.target.value = c;
  $("decodeCounter").textContent = `${c.length} خانة`;
  if(c.length >= 7) doDecode(false);
});

$("decodeInput").addEventListener("keydown", (e)=>{
  if(e.key === "Enter") doDecode(true);
});

let lastDecodedData = null;

// Finds every bank whose rules produce this BBAN; account = the full account number as the bank shows it
function findBankMatches(bban){
  const matches = [];
  for(const b of banks){
    if(b.manualOnly) continue;
    const p = b.prefix || "";
    const ap = b.accPrefix || "";
    const s = b.suffix || "";
    const expectedLen = p.length + ap.length + Number(b.len) + s.length;
    if(bban.length === expectedLen && bban.startsWith(p + ap) && bban.endsWith(s)){
      const core = bban.slice(p.length + ap.length, bban.length - s.length);
      matches.push({bank: b, account: ap + core});
    }
  }
  return matches;
}

function doDecode(showWarningToasts = true){
  const raw = cleanDecodeInput($("decodeInput").value);
  if(!raw){
    if(showWarningToasts) showToast("أدخل رقم BBAN أو IBAN", "يرجى لصق أو كتابة رقم BBAN أو IBAN المراد تفكيكه.", "!");
    $("decodeResult").style.display = "none";
    return;
  }

  let bban = raw;
  let note = "";
  let matches = [];
  if(/^[A-Z]{2}\d{2}/.test(raw)){
    // IBAN: drop the country code and check digits (first 4 characters)
    bban = raw.slice(4);
    note = `تم التعرّف على IBAN وحذف أول 4 خانات (${raw.slice(0,4)}) — رقم BBAN: ${bban}`;
  }
  if(!/^\d+$/.test(bban)){
    if(showWarningToasts) showToast("رقم غير صحيح", "استخدم أرقام BBAN أو IBAN صحيحاً دون رموز إضافية.", "!");
    $("decodeResult").style.display = "none";
    lastDecodedData = null;
    return;
  }
  matches = findBankMatches(bban);
  if(!matches.length && !note && /^\d+$/.test(raw) && raw.length > 4){
    // Digits only but no BBAN match: maybe an IBAN typed without the letters
    const alt = findBankMatches(raw.slice(4));
    if(alt.length){
      matches = alt;
      bban = raw.slice(4);
      note = `تم حذف أول 4 خانات (IBAN) — رقم BBAN: ${bban}`;
    }
  }

  if(!matches.length){
    if(showWarningToasts){
      showToast("لم يتم العثور على بنك مطابق", "تحقق من صحة الرقم أو تأكد من إضافة قواعد البنك من صفحة البنوك.", "!");
    }
    $("decodeResult").style.display = "none";
    lastDecodedData = null;
    return;
  }

  const match = matches[0];
  lastDecodedData = match;

  $("decodeBankName").textContent = match.bank.appName ? `${match.bank.name} — ${match.bank.appName}` : match.bank.name;
  $("decodePrefix").textContent = match.bank.prefix || "—";
  $("decodeAccount").textContent = match.account;
  $("decodeSuffix").textContent = match.bank.suffix || "—";
  $("decodeNote").textContent = note;
  $("decodeNote").classList.toggle("hidden", !note);
  $("decodeResult").style.display = "block";
}

$("decodeBtn").onclick = ()=>doDecode(true);

$("decodeCopyAcc").onclick = async ()=>{
  if(!lastDecodedData) return;
  await copyTextToClipboard(lastDecodedData.account, "تم نسخ رقم الحساب بنجاح");
};

$("decodeSaveVault").onclick = ()=>{
  if(!lastDecodedData) return;
  // Switch to saved tab and prefill form
  const savedTab = document.querySelector('.tab[data-tab="saved"]');
  if(savedTab) savedTab.click();
  $("vBank").value = lastDecodedData.bank.id;
  $("vName").value = lastDecodedData.bank.name;
  $("vAccount").value = lastDecodedData.account;
  updateVaultAccountCounter();
  updateVaultHint();
  showToast("تم نقل البيانات", "أكمل تسمية الحساب واضغط حفظ الحساب.");
  window.scrollTo({top: 0, behavior: "smooth"});
};

// Saved Accounts (Vault)
function populateVaultBanks(){
  const sel = $("vBank");
  const currVal = sel.value;
  sel.innerHTML = bankOptionsHTML();
  if(banks.some(b=>b.id===currVal)) sel.value = currVal;
  vaultDD.render();
  updateVaultHint();
  updateVaultAccountCounter();
}

function updateVaultHint(){
  const b = banks.find(x=>x.id===$("vBank").value);
  $("vBankHint").textContent = accountHintText(b);
}

function updateVaultAccountCounter(){
  setCounter($("vAccountCounter"), banks.find(x=>x.id===$("vBank").value), $("vAccount").value);
}

$("vAccount").addEventListener("input", (e)=>{
  const clean = sanitizeDigits(e.target.value);
  if(e.target.value !== clean) e.target.value = clean;
  updateVaultAccountCounter();
});

$("vAccount").addEventListener("keydown", (e)=>{
  if(e.key === "Enter") $("addVault").click();
});

$("vBank").addEventListener("change", ()=>{
  updateVaultHint();
  updateVaultAccountCounter();
});

// Search Vault
$("searchVault").addEventListener("input", (e)=>{
  currentSearchQuery = e.target.value.trim().toLowerCase();
  renderVault();
});

function renderVault(){
  const query = currentSearchQuery;
  const filtered = savedAccounts.filter(x=>{
    if(!query) return true;
    const b = banks.find(bank=>bank.id===x.bankId);
    const bankName = b ? b.name.toLowerCase() : "";
    const accName = (x.name || "").toLowerCase();
    const accNum = String(x.account || "");
    const bban = b ? calculateBBAN(b, x.account).toLowerCase() : "";
    return accName.includes(query) || accNum.includes(query) || bankName.includes(query) || bban.includes(query);
  });

  if(!filtered.length){
    $("vaultList").innerHTML = savedAccounts.length
      ? `<div class="empty">لا توجد نتائج تطابق بحثك "${esc(query)}".</div>`
      : `<div class="empty">لا توجد حسابات محفوظة حتى الآن.</div>`;
    return;
  }

  $("vaultList").innerHTML = filtered.map(x=>{
    const b = banks.find(bank=>bank.id===x.bankId);
    const lenOk = !!b && isValidAccountLen(b, x.account);
    const bban = b ? calculateBBAN(b, x.account) : "";
    const bankName = b ? b.name : "بنك غير موجود";
    return `
    <div class="item" style="display:block;padding:17px">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
        <div>
          <b style="font-size:17px">🏦 ${esc(x.name || bankName)}</b>
          <div style="color:var(--muted);font-size:13px;margin-top:5px">${esc(bankName)}</div>
        </div>
      </div>
      <div style="margin-top:14px;padding:12px;background:var(--input-bg);border:1px solid var(--border);border-radius:12px">
        <div style="font-size:12px;color:var(--muted);margin-bottom:4px">رقم الحساب الأساسي</div>
        <div class="mono" style="font-size:17px;font-weight:700">${esc(x.account)}</div>
      </div>
      <div style="margin-top:9px;padding:12px;background:var(--result-bg);border:1px solid var(--border);border-radius:12px">
        <div style="font-size:12px;color:var(--muted);margin-bottom:4px">BBAN</div>
        <div class="mono" style="font-size:19px;font-weight:800;word-break:break-all">${!b ? '<span style="color:var(--danger)">تعذر الحساب — البنك المرتبط لم يعد موجودًا</span>' : lenOk ? esc(bban) : `<span style="color:var(--danger);font-size:14px;font-weight:700">طول رقم الحساب (${String(x.account).length}) لا يطابق صيغة البنك الحالية (${b.accPrefix ? b.len + " أو " + (b.len + b.accPrefix.length) : b.len} أرقام) — اضغط تعديل وصحّح الرقم</span>`}</div>
      </div>
      <div class="actions" style="margin-top:12px">
        <button class="btn primary" style="flex:1" onclick="copyVault('${x.id}')" ${lenOk?"":"disabled"}>📋 نسخ BBAN</button>
        <button class="btn secondary" onclick="openVaultQr('${x.id}')" ${lenOk?"":"disabled"}>📱 رمز QR</button>
        <button class="btn secondary" onclick="shareVault('${x.id}')" ${lenOk?"":"disabled"}>📤 مشاركة</button>
        <button class="btn secondary" onclick="editVault('${x.id}')">✏️ تعديل</button>
        <button class="btn danger" onclick="removeVault('${x.id}')">🗑 حذف</button>
      </div>
    </div>`;
  }).join("");
}

window.openVaultQr = id=>{
  const x = savedAccounts.find(v=>v.id===id);
  if(!x) return;
  const b = banks.find(bank=>bank.id===x.bankId);
  if(!b) return;
  const bban = calculateBBAN(b, x.account);
  showQrModal(`رمز QR — ${x.name || b.name}`, `امسح الكود للحصول على رقم BBAN الخاص بـ ${b.name}`, bban, bban);
};

$("addVault").onclick = ()=>{
  const bankId = $("vBank").value;
  const b = banks.find(x=>x.id===bankId);
  const name = $("vName").value.trim();
  const account = sanitizeDigits($("vAccount").value.trim());

  if(!b){showToast("لا يوجد بنك", "أضف بنكاً أولاً من صفحة البنوك.", "!");return;}
  if(!name){showToast("اسم الحساب مطلوب", "أدخل اسمًا للحساب المحفوظ.", "!");return;}
  if(!/^\d+$/.test(account)){showToast("رقم الحساب غير صحيح", "استخدم الأرقام فقط دون مسافات أو رموز.", "!");return;}
  if(!isValidAccountLen(b, account)){showToast("طول رقم الحساب غير صحيح", accountHintText(b), "!");return;}

  const data = {name, bankId, account: normalizeAccount(b, account)};
  const wasVaultEdit = !!vaultEditId;

  if(vaultEditId){
    const old = savedAccounts.find(x=>x.id===vaultEditId);
    if(old) Object.assign(old, data);
    vaultEditId = null;
    $("cancelVaultEdit").classList.add("hidden");
    $("addVault").textContent = "حفظ الحساب";
  }else{
    savedAccounts.push({id: makeId(), ...data});
  }

  saveSavedAccounts();
  clearVaultForm();
  renderVault();
  updateVaultAccountCounter();
  showToast(wasVaultEdit ? "تم حفظ التعديل" : "تم حفظ الحساب", wasVaultEdit ? "تم تحديث بيانات الحساب بنجاح." : "تم حفظ الحساب بنجاح.");
};

function clearVaultForm(){
  $("vName").value = "";
  $("vAccount").value = "";
}

window.editVault = id=>{
  const x = savedAccounts.find(v=>v.id===id);
  if(!x) return;
  $("vBank").value = x.bankId;
  $("vName").value = x.name;
  $("vAccount").value = x.account;
  vaultEditId = id;
  $("cancelVaultEdit").classList.remove("hidden");
  $("addVault").textContent = "حفظ التعديل";
  updateVaultHint();
  updateVaultAccountCounter();
  window.scrollTo({top:0, behavior:"smooth"});
};

$("cancelVaultEdit").onclick = ()=>{
  vaultEditId = null;
  clearVaultForm();
  $("cancelVaultEdit").classList.add("hidden");
  $("addVault").textContent = "حفظ الحساب";
  updateVaultAccountCounter();
};

let toastTimer;
function showToast(title="تمت العملية بنجاح", sub="تم تنفيذ العملية.", icon="✓"){
  const t = $("appToast");
  if(!t) return;
  $("toastTitle").textContent = title;
  $("toastSub").textContent = sub;
  t.querySelector(".toastIcon").textContent = icon;
  t.classList.toggle("warn", icon === "!");
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>t.classList.remove("show"), 2500);
}
$("toastClose").onclick = ()=>$("appToast").classList.remove("show");

window.copyVault = async id=>{
  const x = savedAccounts.find(v=>v.id===id);
  if(!x) return;
  const b = banks.find(v=>v.id===x.bankId);
  if(!b) return;
  const bban = calculateBBAN(b, x.account);
  await copyTextToClipboard(bban, "تم نسخ BBAN للحافظة");
};

window.shareVault = async id=>{
  const x = savedAccounts.find(v=>v.id===id);
  if(!x) return;
  const b = banks.find(bank=>bank.id===x.bankId);
  if(!b){showToast("البنك غير موجود", "البنك المرتبط بهذا الحساب لم يعد موجودًا.", "!");return;}
  const bban = calculateBBAN(b, x.account);
  const text = `تفاصيل الحساب البنكي:\n🏦 البنك: ${b.name}\n👤 الاسم: ${x.name}\n🔢 رقم الحساب: ${x.account}\n💳 رقم BBAN:\n${bban}`;
  if(navigator.share){
    try{ await navigator.share({title: "بيانات BBAN", text}); }catch(e){}
  } else {
    await copyTextToClipboard(text, "تم نسخ بطاقة الحساب للمشاركة");
  }
};

window.removeVault = id=>{
  showConfirmModal("حذف الحساب", "هل تريد حذف هذا الحساب المحفوظ؟", "حذف", ()=>{
    savedAccounts = savedAccounts.filter(v=>v.id!==id);
    saveSavedAccounts();
    renderVault();
    showToast("تم الحذف", "تم حذف الحساب بنجاح.");
  });
};

// Export Backup
$("exportVault").onclick = ()=>{
  const data = {
    app: "BBAN Generator",
    version: 2,
    exportedAt: new Date().toISOString(),
    banks: banks,
    accounts: savedAccounts
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "BBAN-backup.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
  showToast("تم التصدير بنجاح", "تم تنزيل ملف النسخة الاحتياطية.");
};

// Import Backup
$("importVault").onchange = async e=>{
  const file = e.target.files[0];
  if(!file){
    e.target.value = "";
    return;
  }
  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if(data && Array.isArray(data.banks)){
      data.banks.forEach(importedBank=>{
        if(importedBank && importedBank.id && !banks.some(b=>b.id === importedBank.id)){
          banks.push(importedBank);
        }
      });
    }

    const accounts = Array.isArray(data) ? data : (data.accounts || data.vaults || data.savedAccounts || []);
    if(!Array.isArray(accounts)) throw new Error("invalid backup format");

    const cleaned = accounts.filter(x=>x && typeof x.account === "string" && typeof x.bankId === "string")
      .map(x=>({
        id: x.id || makeId(),
        name: String(x.name || "حساب"),
        bankId: x.bankId,
        account: sanitizeDigits(x.account)
      }));

    let addedCount = 0, updatedCount = 0;
    cleaned.forEach(imp=>{
      const existing = savedAccounts.find(a=>a.id === imp.id);
      if(existing){ 
        Object.assign(existing, imp); 
        updatedCount++; 
      }else{ 
        savedAccounts.push(imp); 
        addedCount++; 
      }
    });

    // Clean up duplicate/legacy banks that may come from older backups, keeping saved accounts linked
    const idMap = normalizeBanks();
    remapAccountBankIds(idMap);
    normalizeSavedAccounts();
    saveBanks();
    saveSavedAccounts();
    renderBanks();
    initSavedPage();
    showToast("تم الاستيراد بنجاح", `تمت إضافة ${addedCount} وتحديث ${updatedCount} من الحسابات، دون حذف أي بيانات موجودة.`);
  } catch(err){
    showToast("ملف غير صالح", "تعذر قراءة النسخة الاحتياطية أو الملف غير متوافق.", "!");
  } finally {
    e.target.value = "";
  }
};

// ---- QR scanner (camera or image) — reads an account number, BBAN or IBAN
let scanStream = null, scanTimer = 0, scanCallback = null, scanOpen = false;
const scanCanvas = document.createElement("canvas");
const scanCtx = scanCanvas.getContext("2d", {willReadFrequently:true});

// Extracts an IBAN (2 letters + 2 check digits + digits) or the longest digit run from scanned text
function parseScanned(text){
  const clean = String(text || "").toUpperCase().replace(/[\s\-]/g, "");
  const ib = clean.match(/[A-Z]{2}\d{2}\d{10,30}/);
  if(ib) return {kind:"iban", iban:ib[0], bban:ib[0].slice(4)};
  const runs = (clean.match(/\d+/g) || []).filter(r=>r.length >= 4).sort((a,b)=>b.length - a.length);
  return runs.length ? {kind:"digits", digits:runs[0]} : null;
}

function setScanMsg(msg){
  $("scanMsg").textContent = msg || "";
  $("scanMsg").classList.toggle("hidden", !msg);
}

function stopScanStream(){
  clearTimeout(scanTimer);
  if(scanStream){ scanStream.getTracks().forEach(t=>t.stop()); scanStream = null; }
  const v = $("scanVideo");
  try{ v.pause(); }catch(e){}
  v.srcObject = null;
}

function closeScanner(){
  scanOpen = false;
  stopScanStream();
  $("scanModal").classList.remove("show");
  $("scanModal").setAttribute("aria-hidden", "true");
}

function finishScan(text){
  const cb = scanCallback;
  closeScanner();
  if(cb) cb(text);
}

function decodeImageData(data, w, h, both){
  if(typeof jsQR !== "function") return null;
  const r = jsQR(data, w, h, {inversionAttempts: both ? "attemptBoth" : "dontInvert"});
  return r && r.data ? r.data : null;
}

function scanLoop(){
  if(!scanOpen || !scanStream) return;
  const v = $("scanVideo");
  if(v.readyState >= 2 && v.videoWidth){
    const scale = Math.min(1, 640 / Math.max(v.videoWidth, v.videoHeight));
    const w = Math.round(v.videoWidth * scale), h = Math.round(v.videoHeight * scale);
    scanCanvas.width = w; scanCanvas.height = h;
    scanCtx.drawImage(v, 0, 0, w, h);
    const text = decodeImageData(scanCtx.getImageData(0, 0, w, h).data, w, h, false);
    if(text){ finishScan(text); return; }
  }
  scanTimer = setTimeout(scanLoop, 120);
}

async function startScanCamera(){
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    setScanMsg("الكاميرا غير متاحة (يلزم فتح التطبيق عبر HTTPS). يمكنك اختيار صورة تحتوي على رمز QR.");
    return;
  }
  try{
    const stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"}}, audio:false});
    if(!scanOpen){ stream.getTracks().forEach(t=>t.stop()); return; }
    scanStream = stream;
    const v = $("scanVideo");
    v.srcObject = stream;
    await v.play();
    scanLoop();
  }catch(e){
    const denied = e && (e.name === "NotAllowedError" || e.name === "SecurityError");
    setScanMsg(denied ? "تم رفض إذن الكاميرا. اسمح بالوصول للكاميرا من إعدادات المتصفح، أو اختر صورة تحتوي على رمز QR."
                      : "تعذر تشغيل الكاميرا. يمكنك اختيار صورة تحتوي على رمز QR.");
  }
}

function openScanner(onResult){
  scanCallback = onResult;
  scanOpen = true;
  setScanMsg("");
  $("scanModal").classList.add("show");
  $("scanModal").setAttribute("aria-hidden", "false");
  startScanCamera();
}

$("scanClose").onclick = closeScanner;
$("scanModal").addEventListener("click", e=>{ if(e.target === $("scanModal")) closeScanner(); });
document.addEventListener("keydown", e=>{ if(e.key === "Escape" && scanOpen) closeScanner(); });

$("scanFile").onchange = async e=>{
  const file = e.target.files[0];
  e.target.value = "";
  if(!file) return;
  try{
    const url = URL.createObjectURL(file);
    const img = await new Promise((res, rej)=>{ const i = new Image(); i.onload = ()=>res(i); i.onerror = rej; i.src = url; });
    let text = null;
    for(const max of [1200, 800, 500]){
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale));
      scanCanvas.width = w; scanCanvas.height = h;
      scanCtx.fillStyle = "#fff"; scanCtx.fillRect(0, 0, w, h);
      scanCtx.drawImage(img, 0, 0, w, h);
      text = decodeImageData(scanCtx.getImageData(0, 0, w, h).data, w, h, true);
      if(text) break;
    }
    URL.revokeObjectURL(url);
    if(text) finishScan(text);
    else setScanMsg("لم يتم العثور على رمز QR في هذه الصورة. جرّب صورة أوضح.");
  }catch(err){
    setScanMsg("تعذر قراءة الصورة.");
  }
};

// Generator: fills bank + account from a scanned account number, BBAN or IBAN
function applyScanToGenerator(text){
  const p = parseScanned(text);
  if(!p){ showToast("لم تتم قراءة رقم", "الرمز لا يحتوي على رقم حساب أو BBAN أو IBAN.", "!"); return; }
  const bban = p.kind === "iban" ? p.bban : p.digits;
  const matches = findBankMatches(bban);
  if(matches.length){
    const cur = $("bankSelect").value;
    const m = matches.find(x=>x.bank.id === cur) || matches[0];
    $("bankSelect").value = m.bank.id;
    $("bankSelect").dispatchEvent(new Event("change", {bubbles:true}));
    $("account").value = m.account;
    updateAccountCounter();
    doGenerate(true);
    showToast("تمت قراءة الرمز", `${m.bank.name}${p.kind === "iban" ? " — تم تحويل IBAN إلى BBAN" : ""}`);
    return;
  }
  if(p.kind === "iban"){
    showToast("لم يتم العثور على بنك مطابق", "تأكد من أن قواعد البنك مضافة في صفحة البنوك.", "!");
    return;
  }
  // Plain account number for the selected bank
  const b = banks.find(x=>x.id === $("bankSelect").value);
  $("account").value = p.digits;
  updateAccountCounter();
  if(b && isValidAccountLen(b, p.digits)){
    doGenerate(true);
    showToast("تمت قراءة الرمز", "تم إدخال رقم الحساب.");
  } else {
    showToast("تمت قراءة رقم", "طوله لا يطابق البنك المحدد — اختر البنك الصحيح أو راجع الرقم.", "!");
  }
}

// Decoder: puts the scanned BBAN/IBAN into the input and decodes it
function applyScanToDecoder(text){
  const p = parseScanned(text);
  if(!p){ showToast("لم تتم قراءة رقم", "الرمز لا يحتوي على BBAN أو IBAN.", "!"); return; }
  $("decodeInput").value = p.kind === "iban" ? p.iban : p.digits;
  $("decodeInput").dispatchEvent(new Event("input", {bubbles:true}));
  doDecode(true);
}

$("scanGenBtn").onclick = ()=>openScanner(applyScanToGenerator);
$("scanDecBtn").onclick = ()=>openScanner(applyScanToDecoder);

function initSavedPage(){
  populateVaultBanks();
  renderVault();
}

renderBanks();
initSavedPage();

// PWA Service Worker Registration & Update Notification
let deferredPrompt = null;
const installBtn = $("installBtn");
const updateBanner = $("updateBanner");
const updateAppBtn = $("updateAppBtn");
let newWorker = null;

window.addEventListener("beforeinstallprompt", (e)=>{
  e.preventDefault();
  deferredPrompt = e;
  if(installBtn) installBtn.classList.remove("hidden");
});

if(installBtn){
  installBtn.onclick = async ()=>{
    if(!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if(outcome === "accepted"){
      showToast("تثبيت ناجح", "تم تثبيت تطبيق مولد BBAN بنجاح.");
    }
    deferredPrompt = null;
    installBtn.classList.add("hidden");
  };
}

window.addEventListener("appinstalled", ()=>{
  deferredPrompt = null;
  if(installBtn) installBtn.classList.add("hidden");
  showToast("تم التثبيت", "تم تثبيت التطبيق على جهازك بنجاح.");
});

if(updateAppBtn){
  updateAppBtn.onclick = ()=>{
    if(newWorker){
      newWorker.postMessage({ type: "SKIP_WAITING" });
    } else {
      window.location.reload();
    }
  };
}

if("serviceWorker" in navigator){
  window.addEventListener("load", ()=>{
    navigator.serviceWorker.register("sw.js").then(reg=>{
      function promptUserToRefresh(){
        if(updateBanner) updateBanner.classList.remove("hidden");
      }

      if(reg.waiting){
        newWorker = reg.waiting;
        promptUserToRefresh();
      }

      reg.addEventListener("updatefound", ()=>{
        const installingWorker = reg.installing;
        if(!installingWorker) return;
        installingWorker.addEventListener("statechange", ()=>{
          if(installingWorker.state === "installed" && navigator.serviceWorker.controller){
            newWorker = installingWorker;
            promptUserToRefresh();
          }
        });
      });
    }).catch(err=>{
      console.error("ServiceWorker registration failed: ", err);
    });

    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", ()=>{
      if(!refreshing){
        refreshing = true;
        window.location.reload();
      }
    });
  });
}
