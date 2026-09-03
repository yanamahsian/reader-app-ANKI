import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EXPECTED_RUN_TOKEN_SHA256 = "09697fd4bc452fe68c5330804e2537e2dd11008c5525614f7e22d30e38d6fa3e";
const PROMPT_VERSION = "v2";
const MODEL = Deno.env.get("OMNIA_CLASSIFIER_MODEL") || "gpt-5.6-luna";
const AXES = ["genre","theme","movement","epoch","country"] as const;
type Axis = typeof AXES[number];
const FIELD_BY_AXIS: Record<Axis,string> = { genre:"genre_ids", theme:"theme_ids", movement:"movement_id", epoch:"epoch_id", country:"country_id" };
const MULTI = new Set<Axis>(["genre","theme"]);

function json(body: unknown, status=200){ return new Response(JSON.stringify(body,null,2),{status,headers:{"Content-Type":"application/json"}}); }
async function sha256Hex(v:string){ const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v)); return Array.from(new Uint8Array(d)).map(b=>b.toString(16).padStart(2,"0")).join(""); }
function confidenceRank(v:unknown){ return v === "high" ? 3 : v === "medium" ? 2 : v === "low" ? 1 : 0; }
function centuryId(year:number){ if(year===0) return null; return year < 0 ? `${Math.ceil(Math.abs(year)/100)}-bc` : String(Math.ceil(year/100)); }
function extractOutputText(body:any){ if(typeof body?.output_text === "string") return body.output_text; for(const item of body?.output ?? []) for(const c of item?.content ?? []) if(typeof c?.text === "string") return c.text; return null; }

function pickIndices(n:number){ if(n<=0) return []; if(n<=6) return Array.from({length:n},(_,i)=>i); return Array.from(new Set([0,n-1,Math.floor((n-1)/2),Math.round((n-1)*.2),Math.round((n-1)*.4),Math.round((n-1)*.8)])).sort((a,b)=>a-b).slice(0,6); }
function buildSample(doc:any){ const chapters=Array.isArray(doc?.chapters)?doc.chapters:[]; if(!chapters.length) return ""; if(doc?.hasRealChapters===true && chapters.length>1){ return pickIndices(chapters.length).map(i=>`--- ${chapters[i]?.title ?? `Chapter ${i+1}`} ---\n${String(chapters[i]?.text ?? "").slice(0,1800)}`).join("\n\n"); }
 const full=chapters.map((c:any)=>String(c?.text??"")).join("\n\n"); if(full.length<=10000) return full; const size=1900; return [0,.25,.5,.75,1].map((f,i)=>{const start=f===1?Math.max(0,full.length-size):Math.floor(full.length*f);return `--- sample ${i+1} ---\n${full.slice(start,start+size)}`;}).join("\n\n"); }

async function wikidataYear(qid:string|null){
 if(!qid) return null;
 try{
  const u=new URL("https://www.wikidata.org/w/api.php");
  for(const [k,v] of Object.entries({action:"wbgetentities",format:"json",ids:qid,props:"claims",origin:"*"})) u.searchParams.set(k,v);
  const r=await fetch(u.toString(),{headers:{"User-Agent":"ANKI/1.0 catalog enrichment"}}); if(!r.ok) return null;
  const e=(await r.json())?.entities?.[qid]; const years=new Set<number>();
  for(const c of e?.claims?.P577 ?? []){ const t=c?.mainsnak?.datavalue?.value?.time; const p=c?.mainsnak?.datavalue?.value?.precision; if(typeof t==="string" && Number(p)>=9){ const m=t.match(/^([+-]?\d{1,6})-/); if(m) years.add(Number(m[1])); } }
  return years.size===1 ? [...years][0] : null;
 }catch{return null;}
}

async function callOpenAI(work:any,author:any,sample:string,vocab:Record<string,any[]>,askYear:boolean){
 const apiKey=Deno.env.get("OPENAI_API_KEY"); if(!apiKey) throw new Error("Missing OPENAI_API_KEY");
 const props:any={
  description:{type:["string","null"]},
  genre_ids:{type:"array",items:{type:"string",enum:vocab.genre.map(x=>x.id)}},
  theme_ids:{type:"array",items:{type:"string",enum:vocab.theme.map(x=>x.id)}},
  movement_id:{type:["string","null"],enum:[...vocab.movement.map(x=>x.id),null]},
  epoch_id:{type:["string","null"],enum:[...vocab.epoch.map(x=>x.id),null]},
  country_id:{type:["string","null"],enum:[...vocab.country.map(x=>x.id),null]},
  confidence:{type:"object",properties:{description:{type:"string",enum:["high","medium","low"]},publication_year:{type:"string",enum:["high","medium","low"]},genre:{type:"string",enum:["high","medium","low"]},theme:{type:"string",enum:["high","medium","low"]},movement:{type:"string",enum:["high","medium","low"]},epoch:{type:"string",enum:["high","medium","low"]},country:{type:"string",enum:["high","medium","low"]}},required:["description","publication_year","genre","theme","movement","epoch","country"],additionalProperties:false},
  evidence:{type:"object",properties:{description:{type:"string"},publication_year:{type:"string"},genre:{type:"string"},theme:{type:"string"},movement:{type:"string"},epoch:{type:"string"},country:{type:"string"}},required:["description","publication_year","genre","theme","movement","epoch","country"],additionalProperties:false}
 };
 if(askYear) props.publication_year={type:["integer","null"],minimum:-3000,maximum:2100}; else props.publication_year={type:"null"};
 const required=Object.keys(props);
 const vocabText=AXES.map(a=>`${FIELD_BY_AXIS[a]}:\n${vocab[a].map((t:any)=>`${t.id} = ${t.label_en ?? t.label ?? t.id}`).join("\n")}`).join("\n\n");
 const system=[
  "You enrich metadata for a serious international literary library.",
  "Return only values from the supplied controlled vocabularies for taxonomy fields.",
  "Description must be in Russian, neutral, concise (1-2 sentences), accurate, no marketing language and no invented facts.",
  "Themes should capture the central ideas of the work, normally 2-6 values when supported.",
  "Genres may contain several precise forms when genuinely applicable.",
  "country_id means literary tradition, not citizenship. movement_id and epoch_id are literary-historical classifications.",
  "For publication_year, use established bibliographic knowledge only and return a year only when highly confident; otherwise null.",
  "Use the text sample as primary evidence for themes and genre, and bibliographic knowledge for movement/epoch/tradition/year.",
  "Do not fill a field merely to avoid null."
 ].join("\n");
 const user=`Title: ${work.title}\nOriginal title: ${work.original_title ?? ""}\nAuthor: ${author?.name ?? ""}\nKnown publication year: ${work.publication_year ?? ""}\nOriginal language: ${work.original_language ?? ""}\n\nControlled vocabularies:\n${vocabText}\n\nRepresentative text sample:\n${sample}`;
 const schema={type:"object",properties:props,required,additionalProperties:false};
 const r=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model:MODEL,input:[{role:"system",content:system},{role:"user",content:user}],text:{format:{type:"json_schema",name:"anki_catalog_enrichment_v2",schema,strict:true}},store:false,max_output_tokens:2500})});
 if(!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0,500)}`);
 const body=await r.json(); const text=extractOutputText(body); if(!text) throw new Error("No structured output");
 return {parsed:JSON.parse(text),responseId:body?.id ?? null};
}

Deno.serve(async(req:Request)=>{
 if(req.method!=="GET") return json({error:"Method not allowed"},405);
 const token=req.headers.get("x-omnia-run-token")??""; if(!token || await sha256Hex(token)!==EXPECTED_RUN_TOKEN_SHA256) return json({error:"Unauthorized"},401);
 const url=new URL(req.url); const requestedWorkId=url.searchParams.get("workId");
 const base=Deno.env.get("SUPABASE_URL"), key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"); if(!base||!key) return json({error:"Missing server secrets"},500);
 const sb=createClient(base,key);
 const {data:cands,error:ce}=await sb.rpc("get_catalog_ai_enrichment_candidates",{p_limit:1,p_work_id:requestedWorkId}); if(ce) return json({error:ce.message},500);
 if(!cands?.length) return json({ok:true,processed:0,note:"No eligible work needs v2 enrichment"});
 const c=cands[0]; const now=new Date().toISOString();
 const {data:oldRun}=await sb.from("catalog_ai_enrichment_runs").select("attempts").eq("work_id",c.work_id).maybeSingle();
 await sb.from("catalog_ai_enrichment_runs").upsert({work_id:c.work_id,edition_id:c.edition_id,prompt_version:PROMPT_VERSION,status:"processing",attempts:Number(oldRun?.attempts??0)+1,started_at:now,finished_at:null,last_error:null,updated_at:now},{onConflict:"work_id"});
 try{
  const {data:work,error:we}=await sb.from("works").select("*").eq("id",c.work_id).maybeSingle(); if(we||!work) throw new Error(we?.message??"Work missing");
  const {data:author}=await sb.from("authors").select("id,name").eq("id",work.author_id).maybeSingle();
  const {data:file,error:fe}=await sb.from("book_files").select("storage_path").eq("edition_id",c.edition_id).eq("kind","normalized").eq("format","anki-json").eq("ingestion_status","ready").maybeSingle(); if(fe||!file) throw new Error(fe?.message??"Normalized file missing");
  const {data:blob,error:de}=await sb.storage.from("book-files").download(file.storage_path); if(de||!blob) throw new Error(de?.message??"Storage download failed");
  const doc=JSON.parse(await blob.text()); const sample=buildSample(doc); if(sample.length<500) throw new Error("Text sample too short");
  const vocab:Record<string,any[]>={}; for(const axis of AXES){ const {data,error}=await sb.from("taxonomy_terms").select("id,label,label_en").eq("category",axis).eq("is_canonical",true); if(error) throw new Error(error.message); vocab[axis]=data??[]; }
  const {data:idRow}=await sb.from("work_external_identifiers").select("external_id").eq("work_id",work.id).eq("scheme","wikidata-work").maybeSingle();
  let factualYear=work.publication_year as number|null; if(factualYear==null) factualYear=await wikidataYear(idRow?.external_id??null);
  const ai=await callOpenAI(work,author,sample,vocab,factualYear==null); const p=ai.parsed??{}; const conf=p.confidence??{};
  const updates:any={}; const completed:string[]=[]; const unresolved:string[]=[];
  if(!work.description && typeof p.description==="string" && p.description.trim().length>=40 && confidenceRank(conf.description)>=2){ updates.description=p.description.trim().slice(0,900); completed.push("description"); } else if(!work.description) unresolved.push("description");
  let year=factualYear; if(work.publication_year==null){ if(factualYear!=null){updates.publication_year=factualYear;completed.push("publication_year");} else if(Number.isInteger(p.publication_year) && confidenceRank(conf.publication_year)>=3){year=p.publication_year;updates.publication_year=year;completed.push("publication_year");} else unresolved.push("publication_year"); }
  if(!work.century_id && year!=null){ const cid=centuryId(year); if(cid && (await sb.from("taxonomy_terms").select("id").eq("category","century").eq("id",cid).maybeSingle()).data){updates.century_id=cid;completed.push("century_id");} else unresolved.push("century_id"); }
  for(const axis of AXES){ const field=FIELD_BY_AXIS[axis]; const valid=new Set(vocab[axis].map((x:any)=>x.id)); const threshold=2; if(MULTI.has(axis)){ const existing=Array.isArray(work[field])?work[field]:[]; if(existing.length===0){ const selected=(Array.isArray(p[field])?p[field]:[]).filter((x:any)=>typeof x==="string"&&valid.has(x)); if(selected.length && confidenceRank(conf[axis])>=threshold){updates[field]=Array.from(new Set(selected));completed.push(field);} else unresolved.push(field); } } else if(!work[field]){ const selected=typeof p[field]==="string"&&valid.has(p[field])?p[field]:null; if(selected && confidenceRank(conf[axis])>=threshold){updates[field]=selected;completed.push(field);} else unresolved.push(field); } }
  if(Object.keys(updates).length){ const {error}=await sb.from("works").update(updates).eq("id",work.id); if(error) throw new Error(`works update: ${error.message}`); }
  const sampleHash=await sha256Hex(sample); const taxonomyVersion=await sha256Hex(AXES.map(a=>`${a}:${vocab[a].map((x:any)=>`${x.id}=${x.label_en??x.label??x.id}`).sort().join(",")}`).join("|"));
  const prov:any[]=[]; for(const axis of AXES){ const field=FIELD_BY_AXIS[axis]; const selected=MULTI.has(axis)?(Array.isArray(p[field])?p[field]:[]).filter((x:any)=>vocab[axis].some((t:any)=>t.id===x)):(typeof p[field]==="string"&&vocab[axis].some((t:any)=>t.id===p[field])?[p[field]]:[]); prov.push({work_id:work.id,edition_id:c.edition_id,category:axis,model:MODEL,prompt_version:PROMPT_VERSION,sampler_version:"catalog-v2",sample_hash:sampleHash,taxonomy_version:taxonomyVersion,selected_ids:selected,applied_ids:Object.prototype.hasOwnProperty.call(updates,field)?selected:[],rejected_ids:[],evidence:p.evidence?.[axis]??null,confidence:conf[axis]??"low",provider_response_id:ai.responseId,created_at:new Date().toISOString()}); }
  const {error:pe}=await sb.from("ai_classification_provenance").upsert(prov,{onConflict:"work_id,category"}); if(pe) console.error("provenance write failed",pe);
  await sb.from("catalog_ai_enrichment_runs").update({status:"succeeded",completed_fields:completed,unresolved_fields:unresolved,model:MODEL,result:{written:updates,confidence:conf,evidence:p.evidence??{},provider_response_id:ai.responseId},last_error:null,finished_at:new Date().toISOString(),next_attempt_at:null,updated_at:new Date().toISOString()}).eq("work_id",work.id);
  return json({ok:true,processed:1,workId:work.id,title:work.title,written:updates,completed,unresolved,model:MODEL});
 }catch(e){ const message=e instanceof Error?e.message:String(e); const {data:r}=await sb.from("catalog_ai_enrichment_runs").select("attempts").eq("work_id",c.work_id).maybeSingle(); const attempts=Number(r?.attempts??1); await sb.from("catalog_ai_enrichment_runs").update({status:"failed",last_error:message,finished_at:new Date().toISOString(),next_attempt_at:attempts>=3?null:new Date(Date.now()+30*60*1000).toISOString(),updated_at:new Date().toISOString()}).eq("work_id",c.work_id); return json({ok:false,processed:1,workId:c.work_id,error:message,attempts},500); }
});
