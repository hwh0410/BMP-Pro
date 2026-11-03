"use strict";
/* Google OAuth for BMP Pro. Access tokens remain in memory only. */
(() => {
 const CLIENT_ID="939938555814-vs8evrmpdajdinakhabocvum1e7cvtr0.apps.googleusercontent.com";
 const SCOPE="https://www.googleapis.com/auth/spreadsheets";
 const el=id=>document.getElementById(id);
 let tokenClient=null,accessToken=null,expiresAt=0;
 const setStatus=(s,err=false)=>{el("cloudStatus").textContent=s;el("cloudStatus").style.color=err?"#a74e43":"#426579"};
 function connected(value){el("googleDisconnectBtn").disabled=!value;el("googleConnectBtn").textContent=value?"重新授權 Google":"使用 Google 連線"}
 function ready(){
  if(!window.google?.accounts?.oauth2){setStatus("Google Identity Services 尚未載入。請確認網路連線與瀏覽器阻擋設定。",true);return false}
  if(!tokenClient)tokenClient=google.accounts.oauth2.initTokenClient({
   client_id:CLIENT_ID,scope:SCOPE,
   callback:r=>{
    if(r.error||!r.access_token){setStatus("授權失敗："+(r.error_description||r.error||"未取得存取權杖"),true);connected(false);return}
    accessToken=r.access_token;expiresAt=Date.now()+(Number(r.expires_in)||3600)*1000;
    connected(true);setStatus("Google 已授權Google Sheets 讀寫權限。下一步貼上團隊試算表 ID，再點選「測試資料庫讀取」。");
   },
   error_callback:e=>setStatus("無法完成 Google 授權："+(e?.type||"視窗被關閉／封鎖"),true)
  });
  return true;
 }
 window.BMPGoogleAuth={
  getToken(){if(!accessToken||Date.now()>expiresAt-60000)throw Error("Google 授權已過期，請重新連線。");return accessToken;},
  getSpreadsheetId(){return el("spreadsheetIdInput").value.trim()},
  connected(){return !!accessToken&&Date.now()<expiresAt-60000}
 };
 el("googleConnectBtn").addEventListener("click",()=>{if(ready())tokenClient.requestAccessToken({prompt:"consent"})});
 el("googleDisconnectBtn").addEventListener("click",()=>{
  const previous=accessToken;accessToken=null;expiresAt=0;connected(false);
  if(previous&&window.google?.accounts?.oauth2)google.accounts.oauth2.revoke(previous,()=>{});
  setStatus("已中斷本頁 Google 授權（不影響 Google 試算表的分享設定）。")
 });
 el("testSheetsBtn").addEventListener("click",async()=>{
  const id=el("spreadsheetIdInput").value.trim();
  if(!/^[a-zA-Z0-9_-]{20,}$/.test(id)){setStatus("請輸入有效的 Google 試算表 ID（不是整段網址）。",true);return}
  if(!accessToken||Date.now()>expiresAt-60000){connected(false);setStatus("請先授權或重新連接 Google 帳號。",true);return}
  el("testSheetsBtn").disabled=true;setStatus("正在驗證試算表存取權限……");
  try{
   const url="https://sheets.googleapis.com/v4/spreadsheets/"+encodeURIComponent(id)+"?fields=spreadsheetId,properties(title),sheets(properties(title))";
   const res=await fetch(url,{headers:{Authorization:"Bearer "+accessToken}});
   const payload=await res.json();
   if(!res.ok){const reason=payload?.error?.message||"Unknown error";throw Error(res.status+"："+reason)}
   const tabs=(payload.sheets||[]).map(s=>s.properties.title);
   const required=["Projects","Materials","Groups","TSVS_Data","Gas_Data","Results"];
   const missing=required.filter(x=>!tabs.includes(x));
   setStatus("已成功讀取「"+payload.properties.title+"」，工作表："+tabs.join("、")+(missing.length?"。尚缺預定的資料表："+missing.join("、"):"。核心資料表名稱齊全。"));
  }catch(e){setStatus("讀取失敗："+e.message+"。請檢查測試使用者、OAuth 來源、試算表分享權限與 ID。",true)}
  finally{el("testSheetsBtn").disabled=false}
 });
})();