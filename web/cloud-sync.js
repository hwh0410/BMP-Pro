"use strict";
/* Explicit, append-only BMP Pro cloud snapshots. The browser is not a transactional database. */
(() => {
 const $=id=>document.getElementById(id);
 const api="https://sheets.googleapis.com/v4/spreadsheets/";
 const columns={
  Projects:8,Groups:19,TSVS_Data:8,Gas_Data:7,Results:12
 };
 let cloud=[];
 const message=(text,err=false)=>{$("cloudSyncStatus").textContent=text;$("cloudSyncStatus").style.color=err?"#a74e43":"#426579"};
 const id=()=>crypto.randomUUID?crypto.randomUUID():"bmp-"+Date.now()+"-"+Math.random().toString(36).slice(2);
 const iso=()=>new Date().toISOString();
 const session=()=>{const auth=window.BMPGoogleAuth;if(!auth)throw Error("Google 連線程式尚未載入。");return {token:auth.getToken(),sheet:auth.getSpreadsheetId()}};
 async function call(url,method="GET",body){
  const {token}=session();
  const response=await fetch(url,{method,headers:{"Authorization":"Bearer "+token,...(body?{"Content-Type":"application/json"}:{})},body:body?JSON.stringify(body):undefined});
  const out=await response.json().catch(()=>({}));
  if(!response.ok)throw Error("Google Sheets API "+response.status+"："+(out.error?.message||response.statusText));
  return out;
 }
 function base(){const {sheet}=session();if(!/^[A-Za-z0-9_-]{20,}$/.test(sheet))throw Error("請確認資料庫 ID。");return api+encodeURIComponent(sheet)+"/values/"}
 const a1=name=>encodeURIComponent("'"+name+"'!A1:Z");
 async function append(name,rows){
  if(!rows.length)return;
  return call(base()+a1(name)+":append?valueInputOption=RAW&insertDataOption=INSERT_ROWS","POST",{majorDimension:"ROWS",values:rows});
 }
 async function readResults(){
  const response=await call(base()+encodeURIComponent("'Results'!A2:L1000"));
  return response.values||[];
 }
 function numeric(v){const n=Number(v);return Number.isFinite(n)?n:null}
 async function save(){
  const button=$("cloudSaveBtn");if(button.disabled)return;
  button.disabled=true;
  try{
   const inputs=window.BMPGroupLibrary.collect(),metadata=window.BMPGroupLibrary.meta();
   const result=compute(); // Original calculation functions remain unchanged
   const groupId=id(),projectId=id(),created=iso();
   const name=metadata.code||inputs.sample||"未命名組別";
   const record={id:groupId,name,code:metadata.code,material:metadata.material,notes:metadata.notes,inputs,result,createdAt:created,updatedAt:created};
   const json=JSON.stringify(record);
   if(json.length>42000)throw Error("目前實驗資料超出單格 JSON 快照限制。請先匯出 JSON，後續將支援分頁保存。");
   const existing=await readResults();
   if(existing.length>=990)throw Error("雲端 Results 已達第一版讀取上限，請先整理資料庫。");
   if(!confirm("確定將「"+name+"」儲存為新的雲端快照？不會覆寫其他人的實驗資料。"))return;
   const projectRow=[projectId,inputs.project||"BMP Experiment","BMP Pro 2.0", "",created,created,"",1];
   const groupRow=[groupId,projectId,metadata.code||"",name,inputs.sample||"",numeric(inputs.weight),metadata.material||"","","","",metadata.notes||"",Number(inputs.expCount),Number(inputs.bkCount),inputs.negative||"keep",inputs.subtract===false?"FALSE":"TRUE",created,created,1,""];
   const tsrows=(inputs.ts||[]).map((r,i)=>[id(),groupId,i+1,numeric(r.empty),numeric(r.wet),numeric(r.dry),numeric(r.ash),created]);
   const gasrows=[];
   for(const r of inputs.gas||[]){
    const day=numeric(r.day);if(day===null)continue;
    for(let i=1;i<=Number(inputs.expCount);i++)gasrows.push([id(),groupId,day,"exp",i,numeric(r["exp_"+i])??"",created]);
    for(let i=1;i<=Number(inputs.bkCount);i++)gasrows.push([id(),groupId,day,"bk",i,numeric(r["bk_"+i])??"",created]);
   }
   const resultRow=[id(),groupId,1,created,"","bmp-pro-browser-v2",result.ts,result.vs,result.added,result.final,json,"TRUE"];
   // Results is appended last, serving as a completion marker for the snapshot.
   // Sheets append calls are not atomic together; an interrupted save can leave orphan detail rows.
   message("正在寫入雲端，請不要關閉頁面。");
   await append("Projects",[projectRow]);
   await append("Groups",[groupRow]);
   await append("TSVS_Data",tsrows);
   // Limit request size; large datasets are chunked. No automatic retry on writes to avoid duplicate rows.
   for(let i=0;i<gasrows.length;i+=300)await append("Gas_Data",gasrows.slice(i,i+300));
   await append("Results",[resultRow]);
   message("雲端快照已新增：「"+name+"」。原始數據、組別資訊與計算結果已上傳；本機資料保留。");
   await refresh(false);
  }catch(e){message("上傳未完成："+e.message+"。若中途失敗，可能留下未完成明細，但不會出現在已完成快照清單中。請勿立即重試，先檢查雲端資料。",true)}
  finally{button.disabled=false}
 }
 function render(){
  const container=$("cloudLibrary");container.replaceChildren();
  if(!cloud.length){const p=document.createElement("p");p.className="empty-note";p.textContent="雲端尚無已完成的組別快照。";container.append(p);return}
  for(const entry of cloud){
   const card=document.createElement("div");card.className="group-card";
   const h=document.createElement("h4");h.textContent=entry.name||"未命名組別";card.append(h);
   const subtitle=document.createElement("small");subtitle.textContent=[entry.material||"未填原料",entry.inputs?.sample||"未填樣品",new Date(entry.createdAt).toLocaleString("zh-TW")].join(" · ");card.append(subtitle);
   const metric=document.createElement("div");metric.className="record-metric";metric.textContent=Number(entry.result?.final).toFixed(2)+" ";
   const unit=document.createElement("span");unit.textContent="L/kg-VS";metric.append(unit);card.append(metric);
   const controls=document.createElement("div");controls.className="group-actions";
   const b=document.createElement("button");b.type="button";b.textContent="下載至本機組別庫";
   b.onclick=()=>{const ok=window.BMPGroupLibrary.importOne(entry);if(ok)message("已將「"+(entry.name||"組別")+"」加入本機組別庫，請從「組別與專案庫」載入編輯。")};
   controls.append(b);card.append(controls);container.append(card);
  }
 }
 async function refresh(showStatus=true){
  const button=$("cloudRefreshBtn");button.disabled=true;
  try{
   const rows=await readResults();
   const parsed=[];
   for(const row of rows){
    if(!row[10]||String(row[11]).toUpperCase()==="FALSE")continue;
    try{const g=JSON.parse(row[10]);if(g&&g.id&&g.inputs&&g.result&&Array.isArray(g.inputs.ts)&&Array.isArray(g.inputs.gas))parsed.push(g)}catch{}
   }
   cloud=parsed.reverse();render();
   if(showStatus)message("已讀取 "+cloud.length+" 筆已完成雲端快照。載入至本機前不會更動現有資料。");
  }catch(e){message("無法讀取雲端組別："+e.message,true)}
  finally{button.disabled=false}
 }
 $("cloudSaveBtn").addEventListener("click",save);
 $("cloudRefreshBtn").addEventListener("click",()=>refresh(true));
})();
