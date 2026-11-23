function makeId(){
  if(window.crypto && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return "id-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,10);
}

const DEFAULT_BANKS = [
  {id:"default-bankak",name:"بنكك",code:"1",prefix:"040",suffix:"0001",len:7},
  {id:"default-masrafak",name:"مصرفك",code:"2",prefix:"220",suffix:"",len:11},
  {id:"default-fawry",name:"فوري",code:"3",prefix:"02",suffix:"0001",len:8},
  {id:"default-makashi",name:"ماي كاشي",code:"4",prefix:"070",suffix:"98",len:9},
  {id:"default-O-cash",name:"أوكاش",code:"5",prefix:"24",suffix:"00001",len:7},
  {id:"default-sah",name:"صح - sah",code:"6",prefix:"",suffix:"",len:14},
  {id:"default-islamic-sudanese",name:"البنك الإسلامي",code:"7",prefix:"140",suffix:"00001",len:6}
];

let storedBanks = JSON.parse(localStorage.getItem("bban_banks") || "null");
let banks = Array.isArray(storedBanks) ? storedBanks : DEFAULT_BANKS.map(b=>({...b}));

DEFAULT_BANKS.forEach(def=>{
  const exists = banks.some(b => b.id === def.id || (b.name || "").trim() === def.name);
  if(!exists) banks.push({...def});
});

localStorage.setItem("bban_banks", JSON.stringify(banks));

let editId = null;
let savedAccounts = JSON.parse(localStorage.getItem("bban_saved_accounts") || "[]");
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
function showConfirmModal(title, sub, confirmText = "حذف", onConfirm = null){
  $("modalTitle").textContent = title;
  $("modalSub").textContent = sub;
  $("modalConfirm").textContent = confirmText;
  onModalConfirmCallback = onConfirm;
  $("appModal").classList.add("show");
}

function hideConfirmModal(){
  $("appModal").classList.remove("show");
  onModalConfirmCallback = null;
}

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
}

function hideQrModal(){
  $("qrModal").classList.remove("show");
  qrModalCurrentText = "";
}

$("qrModalClose").onclick = hideQrModal;
$("qrModalCopy").onclick = async ()=>{
  if(!qrModalCurrentText) return;
  await copyTextToClipboard(qrModalCurrentText, "تم نسخ الرقم بنجاح");
};

function renderBanks(){
  const sel = $("bankSelect");
  const currVal = sel.value;
  sel.innerHTML = banks.map(b=>`<option value="${b.id}">${esc(b.name)}</option>`).join("");
  if(banks.some(b=>b.id===currVal)) sel.value = currVal;

  $("bankList").innerHTML = banks.length ? banks.map(b=>`
    <div class="item">
      <div><b>${esc(b.name)}</b><span class="mono">${esc(b.prefix)} + الحساب + ${esc(b.suffix)} — الحساب ${b.len} أرقام</span></div>
      <div class="actions">
        <button class="btn secondary" onclick="editBank('${b.id}')">تعديل</button>
        <button class="btn danger" onclick="deleteBank('${b.id}')">حذف</button>
      </div>
    </div>`).join("") : `<div class="empty">لا توجد بنوك.</div>`;
  updateHint();
  updateAccountCounter();
}

function updateHint(){
  const b = banks.find(x=>x.id===$("bankSelect").value);
  $("bankHint").textContent = b ? `يجب أن يكون رقم الحساب ${b.len} أرقام. الناتج = ${b.prefix} + رقم الحساب + ${b.suffix}` : "أضف بنكاً من صفحة البنوك.";
}

function updateAccountCounter(){
  const b = banks.find(x=>x.id===$("bankSelect").value);
  const acc = $("account").value;
  const counter = $("accountCounter");
  const reqLen = b ? Number(b.len) : 0;
  
  counter.textContent = `${acc.length} / ${reqLen}`;
  counter.classList.remove("done", "overflow");

  if(!reqLen) return;
  if(acc.length === reqLen){
    counter.classList.add("done");
  } else if(acc.length > reqLen){
    counter.classList.add("overflow");
  }
}

// Auto-sanitize and live calculation on account input
$("account").addEventListener("input", (e)=>{
  const clean = sanitizeDigits(e.target.value);
  if(e.target.value !== clean) e.target.value = clean;
  updateAccountCounter();

  const b = banks.find(x=>x.id===$("bankSelect").value);
  if(b && clean.length === Number(b.len)){
    doGenerate(false); // Live auto calculate
  }
});

$("account").addEventListener("keydown", (e)=>{
  if(e.key === "Enter") doGenerate(true);
});

$("bankSelect").addEventListener("change", ()=>{
  updateHint();
  updateAccountCounter();
  const b = banks.find(x=>x.id===$("bankSelect").value);
  const acc = $("account").value.trim();
  if(b && acc.length === Number(b.len)) doGenerate(false);
});

function calculateBBAN(bank, account){
  return bank.prefix + account + bank.suffix;
}

function formatBBANWithSpaces(bank, account){
  return [bank.prefix, account, bank.suffix].filter(Boolean).join(" ");
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
  if(acc.length !== Number(b.len)){
    if(showWarningToasts) showToast("طول رقم الحساب غير صحيح", `يجب أن يكون رقم الحساب ${b.len} أرقام.`, "!");
    return;
  }

  const out = calculateBBAN(b, acc);
  $("resultNum").textContent = out;

  $("resultChunks").innerHTML = `
    <div class="chunk-part"><div class="chunk-val">${esc(b.prefix || "—")}</div><div class="chunk-tag">سابقة Prefix</div></div>
    <div class="chunk-part acc"><div class="chunk-val">${esc(acc)}</div><div class="chunk-tag">رقم الحساب (${acc.length} أرقام)</div></div>
    <div class="chunk-part"><div class="chunk-val">${esc(b.suffix || "—")}</div><div class="chunk-tag">لاحقة Suffix</div></div>
  `;

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

$("copySpacesBtn").onclick = async ()=>{
  const b = banks.find(x=>x.id===$("bankSelect").value);
  const acc = $("account").value.trim();
  if(!b || !acc) return;
  const spaced = formatBBANWithSpaces(b, acc);
  const ok = await copyTextToClipboard(spaced, "تم نسخ BBAN مع فواصل");
  if(ok){
    $("copySpacesBtn").textContent = "تم النسخ ✓";
    setTimeout(()=>$("copySpacesBtn").textContent = "نسخ مع فواصل", 1200);
  }
};

$("shareBtn").onclick = async ()=>{
  const b = banks.find(x=>x.id===$("bankSelect").value);
  const acc = $("account").value.trim();
  const bban = $("resultNum").textContent;
  if(!b || !acc || !bban) return;

  const text = `تفاصيل الحساب البنكي:\n🏦 البنك: ${b.name}\n🔢 رقم الحساب: ${acc}\n💳 رقم BBAN:\n${bban}`;
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
    "هل تريد استعادة قائمة البنوك الأساسية؟ سيتم تحديث بيانات البنوك الافتراضية مع الاحتفاظ بالبنوك المخصصة التي أضفتها.",
    "استعادة",
    ()=>{
      DEFAULT_BANKS.forEach(def=>{
        const idx = banks.findIndex(b=>b.id === def.id || (b.name || "").trim() === def.name);
        if(idx !== -1){
          banks[idx] = {...def};
        } else {
          banks.push({...def});
        }
      });
      saveBanks();
      renderBanks();
      initSavedPage();
      showToast("تمت الاستعادة", "تمت استعادة قائمة البنوك الافتراضية بنجاح.");
    }
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
  ["bName","bCode","bPrefix","bSuffix","bLen"].forEach(x=>$(x).value = "");
}

window.editBank = id=>{
  const b = banks.find(x=>x.id===id);
  if(!b) return;
  editId = id;
  $("bName").value = b.name;
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
$("decodeInput").addEventListener("input", (e)=>{
  const c = sanitizeDigits(e.target.value);
  if(e.target.value !== c) e.target.value = c;
  $("decodeCounter").textContent = `${c.length} رقم`;
  if(c.length >= 7) doDecode(false);
});

$("decodeInput").addEventListener("keydown", (e)=>{
  if(e.key === "Enter") doDecode(true);
});

let lastDecodedData = null;

function doDecode(showWarningToasts = true){
  const bban = sanitizeDigits($("decodeInput").value);
  if(!bban){
    if(showWarningToasts) showToast("أدخل رقم BBAN", "يرجى لصق أو كتابة رقم BBAN المراد تفكيكه.", "!");
    $("decodeResult").style.display = "none";
    return;
  }

  // Find candidate bank
  const matches = [];
  for(const b of banks){
    const p = b.prefix || "";
    const s = b.suffix || "";
    const expectedLen = p.length + Number(b.len) + s.length;
    if(bban.length === expectedLen && bban.startsWith(p) && bban.endsWith(s)){
      const acc = bban.slice(p.length, bban.length - (s.length || undefined));
      matches.push({bank: b, account: acc});
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

  $("decodeBankName").textContent = match.bank.name;
  $("decodePrefix").textContent = match.bank.prefix || "—";
  $("decodeAccount").textContent = match.account;
  $("decodeSuffix").textContent = match.bank.suffix || "—";
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
  sel.innerHTML = banks.map(b=>`<option value="${b.id}">${esc(b.name)}</option>`).join("");
  if(banks.some(b=>b.id===currVal)) sel.value = currVal;
  updateVaultHint();
  updateVaultAccountCounter();
}

function updateVaultHint(){
  const b = banks.find(x=>x.id===$("vBank").value);
  $("vBankHint").textContent = b
    ? `الحساب يجب أن يكون ${b.len} أرقام — BBAN = ${b.prefix} + رقم الحساب + ${b.suffix}`
    : "أضف بنكاً أولاً من صفحة البنوك.";
}

function updateVaultAccountCounter(){
  const b = banks.find(x=>x.id===$("vBank").value);
  const acc = $("vAccount").value;
  const counter = $("vAccountCounter");
  const reqLen = b ? Number(b.len) : 0;
  
  counter.textContent = `${acc.length} / ${reqLen}`;
  counter.classList.remove("done", "overflow");

  if(!reqLen) return;
  if(acc.length === reqLen){
    counter.classList.add("done");
  } else if(acc.length > reqLen){
    counter.classList.add("overflow");
  }
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
        <div class="mono" style="font-size:19px;font-weight:800;word-break:break-all">${b ? esc(bban) : '<span style="color:var(--danger)">تعذر الحساب — البنك المرتبط لم يعد موجودًا</span>'}</div>
      </div>
      <div class="actions" style="margin-top:12px">
        <button class="btn primary" style="flex:1" onclick="copyVault('${x.id}')" ${b?"":"disabled"}>📋 نسخ BBAN</button>
        <button class="btn secondary" onclick="openVaultQr('${x.id}')" ${b?"":"disabled"}>📱 رمز QR</button>
        <button class="btn secondary" onclick="shareVault('${x.id}')" ${b?"":"disabled"}>📤 مشاركة</button>
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
  if(account.length !== Number(b.len)){showToast("طول رقم الحساب غير صحيح", `يجب أن يكون رقم الحساب ${b.len} أرقام.`, "!");return;}

  const data = {name, bankId, account};
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
      saveBanks();
      renderBanks();
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

    saveSavedAccounts();
    initSavedPage();
    showToast("تم الاستيراد بنجاح", `تمت إضافة ${addedCount} وتحديث ${updatedCount} من الحسابات، دون حذف أي بيانات موجودة.`);
  } catch(err){
    showToast("ملف غير صالح", "تعذر قراءة النسخة الاحتياطية أو الملف غير متوافق.", "!");
  } finally {
    e.target.value = "";
  }
};

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
