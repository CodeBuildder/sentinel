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
  provenance?: string
  payload?: Record<string, unknown>
}
type Component = {
  entity_id: string; name: string; namespace: string; entity_type: string; risk: number
  security_posture: string; fragility: number; finding_count: number; latest_at?: string
  sources?: Record<string, number>; severity_counts?: Record<string, number>; evidence?: Timeline[]
  risk_factors?: Record<string, { raw: number; weight: number; contribution: number }>
}
type SourceHealth = {
  connected: boolean; findings: number; latest_at?: string; live: number; replayed: number
  critical: number; high: number
}
type Incident = {
  incident_id: string; correlation_id?: string; title?: string; status?: string; severity?: string
  started_at?: string; updated_at?: string; sources?: string[]; evidence_count?: number
  provenance?: string[]; timeline?: Timeline[]
}
type Overview = {
  generated_at: string; status: string; degraded_sources?: string[]; fleet_risk: number
  risk_level: string; counts: Record<string, number>; sources: Record<string, SourceHealth>
  namespaces?: Record<string, number>; components: Component[]; timeline: Timeline[]
  topology: { nodes: any[]; edges: any[] }; trust: any[]; incidents?: Incident[]
}
type MetricKind = 'signals' | 'urgent' | 'affected' | 'namespaces' | 'incidents'
type Detail = { kind: 'signal'; signal: Timeline } | { kind: 'component'; component: Component } | { kind: 'metric'; metric: MetricKind } | { kind: 'source'; source: 'argus' | 'phoenix' } | { kind: 'incident'; incident: Incident }

const API = '/api'
const ARGUS_URL = (import.meta as any).env.VITE_ARGUS_URL as string | undefined
const PHOENIX_URL = (import.meta as any).env.VITE_PHOENIX_URL as string | undefined
const consolePage = (base: string | undefined, page: string) => base ? `${base.replace(/\/$/, '')}${page}` : undefined
const palette = {
  argus: '#45d9ff', phoenix: '#55e6a5', sentinel: '#b68cff', human: '#ffd166',
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
const riskCopy = (level?: string) => level === 'critical' ? 'Immediate attention' : level === 'high' ? 'Action advised' : level === 'guarded' ? 'Watch closely' : 'No elevated risk'

function LiveRiskPanel({ data, previousRisk, onSelect }: { data: Overview | null; previousRisk: number | null; onSelect: (component: Component) => void }) {
  const top = data?.components?.[0]
  const score = data?.fleet_risk ?? 0
  const delta = previousRisk === null ? 0 : score - previousRisk
  const connected = ['argus', 'phoenix'].filter(source => data?.sources?.[source]?.connected).length
  const latest = data?.timeline?.[0]
  return <button className={`live-risk ${data?.risk_level || 'stable'}`} onClick={() => top && onSelect(top)} disabled={!top} aria-label={top ? `Explain risk score ${score} for ${top.name}` : 'No ranked resource available'}>
    <div className="live-risk-head"><span><i />LIVE RISK</span><time>{data ? age(data.generated_at) : 'connecting'}</time></div>
    <div className="live-risk-score"><b>{data ? score : '—'}</b><span>/100</span><em className={delta > 0 ? 'up' : delta < 0 ? 'down' : ''}>{delta > 0 ? `+${delta}` : delta < 0 ? delta : 'steady'}</em></div>
    <div className="live-risk-track"><i style={{ width: `${score}%` }} /></div>
    <strong>{top?.name || 'No ranked resource'}</strong>
    <p>{top ? `Highest current resource risk · ${top.finding_count} supporting signal${top.finding_count === 1 ? '' : 's'}` : 'Waiting for mapped evidence'}</p>
    <div className="live-risk-meta"><span><i className={connected === 2 ? 'ok' : ''} />{connected}/2 agents reporting</span><span>{latest ? `Latest ${age(latest.timestamp)}` : riskCopy(data?.risk_level)}</span></div>
    <span className="live-risk-action">VIEW SCORE EVIDENCE <ChevronRight /></span>
  </button>
}

function ConsoleLink({ href, children }: { href?: string; children: React.ReactNode }) {
  return href
    ? <a href={href} className="console-link">{children}</a>
    : <span className="console-link disabled" title="Configure this console URL">{children}</span>
}

function PanelTitle({ kicker, title, help, right }: { kicker: string; title: string; help: string; right?: React.ReactNode }) {
  return <div className="panel-title"><div><span>{kicker}</span><h3>{title}</h3><p>{help}</p></div>{right && <div className="panel-right">{right}</div>}</div>
}

function Stat({ label: name, value, sub, icon: Icon, tone, onClick }: { label: string; value: string | number; sub: string; icon: any; tone: string; onClick: () => void }) {
  return <button className="stat" style={{ '--tone': color(tone) } as React.CSSProperties} onClick={onClick}><div><span>{name}</span><Icon size={16} /></div><b>{value}</b><small>{sub}</small><em>Explore <ChevronRight /></em></button>
}

function SourceCard({ name, data, icon: Icon }: { name: 'argus' | 'phoenix'; data?: SourceHealth; icon: any }) {
  const connected = Boolean(data?.connected)
  return <div className={`source-card ${name} ${connected ? 'connected' : 'waiting'}`}>
    <div className="source-identity"><span className="source-icon"><Icon /></span><div><small>{name === 'argus' ? 'SECURITY AGENT' : 'RESILIENCE AGENT'}</small><b>{name}</b></div></div>
    <span className={`connection ${connected ? 'live' : 'waiting'}`}><i />{connected ? 'evidence live' : 'waiting for evidence'}</span>
    <div className="source-metrics"><div><b>{data?.findings || 0}</b><small>signals</small></div><div><b>{data?.live || 0}</b><small>observed</small></div><div><b>{(data?.critical || 0) + (data?.high || 0)}</b><small>urgent</small></div></div>
    <p>{connected ? `Latest ${age(data?.latest_at)} · ${data?.replayed || 0} replayed` : `No ${name} finding is present in the Sentinel Operations Graph yet.`}</p>
  </div>
}

function SogBridge({ data, onSource }: { data: Overview | null; onSource: (source: 'argus' | 'phoenix') => void }) {
  const argus = data?.sources.argus
  const phoenix = data?.sources.phoenix
  const live = Boolean(argus?.connected || phoenix?.connected)
  return <div className={`sog-card ${live ? 'active' : ''}`}>
    <div className="sog-heading"><GitBranch /><span><b>SOG</b> · SENTINEL OPERATIONS GRAPH</span><em><i />{live ? 'SYNCING LIVE' : 'WAITING'}</em></div>
    <div className="sog-flow" aria-label="Argus and Phoenix evidence flowing through the Sentinel Operations Graph">
      <button className={`sog-source argus ${argus?.connected ? 'online' : ''}`} onClick={() => onSource('argus')} title="View the Argus evidence behind this count"><Shield /><span>ARGUS</span><b>{argus?.findings || 0}</b><small>VIEW EVIDENCE <ChevronRight /></small></button>
      <div className="sog-path"><i /><i /><i /></div>
      <div className="sog-core"><Network /><b>{data?.counts.entities || 0}</b><span>ENTITIES</span></div>
      <div className="sog-path reverse"><i /><i /><i /></div>
      <button className={`sog-source phoenix ${phoenix?.connected ? 'online' : ''}`} onClick={() => onSource('phoenix')} title="View the Phoenix evidence behind this count"><Zap /><span>PHOENIX</span><b>{phoenix?.findings || 0}</b><small>VIEW EVIDENCE <ChevronRight /></small></button>
    </div>
    <div className="sog-summary"><span><b>{data?.counts.edges || 0}</b> live relationships</span><span><b>{data?.counts.findings || 0}</b> evidence records</span><time>{data ? `synced ${age(data.generated_at)}` : 'connecting'}</time></div>
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

function PriorityList({ items, onSelect }: { items: Component[]; onSelect: (component: Component) => void }) {
  return <div className="priority-list">{items.slice(0, 7).map((component, index) => { const tone = component.risk >= 75 ? 'critical' : component.risk >= 50 ? 'high' : component.risk >= 25 ? 'medium' : 'low'; return <button key={component.entity_id} onClick={() => onSelect(component)}><span className="priority-rank">{String(index + 1).padStart(2, '0')}</span><div className="priority-name"><b>{component.name}</b><small>{component.namespace || 'unscoped'} · {label(component.entity_type)}</small></div><div className="priority-score"><span>Combined risk</span><div><i style={{ width: `${component.risk}%`, background: color(tone) }} /></div><b style={{ color: color(tone) }}>{component.risk}</b></div><div className="priority-facts"><span><b>{component.finding_count}</b> signals</span><span><b>{component.fragility}</b> fragility</span></div><ChevronRight /></button> })}{!items.length && <Empty text="No resources are currently ranked." />}</div>
}

function EvidenceSankey({ events }: { events: Timeline[] }) {
  const states = ['open', 'handled']
  const sources = Array.from(new Set(events.map(event => event.source))).slice(0, 5)
  const severities = ['critical', 'high', 'medium', 'low', 'info'].filter(severity => events.some(event => event.severity === severity))
  const width = 1040, height = 320, nodeWidth = 18
  const positions = (items: string[], x: number) => new Map(items.map((item, index) => [item, { x, y: 45 + index * (230 / Math.max(items.length - 1, 1)) }]))
  const sourcePosition = positions(sources, 150), severityPosition = positions(severities, 510), statePosition = positions(states, 870)
  const sourceSeverity = new Map<string, number>(), severityState = new Map<string, number>()
  events.forEach(event => { const state = event.outcome || event.action ? 'handled' : 'open'; sourceSeverity.set(`${event.source}|${event.severity}`, (sourceSeverity.get(`${event.source}|${event.severity}`) || 0) + 1); severityState.set(`${event.severity}|${state}`, (severityState.get(`${event.severity}|${state}`) || 0) + 1) })
  const sourceColor = (source: string) => source === 'argus' ? color('argus') : source === 'phoenix' ? color('phoenix') : '#92a4bd'
  const path = (a: { x: number; y: number }, b: { x: number; y: number }) => `M ${a.x + nodeWidth} ${a.y} C ${a.x + 150} ${a.y}, ${b.x - 150} ${b.y}, ${b.x} ${b.y}`
  return <div className="sankey"><div className="sankey-columns"><span>EVIDENCE SOURCE</span><span>SEVERITY CLASSIFICATION</span><span>OPERATIONAL STATE</span></div>{events.length ? <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Evidence source to severity to operational state flow">
    {[...sourceSeverity].map(([key, count]) => { const [source, severity] = key.split('|'), a = sourcePosition.get(source)!, b = severityPosition.get(severity)!; return <path key={key} d={path(a, b)} stroke={sourceColor(source)} strokeWidth={Math.max(2, Math.min(22, count * 1.4))} opacity=".24"><title>{count} {source} signals classified {severity}</title></path> })}
    {[...severityState].map(([key, count]) => { const [severity, state] = key.split('|'), a = severityPosition.get(severity)!, b = statePosition.get(state)!; return <path key={key} d={path(a, b)} stroke={color(severity)} strokeWidth={Math.max(2, Math.min(22, count * 1.4))} opacity=".28"><title>{count} {severity} signals remain {state}</title></path> })}
    {sources.map(source => { const p = sourcePosition.get(source)!, count = events.filter(event => event.source === source).length; return <g key={source}><rect x={p.x} y={p.y - 16} width={nodeWidth} height={32} rx="5" fill={sourceColor(source)} /><text x={p.x - 10} y={p.y - 2} textAnchor="end">{source.toUpperCase()}</text><text className="count" x={p.x - 10} y={p.y + 12} textAnchor="end">{count} signals</text></g> })}
    {severities.map(severity => { const p = severityPosition.get(severity)!, count = events.filter(event => event.severity === severity).length; return <g key={severity}><rect x={p.x} y={p.y - 16} width={nodeWidth} height={32} rx="5" fill={color(severity)} /><text x={p.x + 28} y={p.y - 2}>{severity.toUpperCase()}</text><text className="count" x={p.x + 28} y={p.y + 12}>{count} classified</text></g> })}
    {states.map(state => { const p = statePosition.get(state)!, count = events.filter(event => (event.outcome || event.action ? 'handled' : 'open') === state).length; return <g key={state}><rect x={p.x} y={p.y - 16} width={nodeWidth} height={32} rx="5" fill={state === 'handled' ? color('low') : color('high')} /><text x={p.x + 28} y={p.y - 2}>{state.toUpperCase()}</text><text className="count" x={p.x + 28} y={p.y + 12}>{count} signals</text></g> })}
  </svg> : <Empty text="Evidence flow appears after the first Sentinel Operations Graph finding." />}<p className="sankey-explain">Read left to right: where evidence came from, how severe it is, and whether an agent has handled it. Wider bands represent more signals.</p></div>
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

function MetricDetail({ metric, data, onSignal, onComponent, onIncident }: { metric: MetricKind; data: Overview | null; onSignal: (signal: Timeline) => void; onComponent: (component: Component) => void; onIncident: (incident: Incident) => void }) {
  const definitions: Record<MetricKind, { title: string; description: string }> = {
    signals: { title: 'Live signals', description: 'Every finding in the current Sentinel Operations Graph evidence window, separated into observed and replayed records.' },
    urgent: { title: 'Urgent evidence', description: 'Critical and high-severity findings that should be reviewed before lower-priority telemetry.' },
    affected: { title: 'Affected resources', description: 'Mapped resources with one or more findings in the current evidence window.' },
    namespaces: { title: 'Namespace coverage', description: 'Kubernetes isolation boundaries represented in the Sentinel Operations Graph.' },
    incidents: { title: 'Open incidents', description: 'Correlated cases that combine related evidence into one operational investigation.' },
  }
  const definition = definitions[metric]
  if (metric === 'signals' || metric === 'urgent') { const rows = metric === 'urgent' ? (data?.timeline || []).filter(item => ['critical', 'high'].includes(item.severity)) : data?.timeline || []; return <><div className="metric-intro"><h2>{definition.title}</h2><p>{definition.description}</p><div><span><b>{rows.length}</b> total</span><span><b>{rows.filter(item => !item.replayed).length}</b> observed</span><span><b>{rows.filter(item => item.replayed).length}</b> replayed</span></div></div><div className="metric-list">{rows.slice(0, 20).map((item, index) => <button key={item.id || index} onClick={() => onSignal(item)}><i style={{ background: color(item.severity) }} /><div><b>{item.entity_name || label(item.type)}</b><small>{item.source} · {item.summary}</small></div><strong style={{ color: color(item.severity) }}>{item.severity}</strong><time>{age(item.timestamp)}</time><ChevronRight /></button>)}{!rows.length && <Empty text={`No ${metric === 'urgent' ? 'urgent ' : ''}signals are present.`} />}</div></> }
  if (metric === 'affected') { const rows = (data?.components || []).filter(item => item.finding_count > 0); return <><div className="metric-intro"><h2>{definition.title}</h2><p>{definition.description}</p></div><div className="metric-list">{rows.map(item => <button key={item.entity_id} onClick={() => onComponent(item)}><i style={{ background: color(item.risk >= 50 ? 'high' : 'medium') }} /><div><b>{item.name}</b><small>{item.namespace} · {item.finding_count} signals · risk {item.risk}</small></div><ChevronRight /></button>)}</div></> }
  if (metric === 'namespaces') { const rows = Object.entries(data?.namespaces || {}).sort((a, b) => b[1] - a[1]); return <><div className="metric-intro"><h2>{definition.title}</h2><p>{definition.description}</p></div><div className="namespace-detail">{rows.map(([name, count]) => { const affected = (data?.components || []).filter(item => item.namespace === name && item.finding_count > 0).length; return <div key={name}><Layers3 /><div><b>{name}</b><small>{affected} affected resources</small></div><strong>{count} entities</strong></div> })}</div></> }
  return <><div className="metric-intro"><h2>{definition.title}</h2><p>{definition.description}</p></div><div className="metric-list">{(data?.incidents || []).map((incident, index) => <button className="incident-row" key={incident.incident_id || index} onClick={() => onIncident(incident)}><GitBranch /><div><b>{incident.title || incident.incident_id || 'Correlated incident'}</b><small>{incident.status || 'open'} · {incident.evidence_count || incident.timeline?.length || 0} lifecycle records</small></div><strong style={{ color: color(incident.severity || 'info') }}>{incident.severity || 'info'}</strong><ChevronRight /></button>)}{!(data?.incidents || []).length && <Empty text="No correlated incidents exist. Individual findings remain visible in Live Signals." />}</div></>
}

function DetailDrawer({ detail, data, onClose, onDetail }: { detail: Detail; data: Overview | null; onClose: () => void; onDetail: (detail: Detail) => void }) {
  useEffect(() => { const escape = (event: KeyboardEvent) => event.key === 'Escape' && onClose(); document.addEventListener('keydown', escape); return () => document.removeEventListener('keydown', escape) }, [onClose])
  if (detail.kind === 'metric') return <div className="drawer-wrap" role="dialog" aria-modal="true"><button className="drawer-backdrop" onClick={onClose} aria-label="Close details" /><aside className="drawer metric-drawer"><div className="drawer-head"><div><span>METRIC EXPLORER</span><p>Every number opens into the records behind it.</p></div><button onClick={onClose}><X /></button></div><MetricDetail metric={detail.metric} data={data} onSignal={signal => onDetail({ kind: 'signal', signal })} onComponent={component => onDetail({ kind: 'component', component })} onIncident={incident => onDetail({ kind: 'incident', incident })} /></aside></div>
  if (detail.kind === 'source') {
    const records = (data?.timeline || []).filter(item => item.source === detail.source)
    const consoleUrl = detail.source === 'argus' ? consolePage(ARGUS_URL, '/threats') : PHOENIX_URL
    return <div className="drawer-wrap" role="dialog" aria-modal="true"><button className="drawer-backdrop" onClick={onClose} aria-label="Close details" /><aside className="drawer source-drawer"><div className="drawer-head"><div><span>SOG SOURCE EVIDENCE</span><h2>{detail.source === 'argus' ? 'Argus security evidence' : 'Phoenix resilience evidence'}</h2><p>{records.length} records currently stored in the Sentinel Operations Graph</p></div><button onClick={onClose}><X /></button></div><div className="source-truth"><AlertTriangle /><p><b>{records.length} evidence record{records.length === 1 ? '' : 's'} does not necessarily mean {records.length} incident{records.length === 1 ? '' : 's'}.</b> Incidents exist only after the specialist agent correlates or creates a case.</p></div><div className="metric-list">{records.map((record, index) => <button key={record.id || index} onClick={() => onDetail({ kind: 'signal', signal: record })}><i style={{ background: color(record.severity) }} /><div><b>{record.entity_name || label(record.type)}</b><small>{record.summary}</small></div><strong style={{ color: color(record.severity) }}>{record.severity}</strong><time>{age(record.timestamp)}</time><ChevronRight /></button>)}{!records.length && <Empty text={`No ${detail.source} evidence is currently stored in SOG.`} />}</div>{consoleUrl && <a className="source-console-link" href={consoleUrl}>{detail.source === 'argus' ? 'Open Argus Threat Feed' : 'Open Phoenix Overview'}<ArrowRight /></a>}</aside></div>
  }
  if (detail.kind === 'incident') {
    const incident = detail.incident
    return <div className="drawer-wrap" role="dialog" aria-modal="true"><button className="drawer-backdrop" onClick={onClose} aria-label="Close details" /><aside className="drawer incident-drawer"><div className="drawer-head"><div><span>CORRELATED INCIDENT</span><h2>{incident.title || incident.incident_id}</h2><p>{incident.correlation_id ? `Correlation ID · ${incident.correlation_id}` : incident.incident_id}</p></div><button onClick={onClose}><X /></button></div><div className="incident-facts"><span><small>STATUS</small><b>{incident.status || 'open'}</b></span><span><small>SEVERITY</small><b style={{ color: color(incident.severity || 'info') }}>{incident.severity || 'info'}</b></span><span><small>SOURCES</small><b>{(incident.sources || []).join(' + ') || 'unknown'}</b></span><span><small>EVIDENCE</small><b>{incident.evidence_count || incident.timeline?.length || 0}</b></span></div><section><h3><GitBranch /> Evidence-to-recovery timeline</h3><p className="timeline-help">Every step below carries the same explicit correlation ID. Standalone findings are excluded.</p><div className="lifecycle">{(incident.timeline || []).map((item, index) => <button key={item.id || index} onClick={() => onDetail({ kind: 'signal', signal: item })}><i style={{ background: color(item.source) }} /><div><header><span style={{ color: color(item.source) }}>{item.source}</span><strong>{item.stage ? label(item.stage) : label(item.type)}</strong><time>{age(item.timestamp)}</time></header><b>{item.summary}</b><small>{item.provenance || (item.replayed ? 'replayed' : 'observed')}{item.action ? ` · action ${label(item.action)}` : ''}{item.outcome ? ` · outcome ${label(item.outcome)}` : ''}</small></div><ChevronRight /></button>)}{!(incident.timeline || []).length && <Empty text="This SOG incident has no embedded lifecycle records." />}</div></section></aside></div>
  }
  const signal = detail.kind === 'signal' ? detail.signal : undefined, component = detail.kind === 'component' ? detail.component : undefined
  const evidence = component?.evidence || (signal ? [signal] : [])
  return <div className="drawer-wrap" role="dialog" aria-modal="true"><button className="drawer-backdrop" onClick={onClose} aria-label="Close details" /><aside className="drawer"><div className="drawer-head"><div><span>{detail.kind === 'signal' ? 'OPERATIONAL EVIDENCE' : 'RESOURCE INTELLIGENCE'}</span><h2>{signal?.entity_name || component?.name || 'Unmapped resource'}</h2><p>{signal?.entity_id || component?.entity_id}</p></div><button onClick={onClose}><X /></button></div>
    {component && <div className="drawer-stats"><div><span>RISK</span><b>{component.risk}</b></div><div><span>FRAGILITY</span><b>{component.fragility}</b></div><div><span>FINDINGS</span><b>{component.finding_count}</b></div></div>}
    {component && <section className="risk-proof"><h3><Activity /> Why this score is {component.risk}/100</h3><p>Sentinel combines the strongest current threat, declared security posture, and resilience fragility. The weighted contributions below add to the displayed score.</p><div className="risk-equation">{Object.entries(component.risk_factors || {}).map(([name, factor]) => <div key={name}><header><span>{label(name)}</span><b>{factor.contribution} points</b></header><div><i style={{ width: `${factor.raw}%` }} /></div><small>Raw {factor.raw}/100 × {factor.weight}% weight</small></div>)}</div><div className="risk-total"><span>Combined resource risk</span><b>{component.risk}/100</b></div><div className="risk-support"><span><strong>{component.finding_count}</strong> attached findings</span><span><strong>{Object.keys(component.sources || {}).length}</strong> contributing sources</span><span><strong>{Object.values(component.severity_counts || {}).reduce((total, count) => total + count, 0)}</strong> classified signals</span></div></section>}
    {signal && <div className="signal-summary"><span style={{ color: color(signal.source) }}>{signal.source}</span><strong style={{ color: color(signal.severity) }}>{signal.severity}</strong><em>{signal.replayed ? 'replayed evidence' : 'live evidence'}</em><p>{signal.summary}</p></div>}
    <section><h3><CircleDot /> Evidence trail</h3>{evidence.length ? evidence.map((item, index) => <div className="evidence-card" key={item.id || index}><div><span style={{ color: color(item.source) }}>{item.source}</span><strong style={{ color: color(item.severity) }}>{item.severity}</strong><time>{age(item.timestamp)}</time></div><b>{label(item.type)}</b><p>{item.summary}</p>{(item.action || item.outcome) && <small>{item.action && `Action: ${label(item.action)}`}{item.action && item.outcome && ' · '}{item.outcome && `Outcome: ${label(item.outcome)}`}</small>}</div>) : <Empty text="No evidence is attached to this resource." />}</section>
    <section><h3><Layers3 /> Context</h3><dl><div><dt>Namespace</dt><dd>{component?.namespace || 'unknown'}</dd></div><div><dt>Resource type</dt><dd>{component?.entity_type || 'unknown'}</dd></div><div><dt>Security posture</dt><dd>{component?.security_posture || signal?.severity || 'unknown'}</dd></div><div><dt>Latest evidence</dt><dd>{age(component?.latest_at || signal?.timestamp)}</dd></div></dl></section>
    {signal?.payload && <details><summary>Raw evidence payload</summary><pre>{JSON.stringify(signal.payload, null, 2)}</pre></details>}
  </aside></div>
}

export default function App() {
  const [data, setData] = useState<Overview | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true)
  const [brief, setBrief] = useState(''), [briefing, setBriefing] = useState(false), [detail, setDetail] = useState<Detail | null>(null)
  const [previousRisk, setPreviousRisk] = useState<number | null>(null), [, setClock] = useState(0)
  const load = async () => { setLoading(true); try { const response = await fetch(`${API}/overview`); if (!response.ok) throw Error(await response.text()); const next: Overview = await response.json(); setData(current => { if (current) setPreviousRisk(current.fleet_risk); return next }); setError('') } catch (caught: any) { setError(caught.message) } finally { setLoading(false) } }
  useEffect(() => { load(); const refreshTimer = setInterval(load, 15000); const clockTimer = setInterval(() => setClock(value => value + 1), 1000); return () => { clearInterval(refreshTimer); clearInterval(clockTimer) } }, [])
  const ask = async () => { setBriefing(true); try { const response = await fetch(`${API}/briefing`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"question":"What requires operator attention right now?"}' }), result = await response.json(); setBrief(result.briefing || result.detail) } finally { setBriefing(false) } }
  const componentsById = useMemo(() => new Map((data?.components || []).map(component => [component.entity_id, component])), [data])
  const selectTopology = (id: string) => { const component = componentsById.get(id); if (component) setDetail({ kind: 'component', component }) }
  const urgent = (data?.counts.critical || 0) + (data?.counts.high || 0)
  return <div className="shell">
    <header><div className="brand"><div className="mark"><Network /></div><div><h1>SENTINEL</h1><p>OPENAI-NATIVE · SENTINEL OPERATIONS GRAPH</p></div></div><nav className="console-nav" aria-label="Platform consoles"><ConsoleLink href={ARGUS_URL}><Shield />Argus</ConsoleLink><ConsoleLink href={PHOENIX_URL}><Zap />Phoenix</ConsoleLink><span className="console-link current"><Network />Sentinel</span></nav><div className="header-state"><i className={error ? 'bad' : ''} /><div><b title="Sentinel Operations Graph status">{error ? 'SOG DEGRADED' : data?.status === 'degraded' ? 'PARTIAL DATA' : 'SOG LIVE'}</b><small>{data ? `refreshed ${age(data.generated_at)}` : 'connecting'}</small></div><button onClick={load} className={loading ? 'spin' : ''} aria-label="Refresh"><RefreshCw /></button></div></header>
    <main>
      <section className="hero"><div><span>UNIFIED COMMAND CENTER</span><h2>One fleet. Two specialist agents.<br /><em>One accountable decision.</em></h2><p>Sentinel combines Argus security evidence and Phoenix resilience outcomes inside the <strong>Sentinel Operations Graph (SOG)</strong>—the shared, live evidence layer that explains exactly what requires attention and why.</p><div className="sog-definition"><GitBranch /><div><b>SOG</b><span>Sentinel Operations Graph</span><small>One connected model of services, dependencies, evidence, incidents, and trust.</small></div></div><div className="hero-state"><span><i className={urgent ? 'urgent' : ''} />{urgent ? `${urgent} urgent signals need review` : 'No urgent evidence in the current window'}</span><span><Clock3 />Polling the Operations Graph every 15 seconds</span><span className="streaming"><Activity />SOG evidence stream active</span></div></div><LiveRiskPanel data={data} previousRisk={previousRisk} onSelect={component => setDetail({ kind: 'component', component })} /></section>
      {error && <div className="error"><AlertTriangle />Sentinel cannot reach the Sentinel Operations Graph (SOG) gateway. {error}</div>}
      <section className="stats"><Stat label="LIVE SIGNALS" value={data?.counts.findings || 0} sub={`${data?.counts.live || 0} observed · ${data?.counts.replayed || 0} replayed`} icon={Activity} tone="high" onClick={() => setDetail({ kind: 'metric', metric: 'signals' })} /><Stat label="URGENT EVIDENCE" value={urgent} sub={`${data?.counts.critical || 0} critical · ${data?.counts.high || 0} high`} icon={AlertTriangle} tone={urgent ? 'critical' : 'low'} onClick={() => setDetail({ kind: 'metric', metric: 'urgent' })} /><Stat label="AFFECTED RESOURCES" value={data?.counts.affected || 0} sub={`of ${data?.counts.entities || 0} mapped entities`} icon={Shield} tone="argus" onClick={() => setDetail({ kind: 'metric', metric: 'affected' })} /><Stat label="NAMESPACES" value={data?.counts.namespaces || 0} sub={`${data?.counts.edges || 0} dependency relationships`} icon={Layers3} tone="sentinel" onClick={() => setDetail({ kind: 'metric', metric: 'namespaces' })} /><Stat label="OPEN INCIDENTS" value={data?.counts.incidents || 0} sub="correlated cross-agent cases" icon={GitBranch} tone="phoenix" onClick={() => setDetail({ kind: 'metric', metric: 'incidents' })} /></section>
      <section className="agent-grid"><SourceCard name="argus" data={data?.sources.argus} icon={Shield} /><SogBridge data={data} onSource={source => setDetail({ kind: 'source', source })} /><SourceCard name="phoenix" data={data?.sources.phoenix} icon={Zap} /></section>
      <section className="panel live-panel"><PanelTitle kicker="01 · LIVE OPERATIONS" title="What is happening right now" help="Newest security, resilience, and infrastructure evidence. Select a row to inspect its context and raw payload." right={<span className="live-badge"><i />{data?.timeline.length || 0} signals</span>} /><LiveSignalFeed events={data?.timeline || []} onSelect={signal => setDetail({ kind: 'signal', signal })} /></section>
      <section className="panel sankey-panel"><PanelTitle kicker="02 · EVIDENCE FLOW" title="How signals become operational work" help="Follow the evidence from its reporting system, through severity classification, to its current open or handled state." right={<span>{data?.counts.findings || 0} signals mapped</span>} /><EvidenceSankey events={data?.timeline || []} /></section>
      <section className="viz-grid"><div className="panel"><PanelTitle kicker="03 · ATTENTION QUEUE" title="What needs attention first" help="Resources ranked by combined security exposure, posture, fragility, and current evidence. Highest priority appears first." /><PriorityList items={data?.components || []} onSelect={component => setDetail({ kind: 'component', component })} /></div><div className="panel"><PanelTitle kicker="04 · BLAST RADIUS" title="Where impact can spread" help="Lines are real dependency relationships. Select a node to inspect the resource and its attached evidence." right={<span>{data?.counts.entities || 0} nodes · {data?.counts.edges || 0} edges</span>} /><TopologyGraph nodes={data?.topology.nodes || []} edges={data?.topology.edges || []} selected={detail?.kind === 'component' ? detail.component.entity_id : undefined} onSelect={selectTopology} /></div></section>
      <section className="insight-grid"><div className="panel"><PanelTitle kicker="05 · EVIDENCE QUALITY" title="Observed versus replayed" help="Synthetic evaluation is never presented as live telemetry. Severity bars show what dominates the current window." /><SignalMix data={data} /></div><div className="panel"><PanelTitle kicker="06 · FLEET COVERAGE" title="Where Sentinel has visibility" help="Entity distribution across Kubernetes namespaces. Longer bars mean more mapped services, pods, or nodes." right={<span>{data?.counts.namespaces || 0} namespaces</span>} /><NamespaceList namespaces={data?.namespaces} /></div></section>
      <section className="lower-grid"><div className="panel"><PanelTitle kicker="07 · HUMAN GOVERNANCE" title="Why Sentinel can—or cannot—act" help="Actions earn autonomy through verified success. Surprise immediately returns control to a human." /><TrustLadder records={data?.trust || []} /></div><div className="panel intelligence"><div className="brief-head"><div><BrainCircuit /></div><div><span>OPENAI EVIDENCE BRIEFING</span><h3>Explain the current fleet posture</h3><p>Generated only from the current Sentinel Operations Graph state.</p></div><button onClick={ask} disabled={briefing}><Sparkles />{briefing ? 'Reasoning…' : brief ? 'Refresh' : 'Generate'}</button></div>{brief ? <MarkdownBrief content={brief} /> : <Empty text="Generate a concise, evidence-grounded operator briefing." />}</div></section>
    </main>
    <footer><span>SENTINEL PLATFORM</span><span><Shield />ARGUS <Zap />PHOENIX <GitBranch />SOG · SENTINEL OPERATIONS GRAPH</span><span><Timer />15s live refresh</span></footer>
    {detail && <DetailDrawer detail={detail} data={data} onClose={() => setDetail(null)} onDetail={setDetail} />}
  </div>
}

function Empty({ text }: { text: string }) { return <div className="empty"><Activity /><span>{text}</span></div> }

function InlineMarkdown({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean)
  return <>{parts.map((part, index) => part.startsWith('**') && part.endsWith('**')
    ? <strong key={index}>{part.slice(2, -2)}</strong>
    : part.startsWith('`') && part.endsWith('`')
      ? <code key={index}>{part.slice(1, -1)}</code>
      : <span key={index}>{part}</span>)}</>
}

function MarkdownBrief({ content }: { content: string }) {
  const blocks: React.ReactNode[] = []
  const lines = content.split('\n')
  let index = 0
  while (index < lines.length) {
    const line = lines[index].trim()
    if (!line) { index += 1; continue }
    if (line.startsWith('## ')) { blocks.push(<h4 key={index}>{line.slice(3)}</h4>); index += 1; continue }
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^\d+\.\s/.test(lines[index].trim())) { items.push(lines[index].trim().replace(/^\d+\.\s/, '')); index += 1 }
      blocks.push(<ol key={`ol-${index}`}>{items.map((item, itemIndex) => <li key={itemIndex}><InlineMarkdown text={item} /></li>)}</ol>); continue
    }
    if (/^[-*]\s/.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^[-*]\s/.test(lines[index].trim())) { items.push(lines[index].trim().replace(/^[-*]\s/, '')); index += 1 }
      blocks.push(<ul key={`ul-${index}`}>{items.map((item, itemIndex) => <li key={itemIndex}><InlineMarkdown text={item} /></li>)}</ul>); continue
    }
    blocks.push(<p key={index}><InlineMarkdown text={line} /></p>); index += 1
  }
  return <div className="brief-markdown">{blocks}</div>
}
