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

const $ = id => document.getElementById(id);
const saveBanks = ()=>localStorage.setItem("bban_banks",JSON.stringify(banks));
const saveSavedAccounts = ()=>localStorage.setItem("bban_saved_accounts", JSON.stringify(savedAccounts));

// Custom Modal Handler
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

function renderBanks(){
  $("bankSelect").innerHTML = banks.map(b=>`<option value="${b.id}">${esc(b.name)}</option>`).join("");
  $("bankList").innerHTML = banks.length ? banks.map(b=>`
    <div class="item">
      <div><b>${esc(b.name)}</b><span class="mono">${esc(b.prefix)} + الحساب + ${esc(b.suffix)} — الحساب ${b.len} أرقام</span></div>
      <div class="actions">
        <button class="btn secondary" onclick="editBank('${b.id}')">تعديل</button>
        <button class="btn danger" onclick="deleteBank('${b.id}')">حذف</button>
      </div>
    </div>`).join("") : `<div class="empty">لا توجد بنوك.</div>`;
  updateHint();
}

function updateHint(){
  const b=banks.find(x=>x.id===$("bankSelect").value);
  $("bankHint").textContent=b?`يجب أن يكون رقم الحساب ${b.len} أرقام. الناتج = ${b.prefix} + رقم الحساب + ${b.suffix}`:"أضف بنكاً من صفحة البنوك.";
}

$("bankSelect").addEventListener("change",updateHint);

$("generate").onclick=()=>{
  const b=banks.find(x=>x.id===$("bankSelect").value), acc=$("account").value.trim();
  if(!b){showToast("لا يوجد بنك", "أضف بنكاً أولاً من صفحة البنوك.", "!");return;}
  if(!/^\d+$/.test(acc)){showToast("رقم الحساب غير صحيح", "استخدم الأرقام فقط دون مسافات أو رموز.", "!");return;}
  if(acc.length!==Number(b.len)){showToast("طول رقم الحساب غير صحيح", `يجب أن يكون رقم الحساب ${b.len} أرقام.`, "!");return;}
  const out=b.prefix+acc+b.suffix;
  $("resultNum").textContent=out;$("result").style.display="block";
};

$("copyBtn").onclick=async()=>{
  const text=$("resultNum").textContent;
  try{
    if(navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
    else{
      const ta=document.createElement("textarea");ta.value=text;ta.style.position="fixed";ta.style.opacity="0";document.body.appendChild(ta);ta.focus();ta.select();
      if(!document.execCommand("copy"))throw new Error("copy failed");
      ta.remove();
    }
    $("copyBtn").textContent="تم النسخ ✓";
    showToast("تم نسخ BBAN بنجاح", "الرقم جاهز للصق والمشاركة");
    setTimeout(()=>$("copyBtn").textContent="اضغط للنسخ",1200);
  }catch(e){showToast("تعذر النسخ", "اضغط مطولًا على الرقم لنسخه يدويًا", "!");}
};

function isDuplicateBankName(name, excludeId){
  const norm = name.trim().toLowerCase();
  return banks.some(b => b.id !== excludeId && (b.name || "").trim().toLowerCase() === norm);
}

$("saveBank").onclick=()=>{
  const data={name:$("bName").value.trim(),code:$("bCode").value.trim(),prefix:$("bPrefix").value.trim(),suffix:$("bSuffix").value.trim(),len:Number($("bLen").value)};
  const lenOk = Number.isInteger(data.len) && data.len > 0;
  if(!data.name||!/^[\d]*$/.test(data.prefix)||!/^[\d]*$/.test(data.suffix)||!lenOk){showToast("بيانات البنك غير مكتملة", "أكمل بيانات البنك بصورة صحيحة (طول الحساب يجب أن يكون رقمًا صحيحًا أكبر من صفر).", "!");return;}
  if(isDuplicateBankName(data.name, editId)){showToast("اسم البنك مكرر", "يوجد بنك آخر بنفس الاسم بالفعل.", "!");return;}
  const wasEdit = !!editId;
  if(editId){Object.assign(banks.find(b=>b.id===editId),data);editId=null;$("cancelEdit").classList.add("hidden");}
  else banks.push({id:makeId(),...data});
  saveBanks();clearBankForm();renderBanks();initSavedPage();
  showToast(wasEdit ? "تم حفظ التعديل" : "تم حفظ البنك", wasEdit ? "تم تحديث بيانات البنك بنجاح." : "تمت إضافة البنك إلى القائمة.");
};

function clearBankForm(){["bName","bCode","bPrefix","bSuffix","bLen"].forEach(x=>$(x).value="")}

window.editBank=id=>{
 const b=banks.find(x=>x.id===id); if(!b)return;
 editId=id;$("bName").value=b.name;$("bCode").value=b.code;$("bPrefix").value=b.prefix;$("bSuffix").value=b.suffix;$("bLen").value=b.len;
 $("cancelEdit").classList.remove("hidden");window.scrollTo({top:0,behavior:"smooth"});
};

window.deleteBank=id=>{
 if(banks.length===1){showToast("لا يمكن الحذف", "يجب أن يبقى بنك واحد على الأقل.", "!");return;}
 const linkedCount = savedAccounts.filter(a=>a.bankId===id).length;
 const sub = linkedCount>0
   ? `تحذير: هناك ${linkedCount} حساب/حسابات محفوظة مرتبطة بهذا البنك وستظهر كـ "بنك غير موجود" بعد الحذف. هل تريد المتابعة؟`
   : "هل أنت تأكيد من حذف هذا البنك من القائمة؟";
 showConfirmModal("حذف البنك", sub, "حذف", ()=>{
   banks=banks.filter(b=>b.id!==id);
   saveBanks();
   renderBanks();
   initSavedPage();
   showToast("تم حذف البنك", "تمت إزالة البنك من القائمة.");
 });
};

$("cancelEdit").onclick=()=>{editId=null;clearBankForm();$("cancelEdit").classList.add("hidden")};

document.querySelectorAll(".tab").forEach(btn=>btn.onclick=()=>{
 document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));btn.classList.add("active");
 document.querySelectorAll(".panel").forEach(x=>x.classList.add("hidden"));$(btn.dataset.tab).classList.remove("hidden");
 if(btn.dataset.tab==="banks")renderBanks(); 
 if(btn.dataset.tab==="saved")initSavedPage();
});

function esc(s){return String(s??"").replace(/[&<>"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}

function populateVaultBanks(){
  $("vBank").innerHTML = banks.map(b=>`<option value="${b.id}">${esc(b.name)}</option>`).join("");
  updateVaultHint();
}

function updateVaultHint(){
  const b=banks.find(x=>x.id===$("vBank").value);
  $("vBankHint").textContent=b
    ? `الحساب يجب أن يكون ${b.len} أرقام — BBAN = ${b.prefix} + رقم الحساب + ${b.suffix}`
    : "أضف بنكاً أولاً من صفحة البنوك.";
}

$("vBank").addEventListener("change",updateVaultHint);

function calculateBBAN(bank, account){
  return bank.prefix + account + bank.suffix;
}

function renderVault(){
  if(!savedAccounts.length){
    $("vaultList").innerHTML=`<div class="empty">لا توجد حسابات محفوظة حتى الآن.</div>`;
    return;
  }

  $("vaultList").innerHTML=savedAccounts.map(x=>{
    const b=banks.find(bank=>bank.id===x.bankId);
    const bban=b ? calculateBBAN(b,x.account) : "";
    const bankName=b ? b.name : "بنك غير موجود";
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
        <button class="btn secondary" onclick="shareVault('${x.id}')" ${b?"":"disabled"}>📤 مشاركة</button>
        <button class="btn secondary" onclick="editVault('${x.id}')">✏️ تعديل</button>
        <button class="btn danger" onclick="removeVault('${x.id}')">🗑 حذف</button>
      </div>
    </div>`;
  }).join("");
}

$("addVault").onclick=()=>{
  const bankId=$("vBank").value;
  const b=banks.find(x=>x.id===bankId);
  const name=$("vName").value.trim();
  const account=$("vAccount").value.trim();

  if(!b){showToast("لا يوجد بنك", "أضف بنكاً أولاً من صفحة البنوك.", "!");return;}
  if(!name){showToast("اسم الحساب مطلوب", "أدخل اسمًا للحساب المحفوظ.", "!");return;}
  if(!/^\d+$/.test(account)){showToast("رقم الحساب غير صحيح", "استخدم الأرقام فقط دون مسافات أو رموز.", "!");return;}
  if(account.length!==Number(b.len)){showToast("طول رقم الحساب غير صحيح", `يجب أن يكون رقم الحساب ${b.len} أرقام.`, "!");return;}

  const data={name,bankId,account};
  const wasVaultEdit = !!vaultEditId;

  if(vaultEditId){
    const old=savedAccounts.find(x=>x.id===vaultEditId);
    if(old) Object.assign(old,data);
    vaultEditId=null;
    $("cancelVaultEdit").classList.add("hidden");
    $("addVault").textContent="حفظ الحساب";
  }else{
    savedAccounts.push({id:makeId(),...data});
  }

  saveSavedAccounts();
  clearVaultForm();
  renderVault();
  showToast(wasVaultEdit ? "تم حفظ التعديل" : "تم حفظ الحساب", wasVaultEdit ? "تم تحديث بيانات الحساب بنجاح." : "تم حفظ الحساب بنجاح.");
};

function clearVaultForm(){
  $("vName").value="";
  $("vAccount").value="";
}

window.editVault=id=>{
  const x=savedAccounts.find(v=>v.id===id);
  if(!x)return;
  $("vBank").value=x.bankId;
  $("vName").value=x.name;
  $("vAccount").value=x.account;
  vaultEditId=id;
  $("cancelVaultEdit").classList.remove("hidden");
  $("addVault").textContent="حفظ التعديل";
  updateVaultHint();
  window.scrollTo({top:0,behavior:"smooth"});
};

$("cancelVaultEdit").onclick=()=>{
  vaultEditId=null;
  clearVaultForm();
  $("cancelVaultEdit").classList.add("hidden");
  $("addVault").textContent="حفظ الحساب";
};

let toastTimer;
function showToast(title="تمت العملية بنجاح", sub="تم تنفيذ العملية.", icon="✓"){
 const t=$("appToast"); if(!t)return;
 $("toastTitle").textContent=title;
 $("toastSub").textContent=sub;
 t.querySelector(".toastIcon").textContent=icon;
 t.classList.add("show");
 clearTimeout(toastTimer);
 toastTimer=setTimeout(()=>t.classList.remove("show"),2500);
}
$("toastClose").onclick=()=>$("appToast").classList.remove("show");

window.copyVault=async id=>{
 const x=savedAccounts.find(v=>v.id===id); if(!x)return;
 const b=banks.find(v=>v.id===x.bankId); if(!b)return;
 const bban=calculateBBAN(b,x.account);
 try{
   if(navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(bban);
   else{
     const ta=document.createElement("textarea"); ta.value=bban;
     ta.style.position="fixed";ta.style.opacity="0";
     document.body.appendChild(ta);ta.focus();ta.select();
     if(!document.execCommand("copy"))throw new Error("copy failed");
     ta.remove();
   }
   showToast("تم النسخ بنجاح", "تم نسخ رقم BBAN للحافظة");
 }catch(e){showToast("تعذر النسخ","اضغط مطولًا على الرقم لنسخه يدويًا", "!");}
}

window.shareVault=async id=>{
  const x=savedAccounts.find(v=>v.id===id);
  if(!x)return;
  const b=banks.find(bank=>bank.id===x.bankId);
  if(!b){showToast("البنك غير موجود", "البنك المرتبط بهذا الحساب لم يعد موجودًا.", "!");return;}
  const bban=calculateBBAN(b,x.account);
  const text=`${x.name}\nرقم الحساب: ${x.account}\nBBAN: ${bban}`;
  if(navigator.share){
    try{await navigator.share({title:"BBAN",text});}catch(e){}
  }else{
    try{await navigator.clipboard.writeText(bban);showToast("المشاركة غير متاحة", "تم نسخ BBAN إلى الحافظة", "↗");}
    catch(e){showToast("المشاركة غير متاحة", "يمكنك نسخ BBAN ومشاركته يدويًا.", "!");}
  }
};

window.removeVault=id=>{
  showConfirmModal("حذف الحساب", "هل تريد حذف هذا الحساب المحفوظ؟", "حذف", ()=>{
    savedAccounts=savedAccounts.filter(v=>v.id!==id);
    saveSavedAccounts();
    renderVault();
    showToast("تم الحذف", "تم حذف الحساب بنجاح.");
  });
};

// Export Backup
$("exportVault").onclick = () => {
  const data = {
    app: "BBAN Generator",
    version: 1,
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
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("تم التصدير بنجاح", "تم تنزيل ملف النسخة الاحتياطية.");
};

// Import Backup
$("importVault").onchange = async e => {
  const file = e.target.files[0];
  if (!file) {
    e.target.value = "";
    return;
  }
  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (data && Array.isArray(data.banks)) {
      data.banks.forEach(importedBank => {
        if (importedBank && importedBank.id && !banks.some(b => b.id === importedBank.id)) {
          banks.push(importedBank);
        }
      });
      saveBanks();
      renderBanks();
    }

    const accounts = Array.isArray(data) ? data : (data.accounts || data.vaults || data.savedAccounts || []);
    if (!Array.isArray(accounts)) throw new Error("invalid backup format");

    const cleaned = accounts.filter(x => x && typeof x.account === "string" && typeof x.bankId === "string")
      .map(x => ({
        id: x.id || makeId(),
        name: String(x.name || "حساب"),
        bankId: x.bankId,
        account: x.account
      }));

    let addedCount = 0, updatedCount = 0;
    cleaned.forEach(imp => {
      const existing = savedAccounts.find(a => a.id === imp.id);
      if (existing) { 
        Object.assign(existing, imp); 
        updatedCount++; 
      } else { 
        savedAccounts.push(imp); 
        addedCount++; 
      }
    });

    saveSavedAccounts();
    initSavedPage();
    showToast("تم الاستيراد بنجاح", `تمت إضافة ${addedCount} وتحديث ${updatedCount} من الحسابات، دون حذف أي بيانات موجودة.`);
  } catch (err) {
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

// PWA Service Worker Registration & Install Prompt
let deferredPrompt = null;
const installBtn = $("installBtn");

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (installBtn) installBtn.classList.remove("hidden");
});

if (installBtn) {
  installBtn.onclick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      showToast("تثبيت ناجح", "تم تثبيت تطبيق مولد BBAN بنجاح.");
    }
    deferredPrompt = null;
    installBtn.classList.add("hidden");
  };
});

window.addEventListener("appinstalled", () => {
  deferredPrompt = null;
  if (installBtn) installBtn.classList.add("hidden");
  showToast("تم التثبيت", "تم تثبيت التطبيق على جهازك بنجاح.");
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(err => {
      console.error("ServiceWorker registration failed: ", err);
    });
  });
}
