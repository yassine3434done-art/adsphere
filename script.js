/* =========================
   AdSphere — script.js
   ========================= */

/* ---------- تخزين محلي ---------- */
const LS_CAMPS_KEY = 'adsphere_campaigns_v1';

/* ---------- عملات ---------- */
const CCY_INFO = {
  MAD: { code:'MAD', sign:'DH', symbol:'MAD' },
  USD: { code:'USD', sign:'$',  symbol:'USD' },
  EUR: { code:'EUR', sign:'€',  symbol:'EUR' }
};
const CCY_KEY          = 'adsphere_ccy';
const CCY_RATE_USD_KEY = 'adsphere_rate_usd_mad';
const CCY_RATE_EUR_KEY = 'adsphere_rate_eur_mad';

/* ---------- إعداد الأسعار الحية (عبر Netlify Function /api/fx) ---------- */
const USE_LIVE_RATES_KEY   = 'adsphere_use_live_rates';
const LIVE_RATES_CACHE_KEY = 'adsphere_live_rates_cache'; // { ts, usdToMad, eurToMad, src }
const LIVE_RATES_TTL_MS    = 12 * 60 * 60 * 1000;        // 12h

function readJSON(key, fallback=null){ try{ return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback }catch(_){ return fallback } }
function writeJSON(key, obj){ localStorage.setItem(key, JSON.stringify(obj)) }

function isUseLiveRates(){ return localStorage.getItem(USE_LIVE_RATES_KEY) === '1' }
function setUseLiveRates(v){ localStorage.setItem(USE_LIVE_RATES_KEY, v ? '1' : '0') }

function readLiveCache(){ return readJSON(LIVE_RATES_CACHE_KEY) }
function writeLiveCache(obj){ writeJSON(LIVE_RATES_CACHE_KEY, obj) }

async function fetchLiveRates(){
  // يستدعي وسيطك على Netlify (يجب أن تنشر function باسم fx داخل /netlify/functions أو /api)
  const url = `/api/fx?base=MAD&symbols=USD,EUR`;
  const res = await fetch(url, { cache:'no-store' });
  if(!res.ok) throw new Error('FX HTTP error');
  const data = await res.json();
  const madToUsd = data?.rates?.USD;
  const madToEur = data?.rates?.EUR;
  if(!(madToUsd>0) || !(madToEur>0)) throw new Error('FX data invalid');

  // نحتاج العكس: كم يساوي 1 USD/1 EUR بالـ MAD
  const payload = {
    ts: Date.now(),
    usdToMad: 1 / madToUsd,
    eurToMad: 1 / madToEur,
    src: 'live'
  };
  writeLiveCache(payload);
  return payload;
}

async function ensureLiveRatesFresh(){
  const c = readLiveCache();
  if(c && (Date.now() - c.ts) < LIVE_RATES_TTL_MS) return c;
  try { return await fetchLiveRates(); }
  catch(_){ return null; } // fallback لاحقاً للقيم اليدوية
}

/* ---------- معدّلات يدوية/افتراضية كـ Fallback ---------- */
function getSelectedCcy(){ return localStorage.getItem(CCY_KEY) || 'MAD' }
function setSelectedCcy(c){ localStorage.setItem(CCY_KEY, c) }

function getUsdToMad(){
  if(isUseLiveRates()){
    const c = readLiveCache();
    if(c?.usdToMad) return c.usdToMad;
  }
  const v = parseFloat(localStorage.getItem(CCY_RATE_USD_KEY));
  return (isFinite(v) && v>0) ? v : 10.00; // افتراضي
}
function setUsdToMad(v){ localStorage.setItem(CCY_RATE_USD_KEY, String(v)) }

function getEurToMad(){
  if(isUseLiveRates()){
    const c = readLiveCache();
    if(c?.eurToMad) return c.eurToMad;
  }
  const v = parseFloat(localStorage.getItem(CCY_RATE_EUR_KEY));
  return (isFinite(v) && v>0) ? v : 11.00; // افتراضي
}
function setEurToMad(v){ localStorage.setItem(CCY_RATE_EUR_KEY, String(v)) }

/* تحويل عبر MAD كعملة أساس */
function rate(from, to){
  if(from===to) return (x)=>x;
  const toMAD = (val, f)=>{
    if(f==='MAD') return val;
    if(f==='USD') return val * getUsdToMad();
    if(f==='EUR') return val * getEurToMad();
    return val;
  };
  const fromMAD = (val, t)=>{
    if(t==='MAD') return val;
    if(t==='USD') return val / getUsdToMad();
    if(t==='EUR') return val / getEurToMad();
    return val;
  };
  return (v)=> fromMAD(toMAD(v, from), to);
}

function money(v, ccy){
  const info = CCY_INFO[ccy] || CCY_INFO.MAD;
  return `${Number(v||0).toLocaleString('en-US')} ${info.sign}`;
}

/* ---------- حالة التطبيق ---------- */
let savedCamps = readJSON(LS_CAMPS_KEY, []);

/* ---------- عناصر DOM ---------- */
const sections   = Array.from(document.querySelectorAll('main .section'));
const buttons    = Array.from(document.querySelectorAll('header [data-go]'));
const list       = document.getElementById('campList');
const saveBtn    = document.getElementById('saveCamp');

const exportCSVBtn  = document.getElementById('exportCSV');
const clearAllBtn   = document.getElementById('clearAll');
const exportPDFBtn  = document.getElementById('exportPDF');

const ccySelect   = document.getElementById('ccySelect');
const budgetLabel = document.getElementById('budgetLabel');
const budgetLabel2= document.getElementById('budgetLabel2');

/* Settings Elements */
const defaultCcyEl   = document.getElementById('defaultCcy');
const rateUsdToMadEl = document.getElementById('rateUsdToMad');
const rateEurToMadEl = document.getElementById('rateEurToMad');
const useLiveRatesEl = document.getElementById('useLiveRates');
const saveSettingsBtn= document.getElementById('saveSettings');
const saveSettingsMsg= document.getElementById('saveSettingsMsg');

/* ---------- تنقل بين التبويبات ---------- */
buttons.forEach(btn=>{
  btn.addEventListener('click', ()=>{
    const id = btn.dataset.go;
    if(!id) return;
    sections.forEach(s=>s.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
    if(id==='settings') settingsLoad();
    window.scrollTo({ top:0, behavior:'smooth' });
    buttons.forEach(b=>b.classList.remove('primary'));
    btn.classList.add('primary');
  });
});

/* ---------- حملات: حفظ/تحميل/رسم ---------- */
function saveCamps(arr){
  savedCamps = arr;
  writeJSON(LS_CAMPS_KEY, savedCamps);
}

function renderCampItem(o){
  const d = document.createElement('div');
  d.className = 'item panel';
  const amount = money(o.budget, o.currency||'MAD');
  d.innerHTML = `
    <div>
      <div style="font-weight:800;font-size:16px">${o.name}</div>
      <div class="row" style="margin-top:8px;flex-wrap:wrap">
        <span class="badge">${o.channel}</span>
        <span class="badge">${o.goal}</span>
        <span class="badge">${amount}</span>
        <span class="badge">${o.start} → ${o.end}</span>
      </div>
      ${o.desc ? `<div class="muted" style="margin-top:6px">${o.desc}</div>` : ''}
    </div>`;
  list.prepend(d);
}

function rerenderCampList(){
  if(!list) return;
  list.innerHTML = '';
  savedCamps.forEach(renderCampItem);
  // KPIs
  document.querySelector('#kpi-campaigns .v').textContent = savedCamps.length;
  updateBudgetKPI();
  updateClicksKPI();
}

function updateBudgetKPI(){
  const cur = getSelectedCcy();
  const sumInCur = savedCamps.reduce((a,c)=>{
    const conv = rate(c.currency||'MAD', cur);
    return a + conv(Number(c.budget||0));
  }, 0);
  const el = document.getElementById('kpi-budget');
  if(el) el.querySelector('.v').textContent = money(sumInCur, cur);
}
function updateClicksKPI(){
  const total = savedCamps.reduce((a,c)=> a + Number(c.clicks||0), 0);
  const el = document.getElementById('kpi-clicks');
  if(el) el.querySelector('.v').textContent = Number(total).toLocaleString('en-US');
}

/* حفظ حملة جديدة */
if(saveBtn){
  saveBtn.addEventListener('click', ()=>{
    const cur = getSelectedCcy();
    const o = {
      name:  document.getElementById('cName').value || 'حملة بدون اسم',
      channel: document.getElementById('cChannel').value,
      budget: +(document.getElementById('cBudget').value || 0),
      currency: cur,
      start: document.getElementById('cStart').value || '—',
      end:   document.getElementById('cEnd').value || '—',
      goal:  document.getElementById('cGoal').value,
      desc:  document.getElementById('cDesc').value,
      clicks:+(document.getElementById('cClicks').value || 0)
    };
    if(o.budget<=0){ alert('الميزانية غير صالحة'); return; }

    saveCamps([o, ...savedCamps]);
    rerenderCampList();

    const msg = document.getElementById('saveMsg');
    if(msg){ msg.textContent='👌 تم الحفظ محليًا (localStorage).'; setTimeout(()=>msg.textContent='',2500) }
  });
}

/* CSV Export */
function toCSV(rows){
  return rows.map(r => r.map(x=>{
    const s = (x===null||x===undefined)? '' : String(x);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
  }).join(',')).join('\n');
}
if(exportCSVBtn){
  exportCSVBtn.addEventListener('click', ()=>{
    const head = ['name','channel','goal','budget','currency','start','end','clicks','desc'];
    const body = savedCamps.map(c=>[c.name,c.channel,c.goal,c.budget,c.currency||'MAD',c.start,c.end,c.clicks,c.desc]);
    const csv  = toCSV([head, ...body]);
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'adsphere_campaigns.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  });
}

/* Clear All */
if(clearAllBtn){
  clearAllBtn.addEventListener('click', ()=>{
    if(!confirm('هل تريد حذف جميع الحملات؟')) return;
    saveCamps([]);
    rerenderCampList();
  });
}

/* PDF (بشكل بسيط: فتح نافذة الطباعة) */
if(exportPDFBtn){
  exportPDFBtn.addEventListener('click', ()=> window.print());
}

/* ---------- العملة والواجهة ---------- */
function refreshCurrencyUI(){
  const cur = getSelectedCcy();
  if(budgetLabel)  budgetLabel.textContent  = CCY_INFO[cur].symbol;
  if(budgetLabel2) budgetLabel2.textContent = CCY_INFO[cur].symbol;
  updateBudgetKPI();
  rerenderCampList();
}
if(ccySelect){
  ccySelect.value = getSelectedCcy();
  ccySelect.addEventListener('change', ()=>{
    setSelectedCcy(ccySelect.value);
    refreshCurrencyUI();
  });
}

/* ---------- الإعدادات ---------- */
function settingsLoad(){
  if(!defaultCcyEl) return;
  defaultCcyEl.value = getSelectedCcy();
  rateUsdToMadEl.value = getUsdToMad().toFixed(4);
  rateEurToMadEl.value = getEurToMad().toFixed(4);
  if(useLiveRatesEl) useLiveRatesEl.checked = isUseLiveRates();
}

if(saveSettingsBtn){
  saveSettingsBtn.addEventListener('click', async ()=>{
    const ccy = defaultCcyEl.value;
    const usd = parseFloat(rateUsdToMadEl.value);
    const eur = parseFloat(rateEurToMadEl.value);
    const live = useLiveRatesEl && useLiveRatesEl.checked;

    setSelectedCcy(ccy);
    setUseLiveRates(live);

    if(!live){
      if(!isFinite(usd)||usd<=0){ alert('المرجو إدخال معدل USD→MAD صالح.'); return }
      if(!isFinite(eur)||eur<=0){ alert('المرجو إدخال معدل EUR→MAD صالح.'); return }
      setUsdToMad(usd);
      setEurToMad(eur);
    }else{
      const fresh = await ensureLiveRatesFresh();
      if(!fresh) alert('تعذّر جلب الأسعار الحيّة الآن، سيتم استعمال القيم اليدوية/الافتراضية مؤقتًا.');
    }

    refreshCurrencyUI();
    settingsLoad();
    if(saveSettingsMsg){ saveSettingsMsg.textContent = 'تم الحفظ ✔'; setTimeout(()=>saveSettingsMsg.textContent='',2000) }
  });
}

/* ---------- إقلاع التطبيق ---------- */
(function boot(){
  // عرض الديفولت
  rerenderCampList();

  // أسعار حيّة عند الإقلاع إذا كانت مفعّلة
  (async ()=>{
    if(isUseLiveRates()){ await ensureLiveRatesFresh(); }
    refreshCurrencyUI();
    settingsLoad();
  })();
})();
```0