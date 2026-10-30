"use strict";
const $=id=>document.getElementById(id);
const state={ts:[],gas:[],results:null};
const keys=()=>["day",...Array.from({length:+$("expCount").value},(_,i)=>"exp_"+(i+1)),...Array.from({length:+$("bkCount").value},(_,i)=>"bk_"+(i+1))];
const num=x=>x===""||x===null||x===undefined?null:(Number.isFinite(Number(x))?Number(x):null);
const nice=(x,n=2)=>Number.isFinite(x)?x.toFixed(n):"—";
function message(t,error=false){$("notice").textContent=t;$("notice").style.background=error?"#fff0ee":"#eaf4f9";$("notice").style.color=error?"#a74e43":"#426579"}
function addTS(row={empty:25,wet:30,dry:26,ash:25.3}){state.ts.push({...row});renderTS()}
function renderTS(){
 const body=$("tsTable").tBodies[0];body.innerHTML="";
 state.ts.forEach((r,i)=>{const tr=document.createElement("tr");tr.innerHTML='<td>TS/VS '+(i+1)+'</td>'+["empty","wet","dry","ash"].map(k=>'<td><input type="number" step="any" data-k="'+k+'" value="'+(r[k]??"")+'"></td>').join("")+'<td><button title="刪除">×</button></td>';
 tr.querySelectorAll("input").forEach(el=>el.addEventListener("input",()=>{r[el.dataset.k]=el.value}));tr.querySelector("button").onclick=()=>{state.ts.splice(i,1);renderTS()};body.append(tr)})}
function renderGas(){
 const cols=keys();$("gasTable").tHead.innerHTML="<tr>"+cols.map(k=>"<th>"+(k==="day"?"Day":k.replace("exp_","Exp ").replace("bk_","BK "))+"</th>").join("")+"<th></th></tr>";
 const body=$("gasTable").tBodies[0];body.innerHTML="";
 state.gas.forEach((row,i)=>{const tr=document.createElement("tr");tr.innerHTML=cols.map(k=>'<td><input type="number" step="any" data-k="'+k+'" value="'+(row[k]??"")+'"></td>').join("")+"<td><button title='刪除'>×</button></td>";
 tr.querySelectorAll("input").forEach(el=>{el.oninput=()=>{row[el.dataset.k]=el.value};el.onpaste=e=>{const text=e.clipboardData.getData("text");if(!text.includes("\t")&&!text.includes("\n"))return;e.preventDefault();pasteGrid(text,i,cols.indexOf(el.dataset.k))}});
 tr.querySelector("button").onclick=()=>{state.gas.splice(i,1);renderGas()};body.append(tr)})}
function pasteGrid(raw,startRow=0,startCol=0){
 const lines=raw.trim().split(/\r?\n/).map(line=>line.split("\t"));if(!lines.length)return;
 const cols=keys();const header=/day|time|exp|bk|blank|空白|實驗/i.test(lines[0].join(" "));const data=header?lines.slice(1):lines;
 const mapping=header?lines[0].map((h,i)=>{const v=String(h).trim().toLowerCase().replace(/[\s-]/g,"_");if(/^(day|time|日期|天數)$/.test(v))return "day";let m=v.match(/^(exp|experiment|sample)_?(\d+)$/);if(m)return "exp_"+m[2];m=v.match(/^(bk|blank|control)_?(\d+)$/);if(m)return "bk_"+m[2];return cols[i+startCol]}):null;
 data.forEach((values,j)=>{while(state.gas.length<=startRow+j)state.gas.push({day:state.gas.length});values.forEach((v,k)=>{const key=mapping?mapping[k]:cols[k+startCol];if(cols.includes(key))state.gas[startRow+j][key]=v.trim()})});
 renderGas();message("資料已匯入 "+data.length+" 列。請檢查欄位對應與單位，然後按「計算並更新圖表」。")}
function demo(){
 state.ts=[{empty:25,wet:30,dry:26,ash:25.3},{empty:25.1,wet:30.1,dry:26.08,ash:25.36}];
 const values=[[0,0,0,0,0,0],[1,15,14.5,15.2,2.5,2.7],[2,22,21.8,22.5,3,2.9],[3,28,"",27.5,3.2,3.1],[4,26,25.8,26.3,2.8,2.7],[5,20,19.5,20.1,2.1,2.2],[6,15,14.8,15.3,1.8,1.7],[7,10.2,10,10.1,1.2,1.1]];
 $("expCount").value="3";$("bkCount").value="2";$("weight").value="5";$("project").value="BMP Demo";$("sample").value="Sample A";
 state.gas=values.map(v=>Object.fromEntries(keys().map((k,i)=>[k,v[i]])));renderTS();renderGas();analyze();message("已載入 Python 原始程式中的示範資料。")}
const mean=a=>a.reduce((s,n)=>s+n,0)/a.length;
const sd=a=>a.length<2?0:Math.sqrt(a.reduce((s,v)=>s+(v-mean(a))**2,0)/(a.length-1));
function spread(series,days){
 const result=Array(series.length).fill(0),valid=[];series.forEach((v,i)=>{if(v!==null)valid.push(i)});
 if(!valid.length)return result;
 result[valid[0]]=series[valid[0]];
 for(let n=1;n<valid.length;n++){const prev=valid[n-1],cur=valid[n],delta=days[cur]-days[prev];if(delta<=0){result[cur]=series[cur];continue}const avg=series[cur]/delta;for(let i=0;i<days.length;i++)if(days[i]>=days[prev]+1&&days[i]<=days[cur])result[i]=avg}
 return result;
}
function compute(){
 if(!state.ts.length)throw Error("請先輸入 TS/VS 數據。");
 const tsv=state.ts.map((r,i)=>{const [e,w,d,a]=["empty","wet","dry","ash"].map(k=>num(r[k]));if([e,w,d,a].some(x=>x===null))throw Error("TS/VS 第 "+(i+1)+" 列有空白欄位。");const wet=w-e,dry=d-e,vs=d-a;if(wet<=0||dry<=0||vs<0)throw Error("TS/VS 第 "+(i+1)+" 列秤重不合理。");return {ts:dry/wet,vsts:vs/dry}});
 const ts=mean(tsv.map(x=>x.ts)),vs=mean(tsv.map(x=>x.vsts)),added=num($("weight").value)*ts*vs;
 if(!Number.isFinite(added)||added<=0)throw Error("投入 VS 必須大於 0，請檢查濕樣重量及 TS/VS。");
 const expN=+$("expCount").value,bkN=+$("bkCount").value;
 const rows=state.gas.filter(r=>num(r.day)!==null).map(r=>({...r,day:num(r.day)})).sort((a,b)=>a.day-b.day);
 if(!rows.length)throw Error("請輸入至少一列產氣紀錄。");
 if(rows.some((r,i)=>i>0&&r.day===rows[i-1].day))throw Error("Day 不可重複。");
 if(rows.some(r=>r.day<0||!Number.isInteger(r.day)))throw Error("Day 必須是非負整數。");
 const days=rows.map(r=>r.day);
 const filled={};for(let n=1;n<=expN;n++)filled["exp_"+n]=spread(rows.map(r=>num(r["exp_"+n])),days);
 for(let n=1;n<=bkN;n++)filled["bk_"+n]=spread(rows.map(r=>num(r["bk_"+n])),days);
 const cumulative=Array(expN).fill(0),negative=$("negative").value,subtract=$("subtract").checked;
 const out=days.map((day,i)=>{const bk=bkN?mean(Array.from({length:bkN},(_,j)=>filled["bk_"+(j+1)][i])):0;
 const daily=[],cum=[];for(let n=1;n<=expN;n++){let v=filled["exp_"+n][i]-(subtract?bk:0);if(negative==="zero")v=Math.max(0,v);daily.push(v/added);cumulative[n-1]+=v/added;cum.push(cumulative[n-1])}
 return {day,specific:mean(daily),cumulative:mean(cum),sd:sd(cum),replicates:cus(cum),negative:daily.some(v=>v<0)}});
 return {ts:ts*100,vs:vs*100,added,rows:out,final:out[out.length-1].cumulative};
}
function cus(a){return a.slice()}
function analyze(){
 try{state.results=compute();const r=state.results;["tsMetric","vsMetric","addedMetric","yieldMetric"].forEach((id,i)=>$(id).textContent=nice([r.ts,r.vs,r.added,r.final][i],i===2?3:2));
 $("analysisStatus").textContent="完成 · "+r.rows.length+" 筆時間點";$("resultTable").tBodies[0].innerHTML=r.rows.map(x=>'<tr><td>'+x.day+'</td><td>'+nice(x.specific,3)+'</td><td>'+nice(x.cumulative,3)+'</td><td>'+nice(x.sd,3)+'</td></tr>').join("");
 plot();message("計算完成。採用舊版 BMP Python 核心的 TS/VS、空白扣除與累積產氣公式；動力學模型尚未移植。");
 }catch(e){state.results=null;message("無法計算："+e.message,true);$("analysisStatus").textContent="資料需修正"}}
function plot(){
 const r=state.results;if(!r)return;const x=r.rows.map(a=>a.day),traces=[{x,y:r.rows.map(a=>a.cumulative),name:"累積平均",mode:"lines+markers",type:"scatter",line:{color:"#23766f",width:3},marker:{size:7},error_y:{type:"data",array:r.rows.map(a=>a.sd),visible:true,color:"#9ec4bb"}}];
 if($("showReps").checked)for(let j=0;j<r.rows[0].replicates.length;j++)traces.push({x,y:r.rows.map(a=>a.replicates[j]),name:"Exp "+(j+1),type:"scatter",mode:"lines",line:{width:1.5,dash:"dot"}});
 if(!window.Plotly){$("chart").innerHTML="<p>圖表套件未載入，請檢查網路連線。計算表格仍可使用。</p>";return}
 Plotly.react("chart",traces,{paper_bgcolor:"#fff",plot_bgcolor:"#fff",font:{family:"Inter, Microsoft JhengHei, sans-serif",color:"#53657b"},margin:{l:62,r:25,t:24,b:60},xaxis:{title:"Time (day)",gridcolor:"#edf1f5",zeroline:false},yaxis:{title:"Yield (L/kg-VS)",gridcolor:"#edf1f5",zeroline:false},legend:{orientation:"h",y:-.28}}, {responsive:true,displaylogo:false,toImageButtonOptions:{format:"svg",filename:"BMP_Pro_curve",height:560,width:900}});
}
function download(name,data,type){const blob=new Blob([data],{type}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),500)}
function save(){const obj={version:"2.0-phase1",project:$("project").value,sample:$("sample").value,weight:$("weight").value,expCount:$("expCount").value,bkCount:$("bkCount").value,subtract:$("subtract").checked,negative:$("negative").value,ts:state.ts,gas:state.gas};download(($("project").value||"BMP_Project")+".json",JSON.stringify(obj,null,2),"application/json")}
function restore(obj){if(!obj||!Array.isArray(obj.gas)||!Array.isArray(obj.ts))throw Error("這不是有效的 BMP Pro 專案 JSON");["project","sample","weight","expCount","bkCount"].forEach(k=>{if(obj[k]!=null)$(k).value=obj[k]});$("subtract").checked=obj.subtract!==false;$("negative").value=obj.negative||"keep";state.ts=obj.ts;state.gas=obj.gas;renderTS();renderGas();analyze()}
function csv(){if(!state.results){message("請先執行分析。",true);return}const lines=[["Time","Specific Mean (L/kg-VS)","Cumulative Mean (L/kg-VS)","Cumulative SD"].join(","),...state.results.rows.map(x=>[x.day,x.specific,x.cumulative,x.sd].join(","))];download(($("project").value||"BMP")+"-result.csv","\ufeff"+lines.join("\r\n"),"text/csv;charset=utf-8")}
async function importFile(file){if(!file)return;try{
 if(file.name.toLowerCase().endsWith(".json")){restore(JSON.parse(await file.text()));return}
 let matrix;
 if(window.XLSX){const buf=await file.arrayBuffer(),workbook=XLSX.read(buf,{type:"array"});matrix=XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]],{header:1,defval:""});}
 else if(file.name.toLowerCase().endsWith(".csv"))matrix=(await file.text()).replace(/^\ufeff/,"").trim().split(/\r?\n/).map(l=>l.split(","));
 else throw Error("Excel 解析套件未載入，請確認網路連線後重試。");
 if(matrix.length===0)throw Error("空白工作表");
 pasteGrid(matrix.map(r=>r.join("\t")).join("\n"));
 }catch(e){message("匯入失敗："+e.message,true)}finally{$("fileInput").value=""}}
$("demoBtn").onclick=demo;$("addTS").onclick=()=>addTS({empty:"",wet:"",dry:"",ash:""});
$("addDay").onclick=()=>{state.gas.push({day:state.gas.length?Math.max(...state.gas.map(r=>num(r.day)||0))+1:0});renderGas()};
$("expCount").onchange=$("bkCount").onchange=renderGas;
$("subtract").onchange=$("negative").onchange=()=>{if(state.results)analyze()};
$("showReps").onchange=plot;$("analyzeBtn").onclick=analyze;
$("saveBtn").onclick=save;$("csvBtn").onclick=csv;$("fileInput").onchange=e=>importFile(e.target.files[0]);
$("clearBtn").onclick=()=>{state.gas=[];renderGas();state.results=null;message("已清空每日產氣資料。")};
$("pasteBtn").onclick=()=>{$("pasteDialog").showModal();$("pasteArea").focus()};
$("pasteDialog").addEventListener("close",()=>{if($("pasteDialog").returnValue==="import"){pasteGrid($("pasteArea").value);$("pasteArea").value=""}});
addTS();addTS({empty:25.1,wet:30.1,dry:26.08,ash:25.36});
state.gas=Array.from({length:8},(_,i)=>({day:i}));renderGas();
