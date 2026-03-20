/**
 * AgentDefinitionView — renders a reaflow block diagram of the agent
 * definition stored in execution.workflowDefinition.metadata.agentDef.
 *
 * Architecture mirrors AgentExecutionDiagram:
 *   - Outer viewport div: overflow:hidden, captures gestures
 *   - Inner transform div: CSS translate+scale
 *   - Canvas: pannable=false, zoomable=false, ELK layout (direction=DOWN)
 */
import { useRef, useCallback, useMemo, useState } from "react";
import { Box, Typography } from "@mui/material";
import { useDrag, usePinch, useWheel } from "@use-gesture/react";
import { ZoomControlsButton } from "shared/ZoomControlsButton";
import HomeIcon from "components/flow/components/graphs/PanAndZoomWrapper/icons/Home";
import MinusIcon from "components/flow/components/graphs/PanAndZoomWrapper/icons/Minus";
import PlusIcon from "components/flow/components/graphs/PanAndZoomWrapper/icons/Plus";
import FitToFrame from "shared/icons/FitToFrame";
import { colors } from "theme/tokens/variables";
import { Canvas, CanvasPosition, Edge, Node, NodeData, EdgeData } from "reaflow";
import { getModelIconPath } from "./AgentExecution/agentExecutionUtils";
import "components/flow/ReaflowOverrides.scss";

// ─── Constants ────────────────────────────────────────────────────────────────
const W = 264, H = 80;
const MIN_ZOOM = 0.1, MAX_ZOOM = 2.5;

// ─── Types ────────────────────────────────────────────────────────────────────
interface DefNodeData {
  kind: "agent" | "tool" | "subagent" | "guardrail" | "group";
  label: string;
  sublabel?: string;
  badge?: string;
  badgeColor: string;
  badgeBg: string;
  borderColor: string;
  modelName?: string;
  count?: number;
  items?: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getItemName(t: unknown, fallback = "[item]"): string {
  if (typeof t === "string") return t;
  if (t && typeof t === "object") {
    const o = t as Record<string, unknown>;
    const n = o.name ?? o._worker_ref ?? (o.function as any)?.name;
    if (typeof n === "string" && n) return n;
  }
  return fallback;
}

function toolCat(t: Record<string, unknown>): "agent" | "tool" | "guardrail" | "http" | "mcp" | "rag" {
  const tt = (t.toolType as string | undefined)?.toLowerCase() ?? "";
  if (tt === "agent_tool" || tt === "agent") return "agent";
  if (tt === "guardrail") return "guardrail";
  if (tt === "http") return "http";
  if (tt === "mcp") return "mcp";
  if (tt === "rag") return "rag";
  return "tool";
}

// ─── Node card ────────────────────────────────────────────────────────────────
function NodeCard({ data, width, height }: { data: DefNodeData; width: number; height: number }) {
  const isRoot  = data.kind === "agent";
  const isGroup = data.kind === "group";

  const innerContent = (
    <div style={{
      position: "relative",
      padding: "14px 18px",
      width: "100%", height: "100%",
      borderRadius: 10,
      boxSizing: "border-box",
      color: "#111111",
    }}>
      {/* Type badge */}
      {data.badge && (
        <div style={{
          position: "absolute", top: 0, right: 0,
          padding: "4px 8px", fontSize: "0.72em", fontWeight: 600, letterSpacing: "0.04em",
          background: data.badgeBg, color: data.badgeColor,
          borderRadius: "5px",
        }}>
          {data.badge}
        </div>
      )}

      <div style={{ display: "flex", width: "100%", alignItems: "flex-start", gap: 8 }}>
        {/* Model icon (for agent / subagent nodes) */}
        {data.modelName && (() => {
          const icon = getModelIconPath(data.modelName);
          return icon
            ? <img src={icon} style={{ width: 20, height: 20, objectFit: "contain", flexShrink: 0, marginTop: 1 }} alt="" />
            : null;
        })()}

        <div style={{ flexGrow: 1, overflow: "hidden" }}>
          {/* Primary label */}
          <div style={{
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            fontWeight: isRoot ? 700 : 500,
            fontSize: "0.875rem",
            lineHeight: 1.3,
          }}>
            {data.label}
          </div>

          {/* Sub-label: model name, instructions snippet, or item count */}
          {data.sublabel && (
            <div style={{
              color: "#AAAAAA", fontSize: "0.775rem",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              marginTop: 3, lineHeight: 1.3,
            }}>
              {data.sublabel}
            </div>
          )}
          {isGroup && data.count !== undefined && (
            <div style={{ color: "#888", fontSize: "0.72rem", marginTop: 3 }}>
              {data.count} {data.badge?.toLowerCase() === "agents" ? "agents" : "tools"}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // Group: stacked card effect (mirrors AgentExecutionDiagram group style)
  if (isGroup) {
    return (
      <div style={{ width, height, position: "relative" }}>
        <div style={{ position: "absolute", top: 14, left: 14, width: "100%", height: "100%", borderRadius: 10, background: "#d0d0d0", border: `2px solid ${data.borderColor}`, opacity: 0.6 }} />
        <div style={{ position: "absolute", top: 7, left: 7, width: "100%", height: "100%", borderRadius: 10, background: "#ebebeb", border: `2px solid ${data.borderColor}`, opacity: 0.85 }} />
        <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: 10, background: "#fff", border: `2.5px solid ${data.borderColor}` }}>
          {innerContent}
        </div>
      </div>
    );
  }

  // Single node
  return (
    <div style={{
      width, height,
      borderRadius: 10,
      background: "#fff",
      border: `${isRoot ? "2px" : "1.5px"} solid ${data.borderColor}`,
    }}>
      {innerContent}
    </div>
  );
}

// ─── Reaflow node wrapper ─────────────────────────────────────────────────────
const DiagramNode = (nodeProps: any) => {
  const { properties } = nodeProps;
  const data: DefNodeData = properties?.data;
  return (
    <Node {...nodeProps} onClick={() => null} label={<></>} style={{ stroke: "none", fill: "none" }}>
      {(ev: any) => (
        <g>
          <foreignObject width={ev.width} height={ev.height} style={{ overflow: "visible" }}>
            <NodeCard data={data} width={ev.width} height={ev.height} />
          </foreignObject>
        </g>
      )}
    </Node>
  );
};

// ─── Build nodes + edges from agentDef ───────────────────────────────────────
function buildDefDiagram(agentDef: Record<string, unknown>) {
  const nodes: NodeData<DefNodeData>[] = [];
  const edges: EdgeData[] = [];

  const defModel     = agentDef.model as string | undefined;
  const agentName    = (agentDef.name as string | undefined) ?? "Agent";
  const instructions = (agentDef.instructions ?? agentDef.description) as string | undefined;
  const allTools     = (agentDef.tools as Array<Record<string, unknown>> | undefined) ?? [];
  const guardrailsDef = (agentDef.guardrails as Array<unknown> | undefined) ?? [];

  const agentToolsList  = allTools.filter(t => toolCat(t) === "agent");
  const regularTools    = allTools.filter(t => toolCat(t) === "tool");
  const httpTools       = allTools.filter(t => toolCat(t) === "http");
  const mcpTools        = allTools.filter(t => toolCat(t) === "mcp");
  const ragTools        = allTools.filter(t => toolCat(t) === "rag");
  const guardrailTools  = allTools.filter(t => toolCat(t) === "guardrail");
  const allGuardrails   = [
    ...guardrailTools.map(g => getItemName(g)),
    ...(guardrailsDef as unknown[]).map(g => getItemName(g)),
  ];

  const instSnippet = instructions
    ? instructions.slice(0, 55) + (instructions.length > 55 ? "…" : "")
    : undefined;

  // Root agent node
  nodes.push({
    id: "agent", width: W, height: H,
    data: {
      kind: "agent",
      label: agentName,
      sublabel: defModel ?? instSnippet,
      badge: "AGENT",
      badgeColor: "#3d5fc0", badgeBg: "#e8eeff",
      borderColor: "#93c5fd",
      modelName: defModel,
    },
  });

  let prevId = "agent";

  // Helper: add a single node chained from prevId
  const addNode = (id: string, data: DefNodeData) => {
    nodes.push({ id, width: W, height: H, data });
    edges.push({ id: `${prevId}→${id}`, from: prevId, to: id });
    prevId = id;
  };

  // Helper: single or group depending on count
  const addCategory = (
    items: Array<{ label: string; model?: string }>,
    singleKind: DefNodeData["kind"],
    badge: string, badgeColor: string, badgeBg: string, borderColor: string,
    groupIdPrefix: string,
  ) => {
    if (items.length === 0) return;
    if (items.length === 1) {
      addNode(`${groupIdPrefix}-0`, {
        kind: singleKind,
        label: items[0].label,
        sublabel: items[0].model,
        badge, badgeColor, badgeBg, borderColor,
        modelName: items[0].model,
      });
    } else {
      addNode(groupIdPrefix, {
        kind: "group",
        label: items.map(i => i.label).slice(0, 3).join(", ") + (items.length > 3 ? ", …" : ""),
        count: items.length,
        badge, badgeColor, badgeBg, borderColor,
        items: items.map(i => i.label),
      });
    }
  };

  // Sub-agents (agent_tool type)
  addCategory(
    agentToolsList.map(t => ({
      label: getItemName(t),
      model: ((t.config as any)?.agentConfig?.model ?? t.model) as string | undefined,
    })),
    "subagent", "AGENTS", "#3d5fc0", "#e8eeff", "#93c5fd", "subagents",
  );

  // Regular / worker tools
  addCategory(
    regularTools.map(t => ({ label: getItemName(t) })),
    "tool", "TOOLS", "#0369a1", "#e0f2fe", "#DDDDDD", "tools",
  );

  // HTTP tools
  addCategory(
    httpTools.map(t => ({ label: getItemName(t) })),
    "tool", "HTTP", "#6b7280", "#f3f4f6", "#DDDDDD", "http-tools",
  );

  // MCP tools
  addCategory(
    mcpTools.map(t => ({ label: getItemName(t) })),
    "tool", "MCP", "#7c3aed", "#ede9fe", "#c4b5fd", "mcp-tools",
  );

  // RAG tools
  addCategory(
    ragTools.map(t => ({ label: getItemName(t) })),
    "tool", "RAG", "#0f766e", "#ccfbf1", "#99f6e4", "rag-tools",
  );

  // Guardrails
  addCategory(
    allGuardrails.map(g => ({ label: g })),
    "guardrail", "GUARDRAILS", "#b45309", "#fef3c7", "#fde68a", "guardrails",
  );

  return { nodes, edges };
}

// ─── Zoom controls (matches AgentExecutionDiagram's DiagramControls) ──────────
function ZoomControls({ zoom, onReset, onZoomIn, onZoomOut, onFit }: {
  zoom: number; onReset: () => void; onZoomIn: () => void; onZoomOut: () => void; onFit: () => void;
}) {
  const border = `1px solid ${colors.lightGrey}`;
  const col    = colors.greyText;
  return (
    <Box sx={{ position: "absolute", top: 5, left: 5, borderRadius: "6px", boxShadow: "0px 4px 12px 0px #0000001F", backgroundColor: "#fff", display: "flex", userSelect: "none", zIndex: 100 }}>
      <ZoomControlsButton onClick={onReset} tooltip="Reset position"><HomeIcon color={col} /></ZoomControlsButton>
      <ZoomControlsButton style={{ borderLeft: border, borderRight: border, width: 60 }}>{Math.round(zoom * 100)}%</ZoomControlsButton>
      <ZoomControlsButton onClick={onZoomOut} tooltip="Zoom out"><MinusIcon color={col} /></ZoomControlsButton>
      <ZoomControlsButton onClick={onZoomIn} disabled={zoom >= MAX_ZOOM} tooltip="Zoom in" style={{ borderLeft: border }}><PlusIcon color={col} /></ZoomControlsButton>
      <ZoomControlsButton onClick={onFit} tooltip="Fit to screen" style={{ borderLeft: border, borderTopRightRadius: 5, borderBottomRightRadius: 5 }}><FitToFrame color={col} /></ZoomControlsButton>
    </Box>
  );
}

// ─── Diagram canvas with pan / zoom ──────────────────────────────────────────
function AgentDefinitionDiagram({ agentDef }: { agentDef: Record<string, unknown> }) {
  const { nodes, edges } = useMemo(() => buildDefDiagram(agentDef), [agentDef]);

  const viewportRef = useRef<HTMLDivElement>(null);
  const [panZoom, setPanZoom]       = useState({ x: 40, y: 40, zoom: 1 });
  const [layoutSize, setLayoutSize] = useState({ width: 0, height: 0 });
  const panZoomRef = useRef(panZoom);
  panZoomRef.current = panZoom;

  const handleLayoutChange = useCallback((result: any) => {
    if (result?.width > 0 && result?.height > 0) {
      setLayoutSize({ width: result.width, height: result.height });
    }
  }, []);

  const handleReset   = useCallback(() => setPanZoom({ x: 40, y: 40, zoom: 1 }), []);
  const handleZoomIn  = useCallback(() => setPanZoom(p => ({ ...p, zoom: Math.min(MAX_ZOOM, p.zoom * 1.2) })), []);
  const handleZoomOut = useCallback(() => setPanZoom(p => ({ ...p, zoom: Math.max(MIN_ZOOM, p.zoom / 1.2) })), []);
  const handleFit     = useCallback(() => {
    if (!viewportRef.current || !layoutSize.width) return;
    const { offsetWidth: vw, offsetHeight: vh } = viewportRef.current;
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min((vw - 80) / layoutSize.width, (vh - 80) / layoutSize.height)));
    setPanZoom({ x: (vw - layoutSize.width * newZoom) / 2, y: (vh - layoutSize.height * newZoom) / 2, zoom: newZoom });
  }, [layoutSize]);

  useDrag(
    ({ delta, tap }) => { if (tap) return; setPanZoom(p => ({ ...p, x: p.x + delta[0], y: p.y + delta[1] })); },
    { target: viewportRef, filterTaps: true, eventOptions: { passive: false } },
  );
  useWheel(
    ({ delta, event, metaKey, ctrlKey }) => {
      event.preventDefault();
      if (metaKey || ctrlKey) {
        const rect = viewportRef.current?.getBoundingClientRect();
        const cx = (event as WheelEvent).clientX - (rect?.left ?? 0);
        const cy = (event as WheelEvent).clientY - (rect?.top ?? 0);
        setPanZoom(p => {
          const nz = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, p.zoom * (1 - (event as WheelEvent).deltaY * 0.001)));
          const s = nz / p.zoom;
          return { x: cx - s * (cx - p.x), y: cy - s * (cy - p.y), zoom: nz };
        });
      } else {
        setPanZoom(p => ({ ...p, x: p.x - delta[0], y: p.y - delta[1] }));
      }
    },
    { target: viewportRef, eventOptions: { passive: false } },
  );
  usePinch(
    ({ offset: [scale], event, origin: [ox, oy] }) => {
      event.preventDefault();
      const rect = viewportRef.current?.getBoundingClientRect();
      const cx = ox - (rect?.left ?? 0);
      const cy = oy - (rect?.top ?? 0);
      const nz = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, scale));
      setPanZoom(p => { const f = nz / p.zoom; return { x: cx - f * (cx - p.x), y: cy - f * (cy - p.y), zoom: nz }; });
    },
    { scaleBounds: { min: MIN_ZOOM, max: MAX_ZOOM }, from: () => [panZoomRef.current.zoom, 0], target: viewportRef, eventOptions: { passive: false } },
  );

  const hasLayout = layoutSize.width > 0;

  return (
    <div
      ref={viewportRef}
      style={{ width: "100%", height: "100%", overflow: "hidden", position: "relative", cursor: "grab", touchAction: "none", backgroundImage: "url('/diagramDotBg.svg')", backgroundColor: "#fff" }}
    >
      {/* Loading skeleton */}
      {!hasLayout && (
        <Box sx={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#fff", backgroundImage: "url('/diagramDotBg.svg')" }}>
          <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            {[0, 1, 2].map(i => (
              <Box key={i} sx={{ width: i === 0 ? 56 : 220, height: 80, borderRadius: 1, backgroundColor: "#f3f3f3", border: "1px solid #DDDDDD", animation: "shimmer 1.5s ease-in-out infinite", animationDelay: `${i * 0.2}s`, "@keyframes shimmer": { "0%,100%": { opacity: 0.6 }, "50%": { opacity: 1 } } }} />
            ))}
          </Box>
        </Box>
      )}

      {/* Zoom controls */}
      {hasLayout && <ZoomControls zoom={panZoom.zoom} onReset={handleReset} onZoomIn={handleZoomIn} onZoomOut={handleZoomOut} onFit={handleFit} />}

      {/* Transform container */}
      <div style={{
        position: "absolute",
        transformOrigin: "top left",
        transition: "transform .1s",
        transform: `translateX(${panZoom.x}px) translateY(${panZoom.y}px) scale(${panZoom.zoom})`,
        ...(hasLayout ? { width: layoutSize.width, height: layoutSize.height } : {}),
      }}>
        <Canvas
          nodes={nodes}
          edges={edges}
          fit={false}
          zoomable={false}
          pannable={false}
          defaultPosition={CanvasPosition.CENTER}
          maxWidth={5000}
          maxHeight={4000}
          onLayoutChange={handleLayoutChange}
          direction="DOWN"
          layoutOptions={{
            "org.eclipse.elk.spacing.nodeNode": "18",
            "elk.layered.spacing.nodeNodeBetweenLayers": "24",
            "org.eclipse.elk.padding": "[top=60,left=60,bottom=60,right=60]",
          }}
          node={<DiagramNode />}
          edge={(ed: EdgeData) => <Edge {...ed} style={{ stroke: "#BBBBBB", strokeWidth: 1.5 }} />}
        />
      </div>
    </div>
  );
}

// ─── Public wrapper ───────────────────────────────────────────────────────────
interface AgentDefinitionViewProps {
  execution: any;
}

export function AgentDefinitionView({ execution }: AgentDefinitionViewProps) {
  const agentDef = execution?.workflowDefinition?.metadata?.agentDef as Record<string, unknown> | undefined;

  if (!agentDef) {
    return (
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "text.secondary" }}>
        <Typography variant="body2">No agent definition found in workflow metadata</Typography>
      </Box>
    );
  }

  return <AgentDefinitionDiagram agentDef={agentDef} />;
}

export default AgentDefinitionView;
