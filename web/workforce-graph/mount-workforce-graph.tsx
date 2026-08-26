import "@xyflow/react/dist/style.css";
import "./workforce-graph.css";

import dagre from "@dagrejs/dagre";
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  getSmoothStepPath,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { StrictMode, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import type { CompanyWorkState } from "../../application/company-operations.ts";
import type { OrganizationDraft } from "../../core/organization.ts";

type GraphMode = "task" | "organization";
type NodeKind = "company" | "department" | "human" | "agent" | "trigger" | "approval" | "evidence" | "result";
type NodeState = "idle" | "working" | "approval" | "complete";

interface WorkforceNodeData extends Record<string, unknown> {
  readonly kind: NodeKind;
  readonly title: string;
  readonly eyebrow: string;
  readonly detail: string;
  readonly status: string;
  readonly state: NodeState;
  readonly avatar?: string;
}

type WorkforceNode = Node<WorkforceNodeData, "workforce">;
type WorkforceEdge = Edge<{ readonly label: string }, "responsibility">;

const NODE_WIDTH = 236;
const NODE_HEIGHT = 82;

const avatarPaths = [
  new URL("../assets/fish/raft-fish-fizz.png", import.meta.url).href,
  new URL("../assets/fish/raft-fish-bumble.png", import.meta.url).href,
  new URL("../assets/fish/raft-fish-honey.png", import.meta.url).href,
] as const;
const humanAvatar = new URL(
  "../assets/characters/humans/terracotta-short-hair.png",
  import.meta.url,
).href;

function phaseState(phase: CompanyWorkState["phase"]): NodeState {
  if (phase === "AWAITING_APPROVAL") return "approval";
  if (phase === "COMPLETED") return "complete";
  if (["PLANNING", "SIMULATING_TOOL_ACTIVITY"].includes(phase)) return "working";
  return "idle";
}

function layoutNodes(nodes: readonly WorkforceNode[], edges: readonly WorkforceEdge[]): WorkforceNode[] {
  const graph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: "TB", ranksep: 38, nodesep: 42, marginx: 32, marginy: 32 });
  for (const node of nodes) graph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  for (const edge of edges) graph.setEdge(edge.source, edge.target);
  dagre.layout(graph);
  return nodes.map((node) => {
    const point = graph.node(node.id) as { readonly x: number; readonly y: number };
    return {
      ...node,
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
      position: { x: point.x - NODE_WIDTH / 2, y: point.y - NODE_HEIGHT / 2 },
    };
  });
}

function GraphNode({ data, selected }: NodeProps<WorkforceNode>) {
  return (
    <article
      className={`workforce-node workforce-node--${data.kind} workforce-node--${data.state}`}
      aria-label={`${data.title}，${data.status}`}
      data-selected={selected ? "true" : "false"}
    >
      <Handle type="target" position={Position.Left} className="workforce-handle" />
      <div className="workforce-node-avatar" data-kind={data.kind}>
        {data.avatar ? <img src={data.avatar} alt="" /> : <span aria-hidden="true">{nodeSymbol(data.kind)}</span>}
      </div>
      <div className="workforce-node-copy">
        <small>{data.eyebrow}</small>
        <strong>{data.title}</strong>
        <span>{data.detail}</span>
      </div>
      <span className="workforce-node-status" data-state={data.state}>{data.status}</span>
      <Handle type="source" position={Position.Right} className="workforce-handle" />
    </article>
  );
}

function nodeSymbol(kind: NodeKind): string {
  const symbols: Record<NodeKind, string> = {
    company: "C",
    department: "部",
    human: "人",
    agent: "A",
    trigger: "↗",
    approval: "✓",
    evidence: "◇",
    result: "●",
  };
  return symbols[kind];
}

function ResponsibilityEdge(props: EdgeProps<WorkforceEdge>) {
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
    borderRadius: 12,
  });
  return (
    <>
      <BaseEdge
        path={path}
        markerEnd={props.markerEnd}
        className={props.animated ? "workforce-edge workforce-edge--active" : "workforce-edge"}
      />
      {props.data?.label ? (
        <EdgeLabelRenderer>
          <span className="workforce-edge-label" style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}>
            {props.data.label}
          </span>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

function makeTaskGraph(organization: OrganizationDraft, state: CompanyWorkState) {
  const human = organization.humans[0];
  const agents = organization.agents.slice(0, 3);
  const activeState = phaseState(state.phase);
  const nodes: WorkforceNode[] = [
    {
      id: "goal",
      type: "workforce",
      position: { x: 0, y: 0 },
      data: { kind: "trigger", eyebrow: "工作目标", title: "准备季度客户简报", detail: "由真人提出并绑定责任", status: "已提出", state: "idle" },
    },
    {
      id: "human",
      type: "workforce",
      position: { x: 0, y: 0 },
      data: { kind: "human", eyebrow: "ACCOUNTABLE HUMAN", title: human?.name ?? "林澄", detail: human?.title ?? "Agent Boss", status: "负责人", state: "idle", avatar: humanAvatar },
    },
    ...agents.map<WorkforceNode>((agent, index) => ({
      id: agent.id,
      type: "workforce",
      position: { x: 0, y: 0 },
      data: {
        kind: "agent",
        eyebrow: index === 0 ? "EXECUTING AGENT" : "COLLABORATING AGENT",
        title: agent.name,
        detail: agent.role,
        status: index === 0 ? stateLabel(state.phase) : "待命",
        state: index === 0 ? activeState : "idle",
        avatar: avatarPaths[index % avatarPaths.length],
      },
    })),
    {
      id: "approval",
      type: "workforce",
      position: { x: 0, y: 0 },
      data: { kind: "approval", eyebrow: "HIGH-RISK ACTION", title: "发布客户简报", detail: "精确绑定本次动作与摘要", status: state.phase === "AWAITING_APPROVAL" ? "需要批准" : "受控", state: state.phase === "AWAITING_APPROVAL" ? "approval" : "idle" },
    },
    {
      id: "evidence",
      type: "workforce",
      position: { x: 0, y: 0 },
      data: { kind: "evidence", eyebrow: "EVIDENCE", title: `${state.responsibility.evidenceIds.length} 项运行证据`, detail: "计划、活动、审批与结果", status: state.responsibility.evidenceIds.length ? "已记录" : "收集中", state: state.responsibility.evidenceIds.length ? "complete" : "idle" },
    },
    {
      id: "result",
      type: "workforce",
      position: { x: 0, y: 0 },
      data: { kind: "result", eyebrow: "RESULT", title: state.responsibility.resultId ? "结果已归档" : "等待可验证结果", detail: "责任链可追溯", status: state.responsibility.resultId ? "完成" : "等待", state: state.responsibility.resultId ? "complete" : "idle" },
    },
  ];
  const primaryAgentId = agents[0]?.id ?? "missing-agent";
  const edges: WorkforceEdge[] = [
    edge("goal-human", "goal", "human", "提出并负责"),
    edge("human-agent", "human", primaryAgentId, "授权执行", activeState === "working"),
    ...agents.slice(1).map((agent, index) => edge(`agent-${index}`, primaryAgentId, agent.id, "协作")),
    edge("agent-approval", primaryAgentId, "approval", "高风险暂停", state.phase === "AWAITING_APPROVAL"),
    edge("approval-evidence", "approval", "evidence", "决定与证明"),
    edge("evidence-result", "evidence", "result", "形成结果", state.phase === "COMPLETED"),
  ];
  return { nodes: layoutNodes(nodes, edges), edges };
}

function makeOrganizationGraph(organization: OrganizationDraft) {
  const nodes: WorkforceNode[] = [
    {
      id: organization.company.id,
      type: "workforce",
      position: { x: 0, y: 0 },
      data: {
        kind: "company",
        eyebrow: "COMPANY",
        title: organization.company.name,
        detail: organization.company.purpose || "公司使命与治理边界",
        status: "组织根节点",
        state: "idle",
      },
    },
    ...organization.departments.map<WorkforceNode>((department) => ({
      id: department.id,
      type: "workforce",
      position: { x: 0, y: 0 },
      data: {
        kind: "department",
        eyebrow: "DEPARTMENT",
        title: department.name,
        detail: department.mandate || "部门职责",
        status: "部门",
        state: "idle",
      },
    })),
    ...organization.humans.map<WorkforceNode>((human) => ({
      id: human.id,
      type: "workforce",
      position: { x: 0, y: 0 },
      data: {
        kind: "human",
        eyebrow: "ACCOUNTABLE HUMAN",
        title: human.name,
        detail: human.title,
        status: "真人负责人",
        state: "idle",
        avatar: humanAvatar,
      },
    })),
    ...organization.agents.map<WorkforceNode>((agent, index) => ({
      id: agent.id,
      type: "workforce",
      position: { x: 0, y: 0 },
      data: {
        kind: "agent",
        eyebrow: `AGENT POSITION · L${agent.autonomyLevel}`,
        title: agent.name,
        detail: agent.role,
        status: "向真人汇报",
        state: "idle",
        avatar: avatarPaths[index % avatarPaths.length],
      },
    })),
  ];
  const edges: WorkforceEdge[] = [
    ...organization.departments.map((department) => edge(
      `company-${department.id}`,
      organization.company.id,
      department.id,
      "组织包含",
    )),
    ...organization.humans.map((human) => edge(
      `department-${human.id}`,
      human.departmentId,
      human.id,
      "岗位负责",
    )),
    ...organization.agents.map((agent) => edge(
      `human-${agent.id}`,
      agent.accountableHumanId,
      agent.id,
      "管理与担责",
    )),
  ];
  return { nodes: layoutNodes(nodes, edges), edges };
}

function edge(id: string, source: string, target: string, label: string, animated = false): WorkforceEdge {
  return { id, source, target, type: "responsibility", data: { label }, animated, markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: "#989ba6" } };
}

function stateLabel(phase: CompanyWorkState["phase"]): string {
  const labels: Record<CompanyWorkState["phase"], string> = {
    READY: "待命",
    PLANNING: "规划中",
    SIMULATING_TOOL_ACTIVITY: "执行中",
    AWAITING_APPROVAL: "已暂停",
    COMPLETED: "已完成",
    REJECTED: "已拒绝",
  };
  return labels[phase];
}

function WorkforceGraph({ organization, state }: { readonly organization: OrganizationDraft; readonly state: CompanyWorkState }) {
  const [mode, setMode] = useState<GraphMode>("task");
  const graph = useMemo(
    () => mode === "task" ? makeTaskGraph(organization, state) : makeOrganizationGraph(organization),
    [mode, organization, state],
  );
  const [selected, setSelected] = useState<WorkforceNodeData | null>(null);
  const compactViewport = window.matchMedia("(max-width: 760px)").matches;
  return (
    <div className="workforce-graph-shell">
      <div className="workforce-graph-toolbar">
        <div><span className="workforce-live-dot" /> <strong>{mode === "task" ? "任务责任网络" : "公司组织架构"}</strong><small>确定性演示 · 非真实 Agent</small></div>
        <div className="workforce-graph-modes" role="group" aria-label="画布制度">
          <button type="button" aria-pressed={mode === "task"} onClick={() => { setSelected(null); setMode("task"); }}>任务责任链</button>
          <button type="button" aria-pressed={mode === "organization"} onClick={() => { setSelected(null); setMode("organization"); }}>组织架构</button>
        </div>
      </div>
      <ReactFlow<WorkforceNode, WorkforceEdge>
        nodes={graph.nodes}
        edges={graph.edges}
        nodeTypes={{ workforce: GraphNode }}
        edgeTypes={{ responsibility: ResponsibilityEdge }}
        onNodeClick={(_, node) => setSelected(node.data)}
        onPaneClick={() => setSelected(null)}
        fitView
        fitViewOptions={{ padding: 0.2, minZoom: compactViewport ? 0.72 : 0.58, maxZoom: 0.94 }}
        minZoom={compactViewport ? 0.72 : 0.58}
        maxZoom={1.6}
        nodesDraggable
        nodesConnectable={false}
        panOnScroll
        selectionOnDrag={false}
        aria-label={mode === "task" ? "Company OS 真人与 Agent 责任关系画布" : "Company OS 公司组织架构画布"}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1.25} color="#d9d9e2" />
        <Controls showInteractive={false} position="bottom-left" />
      </ReactFlow>
      {selected ? (
        <aside className="workforce-detail" aria-label={`${selected.title} 详情`}>
          <button type="button" onClick={() => setSelected(null)} aria-label="关闭详情">×</button>
          <p>{selected.eyebrow}</p>
          <h3>{selected.title}</h3>
          <span className="workforce-detail-status" data-state={selected.state}>{selected.status}</span>
          <dl>
            <div><dt>角色</dt><dd>{selected.detail}</dd></div>
            <div><dt>责任状态</dt><dd>{selected.status}</dd></div>
            <div><dt>运行模式</dt><dd>确定性演示 fixture</dd></div>
          </dl>
        </aside>
      ) : null}
    </div>
  );
}

export function mountWorkforceGraph(element: HTMLElement, organization: OrganizationDraft, state: CompanyWorkState): () => void {
  const root = createRoot(element);
  root.render(
    <StrictMode><ReactFlowProvider><WorkforceGraph organization={organization} state={state} /></ReactFlowProvider></StrictMode>,
  );
  return () => root.unmount();
}
