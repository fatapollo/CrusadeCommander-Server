import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { campaignsApi, forcesApi } from '../api/endpoints';
import { ApiError } from '../api/client';
import { BunkPage } from '../components/bunker';
import { Button, EmptyState, Spinner } from '../components/ui';
import { EdgeLine } from '../components/map/EdgeLine';
import { NodeToken } from '../components/map/NodeToken';
import {
  MAP_W, MAP_H, NODE_TYPE, ownerAtPhase, ownerColor, ownerLabel,
} from '../components/map/utils';
import { crestFor, SigilHazard, SigilReticle } from '../components/sigils';
import { useIsNarrow } from '../hooks/useIsNarrow';
import type {
  CrusadeForce, NodeOwner, NodeType, SectorEdge, SectorMap, SectorNode,
} from '../types';

const RUST = '#e2683c';
const GRID_PX = 40; // logical grid step (1000×700 plane → 25×17.5 cells)

type Tool = 'select' | 'node' | 'edge' | 'move' | 'delete';

interface BuilderState {
  map: SectorMap;
  selectedId: string | null;
  edgeStartId: string | null;
  cursor: { x: number; y: number } | null;
  dirty: boolean;
}

const NODE_TYPE_KEYS = Object.keys(NODE_TYPE) as NodeType[];

export default function MapBuilderPage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const navigate = useNavigate();
  const isNarrow = useIsNarrow();

  const campaignQ = useQuery({
    queryKey: ['campaign', campaignId],
    queryFn: () => campaignsApi.get(campaignId!),
    enabled: !!campaignId,
  });
  const forcesQ = useQuery({
    queryKey: ['campaign', campaignId, 'forces'],
    queryFn: () => forcesApi.list(campaignId!),
    enabled: !!campaignId,
  });

  if (campaignQ.isLoading || forcesQ.isLoading) {
    return <BunkPage active="01"><Spinner /></BunkPage>;
  }
  if (campaignQ.error || !campaignQ.data) {
    return (
      <BunkPage active="01">
        <EmptyState icon="✕" title="Campaign not found"
          action={<Button onClick={() => navigate('/campaigns')}>Back</Button>} />
      </BunkPage>
    );
  }

  const c = campaignQ.data.campaign;
  const role = campaignQ.data.role;
  const isAdmin = role === 'owner' || role === 'admin';
  const forces = forcesQ.data?.forces ?? [];

  if (!isAdmin) {
    return (
      <BunkPage active="01">
        <EmptyState icon="⚠" title="Admin only"
          action={
            <Button onClick={() => navigate(`/campaigns/${campaignId}?tab=map`)}>
              Back to map
            </Button>
          }
        />
      </BunkPage>
    );
  }

  if (isNarrow) {
    return (
      <BunkPage active="01">
        <BuilderDesktopOnly campaignId={c.id} />
      </BunkPage>
    );
  }

  return (
    <BunkPage active="01">
      <Builder
        campaignId={c.id}
        campaignName={c.name}
        campaignState={c.state}
        forces={forces}
        initialMap={c.sector_map ?? { nodes: [], edges: [] }}
      />
    </BunkPage>
  );
}

function Builder({
  campaignId, campaignName, campaignState, forces, initialMap,
}: {
  campaignId: string;
  campaignName: string;
  campaignState: string;
  forces: CrusadeForce[];
  initialMap: SectorMap;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tool, setTool] = useState<Tool>('select');
  const [snap, setSnap] = useState(true);
  const [state, setState] = useState<BuilderState>({
    map: initialMap,
    selectedId: null,
    edgeStartId: null,
    cursor: null,
    dirty: false,
  });
  const [saveError, setSaveError] = useState<string | null>(null);

  const selectedNode = state.selectedId
    ? state.map.nodes.find(n => n.id === state.selectedId) ?? null
    : null;

  const saveM = useMutation({
    mutationFn: (m: SectorMap) => campaignsApi.setSectorMap(campaignId, m),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaign', campaignId] });
      setState(s => ({ ...s, dirty: false }));
      setSaveError(null);
    },
    onError: (e) => setSaveError(e instanceof ApiError ? e.message : 'Failed to save'),
  });

  const mutate = (fn: (m: SectorMap) => SectorMap, patch?: Partial<BuilderState>) => {
    setState(s => ({ ...s, map: fn(s.map), dirty: true, ...(patch ?? {}) }));
  };

  // Cursor reporting + drag handling -----------------------------------------
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);

  const toLogical = (e: { clientX: number; clientY: number }): { x: number; y: number } | null => {
    const el = containerRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * MAP_W;
    const y = ((e.clientY - r.top) / r.height) * MAP_H;
    return { x: clamp(x, 0, MAP_W), y: clamp(y, 0, MAP_H) };
  };

  const snapPos = (p: { x: number; y: number }) => snap
    ? { x: Math.round(p.x / GRID_PX) * GRID_PX, y: Math.round(p.y / GRID_PX) * GRID_PX }
    : { x: Math.round(p.x), y: Math.round(p.y) };

  const onCanvasPointerMove = (e: React.PointerEvent) => {
    const p = toLogical(e);
    if (!p) return;
    if (dragRef.current && tool === 'move') {
      const { id, dx, dy } = dragRef.current;
      const next = snapPos({ x: p.x - dx, y: p.y - dy });
      mutate(m => ({
        ...m,
        nodes: m.nodes.map(n => n.id === id ? { ...n, pos: next } : n),
      }), { cursor: next });
    } else {
      setState(s => ({ ...s, cursor: snap ? snapPos(p) : { x: Math.round(p.x), y: Math.round(p.y) } }));
    }
  };

  const onCanvasPointerUp = () => {
    if (dragRef.current && containerRef.current) {
      containerRef.current.releasePointerCapture?.(0);
    }
    dragRef.current = null;
  };

  const onCanvasClick = (e: React.MouseEvent) => {
    // Only fires when clicking empty canvas (nodes stopPropagation).
    if (tool !== 'node') {
      // clear selection / edge start when clicking empty space.
      setState(s => ({ ...s, selectedId: null, edgeStartId: null }));
      return;
    }
    const p = toLogical(e);
    if (!p) return;
    const pos = snapPos(p);
    const id = nextNodeId(state.map.nodes);
    const node: SectorNode = {
      id,
      name: `Node ${state.map.nodes.length + 1}`,
      type: 'WILD',
      pos,
      value: 1,
      traits: [],
      owners: ['NEUTRAL'],
      isObjective: false,
      history: [],
      battles: [],
    };
    mutate(m => ({ ...m, nodes: [...m.nodes, node] }), { selectedId: id });
    setTool('select');
  };

  const onNodeClick = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tool === 'delete') {
      mutate(m => ({
        nodes: m.nodes.filter(n => n.id !== id),
        edges: m.edges.filter(([a, b]) => a !== id && b !== id),
      }), { selectedId: null, edgeStartId: null });
      return;
    }
    if (tool === 'edge') {
      if (!state.edgeStartId) {
        setState(s => ({ ...s, edgeStartId: id }));
        return;
      }
      if (state.edgeStartId === id) {
        setState(s => ({ ...s, edgeStartId: null }));
        return;
      }
      const a = state.edgeStartId, b = id;
      mutate(m => {
        const exists = m.edges.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
        return exists ? m : { ...m, edges: [...m.edges, [a, b] as SectorEdge] };
      }, { edgeStartId: null });
      return;
    }
    // select / move both select on plain click.
    setState(s => ({ ...s, selectedId: id }));
  };

  const onNodePointerDown = (id: string, e: React.PointerEvent) => {
    if (tool !== 'move') return;
    e.stopPropagation();
    const p = toLogical(e);
    const node = state.map.nodes.find(n => n.id === id);
    if (!p || !node) return;
    dragRef.current = { id, dx: p.x - node.pos.x, dy: p.y - node.pos.y };
    setState(s => ({ ...s, selectedId: id }));
    containerRef.current?.setPointerCapture?.(e.pointerId);
  };

  // Validation ---------------------------------------------------------------
  const validation = useMemo(() => {
    const nodeCount = state.map.nodes.length;
    const edgeCount = state.map.edges.length;
    const objectives = state.map.nodes.filter(n => n.isObjective).length;
    const warnings: string[] = [];
    if (nodeCount > 0 && edgeCount === 0) warnings.push('No supply lines drawn');
    // Find isolated nodes (no connecting edge), only warn if >= 3 total nodes.
    if (nodeCount >= 3) {
      const linked = new Set<string>();
      state.map.edges.forEach(([a, b]) => { linked.add(a); linked.add(b); });
      const isolated = state.map.nodes.filter(n => !linked.has(n.id));
      if (isolated.length === 1) warnings.push(`"${isolated[0].name}" has no connections`);
      else if (isolated.length > 1) warnings.push(`${isolated.length} nodes have no connections`);
    }
    return { nodeCount, edgeCount, objectives, warnings };
  }, [state.map]);

  // Update helpers for inspector --------------------------------------------
  const updateSelected = (patch: Partial<SectorNode>) => {
    if (!state.selectedId) return;
    mutate(m => ({
      ...m,
      nodes: m.nodes.map(n => n.id === state.selectedId ? { ...n, ...patch } : n),
    }));
  };

  const deleteSelected = () => {
    if (!state.selectedId) return;
    const id = state.selectedId;
    mutate(m => ({
      nodes: m.nodes.filter(n => n.id !== id),
      edges: m.edges.filter(([a, b]) => a !== id && b !== id),
    }), { selectedId: null });
  };

  return (
    <>
      {/* Admin banner */}
      <div className="px-6 py-2 border-y border-bunk-warning/50 bg-bunk-warning/10 flex flex-wrap items-center gap-3 font-mono text-[10px] tracking-mono-lg uppercase">
        <span className="text-bunk-warning font-bold">⚠ ADMIN · MAP BUILDER</span>
        <span className="text-bunk-boneDim">// {campaignName} · {campaignState}</span>
        <div className="flex-1" />
        <span className={state.dirty ? 'text-bunk-warning' : 'text-bunk-green'}>
          {saveM.isPending ? '◌ SAVING…' : state.dirty ? '◌ UNSAVED CHANGES' : '● SAVED'}
        </span>
      </div>

      {/* Hero */}
      <div className="relative overflow-hidden border border-bunk-line bg-bunk-surface mb-4 mt-4 mx-0">
        <SigilHazard height={8} color={RUST} bg="#06040a" />
        <div className="p-4 flex flex-wrap items-baseline gap-3">
          <Link to={`/campaigns/${campaignId}?tab=map`} className="font-mono text-[10px] tracking-mono-lg text-bunk-rust hover:text-bunk-bone">
            ‹ MAP // RETURN TO SECTOR
          </Link>
          <h1 className="font-display text-3xl font-bold uppercase tracking-tight text-bunk-bone leading-none">
            Sector Cartography
          </h1>
          <div className="flex-1" />
          <span className="font-mono text-[10px] tracking-mono-lg text-bunk-boneDim uppercase">
            {validation.nodeCount} nodes · {validation.edgeCount} edges · {validation.objectives} objectives
          </span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="border border-bunk-line bg-bunk-surfaceLo px-3 py-2 flex flex-wrap items-center gap-1.5">
        {TOOLS.map(t => (
          <ToolButton
            key={t.key}
            label={t.label}
            active={tool === t.key}
            onClick={() => {
              setTool(t.key);
              setState(s => ({ ...s, edgeStartId: null }));
            }}
          />
        ))}
        <Divider />
        <ToolButton
          label="⬚ SNAP TO GRID"
          active={snap}
          onClick={() => setSnap(s => !s)}
        />
        <ToolButton label="⊞ TEMPLATE ▾" disabled />
        <div className="flex-1" />
        <button
          onClick={() => navigate(`/campaigns/${campaignId}?tab=map`)}
          className="px-3 py-1.5 font-display text-[11px] tracking-mono-md font-bold uppercase text-bunk-boneDim hover:text-bunk-bone"
        >
          ✕ CLOSE
        </button>
        <button
          onClick={() => saveM.mutate(state.map)}
          disabled={!state.dirty || saveM.isPending}
          className="px-4 py-1.5 font-display text-[11px] tracking-mono-md font-bold uppercase bg-bunk-bone text-bunk-ink disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saveM.isPending ? 'SAVING…' : 'PUBLISH'}
        </button>
      </div>

      {/* Validation banner */}
      <div className="border-x border-b border-bunk-line bg-bunk-surface px-3 py-2 flex flex-wrap items-center gap-4 font-mono text-[10px] tracking-mono-md uppercase">
        <span className="text-bunk-green">● {validation.nodeCount} nodes</span>
        <span className="text-bunk-green">● {validation.edgeCount} edges</span>
        <span className="text-bunk-boneDim">○ {validation.objectives} objectives</span>
        {validation.warnings.map((w, i) => (
          <span key={i} className="text-bunk-warning">⚠ {w}</span>
        ))}
        {saveError && <span className="text-bunk-red">✕ {saveError}</span>}
        <div className="flex-1" />
        <span className="text-bunk-boneMute">
          {tool === 'node' && 'click empty space to place'}
          {tool === 'edge' && (state.edgeStartId ? 'click another node to connect' : 'click first endpoint')}
          {tool === 'move' && 'drag a node to reposition'}
          {tool === 'delete' && 'click a node to remove'}
          {tool === 'select' && 'click a node to inspect'}
        </span>
      </div>

      {/* Canvas + inspector */}
      <div className="grid lg:grid-cols-[1fr_360px] gap-4 mt-4">
        <div>
          <div
            ref={containerRef}
            className="relative w-full bg-bunk-ink border border-bunk-line overflow-hidden select-none"
            style={{
              height: 620,
              backgroundImage: 'linear-gradient(rgba(226,104,60,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(226,104,60,0.08) 1px, transparent 1px)',
              backgroundSize: `${(GRID_PX / MAP_W) * 100}% ${(GRID_PX / MAP_H) * 100}%`,
              cursor: cursorForTool(tool),
            }}
            onClick={onCanvasClick}
            onPointerMove={onCanvasPointerMove}
            onPointerUp={onCanvasPointerUp}
            onPointerLeave={() => setState(s => ({ ...s, cursor: null }))}
          >
            {/* Sector label */}
            <div className="absolute top-2 left-2 font-mono text-[9px] tracking-mono-lg text-bunk-rust select-none pointer-events-none">
              // SECTOR PLANE · {MAP_W}×{MAP_H} {snap && `· GRID ${GRID_PX}px`}
            </div>
            <div className="absolute top-2 right-2 font-mono text-[9px] tracking-mono-md text-bunk-warning select-none pointer-events-none">
              BUILDER MODE
            </div>

            {/* Edges */}
            <svg
              viewBox={`0 0 ${MAP_W} ${MAP_H}`}
              preserveAspectRatio="none"
              className="absolute inset-0 w-full h-full pointer-events-none"
              aria-hidden
            >
              {state.map.edges.map(([aId, bId], i) => {
                const a = state.map.nodes.find(n => n.id === aId);
                const b = state.map.nodes.find(n => n.id === bId);
                if (!a || !b) return null;
                const oa = ownerAtPhase(a, 1);
                const ob = ownerAtPhase(b, 1);
                const shared = oa === ob ? ownerColor(oa, forces) : undefined;
                return (
                  <EdgeLine
                    key={`${aId}-${bId}-${i}`}
                    a={a} b={b}
                    ownerA={oa} ownerB={ob}
                    sharedOwnerColor={shared}
                  />
                );
              })}
              {/* Phantom edge while drawing */}
              {tool === 'edge' && state.edgeStartId && state.cursor && (() => {
                const start = state.map.nodes.find(n => n.id === state.edgeStartId);
                if (!start) return null;
                return (
                  <line
                    x1={start.pos.x} y1={start.pos.y}
                    x2={state.cursor.x} y2={state.cursor.y}
                    stroke={RUST} strokeWidth={1.5} strokeDasharray="4 3" opacity={0.7}
                  />
                );
              })()}
            </svg>

            {/* Tokens */}
            <div className="absolute inset-0">
              {state.map.nodes.map(n => {
                const owner = ownerAtPhase(n, 1);
                const color = ownerColor(owner, forces);
                const force = forces.find(f => f.id === owner);
                const crest = force ? crestFor(force.faction) : undefined;
                const isEdgeStart = state.edgeStartId === n.id;
                const ringState = state.selectedId === n.id || isEdgeStart ? 'selected' : 'default';
                return (
                  <div
                    key={n.id}
                    onPointerDownCapture={(e) => onNodePointerDown(n.id, e)}
                    onClickCapture={(e) => onNodeClick(n.id, e)}
                  >
                    <NodeToken
                      node={n}
                      ownerColor={color}
                      crest={crest}
                      contested={owner === 'CONTESTED'}
                      zoom={2}
                      state={ringState}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Cursor readout strip */}
          <div className="border-x border-b border-bunk-line bg-bunk-surfaceLo px-3.5 py-2 flex flex-wrap justify-between gap-3 font-mono text-[10px] tracking-mono-md text-bunk-boneDim uppercase">
            <span>
              CURSOR · {state.cursor ? `${state.cursor.x}, ${state.cursor.y}` : '— , —'}
            </span>
            <span>
              SELECTED · {selectedNode ? selectedNode.id.toUpperCase() : '—'}
            </span>
            <span>GRID · {GRID_PX}px {snap ? '' : '(off)'}</span>
            <span className="text-bunk-rust">TOOL · {tool.toUpperCase()}</span>
          </div>
        </div>

        <div>
          {selectedNode ? (
            <NodeInspector
              key={selectedNode.id}
              node={selectedNode}
              forces={forces}
              onChange={updateSelected}
              onDelete={deleteSelected}
              onClose={() => setState(s => ({ ...s, selectedId: null }))}
            />
          ) : (
            <InspectorEmpty />
          )}
        </div>
      </div>
    </>
  );
}

// ─── Inspector ──────────────────────────────────────────────────────────────

function NodeInspector({
  node, forces, onChange, onDelete, onClose,
}: {
  node: SectorNode;
  forces: CrusadeForce[];
  onChange: (patch: Partial<SectorNode>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [traitDraft, setTraitDraft] = useState('');
  const startingOwner = node.owners[0] ?? 'NEUTRAL';

  const ownerOptions: NodeOwner[] = ['NEUTRAL', ...forces.map(f => f.id)];

  const setStartingOwner = (o: NodeOwner) => {
    const owners = node.owners.length > 0 ? [...node.owners] : ['NEUTRAL'];
    owners[0] = o;
    onChange({ owners });
  };

  const addTrait = () => {
    const t = traitDraft.trim();
    if (!t || node.traits.includes(t)) return;
    onChange({ traits: [...node.traits, t] });
    setTraitDraft('');
  };

  const removeTrait = (t: string) => {
    onChange({ traits: node.traits.filter(x => x !== t) });
  };

  return (
    <div className="bg-bunk-surface border border-bunk-lineHi self-start">
      {/* Header strip */}
      <div className="px-4 py-2.5 bg-bunk-rust text-bunk-ink flex items-center font-mono text-[10px] tracking-mono-lg font-bold">
        <span>// NODE INSPECTOR</span>
        <div className="flex-1" />
        <button onClick={onClose} className="text-bunk-ink hover:opacity-70" aria-label="Close inspector">✕</button>
      </div>

      <div className="p-4 grid gap-4">
        {/* Name */}
        <BuilderField label="NODE NAME">
          <input
            type="text"
            value={node.name}
            onChange={(e) => onChange({ name: e.target.value })}
            className="w-full px-3 py-2 bg-bunk-ink border border-bunk-line border-b-2 border-b-bunk-rust font-display text-[15px] font-semibold text-bunk-bone outline-none focus:border-bunk-rust"
          />
        </BuilderField>

        {/* Type */}
        <div>
          <FieldLabel>NODE TYPE</FieldLabel>
          <div className="grid grid-cols-4 gap-px bg-bunk-line">
            {NODE_TYPE_KEYS.map(k => {
              const active = node.type === k;
              const v = NODE_TYPE[k];
              return (
                <button
                  key={k}
                  onClick={() => onChange({ type: k })}
                  className={`py-2 text-center ${active ? 'bg-bunk-rust text-bunk-ink' : 'bg-bunk-ink text-bunk-bone hover:brightness-125'}`}
                >
                  <div className="font-display text-sm font-bold leading-none">{v.glyph}</div>
                  <div className="font-mono text-[9px] tracking-mono-sm uppercase mt-0.5">{v.label.split(' ')[0]}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Strategic value */}
        <div>
          <FieldLabel>STRATEGIC VALUE</FieldLabel>
          <div className="flex gap-0.5">
            {[1, 2, 3, 4, 5].map(v => {
              const active = node.value === v;
              return (
                <button
                  key={v}
                  onClick={() => onChange({ value: v as 1 | 2 | 3 | 4 | 5 })}
                  className={`flex-1 py-2 border border-bunk-line font-display text-lg font-bold ${active ? 'bg-bunk-rust text-bunk-ink' : 'bg-bunk-ink text-bunk-bone hover:brightness-125'}`}
                >{v}</button>
              );
            })}
          </div>
        </div>

        {/* Traits */}
        <div>
          <FieldLabel>TRAITS</FieldLabel>
          <div className="flex flex-wrap gap-1.5">
            {node.traits.map(t => (
              <span key={t} className="px-2 py-1 bg-bunk-ink border border-bunk-rust text-bunk-rust font-mono text-[10px] tracking-mono-sm uppercase flex items-center gap-2">
                {t}
                <button onClick={() => removeTrait(t)} className="text-bunk-boneDim hover:text-bunk-red" aria-label={`Remove ${t}`}>×</button>
              </span>
            ))}
            <span className="flex items-center gap-1">
              <input
                type="text"
                value={traitDraft}
                onChange={(e) => setTraitDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTrait(); } }}
                placeholder="new trait"
                className="w-24 px-2 py-1 bg-transparent border border-dashed border-bunk-line font-mono text-[10px] tracking-mono-sm text-bunk-bone uppercase outline-none focus:border-bunk-rust"
              />
              <button onClick={addTrait} className="px-2 py-1 font-mono text-[10px] tracking-mono-sm text-bunk-boneDim border border-dashed border-bunk-line hover:text-bunk-bone">＋</button>
            </span>
          </div>
        </div>

        {/* Starting owner */}
        <div>
          <FieldLabel>STARTING OWNER · PHASE 01</FieldLabel>
          <div className="grid gap-1">
            {ownerOptions.map(o => {
              const active = startingOwner === o;
              const c = ownerColor(o, forces);
              const label = ownerLabel(o, forces);
              const force = forces.find(f => f.id === o);
              const Crest = force ? crestFor(force.faction) : null;
              return (
                <button
                  key={o}
                  onClick={() => setStartingOwner(o)}
                  className="px-3 py-2 flex items-center gap-2.5 border text-left"
                  style={{
                    background: active ? '#06040a' : 'transparent',
                    borderColor: active ? c : '#2e251e',
                    borderLeftWidth: 4,
                    borderLeftColor: active ? c : '#2e251e',
                  }}
                >
                  {Crest
                    ? <Crest size={18} color={c} />
                    : <span className="block w-[18px] h-[18px] border border-bunk-ink" style={{ background: c }} />}
                  <span className="font-display text-[12px] font-semibold tracking-wide text-bunk-bone uppercase truncate">{label}</span>
                  {active && (
                    <span className="ml-auto font-mono text-[9px] tracking-mono-md uppercase" style={{ color: c }}>● SELECTED</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Objective toggle */}
        <button
          onClick={() => onChange({ isObjective: !node.isObjective })}
          className="px-3 py-2.5 bg-bunk-ink border border-bunk-line flex items-center gap-3 text-left"
        >
          <span
            className="relative block flex-shrink-0 border border-bunk-lineHi"
            style={{ width: 32, height: 18, background: node.isObjective ? '#f4c14b' : '#1a1614' }}
          >
            <span
              className="absolute top-[1px] block bg-bunk-ink"
              style={{ width: 14, height: 14, left: node.isObjective ? 'auto' : 1, right: node.isObjective ? 1 : 'auto' }}
            />
          </span>
          <span className="font-display text-[12px] font-semibold tracking-wide text-bunk-bone uppercase">Campaign Objective</span>
          <span
            className="ml-auto font-mono text-[9px] tracking-mono-md uppercase"
            style={{ color: node.isObjective ? '#f4c14b' : '#5c5346' }}
          >
            {node.isObjective ? '● MARKED' : '○ OPTIONAL'}
          </span>
        </button>

        {/* Position readout */}
        <div className="px-3 py-2.5 bg-bunk-ink border border-bunk-line grid grid-cols-2 gap-3 font-mono text-[10px] tracking-mono-sm uppercase text-bunk-boneDim">
          <div>X <span className="text-bunk-bone ml-2 tabular-nums">{Math.round(node.pos.x)}</span></div>
          <div>Y <span className="text-bunk-bone ml-2 tabular-nums">{Math.round(node.pos.y)}</span></div>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => { if (confirm(`Delete "${node.name}"?`)) onDelete(); }}
            className="py-2.5 border border-bunk-red text-bunk-red font-display text-[11px] tracking-mono-md font-bold uppercase hover:bg-bunk-red/10"
          >✕ DELETE NODE</button>
          <button
            onClick={onClose}
            className="py-2.5 bg-bunk-rust text-bunk-ink font-display text-[11px] tracking-mono-md font-bold uppercase hover:brightness-110"
          >DONE</button>
        </div>
      </div>
    </div>
  );
}

function InspectorEmpty() {
  return (
    <div className="bg-bunk-surface border border-bunk-line p-6 grid gap-3 self-start">
      <div className="font-mono text-[10px] tracking-mono-lg text-bunk-rust uppercase">// NODE INSPECTOR</div>
      <p className="font-narrative italic text-[13px] text-bunk-boneDim leading-relaxed">
        Pick the <strong className="text-bunk-bone">＋ ADD NODE</strong> tool to drop worlds onto the sector,
        or click an existing node to edit it.
      </p>
      <div className="grid gap-1.5 mt-2 font-mono text-[10px] tracking-mono-sm uppercase text-bunk-boneDim">
        <Hint glyph="↖">SELECT to inspect</Hint>
        <Hint glyph="＋">ADD NODE places a new world</Hint>
        <Hint glyph="／">DRAW EDGE connects two nodes</Hint>
        <Hint glyph="✥">MOVE drags nodes to reposition</Hint>
        <Hint glyph="✕">DELETE removes a node (and its edges)</Hint>
      </div>
      <p className="font-mono text-[10px] tracking-mono-sm uppercase text-bunk-boneMute mt-2">
        Hit <span className="text-bunk-bone">PUBLISH</span> to save the sector. Players will see your changes
        on the MAP tab.
      </p>
    </div>
  );
}

function Hint({ glyph, children }: { glyph: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-bunk-rust w-4 inline-block">{glyph}</span>
      <span>{children}</span>
    </div>
  );
}

// ─── Mobile gate ────────────────────────────────────────────────────────────

function BuilderDesktopOnly({ campaignId }: { campaignId: string }) {
  const navigate = useNavigate();
  return (
    <div className="relative overflow-hidden border border-bunk-line bg-bunk-surface py-12">
      <div className="absolute -left-10 -top-10 opacity-[0.05]"><SigilReticle size={220} color={RUST} /></div>
      <div className="relative max-w-[420px] mx-auto text-center px-5">
        <div className="flex justify-center mb-4"><SigilHazard width={64} height={10} color={RUST} bg="#161310" /></div>
        <div className="font-mono text-[10px] tracking-mono-lg text-bunk-rust mb-3 uppercase">
          ⚠ Desktop Required
        </div>
        <div className="font-display text-4xl font-bold uppercase tracking-tight text-bunk-bone leading-[0.95]">
          Cartography on a<br />
          <span className="text-bunk-rust">larger plane</span>
        </div>
        <p className="font-narrative italic text-sm text-bunk-boneDim mt-4 leading-relaxed">
          The sector builder needs precision input — placing nodes, drawing supply lines, and snapping
          to grid. Open this campaign on a desktop browser to chart the sector.
        </p>
        <div className="mt-6">
          <Button onClick={() => navigate(`/campaigns/${campaignId}?tab=map`)}>
            ‹ Back to Map
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Toolbar bits ───────────────────────────────────────────────────────────

const TOOLS: { key: Tool; label: string }[] = [
  { key: 'select', label: '↖ SELECT' },
  { key: 'node',   label: '＋ ADD NODE' },
  { key: 'edge',   label: '／ DRAW EDGE' },
  { key: 'move',   label: '✥ MOVE' },
  { key: 'delete', label: '✕ DELETE' },
];

function ToolButton({
  label, active, disabled, onClick,
}: {
  label: string; active?: boolean; disabled?: boolean; onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-1.5 border font-display text-[11px] tracking-mono-md font-bold uppercase ${
        active
          ? 'bg-bunk-rust text-bunk-ink border-bunk-rust'
          : 'bg-bunk-ink text-bunk-bone border-bunk-line hover:brightness-125'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
    >
      {label}
    </button>
  );
}

function Divider() {
  return <span className="block w-px h-5 bg-bunk-line mx-1.5" />;
}

function BuilderField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      {children}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[9px] tracking-mono-lg text-bunk-rust mb-1.5 uppercase">{children}</div>
  );
}

// ─── helpers ────────────────────────────────────────────────────────────────

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function nextNodeId(nodes: SectorNode[]): string {
  const taken = new Set(nodes.map(n => n.id));
  let i = nodes.length + 1;
  while (taken.has(`node-${i}`)) i++;
  return `node-${i}`;
}

function cursorForTool(t: Tool): string {
  switch (t) {
    case 'node':   return 'crosshair';
    case 'edge':   return 'cell';
    case 'move':   return 'grab';
    case 'delete': return 'not-allowed';
    default:       return 'default';
  }
}

