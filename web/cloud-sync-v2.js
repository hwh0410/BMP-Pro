"use strict";
/* Cloud group revisions. The existing BMP compute() is never changed here.
 * Google Sheets is not a transactional store: version checks are best-effort, not exclusive locks.
 */
(() => {
 const $=id=>document.getElementById(id);
 const API="https://sheets.googleapis.com/v4/spreadsheets/";
 const required=["Projects","Groups","TSVS_Data","Gas_Data","Results","Revisions"];
 let latest=[],history=new Map(),editing=null,busy=false;
 const stamp=()=>new Date().toISOString();
 const uuid=()=>crypto?.randomUUID?.()||"bmp-"+Date.now()+"-"+Math.random().toString(36).slice(2);
 const fmt=n=>Number.isFinite(Number(n))?Number(n).toFixed(2):"—";
 const clone=x=>JSON.parse(JSON.stringify(x));
 const message=(s,error=false)=>{const node=$("cloudSyncStatus");node.textContent=s;node.style.color=error?"#a74e43":"#426579"};
 const session=()=>{
  const auth=window.BMPGoogleAuth;if(!auth)throw Error("Google 授權尚未就緒。");
  const token=auth.getToken(),sheet=auth.getSpreadsheetId();
  if(!/^[\w-]{20,}$/.test(sheet))throw Error("Google Sheets 試算表 ID 不正確。");
  return {token,sheet};
 };
 async function request(path,method="GET",body){
  const {token,sheet}=session();const url=API+encodeURIComponent(sheet)+path;
  const res=await fetch(url,{method,headers:{Authorization:"Bearer "+token,...(body?{"Content-Type":"application/json"}:{})},body:body?JSON.stringify(body):undefined});
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw Error("Google API "+res.status+"："+(data.error?.message||res.statusText));
  return data;
 }
 async function fetchRows(){
  const out=await request("/values/"+encodeURIComponent("'Results'!A2:L5000")+"?valueRenderOption=UNFORMATTED_VALUE");
  if((out.values||[]).length>=4999)throw Error("結果表已接近單次讀取上限，請擴充分頁功能。");
  return out.values||[];
 }
 function parseRecords(rows){
  const versions=new Map(),conflicts=new Set();
  for(const row of rows){
   if(!row[10]||String(row[11]).toUpperCase()==="FALSE")continue;
   try{
    const entry=JSON.parse(row[10]);
    if(!entry||!entry.id||!entry.inputs||!Array.isArray(entry.inputs.ts)||!Array.isArray(entry.inputs.gas)||!entry.result||!Array.isArray(entry.result.rows))continue;
    const rev=Number(row[2])||1;entry.revision=rev;
    const list=versions.get(entry.id)||[];list.push(entry);versions.set(entry.id,list);
   }catch{}
  }
  history=versions;
  latest=[];
  for(const [key,list] of versions){
   list.sort((a,b)=>a.revision-b.revision||String(a.updatedAt).localeCompare(String(b.updatedAt)));
   const highest=list[list.length-1].revision;
   if(list.filter(x=>x.revision===highest).length>1)conflicts.add(key);
   const record=clone(list[list.length-1]);record.conflicted=conflicts.has(key);latest.push(record);
  }
  latest.sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));
 }
 async function refresh(announce=true){
  const b=$("cloudRefreshBtn");b.disabled=true;
  try{
   parseRecords(await fetchRows());render();
   if(announce)message("已讀取 "+latest.length+" 組雲端實驗、"+[...history.values()].reduce((n,x)=>n+x.length,0)+" 個歷史版本。"+
      (latest.some(g=>g.conflicted)?"偵測到同版號衝突，請勿直接更新衝突組別。":""));
  }catch(e){message("讀取雲端失敗："+e.message,true);throw e}
  finally{b.disabled=false}
 }
 function setEditing(g){
  if(!window.BMPGroupLibrary.openCloud(g))return;
  editing={id:g.id,revision:g.revision,projectId:g.projectId||null,createdAt:g.createdAt};
  updateLabel();message("編輯中：「"+g.name+"」v"+g.revision+"。儲存前會重新檢查雲端版本。");
 }
 function updateLabel(){
  $("cloudSaveBtn").textContent=editing?"↑ 儲存雲端新版本（v"+(editing.revision+1)+"）":"↑ 建立新雲端組別";
  $("cloudEditingLabel").textContent=editing?"目前選取雲端組別："+editing.id+"（基準 v"+editing.revision+"）":"目前模式：新增組別；不會修改既有雲端紀錄";
 }
 function render(){
  const container=$("cloudLibrary");container.replaceChildren();
  if(!latest.length){const p=document.createElement("p");p.className="empty-note";p.textContent="目前尚無雲端完成的分析組別。";container.append(p);return}
  for(const entry of latest){
   const card=document.createElement("article");card.className="group-card";
   const h=document.createElement("h4");h.textContent=entry.name||"未命名組別";card.append(h);
   const desc=document.createElement("small");desc.textContent=[entry.material||"未填原料",entry.inputs.sample||"", "v"+entry.revision,entry.conflicted?"⚠ 同版號衝突":""].filter(Boolean).join(" · ");card.append(desc);
   const metric=document.createElement("div");metric.className="record-metric";metric.textContent=fmt(entry.result.final)+" ";
   const units=document.createElement("span");units.textContent="L/kg-VS";metric.append(units);card.append(metric);
   const time=document.createElement("small");time.textContent="最後更新 "+new Date(entry.updatedAt).toLocaleString("zh-TW")+" · 版本 "+(history.get(entry.id)?.length||1);card.append(time);
   const controls=document.createElement("div");controls.className="group-actions";
   const add=(label,fn,disabled=false)=>{const b=document.createElement("button");b.textContent=label;b.disabled=disabled;b.onclick=fn;controls.append(b)};
   add("載入並編輯",()=>setEditing(entry),entry.conflicted);
   add("加入本機比較",()=>{
    const ok=window.BMPGroupLibrary.importOne(entry);
    if(ok)message("已將「"+entry.name+"」加入本機組別庫；可在跨組比較區選取。")
   });
   const choices=history.get(entry.id)||[];
   if(choices.length>1){
    const pick=document.createElement("select");pick.setAttribute("aria-label","選擇歷史版本");
    choices.slice().reverse().forEach(v=>{const opt=document.createElement("option");opt.value=String(v.revision)+"|"+v.updatedAt;opt.textContent="v"+v.revision+" · "+new Date(v.updatedAt).toLocaleString("zh-TW");pick.append(opt)});
    controls.append(pick);
    add("載入歷史",()=>{
     const v=choices.find(v=>String(v.revision)+"|"+v.updatedAt===pick.value);
     if(v){window.BMPGroupLibrary.openCloud(v);editing=null;updateLabel();message("已載入歷史版本 v"+v.revision+" 作為參考；要保留修改請用「建立新雲端組別」。")}
    });
   }
   card.append(controls);container.append(card)
  }
 }
 function cell(v){
  if(v===null||v===undefined||v==="")return {};
  if(typeof v==="number"&&Number.isFinite(v))return {userEnteredValue:{numberValue:v}};
  if(typeof v==="boolean")return {userEnteredValue:{boolValue:v}};
  return {userEnteredValue:{stringValue:String(v)}};
 }
 const row=values=>({values:values.map(cell)});
 async function sheetIds(){
  const out=await request("?fields=sheets(properties(sheetId,title))");
  const ids=new Map((out.sheets||[]).map(s=>[s.properties.title,s.properties.sheetId]));
  for(const name of required)if(!ids.has(name))throw Error("資料庫缺少工作表："+name);
  return ids;
 }
 function batchRows(name,values,ids){
  return values.length?{appendCells:{sheetId:ids.get(name),rows:values.map(row),fields:"userEnteredValue"}}:null;
 }
 const numeric=x=>x===""||x===null||x===undefined?null:(Number.isFinite(Number(x))?Number(x):null);
 async function save(){
  if(busy)return;busy=true;$("cloudSaveBtn").disabled=true;
  try{
   const inputs=window.BMPGroupLibrary.collect(),meta=window.BMPGroupLibrary.meta(),result=compute();
   const current=editing?clone(editing):null;
   // Always fetch authoritative state immediately before a write, not just the displayed card cache.
   parseRecords(await fetchRows());render();
   if(current){
    const onServer=latest.find(g=>g.id===current.id);
    if(!onServer)throw Error("雲端找不到原有組別，已中止更新。");
    if(onServer.conflicted)throw Error("此組別存在同版本衝突，請先人工確認。");
    if(onServer.revision!==current.revision)throw Error("版本衝突：雲端已更新到 v"+onServer.revision+"，你的編輯基於 v"+current.revision+"。請先重新載入最新版本，避免覆蓋。");
   }
   const groupId=current?.id||uuid(),projectId=current?.projectId||uuid();
   const revision=current?current.revision+1:1,now=stamp(),created=current?.createdAt||now;
   const name=meta.code||inputs.sample||"未命名組別";
   const record={id:groupId,projectId,name,code:meta.code,material:meta.material,notes:meta.notes,inputs,result,revision,createdAt:created,updatedAt:now};
   const json=JSON.stringify(record);
   if(json.length>42000)throw Error("單組資料超過 JSON 單格安全上限，請先使用本機備份。");
   if((inputs.gas||[]).length*(Number(inputs.expCount)+Number(inputs.bkCount))>2000)throw Error("每日數據超過單次同步建議上限（2,000 筆）；需實作分批匯入。");
   if(!confirm((current?"儲存「"+name+"」的新版本 v"+revision:"新增雲端組別「"+name+"」")+"？舊版紀錄將保留。"))return;
   const projectRows=current?[]:[[projectId,inputs.project||"BMP Experiment","BMP Pro", "",now,now,"",1]];
   const groupRows=[[groupId,projectId,meta.code||"",name,inputs.sample||"",numeric(inputs.weight),meta.material||"","","","",meta.notes||"",Number(inputs.expCount),Number(inputs.bkCount),inputs.negative||"keep",inputs.subtract!==false,created,now,revision,""]];
   const tsvsRows=(inputs.ts||[]).map((r,i)=>[uuid(),groupId,i+1,numeric(r.empty),numeric(r.wet),numeric(r.dry),numeric(r.ash),now]);
   const gasRows=[];
   for(const rec of inputs.gas||[]){
    const day=numeric(rec.day);if(day===null)continue;
    for(let i=1;i<=Number(inputs.expCount);i++)gasRows.push([uuid(),groupId,day,"exp",i,numeric(rec["exp_"+i])??"",now]);
    for(let i=1;i<=Number(inputs.bkCount);i++)gasRows.push([uuid(),groupId,day,"bk",i,numeric(rec["bk_"+i])??"",now]);
   }
   const resultRows=[[uuid(),groupId,revision,now,"","bmp-pro-browser-v2",result.ts,result.vs,result.added,result.final,json,true]];
   const revisionRows=[[uuid(),"Groups",groupId,current?"new_version":"created","",now,current?.revision||0,revision,"BMP Pro web save"]];
   const ids=await sheetIds();
   const sections={Projects:projectRows,Groups:groupRows,TSVS_Data:tsvsRows,Gas_Data:gasRows,Results:resultRows,Revisions:revisionRows};
   const requests=required.map(k=>batchRows(k,sections[k]||[],ids)).filter(Boolean);
   // Single Sheets spreadsheets.batchUpdate avoids partial rows across these tabs on API-validation failures.
   // No retry: a timeout may mean a commit succeeded. Refresh before any manual retry.
   message("正在儲存 Google Sheets 新版本，請勿重複點擊。");
   await request(":batchUpdate","POST",{requests,includeSpreadsheetInResponse:false});
   editing={id:groupId,projectId,createdAt:created,revision};updateLabel();
   message("已提交「"+name+"」v"+revision+"。正在重新讀取確認……");
   await refresh(false);
   const check=latest.find(g=>g.id===groupId);
   if(!check||check.revision!==revision)message("已送出儲存，但尚未完成讀回驗證；請檢查雲端資料。",true);
   else message("雲端儲存成功：「"+name+"」v"+revision+"，舊版本已保留。");
  }catch(e){message("儲存中止／狀態未知："+e.message+"。請先點「讀取雲端組別」確認，再決定是否重試。",true)}
  finally{busy=false;$("cloudSaveBtn").disabled=false}
 }
 $("cloudSaveBtn").onclick=save;
 $("cloudRefreshBtn").onclick=()=>refresh(true).catch(()=>{});
 $("cloudNewBtn").onclick=()=>{editing=null;updateLabel();message("已切換為新增雲端組別模式。現有工作區內容不變。")};
 updateLabel();
})();
