"use strict";
/* BMP Pro group library: browser-local storage, explicit save, saved-result comparisons. */
(() => {
 const STORE="bmp-pro-v2-groups";
 const el=id=>document.getElementById(id);
 let groups=[],selected=new Set(),currentId=null;
 const stamp=()=>new Date().toISOString();
 const uid=()=>typeof crypto!=="undefined"&&crypto.randomUUID?crypto.randomUUID():"bmp-"+Date.now()+"-"+Math.random().toString(36).slice(2);
 const deep=x=>JSON.parse(JSON.stringify(x));
 const textCell=(tr,text)=>{const td=document.createElement("td");td.textContent=String(text??"");tr.append(td)};
 const format=n=>typeof n==="number"&&Number.isFinite(n)?n.toFixed(2):"—";
 const status=t=>{el("groupStatus").textContent=t};
 const read=()=>{try{const data=JSON.parse(localStorage.getItem(STORE)||"[]");groups=Array.isArray(data)?data.filter(g=>g&&g.id&&g.inputs&&g.result):[];}catch(e){groups=[];status("專案庫讀取失敗，請確認瀏覽器儲存空間。")}};
 const persist=()=>{try{localStorage.setItem(STORE,JSON.stringify(groups));return true}catch(e){status("無法寫入本機專案庫（可能是私密模式或儲存空間不足），請先使用 JSON 匯出備份。");return false}};
 const collect=()=>({
   project:el("project").value,sample:el("sample").value,weight:el("weight").value,
   expCount:el("expCount").value,bkCount:el("bkCount").value,
   subtract:el("subtract").checked,negative:el("negative").value,
   ts:deep(state.ts),gas:deep(state.gas)
 });
 const meta=()=>({material:el("materialName").value.trim(),code:el("groupCode").value.trim(),notes:el("groupNotes").value.trim()});
 function saveGroup(){
  let computed;
  try{computed=compute()}catch(e){status("無法儲存：請先修正資料 — "+e.message);return}
  const m=meta(),inputs=collect(),id=currentId||uid();
  const previous=groups.find(g=>g.id===id);
  const group={id,name:m.code||inputs.sample||"未命名組別",...m,inputs,result:deep(computed),createdAt:previous?.createdAt||stamp(),updatedAt:stamp()};
  const next=groups.filter(g=>g.id!==id);next.unshift(group);
  const before=groups;groups=next;
  if(!persist()){groups=before;return}
  currentId=id;selected.add(id);render();
  status("已儲存「"+group.name+"」及分析結果。之後可重新載入或跨組比較。");
 }
 function loadGroup(id){
  const g=groups.find(x=>x.id===id);if(!g)return;
  if(!confirm("載入「"+g.name+"」將取代目前尚未儲存的輸入資料。確定繼續？"))return;
  restore(deep(g.inputs));
  el("materialName").value=g.material||"";
  el("groupCode").value=g.code||"";
  el("groupNotes").value=g.notes||"";
  currentId=id;status("已載入「"+g.name+"」。修改後請再次按「儲存目前組別」。");
  window.scrollTo({top:0,behavior:"smooth"});
 }
 function duplicateGroup(id){
  const g=groups.find(x=>x.id===id);if(!g)return;
  const copy=deep(g);copy.id=uid();copy.code=(g.code||g.name)+"-copy";copy.name=copy.code;copy.createdAt=copy.updatedAt=stamp();
  groups.unshift(copy);if(!persist()){groups.shift();return}selected.add(copy.id);render();status("已複製「"+g.name+"」，可載入複本後調整配比與數據。")
 }
 function deleteGroup(id){
  const g=groups.find(x=>x.id===id);if(!g||!confirm("確定刪除本機儲存的「"+g.name+"」？此動作無法復原。"))return;
  const before=groups;groups=groups.filter(x=>x.id!==id);if(!persist()){groups=before;return}
  selected.delete(id);if(currentId===id)currentId=null;render();status("已刪除組別。")
 }
 function resetGroup(){
  if(!confirm("建立空白組別會清除目前工作中的輸入資料；請先儲存重要資料。確定繼續？"))return;
  currentId=null;el("groupCode").value="";el("materialName").value="";el("groupNotes").value="";
  el("project").value="BMP Experiment";el("sample").value="新樣品";el("weight").value="5";el("expCount").value="3";el("bkCount").value="2";
  el("subtract").checked=true;el("negative").value="keep";
  state.ts=[{empty:"",wet:"",dry:"",ash:""}];state.gas=Array.from({length:8},(_,i)=>({day:i}));state.results=null;
  renderTS();renderGas();
  ["tsMetric","vsMetric","addedMetric","yieldMetric"].forEach(id=>el(id).textContent="—");
  el("resultTable").tBodies[0].replaceChildren();
  if(window.Plotly){Plotly.purge(el("chart"))}el("chart").textContent="輸入資料後按「計算並更新圖表」。";
  el("analysisStatus").textContent="等待分析";status("新的空白組別已建立，請輸入原料與實驗數據。")
 }
 function render(){
  const box=el("groupLibrary");box.replaceChildren();
  if(!groups.length){const empty=document.createElement("p");empty.className="empty-note";empty.textContent="尚無儲存組別。輸入數據、完成計算後，按「儲存目前組別」即可建立第一筆。";box.append(empty)}
  for(const g of groups){
   const card=document.createElement("article");card.className="group-card";
   const title=document.createElement("h4");title.textContent=g.name;card.append(title);
   const info=document.createElement("small");info.textContent=[g.material||"未填原料",g.inputs.sample||"未命名樣品",g.notes||""].filter(Boolean).join(" · ");card.append(info);
   const metric=document.createElement("div");metric.className="record-metric";metric.textContent=format(g.result.final)+" ";
   const unit=document.createElement("span");unit.textContent="L/kg-VS";metric.append(unit);card.append(metric);
   const date=document.createElement("small");date.textContent="已儲存 "+new Date(g.updatedAt).toLocaleString("zh-TW");card.append(date);
   const controls=document.createElement("div");controls.className="group-actions";
   for(const [label,fn,cls] of [["載入",()=>loadGroup(g.id),""],["複製",()=>duplicateGroup(g.id),""],["刪除",()=>deleteGroup(g.id),"danger"]]){
    const b=document.createElement("button");b.type="button";b.textContent=label;b.className=cls;b.addEventListener("click",fn);controls.append(b)
   }
   card.append(controls);box.append(card)
  }
  renderCompare();
 }
 function compareGroups(){return groups.filter(g=>selected.has(g.id)&&g.result&&Array.isArray(g.result.rows))}
 function renderCompare(){
  const checks=el("compareSelection");checks.replaceChildren();
  if(!groups.length){const note=document.createElement("p");note.className="empty-note";note.textContent="儲存至少一筆有效組別後即可比較。";checks.append(note)}
  for(const g of groups){
   const label=document.createElement("label");const c=document.createElement("input");c.type="checkbox";c.checked=selected.has(g.id);
   c.addEventListener("change",()=>{if(c.checked)selected.add(g.id);else selected.delete(g.id);drawComparison()});
   const s=document.createElement("span");s.textContent=g.name;label.append(c,s);checks.append(label)
  }
  drawComparison();
 }
 function drawComparison(){
  const active=compareGroups();const tbody=el("compareTable").tBodies[0];tbody.replaceChildren();
  for(const g of active){
   const tr=document.createElement("tr");[g.name,g.material||"",g.inputs.sample||"",format(g.result.ts),format(g.result.vs),format(g.result.added),format(g.result.final)].forEach(x=>textCell(tr,x));tbody.append(tr)
  }
  const target=el("compareChart");
  if(!active.length){if(window.Plotly)Plotly.purge(target);target.textContent="勾選一個或多個組別以比較累積產氣曲線。";return}
  if(!window.Plotly){target.textContent="圖表套件未載入，仍可使用下方比較表格。";return}
  const traces=active.map(g=>({type:"scatter",mode:"lines+markers",name:g.name,x:g.result.rows.map(r=>r.day),y:g.result.rows.map(r=>r.cumulative),marker:{size:5},line:{width:2.5}}));
  Plotly.react(target,traces,{paper_bgcolor:"#fff",plot_bgcolor:"#fff",font:{family:"Inter,Microsoft JhengHei,sans-serif",color:"#53657b"},margin:{l:65,r:22,t:22,b:67},xaxis:{title:"Time (day)",gridcolor:"#eef1f5"},yaxis:{title:"Yield (L/kg-VS)",gridcolor:"#eef1f5"},legend:{orientation:"h",y:-.3}},{responsive:true,displaylogo:false,toImageButtonOptions:{format:"svg",filename:"BMP_Pro_Group_Comparison",height:560,width:960}})
 }
 function exportComparison(){
  const active=compareGroups();if(!active.length){status("請至少勾選一個組別。");return}
  const safe=v=>{const s=String(v??"");const formula=/^[=+\-@\t\r]/.test(s)?"'"+s:s;return '"'+formula.replace(/"/g,'""')+'"'}
  const rows=[["Group","Material","Sample","TS_percent","VS_TS_percent","Added_VS_g","Final_yield_L_per_kg_VS"],...active.map(g=>[g.name,g.material||"",g.inputs.sample||"",g.result.ts,g.result.vs,g.result.added,g.result.final])];
  download("BMP_Pro_Group_Comparison.csv","\ufeff"+rows.map(row=>row.map(safe).join(",")).join("\r\n"),"text/csv;charset=utf-8");
 }
 el("storeGroupBtn").addEventListener("click",saveGroup);
 el("newGroupBtn").addEventListener("click",resetGroup);
 el("compareCsvBtn").addEventListener("click",exportComparison);

 function backupAll(){
  if(!groups.length){status("沒有可備份的組別，請先儲存實驗組別。");return}
  download("BMP_Pro_Experiment_Library.json",JSON.stringify({format:"bmp-pro-group-library",version:1,exportedAt:stamp(),groups},null,2),"application/json");
  status("已匯出 "+groups.length+" 筆組別的完整備份。");
 }
 async function importAll(file){
  if(!file)return;
  try{
   const raw=JSON.parse(await file.text());
   if(raw.format!=="bmp-pro-group-library"||!Array.isArray(raw.groups))throw Error("備份格式不符。請選擇由「備份全部組別」下載的 JSON。");
   if(raw.groups.length>200)throw Error("單次最多匯入 200 筆組別。");
   const valid=raw.groups.filter(g=>g&&typeof g.id==="string"&&g.inputs&&Array.isArray(g.inputs.ts)&&Array.isArray(g.inputs.gas)&&g.result&&Array.isArray(g.result.rows)&&typeof g.result.final==="number");
   if(valid.length!==raw.groups.length)throw Error("備份資料包含不完整的組別，已取消匯入。");
   if(!confirm("準備匯入 "+valid.length+" 筆組別。若組別 ID 相同，將覆蓋原有儲存紀錄。是否繼續？"))return;
   const before=groups;const existing=new Map(groups.map(g=>[g.id,g]));
   valid.forEach(g=>existing.set(g.id,deep(g)));groups=Array.from(existing.values());
   if(!persist()){groups=before;return}
   valid.forEach(g=>selected.add(g.id));render();status("已還原 "+valid.length+" 筆組別，現在可載入與比較。");
  }catch(e){status("備份匯入失敗："+e.message)}finally{el("restoreAllInput").value=""}
 }
 el("backupAllBtn").addEventListener("click",backupAll);
 el("restoreAllInput").addEventListener("change",e=>importAll(e.target.files[0]));
 el("exportProjectBtn").addEventListener("click",()=>el("saveBtn").click());
 el("exportResultBtn").addEventListener("click",()=>el("csvBtn").click());
 window.BMPGroupLibrary={collect,meta,all:()=>deep(groups),
 openCloud(group){
  if(!group?.inputs||!group?.result)throw Error("雲端資料格式不完整");
  if(!confirm("載入雲端組別將取代目前未儲存的輸入數據，確定繼續？"))return false;
  currentId=null;
  restore(deep(group.inputs));
  el("materialName").value=group.material||"";
  el("groupCode").value=group.code||"";
  el("groupNotes").value=group.notes||"";
  status("已載入雲端「"+group.name+"」。若要留存本機副本，請按「儲存目前組別」。");
  document.getElementById("workspace")?.scrollIntoView({behavior:"smooth"});
  return true;
 },
 importOne(group){if(!group||!group.id||!group.inputs||!group.result)throw Error("群組資料格式不完整");const index=groups.findIndex(g=>g.id===group.id);if(index!==-1){if(!confirm("本機已有同 ID 組別，確定要以雲端版本覆蓋？"))return false;groups.splice(index,1)}groups.unshift(deep(group));if(!persist())return false;selected.add(group.id);render();return true}};
 read();render();
})();
