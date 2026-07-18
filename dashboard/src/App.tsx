import { useEffect, useMemo, useState } from 'react'
import {
  Activity, AlertTriangle, ArrowRight, BrainCircuit, CheckCircle2, ChevronRight,
  CircleDot, Clock3, GitBranch, Layers3, Network, RefreshCw, Shield, Sparkles,
  Timer, UserCheck, X, Zap,
} from 'lucide-react'

type Timeline = {
  id?: string; source: string; severity: string; timestamp: string; entity_id?: string
  entity_name?: string; type: string; summary: string; replayed: boolean
  correlation_id?: string; stage?: string; action?: string; outcome?: string
  payload?: Record<string, unknown>
}
type Component = {
  entity_id: string; name: string; namespace: string; entity_type: string; risk: number
  security_posture: string; fragility: number; finding_count: number; latest_at?: string
  sources?: Record<string, number>; severity_counts?: Record<string, number>; evidence?: Timeline[]
}
type SourceHealth = {
  connected: boolean; findings: number; latest_at?: string; live: number; replayed: number
  critical: number; high: number
}
type Overview = {
  generated_at: string; status: string; degraded_sources?: string[]; fleet_risk: number
  risk_level: string; counts: Record<string, number>; sources: Record<string, SourceHealth>
  namespaces?: Record<string, number>; components: Component[]; timeline: Timeline[]
  topology: { nodes: any[]; edges: any[] }; trust: any[]; incidents?: any[]
}
type Detail = { kind: 'signal'; signal: Timeline } | { kind: 'component'; component: Component }

const API = '/api'
const ARGUS_URL = (import.meta as any).env.VITE_ARGUS_URL as string | undefined
const PHOENIX_URL = (import.meta as any).env.VITE_PHOENIX_URL as string | undefined
const palette = {
  argus: '#45d9ff', phoenix: '#b68cff', sentinel: '#54efa9', human: '#ffd166',
  critical: '#ff5874', high: '#ffad55', medium: '#f2d65c', low: '#55e6a5', info: '#6594cc',
} as const
const color = (value: string) => palette[value as keyof typeof palette] || palette.info
const age = (value?: string) => {
  if (!value) return 'no evidence yet'
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  return `${Math.floor(seconds / 3600)}h ago`
}
const label = (value?: string) => (value || 'unknown').replace(/_/g, ' ')

function ConsoleLink({ href, children }: { href?: string; children: React.ReactNode }) {
  return href
    ? <a href={href} className="console-link">{children}</a>
    : <span className="console-link disabled" title="Configure this console URL">{children}</span>
}

function PanelTitle({ kicker, title, help, right }: { kicker: string; title: string; help: string; right?: React.ReactNode }) {
  return <div className="panel-title"><div><span>{kicker}</span><h3>{title}</h3><p>{help}</p></div>{right && <div className="panel-right">{right}</div>}</div>
}

function Stat({ label: name, value, sub, icon: Icon, tone }: { label: string; value: string | number; sub: string; icon: any; tone: string }) {
  return <div className="stat" style={{ '--tone': color(tone) } as React.CSSProperties}><div><span>{name}</span><Icon size={15} /></div><b>{value}</b><small>{sub}</small></div>
}

function SourceCard({ name, data, icon: Icon }: { name: 'argus' | 'phoenix'; data?: SourceHealth; icon: any }) {
  const connected = Boolean(data?.connected)
  return <div className={`source-card ${name} ${connected ? 'connected' : 'waiting'}`}>
    <div className="source-identity"><span className="source-icon"><Icon /></span><div><small>{name === 'argus' ? 'SECURITY AGENT' : 'RESILIENCE AGENT'}</small><b>{name}</b></div></div>
    <span className={`connection ${connected ? 'live' : 'waiting'}`}><i />{connected ? 'evidence live' : 'waiting for evidence'}</span>
    <div className="source-metrics"><div><b>{data?.findings || 0}</b><small>signals</small></div><div><b>{data?.live || 0}</b><small>observed</small></div><div><b>{(data?.critical || 0) + (data?.high || 0)}</b><small>urgent</small></div></div>
    <p>{connected ? `Latest ${age(data?.latest_at)} · ${data?.replayed || 0} replayed` : `No ${name} finding is present in SOG yet.`}</p>
  </div>
}

function LiveSignalFeed({ events, onSelect }: { events: Timeline[]; onSelect: (event: Timeline) => void }) {
  return <div className="signal-feed">
    <div className="signal-head"><span>TIME</span><span>SOURCE</span><span>SERVICE / RESOURCE</span><span>WHAT HAPPENED</span><span>SEVERITY</span><span>STATE</span></div>
    {events.slice(0, 10).map((event, index) => {
      const eventName = String(event.payload?.alertname || event.payload?.finding_type || event.type)
      const state = event.outcome || event.action ? 'handled' : 'open'
      return <button className={`signal-row ${event.replayed ? 'replayed' : ''}`} key={event.id || index} onClick={() => onSelect(event)}>
        <time>{age(event.timestamp)}</time>
        <span className="source-chip" style={{ color: color(event.source) }}><i style={{ background: color(event.source) }} />{event.source}</span>
        <div><b>{event.entity_name || 'Unmapped resource'}</b><small>{event.entity_id || 'No entity ID'}</small></div>
        <div><b>{label(eventName)}</b><small title={event.summary}>{event.summary}</small></div>
        <strong style={{ color: color(event.severity) }}>{event.severity}</strong>
        <em className={state}>{event.replayed ? 'replay' : state}</em><ChevronRight />
      </button>
    })}
    {!events.length && <Empty text="No operational evidence has reached the Sentinel Operations Graph yet." />}
    <div className="feed-note"><span>Newest evidence across connected agents</span><span>Observed records are live · replay records are explicitly labeled</span></div>
  </div>
}

function RiskMatrix({ items, onSelect }: { items: Component[]; onSelect: (component: Component) => void }) {
  const shown = items.slice(0, 20)
  return <div className="matrix"><div className="y-title">Operational fragility ↑</div><div className="matrix-zone z1">EXPOSED<br />BUT RESILIENT</div><div className="matrix-zone z2">SYSTEMIC<br />DANGER</div><div className="matrix-zone z3">HEALTHY<br />ZONE</div><div className="matrix-zone z4">FRAGILE<br />FOUNDATION</div>
    <svg viewBox="0 0 640 330" role="img" aria-label="Security exposure versus operational fragility matrix"><line className="axis" x1="42" y1="288" x2="620" y2="288" /><line className="axis" x1="42" y1="288" x2="42" y2="16" /><line className="mid" x1="331" y1="16" x2="331" y2="288" /><line className="mid" x1="42" y1="152" x2="620" y2="152" />{shown.map(component => { const x = 52 + (component.risk / 100) * 555, y = 280 - (component.fragility / 100) * 255, radius = 7 + Math.min(13, component.finding_count * 1.8), tone = component.risk >= 75 ? 'critical' : component.risk >= 50 ? 'high' : component.risk >= 25 ? 'medium' : 'low'; return <g className="bubble" key={component.entity_id} onClick={() => onSelect(component)} tabIndex={0} role="button"><circle cx={x} cy={y} r={radius + 5} fill={color(tone)} opacity=".12" /><circle cx={x} cy={y} r={radius} fill={color(tone)} opacity=".85" /><text x={x + radius + 5} y={y + 3}>{component.name.slice(0, 16)}</text><title>{component.name}: exposure {component.risk}, fragility {component.fragility}, {component.finding_count} findings</title></g> })}<text className="axis-label" x="330" y="323">Security exposure →</text></svg>
    <div className="matrix-key"><span>Bubble size = evidence volume</span><span>Click a service to inspect evidence</span></div>
  </div>
}

function TopologyGraph({ nodes, edges, selected, onSelect }: { nodes: any[]; edges: any[]; selected?: string; onSelect: (id: string) => void }) {
  const degrees = new Map<string, number>(); edges.forEach(edge => { degrees.set(edge.source_id, (degrees.get(edge.source_id) || 0) + 1); degrees.set(edge.target_id, (degrees.get(edge.target_id) || 0) + 1) })
  const visible = [...nodes].sort((a, b) => (degrees.get(b.entity_id) || 0) - (degrees.get(a.entity_id) || 0) || Number(b.fragility_score || 0) - Number(a.fragility_score || 0)).slice(0, 24)
  const width = 660, height = 330, centerX = width / 2, centerY = height / 2
  const positions = new Map(visible.map((node, index) => [node.entity_id, { x: centerX + Math.cos((index / Math.max(visible.length, 1)) * Math.PI * 2) * (102 + (index % 3) * 48), y: centerY + Math.sin((index / Math.max(visible.length, 1)) * Math.PI * 2) * (72 + (index % 3) * 31) }]))
  const visibleEdges = edges.filter(edge => positions.has(edge.source_id) && positions.has(edge.target_id)).slice(0, 70)
  return <div className="graph">{visible.length ? <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Operational dependency graph">{visibleEdges.map((edge, index) => { const source = positions.get(edge.source_id)!, target = positions.get(edge.target_id)!; return <line className="edge" key={index} x1={source.x} y1={source.y} x2={target.x} y2={target.y} /> })}{visible.map(node => { const position = positions.get(node.entity_id)!, active = node.entity_id === selected, nodeColor = color(node.security_posture === 'critical' ? 'critical' : node.security_posture === 'high-risk' ? 'high' : node.fragility_score > .5 ? 'medium' : 'low'); return <g key={node.entity_id} className={`graph-node ${active ? 'selected' : ''}`} onClick={() => onSelect(node.entity_id)} role="button" tabIndex={0}><circle cx={position.x} cy={position.y} r={active ? 16 : 9} fill={nodeColor} /><circle cx={position.x} cy={position.y} r={active ? 23 : 14} fill="none" stroke={nodeColor} opacity={.25 + Number(node.fragility_score || 0) * .7} /><text x={position.x + 13} y={position.y + 3}>{node.name.slice(0, 12)}</text><title>{node.name}: {degrees.get(node.entity_id) || 0} relationships</title></g> })}</svg> : <Empty text="No topology entities have been published yet." />}
    <div className="graph-legend"><span><i className="healthy" />healthy</span><span><i className="warning" />fragile</span><span><i className="danger" />exposed</span><span>{visibleEdges.length} relationships visible</span><span>Halo = fragility</span></div>
  </div>
}

function SignalMix({ data }: { data: Overview | null }) {
  const severities = [{ name: 'Critical', value: data?.counts.critical || 0, tone: 'critical' }, { name: 'High', value: data?.counts.high || 0, tone: 'high' }, { name: 'Other', value: Math.max(0, (data?.counts.findings || 0) - (data?.counts.critical || 0) - (data?.counts.high || 0)), tone: 'info' }]
  const maximum = Math.max(1, ...severities.map(item => item.value))
  return <div className="mix"><div className="mix-bars">{severities.map(item => <div key={item.name}><span>{item.name}</span><div><i style={{ width: `${(item.value / maximum) * 100}%`, background: color(item.tone) }} /></div><b>{item.value}</b></div>)}</div><div className="evidence-split"><div><b>{data?.counts.live || 0}</b><span>observed</span><small>live agent evidence</small></div><div><b>{data?.counts.replayed || 0}</b><span>replayed</span><small>synthetic evaluation</small></div></div></div>
}

function NamespaceList({ namespaces }: { namespaces?: Record<string, number> }) {
  const rows = Object.entries(namespaces || {}).sort((a, b) => b[1] - a[1]), maximum = Math.max(1, ...rows.map(row => row[1]))
  return <div className="namespace-list">{rows.slice(0, 8).map(([name, count]) => <div key={name}><div><span>{name}</span><b>{count} entities</b></div><div><i style={{ width: `${(count / maximum) * 100}%` }} /></div></div>)}{!rows.length && <Empty text="No Kubernetes namespaces are mapped yet." />}</div>
}

function TrustLadder({ records }: { records: any[] }) {
  return <div className="trust-list">{records.length ? records.slice(0, 6).map((record, index) => { const total = (record.success_count || 0) + (record.surprise_count || 0), percent = total ? Math.round((record.success_count / total) * 100) : 0; return <div className="trust-row" key={record.action_type || index}><div><b>{label(record.action_type)}</b><small>{record.state === 'auto' ? 'Autonomous after verified outcomes' : 'Human approval required'}</small></div><div className="ladder"><span>GATED</span><div><i style={{ width: `${percent}%` }} /><em style={{ left: `${Math.min(96, percent)}%` }} /></div><span>AUTO</span></div><strong className={record.state === 'auto' ? 'auto' : 'gated'}>{record.state}</strong><small>{record.success_count || 0} success · {record.surprise_count || 0} surprise</small></div> }) : <Empty text="No action trust history yet. Every new action begins human-gated." />}
    <div className="trust-explain"><UserCheck size={14} /><span>A surprise or failed verification returns an action to human review.</span></div>
  </div>
}

function DetailDrawer({ detail, onClose }: { detail: Detail; onClose: () => void }) {
  useEffect(() => { const escape = (event: KeyboardEvent) => event.key === 'Escape' && onClose(); document.addEventListener('keydown', escape); return () => document.removeEventListener('keydown', escape) }, [onClose])
  const signal = detail.kind === 'signal' ? detail.signal : undefined, component = detail.kind === 'component' ? detail.component : undefined
  const evidence = component?.evidence || (signal ? [signal] : [])
  return <div className="drawer-wrap" role="dialog" aria-modal="true"><button className="drawer-backdrop" onClick={onClose} aria-label="Close details" /><aside className="drawer"><div className="drawer-head"><div><span>{detail.kind === 'signal' ? 'OPERATIONAL EVIDENCE' : 'RESOURCE INTELLIGENCE'}</span><h2>{signal?.entity_name || component?.name || 'Unmapped resource'}</h2><p>{signal?.entity_id || component?.entity_id}</p></div><button onClick={onClose}><X /></button></div>
    {component && <div className="drawer-stats"><div><span>RISK</span><b>{component.risk}</b></div><div><span>FRAGILITY</span><b>{component.fragility}</b></div><div><span>FINDINGS</span><b>{component.finding_count}</b></div></div>}
    {signal && <div className="signal-summary"><span style={{ color: color(signal.source) }}>{signal.source}</span><strong style={{ color: color(signal.severity) }}>{signal.severity}</strong><em>{signal.replayed ? 'replayed evidence' : 'live evidence'}</em><p>{signal.summary}</p></div>}
    <section><h3><CircleDot /> Evidence trail</h3>{evidence.length ? evidence.map((item, index) => <div className="evidence-card" key={item.id || index}><div><span style={{ color: color(item.source) }}>{item.source}</span><strong style={{ color: color(item.severity) }}>{item.severity}</strong><time>{age(item.timestamp)}</time></div><b>{label(item.type)}</b><p>{item.summary}</p>{(item.action || item.outcome) && <small>{item.action && `Action: ${label(item.action)}`}{item.action && item.outcome && ' · '}{item.outcome && `Outcome: ${label(item.outcome)}`}</small>}</div>) : <Empty text="No evidence is attached to this resource." />}</section>
    <section><h3><Layers3 /> Context</h3><dl><div><dt>Namespace</dt><dd>{component?.namespace || 'unknown'}</dd></div><div><dt>Resource type</dt><dd>{component?.entity_type || 'unknown'}</dd></div><div><dt>Security posture</dt><dd>{component?.security_posture || signal?.severity || 'unknown'}</dd></div><div><dt>Latest evidence</dt><dd>{age(component?.latest_at || signal?.timestamp)}</dd></div></dl></section>
    {signal?.payload && <details><summary>Raw evidence payload</summary><pre>{JSON.stringify(signal.payload, null, 2)}</pre></details>}
  </aside></div>
}

export default function App() {
  const [data, setData] = useState<Overview | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true)
  const [brief, setBrief] = useState(''), [briefing, setBriefing] = useState(false), [detail, setDetail] = useState<Detail | null>(null)
  const load = async () => { setLoading(true); try { const response = await fetch(`${API}/overview`); if (!response.ok) throw Error(await response.text()); setData(await response.json()); setError('') } catch (caught: any) { setError(caught.message) } finally { setLoading(false) } }
  useEffect(() => { load(); const timer = setInterval(load, 15000); return () => clearInterval(timer) }, [])
  const ask = async () => { setBriefing(true); try { const response = await fetch(`${API}/briefing`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"question":"What requires operator attention right now?"}' }), result = await response.json(); setBrief(result.briefing || result.detail) } finally { setBriefing(false) } }
  const componentsById = useMemo(() => new Map((data?.components || []).map(component => [component.entity_id, component])), [data])
  const selectTopology = (id: string) => { const component = componentsById.get(id); if (component) setDetail({ kind: 'component', component }) }
  const urgent = (data?.counts.critical || 0) + (data?.counts.high || 0)
  return <div className="shell">
    <header><div className="brand"><div className="mark"><Network /></div><div><h1>SENTINEL</h1><p>OPENAI-NATIVE AUTONOMOUS OPERATIONS</p></div></div><nav className="console-nav" aria-label="Platform consoles"><ConsoleLink href={ARGUS_URL}><Shield />Argus</ConsoleLink><ConsoleLink href={PHOENIX_URL}><Zap />Phoenix</ConsoleLink><span className="console-link current"><Network />Sentinel</span></nav><div className="header-state"><i className={error ? 'bad' : ''} /><div><b>{error ? 'SOG DEGRADED' : data?.status === 'degraded' ? 'PARTIAL DATA' : 'SOG LIVE'}</b><small>{data ? `refreshed ${age(data.generated_at)}` : 'connecting'}</small></div><button onClick={load} className={loading ? 'spin' : ''} aria-label="Refresh"><RefreshCw /></button></div></header>
    <main>
      <section className="hero"><div><span>UNIFIED COMMAND CENTER</span><h2>One fleet. Two specialist agents.<br /><em>One accountable decision.</em></h2><p>Sentinel combines Argus security evidence and Phoenix resilience outcomes into a shared operational picture—then shows exactly what requires attention and why.</p><div className="hero-state"><span><i className={urgent ? 'urgent' : ''} />{urgent ? `${urgent} urgent signals need review` : 'No urgent evidence in the current window'}</span><span><Clock3 />15-second live refresh</span></div></div><div className={`risk-orb ${data?.risk_level || 'stable'}`}><small>FLEET RISK</small><b>{data?.fleet_risk ?? '—'}</b><span>{data?.risk_level || 'connecting'}</span></div></section>
      {error && <div className="error"><AlertTriangle />Sentinel cannot reach the SOG gateway. {error}</div>}
      <section className="stats"><Stat label="LIVE SIGNALS" value={data?.counts.findings || 0} sub={`${data?.counts.live || 0} observed · ${data?.counts.replayed || 0} replayed`} icon={Activity} tone="high" /><Stat label="URGENT EVIDENCE" value={urgent} sub={`${data?.counts.critical || 0} critical · ${data?.counts.high || 0} high`} icon={AlertTriangle} tone={urgent ? 'critical' : 'low'} /><Stat label="AFFECTED RESOURCES" value={data?.counts.affected || 0} sub={`of ${data?.counts.entities || 0} mapped entities`} icon={Shield} tone="argus" /><Stat label="NAMESPACES" value={data?.counts.namespaces || 0} sub={`${data?.counts.edges || 0} dependency relationships`} icon={Layers3} tone="sentinel" /><Stat label="OPEN INCIDENTS" value={data?.counts.incidents || 0} sub="correlated cross-agent cases" icon={GitBranch} tone="phoenix" /></section>
      <section className="agent-grid"><SourceCard name="argus" data={data?.sources.argus} icon={Shield} /><div className="sog-card"><div><GitBranch /><span>SENTINEL OPERATIONS GRAPH</span></div><b>{data?.counts.entities || 0} entities connected by {data?.counts.edges || 0} relationships</b><p>{data?.status === 'degraded' ? `Partial services: ${(data.degraded_sources || []).join(', ')}` : 'Topology, evidence, incidents, and trust state are available.'}</p><ArrowRight /></div><SourceCard name="phoenix" data={data?.sources.phoenix} icon={Zap} /></section>
      <section className="panel live-panel"><PanelTitle kicker="01 · LIVE OPERATIONS" title="What is happening right now" help="Newest security, resilience, and infrastructure evidence. Select a row to inspect its context and raw payload." right={<span className="live-badge"><i />{data?.timeline.length || 0} signals</span>} /><LiveSignalFeed events={data?.timeline || []} onSelect={signal => setDetail({ kind: 'signal', signal })} /></section>
      <section className="viz-grid"><div className="panel"><PanelTitle kicker="02 · COMBINED RISK" title="Security × fragility" help="The upper-right identifies services that are both exposed and operationally fragile." /><RiskMatrix items={data?.components || []} onSelect={component => setDetail({ kind: 'component', component })} /></div><div className="panel"><PanelTitle kicker="03 · BLAST RADIUS" title="Dependency map" help="Relationships show propagation paths. Node color is posture; halo intensity is fragility." right={<span>{data?.counts.entities || 0} nodes · {data?.counts.edges || 0} edges</span>} /><TopologyGraph nodes={data?.topology.nodes || []} edges={data?.topology.edges || []} selected={detail?.kind === 'component' ? detail.component.entity_id : undefined} onSelect={selectTopology} /></div></section>
      <section className="insight-grid"><div className="panel"><PanelTitle kicker="04 · EVIDENCE QUALITY" title="Signal composition" help="Observed and replayed evidence remain separate so synthetic evaluation is never presented as live telemetry." /><SignalMix data={data} /></div><div className="panel"><PanelTitle kicker="05 · FLEET COVERAGE" title="Namespace inventory" help="Where the Sentinel Operations Graph currently has operational entities." right={<span>{data?.counts.namespaces || 0} namespaces</span>} /><NamespaceList namespaces={data?.namespaces} /></div></section>
      <section className="lower-grid"><div className="panel"><PanelTitle kicker="06 · HUMAN GOVERNANCE" title="Autonomy trust ladder" help="Actions earn autonomy through verified success. Surprise immediately returns control to a human." /><TrustLadder records={data?.trust || []} /></div><div className="panel intelligence"><div className="brief-head"><div><BrainCircuit /></div><div><span>OPENAI EVIDENCE BRIEFING</span><h3>What needs attention now?</h3><p>Generated only from the current Sentinel Operations Graph state.</p></div><button onClick={ask} disabled={briefing}><Sparkles />{briefing ? 'Reasoning…' : brief ? 'Refresh' : 'Generate'}</button></div>{brief ? <pre>{brief}</pre> : <Empty text="Generate a concise, evidence-grounded operator briefing." />}</div></section>
    </main>
    <footer><span>SENTINEL PLATFORM</span><span><Shield />ARGUS <Zap />PHOENIX <GitBranch />SOG</span><span><Timer />15s live refresh</span></footer>
    {detail && <DetailDrawer detail={detail} onClose={() => setDetail(null)} />}
  </div>
}

function Empty({ text }: { text: string }) { return <div className="empty"><Activity /><span>{text}</span></div> }
