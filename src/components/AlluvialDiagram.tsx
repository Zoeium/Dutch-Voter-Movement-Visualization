import {memo, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {DiagramNode, DiagramLink} from '@/types';
import {RibbonGradient} from './shared';
import {buildGradientId, buildRibbonPath, formatNumber, sumFlowValues} from './diagramUtils';
import {useI18n} from '@/theme';

export type SortMode = 'votes' | 'alphabetical';

interface AlluvialDiagramProps {
  nodes: DiagramNode[];
  links: DiagramLink[];
  /** One label per column. */
  electionLabels: string[];
  selectedParty: string | null;
  sortMode?: SortMode;
}

interface PositionedNode extends DiagramNode {
  x: number;
  y: number;
  width: number;
  nodeHeight: number;
  requiredValue?: number;
}

interface PositionedRibbon {
  source: PositionedNode;
  target: PositionedNode;
  sourceYTop: number;
  targetYTop: number;
  targetYBot: number;
  value: number;
  color: string;
  path: string;
}

const NODE_WIDTH = 16;
const NODE_GAP = 6;
const MIN_NODE_HEIGHT = 3;
const CHART_PADDING_TOP = 36;
const CHART_PADDING_BOTTOM = 20;
const LABEL_SPACE = 130;
const DIAGRAM_HEIGHT = 620;
const DEFAULT_CONTAINER_WIDTH = 1200;

/** Build a stable React key for a positioned ribbon. */
function getRibbonKey(ribbon: PositionedRibbon): string {
  return `${ribbon.source.id}-${ribbon.target.id}-${ribbon.value}`;
}

/** Calculate the horizontal distance between diagram columns. */
function getColumnSpacing(numColumns: number, svgWidth: number): number {
  const chartAreaWidth = svgWidth - LABEL_SPACE * 2;
  return numColumns > 1 ? chartAreaWidth / (numColumns - 1) : 0;
}

/** Sort one column while keeping selected and synthetic nodes prominent. */
function sortNodesInColumn(
  column: PositionedNode[],
  selectedParty: string | null,
  sortMode: SortMode
): PositionedNode[] {
  return [...column].sort((a, b) => {
    if (selectedParty) {
      const aMatch = a.party === selectedParty;
      const bMatch = b.party === selectedParty;
      if (aMatch && !bMatch) return -1;
      if (bMatch && !aMatch) return 1;
    }
    if (a.party === 'not_voted') return 1;
    if (b.party === 'not_voted') return -1;
    if (a.party === 'other') return 1;
    if (b.party === 'other') return -1;
    if (sortMode === 'alphabetical') {
      return a.label.localeCompare(b.label);
    }
    return b.value - a.value;
  });
}

/** Group links by their source or target node identifier. */
function buildLinkGroups(links: DiagramLink[], key: 'source' | 'target'): Map<string, DiagramLink[]> {
  const groups = new Map<string, DiagramLink[]>();
  for (const link of links) {
    const group = groups.get(link[key]);
    if (group) group.push(link);
    else groups.set(link[key], [link]);
  }
  return groups;
}

/** Sort each link group by the vertical position of the node at its `by` end. */
function sortGroupsByNodeY(
  groups: Map<string, DiagramLink[]>,
  nodeMap: Map<string, PositionedNode>,
  by: 'source' | 'target'
): void {
  for (const group of groups.values()) {
    group.sort((a, b) => {
      const first = nodeMap.get(a[by]);
      const second = nodeMap.get(b[by]);
      if (!first || !second) return 0;
      return first.y - second.y;
    });
  }
}

/** Assign scaled SVG coordinates and heights to every diagram node. */
function positionNodes(
  columns: PositionedNode[][],
  scale: number,
  svgWidth: number,
  selectedParty: string | null,
  sortMode: SortMode
): PositionedNode[] {
  const spacing = getColumnSpacing(columns.length, svgWidth);
  return columns.flatMap((column, columnIndex) => {
    let yOffset = CHART_PADDING_TOP;
    return sortNodesInColumn(column, selectedParty, sortMode).map((node) => {
      // The height covers the node's own votes and every flow in or out of it.
      const nodeHeight = Math.max(MIN_NODE_HEIGHT, (node.requiredValue ?? node.value) * scale);
      const positionedNode = {...node, y: yOffset, x: LABEL_SPACE + columnIndex * spacing, width: NODE_WIDTH, nodeHeight};
      yOffset += nodeHeight + NODE_GAP;
      return positionedNode;
    });
  });
}

/**
 * Seed the per-node `id -> y` offset map. Used as the starting cursor for both the
 * incoming (target) and outgoing (source) accumulators so the two cannot drift.
 */
function buildNodeOffsets(allNodesFlat: PositionedNode[]): Map<string, number> {
  return new Map(allNodesFlat.map((node) => [node.id, node.y]));
}

type Span = { top: number; bot: number };

/** Compute the target-side vertical span allocated to each link, keyed `source->target`. */
function buildTargetOffsets(
  allNodesFlat: PositionedNode[],
  incomingByTarget: Map<string, DiagramLink[]>,
  scale: number
): Map<string, Span> {
  const targetOffsets = buildNodeOffsets(allNodesFlat);
  const linkTargetOffsets = new Map<string, Span>();

  for (const node of allNodesFlat) {
    for (const link of incomingByTarget.get(node.id) ?? []) {
      const top = targetOffsets.get(link.target);
      if (top === undefined) continue;
      const bot = top + link.value * scale;
      targetOffsets.set(link.target, bot);
      linkTargetOffsets.set(`${link.source}->${link.target}`, {top, bot});
    }
  }

  return linkTargetOffsets;
}

/** Convert links between positioned nodes into drawable ribbon geometry. */
function buildRibbons(
  nodeMap: Map<string, PositionedNode>,
  outgoingBySource: Map<string, DiagramLink[]>,
  incomingByTarget: Map<string, DiagramLink[]>,
  scale: number,
  allNodesFlat: PositionedNode[]
): PositionedRibbon[] {
  const sourceOffsets = buildNodeOffsets(allNodesFlat);
  const linkTargetOffsets = buildTargetOffsets(allNodesFlat, incomingByTarget, scale);
  const ribbons: PositionedRibbon[] = [];

  for (const node of allNodesFlat) {
    for (const link of outgoingBySource.get(node.id) ?? []) {
      const source = nodeMap.get(link.source);
      const target = nodeMap.get(link.target);
      const targetInfo = linkTargetOffsets.get(`${link.source}->${link.target}`);
      const sourceYTop = sourceOffsets.get(link.source);
      if (!source || !target || !targetInfo || sourceYTop === undefined) continue;

      const sourceYBot = sourceYTop + link.value * scale;
      sourceOffsets.set(link.source, sourceYBot);

      ribbons.push({
        source,
        target,
        sourceYTop,
        targetYTop: targetInfo.top,
        targetYBot: targetInfo.bot,
        value: link.value,
        color: link.color,
        path: buildRibbonPath(source.x + source.width, sourceYTop, sourceYBot, target.x, targetInfo.top, targetInfo.bot),
      });
    }
  }

  return ribbons.sort((a, b) => b.value - a.value);
}

/** Derive responsive node and ribbon geometry for the alluvial diagram. */
function computeDiagramLayout(
  nodes: DiagramNode[],
  links: DiagramLink[],
  numColumns: number,
  selectedParty: string | null,
  sortMode: SortMode,
  containerWidth: number
): {
  positionedNodes: PositionedNode[];
  positionedRibbons: PositionedRibbon[];
  svgWidth: number;
  contentHeight: number
} {
  const availableWidth = Math.max(containerWidth, 600);
  const columns: PositionedNode[][] = Array.from({length: numColumns}, () => []);

  // A node is drawn tall enough for its own votes and for every flow in or out of it.
  const {outgoing, incoming} = sumFlowValues(links);

  for (const node of nodes) {
    const requiredValue = Math.max(node.value, outgoing[node.id] ?? 0, incoming[node.id] ?? 0);
    columns[node.columnIndex]?.push({...node, x: 0, y: 0, width: NODE_WIDTH, nodeHeight: 0, requiredValue});
  }

  const maxColumnTotal = Math.max(
    0,
    ...columns.map((column) => column.reduce((sum, node) => sum + (node.requiredValue ?? node.value), 0))
  );
  const availableHeight = DIAGRAM_HEIGHT - CHART_PADDING_TOP - CHART_PADDING_BOTTOM;
  const scale = maxColumnTotal > 0 ? availableHeight / maxColumnTotal : 1;
  const positionedNodes = positionNodes(columns, scale, availableWidth, selectedParty, sortMode);
  const nodeMap = new Map(positionedNodes.map((node) => [node.id, node]));

  const outgoingBySource = buildLinkGroups(links, 'source');
  const incomingByTarget = buildLinkGroups(links, 'target');
  sortGroupsByNodeY(outgoingBySource, nodeMap, 'target');
  sortGroupsByNodeY(incomingByTarget, nodeMap, 'source');

  const positionedRibbons = buildRibbons(nodeMap, outgoingBySource, incomingByTarget, scale, positionedNodes);
  const maxBottom = Math.max(0, ...positionedNodes.map((node) => node.y + node.nodeHeight));

  return {
    positionedNodes,
    positionedRibbons,
    svgWidth: availableWidth,
    contentHeight: Math.ceil(maxBottom + CHART_PADDING_BOTTOM),
  };
}

interface DiagramLabelProps {
  label: string;
  x: number;
}

/** Render a year label above an alluvial column. */
function DiagramLabel({label, x}: Readonly<DiagramLabelProps>) {
  return (
    <text
      x={x}
      y={22}
      textAnchor="middle"
      className="fill-app-muted text-sm font-semibold"
    >
      {label}
    </text>
  );
}

interface DiagramRibbonProps {
  ribbon: PositionedRibbon;
  active: boolean;
  isHovered: boolean;
  gradientId?: string;
  onHover: (ribbon: PositionedRibbon) => void;
  onLeave: () => void;
}

const DiagramRibbon = memo(/** Render one interactive flow ribbon. */ function DiagramRibbon({
  ribbon,
  active,
  isHovered,
  gradientId,
  onHover,
  onLeave,
}: Readonly<DiagramRibbonProps>) {
  let fillOpacity = 0.06;
  if (active) {
    fillOpacity = isHovered ? 0.7 : 0.35;
  }

  const fill = gradientId ? `url(#${gradientId})` : ribbon.color;

  return (
    <path
      d={ribbon.path}
      fill={fill}
      fillOpacity={fillOpacity}
      stroke="none"
      style={{transition: 'fill-opacity 0.2s ease', cursor: 'pointer'}}
      onMouseEnter={() => onHover(ribbon)}
      onMouseLeave={onLeave}
    />
  );
});

interface DiagramTooltipProps {
  centerX: number;
  y: number;
  width: number;
  text: string;
}

/** Render an SVG tooltip centered on the requested coordinate. */
function DiagramTooltip({centerX, y, width, text}: Readonly<DiagramTooltipProps>) {
  return (
    <g style={{pointerEvents: 'none'}}>
      <rect
        x={centerX - width / 2}
        y={y}
        width={width}
        height={30}
        rx={6}
        fill="var(--c-tooltip-bg)"
        fillOpacity={0.95}
      />
      <text
        x={centerX}
        y={y + 18}
        textAnchor="middle"
        className="fill-app-tooltip-text text-xs font-medium"
      >
        {text}
      </text>
    </g>
  );
}

interface DiagramNodeGlyphProps {
  node: PositionedNode;
  isActive: boolean;
  isLastColumn: boolean;
  onHover: (id: string) => void;
  onLeave: () => void;
}

const DiagramNodeGlyph = memo(/** Render one party node and its adjacent label. */ function DiagramNodeGlyph({
  node,
  isActive,
  isLastColumn,
  onHover,
  onLeave,
}: Readonly<DiagramNodeGlyphProps>) {
  const textProps = isLastColumn
    ? {x: node.x + node.width + 6, textAnchor: 'start' as const}
    : {x: node.x - 6, textAnchor: 'end' as const};

  return (
    <g>
      <rect
        x={node.x}
        y={node.y}
        width={node.width}
        height={node.nodeHeight}
        rx={2}
        fill={node.color}
        fillOpacity={isActive ? 1 : 0.3}
        style={{transition: 'fill-opacity 0.2s ease', cursor: 'pointer'}}
        onMouseEnter={() => onHover(node.id)}
        onMouseLeave={onLeave}
      />
      <text
        x={textProps.x}
        y={node.y + node.nodeHeight / 2}
        dy="0.35em"
        textAnchor={textProps.textAnchor}
        className="fill-app-text text-xs font-medium"
        style={{pointerEvents: 'none'}}
      >
        {node.label}
      </text>
    </g>
  );
});

/** Render a responsive, interactive alluvial voter-flow diagram. */
export default function AlluvialDiagram({
                                          nodes,
                                          links,
                                          electionLabels,
                                          selectedParty,
                                          sortMode = 'votes',
                                        }: Readonly<AlluvialDiagramProps>) {
  const {t} = useI18n();
  const numColumns = electionLabels.length;
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [hoveredRibbonKey, setHoveredRibbonKey] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(DEFAULT_CONTAINER_WIDTH);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    let frame = 0;
    const observer = new ResizeObserver((entries) => {
      // Throttle to one update per animation frame: a resize drag would otherwise
      // recompute the O(nodes + links) layout on every tick.
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        for (const entry of entries) {
          setContainerWidth(entry.contentRect.width);
        }
      });
    });

    observer.observe(element);
    setContainerWidth(element.getBoundingClientRect().width || DEFAULT_CONTAINER_WIDTH);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  const {positionedNodes, positionedRibbons, svgWidth, contentHeight} = useMemo(
    () => computeDiagramLayout(nodes, links, numColumns, selectedParty, sortMode, containerWidth),
    [nodes, links, numColumns, selectedParty, sortMode, containerWidth]
  );

  const isRibbonActive = (ribbon: PositionedRibbon): boolean => {
    if (!hoveredNode) return true;
    return ribbon.source.id === hoveredNode || ribbon.target.id === hoveredNode;
  };

  const handleRibbonHover = useCallback((ribbon: PositionedRibbon) => {
    setHoveredRibbonKey(getRibbonKey(ribbon));
    setHoveredNode(null);
  }, []);

  const handleRibbonLeave = useCallback(() => setHoveredRibbonKey(null), []);
  const handleNodeLeave = useCallback(() => setHoveredNode(null), []);

  // Resolve the (stable) hovered key back to a live ribbon: storing the object
  // itself would go stale as soon as the layout memo re-runs (e.g. on resize).
  const hoveredRibbon = useMemo(
    () => positionedRibbons.find((ribbon) => getRibbonKey(ribbon) === hoveredRibbonKey) ?? null,
    [positionedRibbons, hoveredRibbonKey]
  );

  return (
    // On narrow screens the drawing keeps its minimum readable width and scrolls sideways
    // inside its card, instead of being shrunk until the labels are unreadable.
    <div ref={containerRef} className="w-full overflow-x-auto">
      <svg
        data-export-chart
        width="100%"
        height={contentHeight}
        viewBox={`0 0 ${svgWidth} ${contentHeight}`}
        preserveAspectRatio="xMidYMid meet"
        className="block"
        style={{minWidth: svgWidth}}
      >
        {electionLabels.map((label, index) => {
          const x = LABEL_SPACE + index * getColumnSpacing(numColumns, svgWidth) + NODE_WIDTH / 2;
          return <DiagramLabel key={label} label={label} x={x}/>;
        })}

        <defs>
          {positionedRibbons.map((ribbon) => {
            const gradId = buildGradientId(ribbon.source.id, ribbon.target.id, ribbon.value);
            return (
              <RibbonGradient
                key={gradId}
                id={gradId}
                x1={ribbon.source.x + ribbon.source.width}
                x2={ribbon.target.x}
                sourceColor={ribbon.source.color}
                targetColor={ribbon.target.color}
              />
            );
          })}
        </defs>

        {positionedRibbons.map((ribbon) => {
          const gradId = buildGradientId(ribbon.source.id, ribbon.target.id, ribbon.value);
          const ribbonKey = getRibbonKey(ribbon);
          return (
            <DiagramRibbon
              key={ribbonKey}
              ribbon={ribbon}
              gradientId={gradId}
              active={isRibbonActive(ribbon)}
              isHovered={hoveredRibbonKey === ribbonKey}
              onHover={handleRibbonHover}
              onLeave={handleRibbonLeave}
            />
          );
        })}

        {positionedNodes.map((node) => (
          <DiagramNodeGlyph
            key={node.id}
            node={node}
            isActive={!hoveredNode || hoveredNode === node.id}
            isLastColumn={node.columnIndex === numColumns - 1}
            onHover={setHoveredNode}
            onLeave={handleNodeLeave}
          />
        ))}

        {hoveredRibbon && (
          <DiagramTooltip
            centerX={svgWidth / 2}
            y={contentHeight - 44}
            width={280}
            text={`${hoveredRibbon.source.label} → ${hoveredRibbon.target.label}: ${formatNumber(hoveredRibbon.value)} ${t('votes')}`}
          />
        )}

        {hoveredNode && (() => {
          const node = positionedNodes.find((n) => n.id === hoveredNode);
          if (!node) return null;

          return (
            <DiagramTooltip
              centerX={svgWidth / 2}
              y={contentHeight - 80}
              width={280}
              text={`${node.label}: ${formatNumber(node.value)} ${t('votes')}`}
            />
          );
        })()}
      </svg>
    </div>
  );
}
