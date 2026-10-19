const $ = id => document.getElementById(id);
const state = { repos: [], token: "", owner: "", scope: "user", readmes: new Map() };
const categories = ["Hackathons & Events","Fun & Experimental","Open Source","Work in Progress / Open for Collaboration","Tools","Knowledge & Learning","Others"];
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
    return (!q||hay.includes(q))&&(cat==="All categories"|| (r.catalog?.category||"Others")===cat);
  });
  if(sort==="name")a.sort((x,y)=>x.name.localeCompare(y.name));
  else if(sort==="stars")a.sort((x,y)=>y.stars-x.stars);
  else if(sort==="updated")a.sort((x,y)=>y.updated_at.localeCompare(x.updated_at));
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
    const c=r.catalog||{category:"Others",description:r.description||"",tags:r.topics||[],reviewed:false};
    return `<tr data-name="${esc(r.full_name)}" draggable="false">
      <td class="drag-cell"><button class="drag-handle" type="button" draggable="true" aria-label="Reorder ${esc(r.name)}" title="Drag to reorder"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="5" cy="3" r="1"></circle><circle cx="11" cy="3" r="1"></circle><circle cx="5" cy="8" r="1"></circle><circle cx="11" cy="8" r="1"></circle><circle cx="5" cy="13" r="1"></circle><circle cx="11" cy="13" r="1"></circle></svg></button></td>
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
    const handle=tr.querySelector(".drag-handle");
    handle.addEventListener("dragstart",e=>{e.dataTransfer.setData("text/plain",r.full_name);e.dataTransfer.effectAllowed="move";tr.classList.add("dragging")});
    handle.addEventListener("dragend",()=>tr.classList.remove("dragging"));
    tr.addEventListener("dragover",e=>{e.preventDefault();e.dataTransfer.dropEffect="move";tr.classList.add("drop-target")});
    tr.addEventListener("dragleave",()=>tr.classList.remove("drop-target"));
    tr.addEventListener("drop",e=>{
      e.preventDefault();tr.classList.remove("drop-target");
      const dragged=e.dataTransfer.getData("text/plain"),from=state.repos.findIndex(x=>x.full_name===dragged),to=state.repos.findIndex(x=>x.full_name===r.full_name);
      if(from<0||to<0||from===to)return;
      const [item]=state.repos.splice(from,1);state.repos.splice(to,0,item);$("sort").value="manual";render();
    });
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
    state.repos=data.repos.map(r=>({...r,include:!r.private&&!r.archived, catalog:{category:"Others",description:r.description||"",tags:r.topics?.length?r.topics:(r.language?[r.language.toLowerCase()]:[]),method:"metadata",reviewed:false}}));
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
  selected.forEach(r=>{const cat=r.catalog?.category||"Others";if(!groups.has(cat))groups.set(cat,[]);groups.get(cat).push(r)});
  const order=categories;
  for(const cat of order){
    const items=groups.get(cat);if(!items?.length)continue;
    md+=`## ${cat}\n\n| Project | Description | Tech stack | Tags |\n|---|---|---|---|\n`;
    for(const r of items){
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
function inlineMarkdown(text){
  let html=esc(text);
  html=html.replace(/`([^`]+)`/g,"<code>$1</code>");
  html=html.replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>');
  html=html.replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>").replace(/\*([^*]+)\*/g,"<em>$1</em>");
  return html;
}
function renderMarkdown(source){
  const lines=source.split(/\r?\n/), out=[];let i=0;
  while(i<lines.length){
    const line=lines[i];
    if(!line.trim()){i++;continue;}
    if(/^---+$/.test(line.trim())){out.push("<hr>");i++;continue;}
    if(/^\|/.test(line.trim())){
      const rows=[];
      while(i<lines.length&&/^\|/.test(lines[i].trim()))rows.push(lines[i++].trim().replace(/^\||\|$/g,"").split("|").map(cell=>cell.trim()));
      const data=rows.filter(row=>!row.every(cell=>/^:?-{3,}:?$/.test(cell)));
      if(data.length)out.push("<table><thead><tr>"+data[0].map(cell=>"<th>"+inlineMarkdown(cell)+"</th>").join("")+"</tr></thead><tbody>"+data.slice(1).map(row=>"<tr>"+data[0].map((_,n)=>"<td>"+inlineMarkdown(row[n]||"")+"</td>").join("")+"</tr>").join("")+"</tbody></table>");
      continue;
    }
    const heading=line.match(/^(#{1,6})\s+(.*)$/);
    if(heading){const level=heading[1].length;out.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);i++;continue;}
    if(/^>\s?/.test(line)){out.push("<blockquote><p>"+inlineMarkdown(line.replace(/^>\s?/,""))+"</p></blockquote>");i++;continue;}
    const para=[];while(i<lines.length&&lines[i].trim()&&!/^(#{1,6})\s|^>\s?|^\|/.test(lines[i].trim())&&!/^---+$/.test(lines[i].trim()))para.push(lines[i++].trim());
    if(para.length)out.push("<p>"+inlineMarkdown(para.join(" "))+"</p>");
  }
  return out.join("\n");
}
$("markdown").addEventListener("input",e=>$("markdownPreview").innerHTML=renderMarkdown(e.target.value));
$("previewBtn").addEventListener("click",()=>{
  const showingPreview=$("markdownPreview").classList.contains("hidden");
  $("markdownPreview").classList.toggle("hidden",!showingPreview);
  $("markdownEditor").classList.toggle("hidden",showingPreview);
  $("previewBtn").textContent=showingPreview?"Edit Markdown":"Preview";
  $("previewBtn").setAttribute("aria-pressed",String(showingPreview));
});
$("exportBtn").addEventListener("click",()=>{$("markdown").value=buildMarkdown();$("markdownPreview").innerHTML=renderMarkdown($("markdown").value);$("outputPanel").classList.remove("hidden");$("outputPanel").scrollIntoView({behavior:"smooth",block:"start"})});
$("copyBtn").addEventListener("click",async()=>{try{await navigator.clipboard.writeText($("markdown").value);notice("Markdown copied to clipboard.","ok")}catch(e){$("markdown").select();notice("Clipboard access unavailable. Select and copy the Markdown manually.")}});
function download(name,content,type){const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=name;a.click();URL.revokeObjectURL(url)}
$("downloadMdBtn").addEventListener("click",()=>download("README.md",$("markdown").value,"text/markdown;charset=utf-8"));
$("downloadJsonBtn").addEventListener("click",()=>download("catalog.json",JSON.stringify({owner:state.owner,scope:state.scope,generated_at:new Date().toISOString(),repositories:state.repos.map(r=>({...r,readme_cached:undefined}))},null,2),"application/json"));
