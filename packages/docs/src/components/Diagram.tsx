/**
 * SVG node/edge diagrams laid out with dagre (not mermaid — real SVG we
 * control, themed with the docs, and reusable as data).
 *
 * Usage from MDX:
 *   <Diagram
 *     direction="LR"
 *     nodes={[{ id: 'a', label: 'Component', kind: 'component' }, ...]}
 *     edges={[{ from: 'a', to: 'b', label: 'reads' }, ...]}
 *     caption="What connects to what"
 *   />
 */
import dagre from '@dagrejs/dagre';
import { For, Show } from 'solid-js';
import { viewRoot } from 'wheel/core';

export interface DiagramNode {
  id: string;
  label: string;
  /** Second, smaller line inside the node. */
  sub?: string;
  kind?: 'component' | 'service' | 'state' | 'client' | 'server' | 'store' | 'tool';
}

export interface DiagramEdge {
  from: string;
  to: string;
  label?: string;
  /** Dashed = planned/optional path. */
  dashed?: boolean;
}

/*
 * THE FIGURE PALETTE — every color in this component lives in this one block.
 *
 * These are baked on purpose and the linter is told so line by line. A diagram
 * needs seven CATEGORICAL hues (indigo, violet, emerald, teal, orange, slate,
 * yellow) that stay mutually distinguishable at a glance; no semantic token
 * family says "seven things that must not be confused with each other", and a
 * figure that re-hued itself between light and dark would stop matching the
 * prose describing it. Colors that DO follow the theme belong in
 * `packages/docs/src/theme.css`, not here.
 */
const COLORS: Record<NonNullable<DiagramNode['kind']>, { fill: string; stroke: string; text: string }> = {
  // wheel-color: categorical figure hue, one per node kind — see the palette note above
  component: { fill: '#eef2ff', stroke: '#6366f1', text: '#3730a3' },
  // wheel-color: categorical figure hue, one per node kind — see the palette note above
  service: { fill: '#f5f3ff', stroke: '#8b5cf6', text: '#5b21b6' },
  // wheel-color: categorical figure hue, one per node kind — see the palette note above
  state: { fill: '#ecfdf5', stroke: '#10b981', text: '#065f46' },
  // wheel-color: categorical figure hue, one per node kind — see the palette note above
  client: { fill: '#f0fdfa', stroke: '#14b8a6', text: '#115e59' },
  // wheel-color: categorical figure hue, one per node kind — see the palette note above
  server: { fill: '#fff7ed', stroke: '#f97316', text: '#9a3412' },
  // wheel-color: categorical figure hue, one per node kind — see the palette note above
  store: { fill: '#f8fafc', stroke: '#94a3b8', text: '#334155' },
  // wheel-color: categorical figure hue, one per node kind — see the palette note above
  tool: { fill: '#fefce8', stroke: '#eab308', text: '#854d0e' }
};

/**
 * Edge ink, baked with the fills above. SVG presentation attributes
 * (`fill=`, `stroke=`) do not resolve `var()` reliably across browsers, so
 * these have to be literals wherever the attribute form is used.
 */
const EDGE = {
  // wheel-color: figure ink — connector lines and arrowheads, baked with the node fills
  line: '#94a3b8',
  // wheel-color: figure ink — edge labels, one step darker so they read over the lines
  label: '#64748b'
};

const NODE_H = 46;
const CHAR_W = 7.2;

export function Diagram(props: {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  direction?: 'LR' | 'TB';
  caption?: string;
}) {
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({
    rankdir: props.direction ?? 'LR',
    nodesep: 28,
    ranksep: 48,
    marginx: 12,
    marginy: 12
  });
  graph.setDefaultEdgeLabel(() => ({}));

  for (const node of props.nodes) {
    const textWidth = Math.max(node.label.length, (node.sub?.length ?? 0) * 0.82) * CHAR_W;
    graph.setNode(node.id, {
      width: Math.max(96, textWidth + 28),
      height: node.sub ? NODE_H + 14 : NODE_H,
      data: node
    });
  }
  for (const edge of props.edges) {
    graph.setEdge(edge.from, edge.to, { data: edge });
  }
  dagre.layout(graph);

  const layout = graph.graph() as { width?: number; height?: number };
  const width = Math.ceil(layout.width ?? 600);
  const height = Math.ceil(layout.height ?? 300);

  const placedNodes = graph.nodes().map((id) => {
    const placed = graph.node(id) as dagre.Node & { data: DiagramNode };
    return placed;
  });
  const placedEdges = graph.edges().map((ref) => {
    const placed = graph.edge(ref) as { points: Array<{ x: number; y: number }>; data: DiagramEdge };
    return placed;
  });

  const path = (points: Array<{ x: number; y: number }>): string => {
    const [first, ...rest] = points;
    return `M ${first.x} ${first.y} ` + rest.map((p) => `L ${p.x} ${p.y}`).join(' ');
  };

  const midpoint = (points: Array<{ x: number; y: number }>) => points[Math.floor(points.length / 2)];

  return (
    <figure use:viewRoot={{ name: 'Diagram', props }} class="diagram">
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={EDGE.line} />
          </marker>
        </defs>
        <For each={placedEdges}>
          {(edge) => (
            <g>
              <path
                d={path(edge.points)}
                fill="none"
                stroke={EDGE.line}
                stroke-width="1.5"
                stroke-dasharray={edge.data.dashed ? '5 4' : undefined}
                marker-end="url(#arrow)"
              />
              <Show when={edge.data.label}>
                <text
                  x={midpoint(edge.points).x}
                  y={midpoint(edge.points).y - 6}
                  text-anchor="middle"
                  font-size="11"
                  fill={EDGE.label}
                  style="paint-order: stroke; stroke: white; stroke-width: 3px;"
                >
                  {edge.data.label}
                </text>
              </Show>
            </g>
          )}
        </For>
        <For each={placedNodes}>
          {(node) => {
            const colors = COLORS[node.data.kind ?? 'store'];
            return (
              <g>
                <rect
                  x={node.x - node.width / 2}
                  y={node.y - node.height / 2}
                  width={node.width}
                  height={node.height}
                  rx="8"
                  fill={colors.fill}
                  stroke={colors.stroke}
                  stroke-width="1.5"
                />
                <text
                  x={node.x}
                  y={node.data.sub ? node.y - 4 : node.y + 4}
                  text-anchor="middle"
                  font-size="13"
                  font-weight="600"
                  fill={colors.text}
                >
                  {node.data.label}
                </text>
                <Show when={node.data.sub}>
                  <text x={node.x} y={node.y + 14} text-anchor="middle" font-size="10.5" fill={colors.text} opacity="0.75">
                    {node.data.sub}
                  </text>
                </Show>
              </g>
            );
          }}
        </For>
      </svg>
      <Show when={props.caption}>
        <figcaption class="diagram-caption">{props.caption}</figcaption>
      </Show>
    </figure>
  );
}
