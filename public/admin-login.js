(() => {
  "use strict";
  const $=s=>document.querySelector(s);
  async function api(path,options={}){
    if(typeof path!=="string" || !path.startsWith("/api/")) throw new Error("Same-origin PCS API path required.");
    const init={credentials:"same-origin",...options};
    if(init.body&&typeof init.body!=="string"){
      init.headers={...(init.headers||{}),"content-type":"application/json"};
      init.body=JSON.stringify(init.body);
    }
    const res=await fetch(path,init);
    const data=await res.json().catch(()=>({message:"Invalid server response."}));
    if(!res.ok){const e=new Error(data.message||"Request failed.");e.status=res.status;e.code=data.error;throw e;}
    return data;
  }
  function message(text,good=false){
    const el=$("#adminLoginMessage"); if(!el)return;
    el.textContent=text||"";
    el.className=good?"form-message successline":"form-message validation bad";
  }
  async function check(){
    try{
      const session=await api("/api/admin/session");
      if(session.authenticated) location.replace("admin.html");
    }catch(_){}
  }
  $("#adminLoginForm")?.addEventListener("submit",async event=>{
    event.preventDefault();
    const fd=new FormData(event.currentTarget);
    message("Signing in…",true);
    try{
      await api("/api/admin/login",{method:"POST",body:{email:fd.get("email"),password:fd.get("password")}});
      message("Administrator session created. Opening Admin Center…",true);
      location.replace("admin.html");
    }catch(e){message(e.message);}
  });
  document.addEventListener("DOMContentLoaded",check);
})();