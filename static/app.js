const $ = id => document.getElementById(id);
const state = { repos: [], token: "", owner: "", scope: "user", readmes: new Map() };
const categories = ["Hackathons & Events","Experiments & Side Projects","Games & Fun","Learning & Practice","AI & Data","Web & Applications","Open Source","Other"];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function notice(message, kind="") { const el=$("status"); el.textContent=message; el.className="notice "+kind; el.classList.remove("hidden"); }
function setBusy(button, busy, label) { button.disabled=busy; if(busy){button.dataset.old=button.textContent;button.textContent=label||"Working…"}else if(button.dataset.old){button.textContent=button.dataset.old;delete button.dataset.old} }
async function post(path, payload) {
  const res = await fetch(path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
  const data = await res.json().catch(()=>({error:"Unexpected server response"}));
  if(!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
function tagsText(r){return (r.catalog?.tags || r.topics || (r.language?[r.language.toLowerCase()]:[])).join(", ")}
function visibleRepos(){
  const q=$("filter").value.toLowerCase().trim(), cat=$("categoryFilter").value, sort=$("sort").value;
  let a=state.repos.filter(r=>{
    const hay=[r.name,r.description,r.catalog?.description,r.language,(r.catalog?.tags||[]).join(" ")].join(" ").toLowerCase();
    return (!q||hay.includes(q))&&(cat==="All categories"|| (r.catalog?.category||"Other")===cat);
  });
  a.sort((x,y)=>sort==="name"?x.name.localeCompare(y.name):sort==="stars"?(y.stars-x.stars):y.updated_at.localeCompare(x.updated_at));
  return a;
}
function updateStats(){
  $("totalCount").textContent=state.repos.length;
  $("includedCount").textContent=state.repos.filter(r=>r.include).length;
  $("reviewCount").textContent=state.repos.filter(r=>!r.catalog || !r.catalog.reviewed).length;
}
function render(){
  const rows=$("repoRows");
  rows.innerHTML=visibleRepos().map(r=>{
    const c=r.catalog||{category:"Other",description:r.description||"",tags:r.topics||[],reviewed:false};
    return `<tr data-name="${esc(r.full_name)}">
      <td><input type="checkbox" class="include" aria-label="Include ${esc(r.name)}" ${r.include?"checked":""}></td>
      <td><a class="repo-name" href="${esc(r.html_url)}" target="_blank" rel="noopener">${esc(r.name)}</a>
        <div class="repo-meta">${esc(r.language||"No language")} · updated ${esc(r.updated_at||"unknown")}${r.fork?" · fork":""}${r.archived?" · archived":""}${r.private?" · private":""}</div>
      </td>
      <td><select class="edit category">${categories.map(ca=>`<option ${ca===c.category?"selected":""}>${esc(ca)}</option>`).join("")}</select></td>
      <td><textarea class="edit desc" rows="3" maxlength="220">${esc(c.description)}</textarea><div class="repo-meta">${esc(c.method==="ai"?"AI suggestion":c.method==="heuristic"?"Rule-based suggestion":"Existing description")}</div></td>
      <td><textarea class="edit tags" rows="3" placeholder="e.g. python, learning">${esc((c.tags||[]).join(", "))}</textarea><div class="repo-meta"><button class="secondary analyzeOne" type="button">Analyze README</button></div></td>
    </tr>`;
  }).join("");
  rows.querySelectorAll("tr").forEach(tr=>{
    const r=state.repos.find(x=>x.full_name===tr.dataset.name);
    tr.querySelector(".include").addEventListener("change",e=>{r.include=e.target.checked;updateStats()});
    tr.querySelector(".category").addEventListener("change",e=>{r.catalog.category=e.target.value;r.catalog.reviewed=true;updateCategoryFilter();updateStats()});
    tr.querySelector(".desc").addEventListener("input",e=>{r.catalog.description=e.target.value;r.catalog.reviewed=true;updateStats()});
    tr.querySelector(".tags").addEventListener("input",e=>{r.catalog.tags=e.target.value.split(",").map(x=>x.trim().toLowerCase()).filter(Boolean).slice(0,12);r.catalog.reviewed=true;updateStats()});
    tr.querySelector(".analyzeOne").addEventListener("click",()=>analyzeRepo(r,tr.querySelector(".analyzeOne")));
  });
  updateStats();
}
function updateCategoryFilter(){
  const current=$("categoryFilter").value;
  const seen=[...new Set(state.repos.map(r=>r.catalog?.category).filter(Boolean))];
  $("categoryFilter").innerHTML='<option>All categories</option>'+categories.filter(c=>seen.includes(c)).map(c=>`<option>${esc(c)}</option>`).join("");
  if([...$("categoryFilter").options].some(o=>o.value===current))$("categoryFilter").value=current;
}
async function loadReadme(r){
  if(state.readmes.has(r.full_name)) return state.readmes.get(r.full_name);
  const result=await post("/api/readme",{full_name:r.full_name,token:state.token});
  state.readmes.set(r.full_name,result.readme||"");
  return result.readme||"";
}
async function analyzeRepo(r, button){
  setBusy(button,true,"Reading…");
  try{
    const readme=await loadReadme(r);
    const suggestion=await post("/api/suggest",{repo:r,readme});
    r.catalog={...r.catalog,...suggestion,reviewed:false};
    render();
    notice(`Suggestions updated for ${r.name}. Review the category, description, and tags.`, "ok");
  }catch(e){notice(`Could not analyze ${r.name}: ${e.message}`,"error");}
  finally{setBusy(button,false)}
}
$("scanBtn").addEventListener("click",async()=>{
  const btn=$("scanBtn");setBusy(btn,true,"Scanning…");
  state.owner=$("owner").value.trim();state.scope=$("scope").value;state.token=$("token").value.trim();state.readmes.clear();
  try{
    const data=await post("/api/scan",{owner:state.owner,scope:state.scope,token:state.token});
    state.repos=data.repos.map(r=>({...r,include:!r.private&&!r.archived, catalog:{category:"Other",description:r.description||"",tags:r.topics?.length?r.topics:(r.language?[r.language.toLowerCase()]:[]),method:"metadata",reviewed:false}}));
    // Keep the user's catalog private by default; public repos are selected initially, private repos excluded.
    updateCategoryFilter();$("results").classList.remove("hidden");$("outputPanel").classList.add("hidden");render();
    notice(`Found ${data.count} repositories for ${state.owner}. No files have been changed on GitHub.`, "ok");
  }catch(e){notice(e.message,"error")}
  finally{setBusy(btn,false)}
});
$("suggestBtn").addEventListener("click",async()=>{
  const btn=$("suggestBtn");setBusy(btn,true,"Analyzing…");
  const chosen=state.repos.filter(r=>r.include);
  let ok=0, errors=0;
  for(let i=0;i<chosen.length;i++){
    try{
      const readme=await loadReadme(chosen[i]);
      const suggestion=await post("/api/suggest",{repo:chosen[i],readme});
      chosen[i].catalog={...chosen[i].catalog,...suggestion,reviewed:false};ok++;
      notice(`Analyzed ${ok}/${chosen.length}: ${chosen[i].name}`);
    }catch(e){errors++;chosen[i].catalog.description=chosen[i].catalog.description||chosen[i].description||"";
      chosen[i].catalog.error=e.message;}
    render();
  }
  notice(`Analysis complete: ${ok} suggestions generated; ${errors} README/API errors. Review all results before exporting.`,errors?"error":"ok");
  setBusy(btn,false);
});
$("filter").addEventListener("input",render);$("categoryFilter").addEventListener("change",render);$("sort").addEventListener("change",render);
$("selectAllBtn").addEventListener("click",()=>{visibleRepos().forEach(r=>r.include=true);render()});
$("selectNoneBtn").addEventListener("click",()=>{visibleRepos().forEach(r=>r.include=false);render()});
function buildMarkdown(){
  const selected=state.repos.filter(r=>r.include);
  const owner=state.owner;
  const title=owner ? `${owner} Project Lab` : "Project Lab";
  const intro="A collection of hackathon builds, experiments, learning projects, and small things built for fun.";
  let md=`# ${title}\n\n${intro}\n\n> Automatically cataloged from GitHub; descriptions and categories may need review.\n\n`;
  const groups=new Map();
  selected.forEach(r=>{const cat=r.catalog?.category||"Other";if(!groups.has(cat))groups.set(cat,[]);groups.get(cat).push(r)});
  const order=[...categories,"Other"];
  for(const cat of order){
    const items=groups.get(cat);if(!items?.length)continue;
    md+=`## ${cat}\n\n| Project | Description | Tech stack | Tags |\n|---|---|---|---|\n`;
    for(const r of items.sort((a,b)=>a.name.localeCompare(b.name))){
      const c=r.catalog||{};
      const cell=s=>String(s||"").replace(/\|/g,"\\|").replace(/\r?\n/g," ").trim();
      const tags=(c.tags||[]).map(t=>"`"+String(t).replace(/`/g,"")+"`").join(" ");
      md+=`| [${cell(r.name)}](${r.html_url}) | ${cell(c.description||r.description||"Description not available")} | ${cell(r.language||"—")} | ${tags||"—"} |\n`;
    }
    md+="\n";
  }
  md+="---\n\n*Some repositories are prototypes or learning exercises and are not intended to be production-ready.*\n";
  return md;
}
$("exportBtn").addEventListener("click",()=>{$("markdown").value=buildMarkdown();$("outputPanel").classList.remove("hidden");$("outputPanel").scrollIntoView({behavior:"smooth",block:"start"})});
$("copyBtn").addEventListener("click",async()=>{try{await navigator.clipboard.writeText($("markdown").value);notice("Markdown copied to clipboard.","ok")}catch(e){$("markdown").select();notice("Clipboard access unavailable. Select and copy the Markdown manually.")}});
function download(name,content,type){const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=name;a.click();URL.revokeObjectURL(url)}
$("downloadMdBtn").addEventListener("click",()=>download("README.md",$("markdown").value,"text/markdown;charset=utf-8"));
$("downloadJsonBtn").addEventListener("click",()=>download("catalog.json",JSON.stringify({owner:state.owner,scope:state.scope,generated_at:new Date().toISOString(),repositories:state.repos.map(r=>({...r,readme_cached:undefined}))},null,2),"application/json"));
