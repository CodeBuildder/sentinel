import { useEffect, useMemo, useState } from 'react'
import { Activity, AlertTriangle, Bot, BrainCircuit, CheckCircle2, Network, RefreshCw, Shield, Sparkles, Timer, Zap } from 'lucide-react'

type Timeline = {id?:string;source:string;severity:string;timestamp:string;entity_name?:string;type:string;summary:string;replayed:boolean}
type Component = {entity_id:string;name:string;namespace:string;entity_type:string;risk:number;security_posture:string;fragility:number;finding_count:number}
type Overview = {generated_at:string;status:string;degraded_sources:string[];fleet_risk:number;risk_level:string;counts:Record<string,number>;sources:Record<string,{connected:boolean;findings:number}>;components:Component[];timeline:Timeline[];topology:{nodes:any[];edges:any[]};trust:any[]}

const API='/api'
const tone=(v:string)=>v==='critical'?'red':v==='high'?'amber':v==='medium'||v==='med'||v==='guarded'?'yellow':v==='stable'||v==='low'?'green':'blue'
const age=(stamp?:string)=>{if(!stamp)return 'unknown';const s=Math.max(0,Math.floor((Date.now()-new Date(stamp).getTime())/1000));return s<60?`${s}s ago`:s<3600?`${Math.floor(s/60)}m ago`:`${Math.floor(s/3600)}h ago`}

function Stat({label,value,sub,icon:Icon,color='blue'}:{label:string;value:string|number;sub:string;icon:any;color?:string}){return <div className={`stat ${color}`}><div className="stat-head"><span>{label}</span><Icon size={15}/></div><strong>{value}</strong><small>{sub}</small></div>}

export default function App(){
 const [data,setData]=useState<Overview|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[brief,setBrief]=useState(''),[briefing,setBriefing]=useState(false)
 const load=async()=>{setLoading(true);try{const r=await fetch(`${API}/overview`);if(!r.ok)throw new Error(await r.text());setData(await r.json());setError('')}catch(e:any){setError(e.message)}finally{setLoading(false)}}
 useEffect(()=>{load();const t=setInterval(load,15000);return()=>clearInterval(t)},[])
 const ask=async()=>{setBriefing(true);try{const r=await fetch(`${API}/briefing`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:'What requires operator attention right now?'})});const j=await r.json();setBrief(j.briefing||j.detail||'Briefing unavailable')}catch{setBrief('Briefing request failed')}finally{setBriefing(false)}}
 const maxRisk=Math.max(...(data?.components.map(c=>c.risk)||[1]),1)
 const trust=useMemo(()=>({auto:data?.trust.filter(x=>x.state==='auto').length||0,gated:data?.trust.filter(x=>x.state!=='auto').length||0}),[data])
 return <div className="shell">
  <header><div className="brand"><div className="mark"><Network size={22}/></div><div><h1>SENTINEL</h1><p>OPENAI-NATIVE AUTONOMOUS OPERATIONS</p></div></div><div className="header-state"><span className={`pulse ${error?'bad':''}`}/><div><b>{error?'DEGRADED':'WORLD MODEL LIVE'}</b><small>{data?`updated ${age(data.generated_at)}`:'connecting'}</small></div><button onClick={load} className={loading?'spin':''}><RefreshCw size={15}/></button></div></header>
  <main>
   <section className="hero"><div><span className="eyebrow">UNIFIED COMMAND CENTER</span><h2>One operational truth across<br/><em>security and resilience.</em></h2><p>Argus detects. Phoenix restores. Sentinel correlates evidence, governs autonomy, and tells operators what matters next.</p></div><div className={`risk-orb ${tone(data?.risk_level||'stable')}`}><small>FLEET RISK</small><strong>{data?.fleet_risk??'—'}</strong><span>{data?.risk_level?.toUpperCase()||'CONNECTING'}</span></div></section>
   {error&&<div className="error"><AlertTriangle size={16}/><span>Sentinel cannot reach the World Model: {error}</span></div>}
   <section className="stats">
    <Stat label="ARGUS SECURITY" value={data?.counts.argus??0} sub={data?.sources.argus.connected?'findings synchronized':'awaiting first finding'} icon={Shield} color={data?.sources.argus.connected?'cyan':'muted'}/>
    <Stat label="PHOENIX RESILIENCE" value={data?.counts.phoenix??0} sub={data?.sources.phoenix.connected?'outcomes synchronized':'integration not reporting'} icon={Zap} color={data?.sources.phoenix.connected?'violet':'muted'}/>
    <Stat label="ACTIVE SIGNALS" value={(data?.counts.critical||0)+(data?.counts.high||0)} sub={`${data?.counts.critical||0} critical · ${data?.counts.high||0} high`} icon={Activity} color="amber"/>
    <Stat label="AUTONOMY POLICY" value={`${trust.auto}/${trust.auto+trust.gated||0}`} sub={`${trust.gated} actions remain human-gated`} icon={CheckCircle2} color="green"/>
   </section>
   <section className="grid">
    <div className="panel timeline"><div className="panel-title"><div><span>LIVE EVIDENCE</span><h3>Cross-agent timeline</h3></div><small>{data?.timeline.length||0} normalized events</small></div>
     <div className="rows">{data?.timeline.length?data.timeline.slice(0,12).map((e,i)=><div className="event" key={e.id||i}><div className={`source ${e.source}`}>{e.source==='argus'?<Shield size={14}/>:e.source==='phoenix'?<Zap size={14}/>:<Bot size={14}/>}</div><div className="event-body"><div><b>{e.source.toUpperCase()}</b><span className={`badge ${tone(e.severity)}`}>{e.severity}</span>{e.replayed&&<span className="badge blue">replay</span>}</div><p>{e.summary}</p><small>{e.entity_name||e.type} · {age(e.timestamp)}</small></div></div>):<Empty text="No shared findings yet. Argus and Phoenix must publish to the World Model."/>}</div>
    </div>
    <div className="right-stack">
     <div className="panel"><div className="panel-title"><div><span>RISK MODEL</span><h3>Component exposure</h3></div><small>evidence + posture + fragility</small></div><div className="risk-list">{data?.components.length?data.components.slice(0,7).map(c=><div className="component" key={c.entity_id}><div><b>{c.name}</b><small>{c.namespace} · {c.finding_count} findings</small></div><div className="bar"><i style={{width:`${(c.risk/maxRisk)*100}%`}}/></div><strong className={tone(c.risk>=75?'critical':c.risk>=50?'high':c.risk>=25?'guarded':'stable')}>{c.risk}</strong></div>):<Empty text="Topology is empty."/>}</div></div>
     <div className="panel topology"><div className="panel-title"><div><span>WORLD MODEL</span><h3>Shared operational graph</h3></div><small>{data?.counts.entities||0} entities · {data?.counts.edges||0} edges</small></div><div className="nodes">{data?.topology.nodes.slice(0,16).map((n:any)=><div className={`node ${tone(n.security_posture)}`} key={n.entity_id}><span/><div><b>{n.name}</b><small>{n.entity_type} / {n.namespace}</small></div></div>)}</div></div>
    </div>
   </section>
   <section className="panel briefing"><div className="brief-head"><div className="ai-icon"><BrainCircuit/></div><div><span>OPENAI OPERATIONAL BRIEFING</span><h3>Sentinel intelligence</h3><p>Generated from the current World Model—not placeholder copy.</p></div><button onClick={ask} disabled={briefing}><Sparkles size={15}/>{briefing?'Reasoning…':brief?'Refresh briefing':'Generate briefing'}</button></div>{brief&&<div className="brief-copy">{brief}</div>}</section>
  </main><footer><span>SENTINEL PLATFORM</span><span>ARGUS · PHOENIX · WORLD MODEL · HUMAN GOVERNANCE</span><span><Timer size={12}/> 15s refresh</span></footer>
 </div>
}
function Empty({text}:{text:string}){return <div className="empty"><Activity size={20}/><span>{text}</span></div>}
