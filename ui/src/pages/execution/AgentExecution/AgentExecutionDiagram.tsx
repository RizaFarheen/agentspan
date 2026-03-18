/**
 * AgentExecutionDiagram — Reaflow box diagram, same visual language as Conductor.
 * Uses the same CardStatusBadge + getCardVariant components as the Debug View.
 * Turn-filtered: shows one turn at a time with next-turn terminator circle.
 */
import { Canvas, Edge, Node, NodeData, EdgeData } from "reaflow";
import { Box } from "@mui/material";
import { getCardVariant } from "components/flow/components/shapes/styles";
import CardStatusBadge from "components/flow/components/shapes/TaskCard/CardStatusBadge";
import { ArrowRight } from "@phosphor-icons/react";
import { TaskStatus, TaskType } from "types";
import { AgentEvent, AgentRunData, AgentStatus, EventType } from "./types";
import { DetailNodeData } from "./AgentDetailPanel";
import { formatTokens, formatDuration } from "./agentExecutionUtils";
import "components/flow/ReaflowOverrides.scss";

// ─── Tokens ───────────────────────────────────────────────────────────────────
const G = "#40BA56";
const R = "#DD2222";

type Kind = "start" | "llm" | "tool" | "handoff" | "subagent" | "output" | "error" | "next";

// Maps agent kind → TaskType for Conductor card styling
// Operator types (SUB_WORKFLOW, SET_VARIABLE) get dark-teal background
// System types (SIMPLE, LLM_CHAT_COMPLETE) get white background
const KIND_TYPE: Record<Kind, TaskType> = {
  start:    TaskType.SUB_WORKFLOW,
  subagent: TaskType.SUB_WORKFLOW,
  handoff:  TaskType.SET_VARIABLE,
  llm:      TaskType.LLM_CHAT_COMPLETE,
  tool:     TaskType.SIMPLE,
  output:   TaskType.SIMPLE,
  error:    TaskType.SIMPLE,
  next:     TaskType.SIMPLE,
};

const KIND_LABEL: Record<Kind, string> = {
  start:    "AGENT",
  subagent: "AGENT",
  handoff:  "HANDOFF",
  llm:      "LLM CALL",
  tool:     "TOOL",
  output:   "OUTPUT",
  error:    "ERROR",
  next:     "",
};

// Operator kinds use dark background → white text
const OPERATOR_KINDS = new Set<Kind>(["start", "subagent", "handoff"]);

// ─── AgentStatus → TaskStatus ─────────────────────────────────────────────────
function toTS(s?: AgentStatus): TaskStatus {
  if (s === AgentStatus.FAILED)  return TaskStatus.FAILED;
  if (s === AgentStatus.RUNNING) return TaskStatus.IN_PROGRESS;
  if (s === AgentStatus.WAITING) return TaskStatus.SCHEDULED;
  return TaskStatus.COMPLETED;
}

// ─── Node data ────────────────────────────────────────────────────────────────
interface DiagramNodeData {
  kind: Kind;
  label: string;
  sublabel?: string;
  meta?: string;
  ts: TaskStatus;
  event?: AgentEvent;
  subAgentRun?: AgentRunData;
  nextTurn?: number;
}

// ─── Node card ────────────────────────────────────────────────────────────────
function NodeCard({ data, width, height, selected, onSelect, onDrillIn }: {
  data: DiagramNodeData;
  width: number; height: number;
  selected: boolean;
  onSelect: () => void;
  onDrillIn?: (r: AgentRunData) => void;
}) {
  // Next-turn: small dashed circle (same as before)
  if (data.kind === "next") {
    return (
      <div
        onClick={(e) => { e.stopPropagation(); onSelect(); }}
        style={{ width, height, display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        <div style={{
          width: 48, height: 48, borderRadius: "50%",
          border: "1.5px dashed #94a3b8",
          backgroundColor: "#f8fafc",
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          cursor: "pointer",
        }}>
          <span style={{ fontSize: "0.52rem", color: "#94a3b8", lineHeight: 1, textTransform: "uppercase", letterSpacing: "0.05em" }}>Turn</span>
          <span style={{ fontSize: "0.88rem", fontWeight: 700, color: "#475569", lineHeight: 1.15 }}>{data.nextTurn}</span>
        </div>
      </div>
    );
  }

  const type = KIND_TYPE[data.kind];
  const isOperator = OPERATOR_KINDS.has(data.kind);
  const textColor = isOperator ? "white" : (data.ts === TaskStatus.FAILED ? R : "#111111");
  const subColor  = isOperator ? "rgba(255,255,255,0.6)" : "#AAAAAA";

  const base = getCardVariant(type, data.ts, selected) as any;
  const cardStyle: React.CSSProperties = {
    ...base,
    width, height,
    borderRadius: 10,
    cursor: "pointer",
    transition: "box-shadow 250ms",
    transitionDelay: "40ms",
    border: selected ? "1px solid #3388DD" : "1px solid transparent",
  };

  return (
    <div onClick={(e) => { e.stopPropagation(); onSelect(); }} style={cardStyle}>
      <div style={{
        position: "relative",
        padding: "14px 16px",
        width: "100%", height: "100%",
        borderRadius: 10,
        boxSizing: "border-box",
      }}>
        <CardStatusBadge status={data.ts} />

        {/* Kind chip — matches CardLabel exactly: #dddddd bg, black text for system tasks; muted white for operators */}
        <div style={{
          position: "absolute", top: 0, right: 0,
          padding: "4px 8px",
          fontSize: "0.8em",
          background: isOperator ? "rgba(255,255,255,0.15)" : "#dddddd",
          color: isOperator ? "rgba(255,255,255,0.8)" : "black",
          borderRadius: "5px",
        }}>
          {KIND_LABEL[data.kind]}
        </div>

        {/* Main label — inherits Lexend from MUI theme */}
        <div style={{
          fontWeight: 600, fontSize: "0.875rem", lineHeight: 1.3,
          color: textColor,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          display: "block",
        }}>
          {data.label}
        </div>

        {/* Secondary line (model / token counts / reference) */}
        {data.meta && (
          <div style={{ fontSize: "0.75rem", color: subColor, lineHeight: 1.3, marginTop: 2 }}>
            {data.meta}
          </div>
        )}

        {/* Sublabel (input snippet / output snippet) */}
        {data.sublabel && (
          <div style={{
            fontSize: "0.75rem", color: subColor,
            lineHeight: 1.3, marginTop: 1,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {data.sublabel}
          </div>
        )}

        {/* Sub-agent drill-in */}
        {data.kind === "subagent" && data.subAgentRun && (
          <div
            onClick={(e) => { e.stopPropagation(); onDrillIn?.(data.subAgentRun!); }}
            style={{
              display: "inline-flex", alignItems: "center", gap: 2,
              marginTop: 5, padding: "2px 7px",
              borderRadius: 3, backgroundColor: "rgba(255,255,255,0.18)",
              cursor: "pointer", width: "fit-content",
              fontSize: "0.75rem", fontWeight: 600, color: "rgba(255,255,255,0.9)",
            }}
          >
            View execution <ArrowRight size={9} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Reaflow node wrapper ─────────────────────────────────────────────────────
const DiagramNode = (nodeProps: any) => {
  const { selectedId, onSelect, properties } = nodeProps;
  const data: DiagramNodeData = properties?.data;
  return (
    <Node {...nodeProps} onClick={() => null} label={<></>} style={{ stroke: "none", fill: "none" }}>
      {(ev: any) => (
        <g>
          <foreignObject width={ev.width} height={ev.height} style={{ overflow: "visible" }}>
            <NodeCard
              data={data}
              width={ev.width} height={ev.height}
              selected={selectedId === properties?.id}
              onSelect={() => onSelect(properties?.id)}
              onDrillIn={data?.subAgentRun ? (r) => onSelect(`sub-${r.id}`) : undefined}
            />
          </foreignObject>
        </g>
      )}
    </Node>
  );
};

// ─── Build diagram nodes/edges ────────────────────────────────────────────────
const W = 260, H = 76, HS = 56, HSUB = 100;

function buildDiagram(agentRun: AgentRunData, activeTurnNum: number) {
  const nodes: NodeData<DiagramNodeData>[] = [];
  const edges: EdgeData[] = [];
  const done = new Set<string>();
  let prev = "start";

  const push = (id: string, data: DiagramNodeData, h = H) => {
    nodes.push({ id, width: W, height: h, data });
    edges.push({ id: `${prev}→${id}`, from: prev, to: id });
    if (data.ts === TaskStatus.COMPLETED) done.add(id);
    prev = id;
  };

  const allTurns = agentRun.turns;
  const turn = allTurns.find(t => t.turnNumber === activeTurnNum) ?? allTurns[0];
  const nextTurn = allTurns.find(t => t.turnNumber > (turn?.turnNumber ?? 0));

  nodes.push({ id: "start", width: W, height: HS, data: {
    kind: "start", label: agentRun.agentName,
    sublabel: agentRun.input?.slice(0, 55),
    meta: agentRun.model, ts: toTS(agentRun.status),
  }});
  if (agentRun.status === AgentStatus.COMPLETED) done.add("start");

  if (turn) {
    for (const ev of turn.events) {
      switch (ev.type) {
        case EventType.THINKING: {
          const tok = ev.tokens;
          push(ev.id, {
            kind: "llm", label: "LLM",
            sublabel: ev.toolName,
            meta: tok ? `${formatTokens(tok.promptTokens)}↑  ${formatTokens(tok.completionTokens)}↓` : undefined,
            ts: ev.success === false ? TaskStatus.FAILED : TaskStatus.COMPLETED, event: ev,
          }); break;
        }
        case EventType.TOOL_CALL: {
          const out = ev.result ? JSON.stringify(ev.result).replace(/[{}"]/g, "").slice(0, 55) : undefined;
          push(ev.id, {
            kind: "tool", label: ev.toolName ?? "tool",
            sublabel: out, meta: ev.durationMs ? formatDuration(ev.durationMs) : undefined,
            ts: ev.success === false ? TaskStatus.FAILED : TaskStatus.COMPLETED, event: ev,
          }); break;
        }
        case EventType.HANDOFF:
          push(ev.id, {
            kind: "handoff", label: ev.targetAgent ?? ev.summary.replace(/^→\s*/, ""),
            ts: TaskStatus.COMPLETED, event: ev,
          }, HS); break;
        case EventType.DONE: {
          const txt = typeof ev.detail === "string" ? ev.detail : undefined;
          push(ev.id, {
            kind: "output", label: "output",
            sublabel: txt?.slice(0, 70) + (txt && txt.length > 70 ? "…" : ""),
            ts: TaskStatus.COMPLETED, event: ev,
          }); break;
        }
        case EventType.ERROR:
          push(ev.id, {
            kind: "error", label: "error", sublabel: ev.summary,
            ts: TaskStatus.FAILED, event: ev,
          }, HS); break;
        default: break;
      }
    }
    for (const sub of turn.subAgents) {
      const id = `sub-${sub.id}`;
      const h = sub.model && sub.output ? HSUB : sub.model || sub.output ? H : HS;
      push(id, {
        kind: "subagent", label: sub.agentName,
        meta: sub.model,
        sublabel: sub.output?.slice(0, 55) ?? sub.failureReason?.slice(0, 55),
        ts: toTS(sub.status), subAgentRun: sub,
      }, h);
    }
  }

  if (nextTurn) {
    const ntId = `next-${nextTurn.turnNumber}`;
    nodes.push({ id: ntId, width: 56, height: 56, data: {
      kind: "next", label: String(nextTurn.turnNumber),
      nextTurn: nextTurn.turnNumber, ts: toTS(nextTurn.status),
    }});
    edges.push({ id: `${prev}→${ntId}`, from: prev, to: ntId });
  }

  return { nodes, edges, done };
}

// ─── Main component ───────────────────────────────────────────────────────────
interface AgentExecutionDiagramProps {
  agentRun: AgentRunData;
  activeTurn: number;
  onSelectTurn: (n: number) => void;
  selectedId: string | null;
  onNodeSelect: (id: string | null, node: DetailNodeData | null) => void;
}

export function AgentExecutionDiagram({ agentRun, activeTurn, onSelectTurn, selectedId, onNodeSelect }: AgentExecutionDiagramProps) {
  const { nodes, edges, done } = buildDiagram(agentRun, activeTurn);

  const handle = (id: string) => {
    const nd = nodes.find(n => n.id === id)?.data;
    if (nd?.kind === "next" && nd.nextTurn) { onSelectTurn(nd.nextTurn); return; }
    if (id === selectedId || nd?.kind === "start") { onNodeSelect(null, null); return; }
    if (!nd) { onNodeSelect(null, null); return; }
    onNodeSelect(id, {
      kind: nd.kind as any, label: nd.label,
      status: nd.ts === TaskStatus.COMPLETED ? AgentStatus.COMPLETED
            : nd.ts === TaskStatus.FAILED    ? AgentStatus.FAILED
            : AgentStatus.RUNNING,
      event: nd.event, subAgentRun: nd.subAgentRun,
    });
  };

  return (
    <Box sx={{
      height: "100%",
      backgroundImage: "url('/diagramDotBg.svg')",
      backgroundColor: "#fff",
    }}
      onClick={() => onNodeSelect(null, null)}
    >
      <Canvas
        nodes={nodes} edges={edges}
        fit zoomable pannable
        maxZoom={2.5} minZoom={0.15}
        direction="DOWN"
        layoutOptions={{
          "org.eclipse.elk.spacing.nodeNode": "20",
          "elk.layered.spacing.nodeNodeBetweenLayers": "28",
          "org.eclipse.elk.padding": "[top=40,left=80,bottom=40,right=80]",
        }}
        node={<DiagramNode selectedId={selectedId} onSelect={handle} />}
        edge={(ed: EdgeData) => (
          <Edge {...ed} style={{
            stroke: done.has(ed.from ?? "") ? G : "#cbd5e1",
            strokeWidth: done.has(ed.from ?? "") ? 1.5 : 1,
          }} />
        )}
      />
    </Box>
  );
}

export default AgentExecutionDiagram;
