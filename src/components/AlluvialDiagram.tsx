import {memo, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {DiagramNode, DiagramLink} from '@/types';
import {RibbonGradient} from './shared';
import {buildGradientId, buildRibbonPath} from './diagramUtils';

export type SortMode = 'votes' | 'alphabetical';

interface AlluvialDiagramProps {
  nodes: DiagramNode[];
  links: DiagramLink[];
  numColumns: number;
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

/** Remove a column prefix from a diagram node identifier. */
function getBaseId(id: string): string {
  const idx = id.indexOf(':');
  return idx >= 0 ? id.slice(idx + 1) : id;
}

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
  selectedBase: string | null,
  sortMode: SortMode
): PositionedNode[] {
  return [...column].sort((a, b) => {
    const aBase = getBaseId(a.id);
    const bBase = getBaseId(b.id);

    if (selectedBase) {
      const aMatch = aBase === selectedBase;
      const bMatch = bBase === selectedBase;
      if (aMatch && !bMatch) return -1;
      if (bMatch && !aMatch) return 1;
    }
    if (aBase === 'not_voted') return 1;
    if (bBase === 'not_voted') return -1;
    if (aBase === 'other') return 1;
    if (bBase === 'other') return -1;
    if (sortMode === 'alphabetical') {
      return a.label.localeCompare(b.label);
    }
    return b.value - a.value;
  });
}

/** Group links by their source or target node identifier. */
function buildLinkGroups(
  links: DiagramLink[],
  key: 'source' | 'target'
): Record<string, DiagramLink[]> {
  const groups: Record<string, DiagramLink[]> = {};

  for (const link of links) {
    const groupKey = link[key];
    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    groups[groupKey].push(link);
  }

  return groups;
}

/** Sort each link group by the vertical position of its opposite endpoint. */
function sortGroupsByNodeY(
  groups: Record<string, DiagramLink[]>,
  nodeMap: Record<string, PositionedNode>,
  dimension: 'source' | 'target'
): void {
  for (const groupId in groups) {
    groups[groupId].sort((a, b) => {
      const first = dimension === 'source' ? nodeMap[a.source] : nodeMap[a.target];
      const second = dimension === 'source' ? nodeMap[b.source] : nodeMap[b.target];
      if (!first || !second) return 0;
      return first.y - second.y;
    });
  }
}

/** Assign scaled SVG coordinates and heights to every diagram node. */
function positionNodes(
  columns: PositionedNode[][],
  numColumns: number,
  scale: number,
  svgWidth: number,
  selectedParty: string | null,
  sortMode: SortMode
): PositionedNode[] {
  const selectedBase = selectedParty ? getBaseId(selectedParty) : null;

  for (let columnIndex = 0; columnIndex < numColumns; columnIndex += 1) {
    columns[columnIndex] = sortNodesInColumn(columns[columnIndex], selectedBase, sortMode);
  }

  const allNodesFlat: PositionedNode[] = [];
  for (let columnIndex = 0; columnIndex < numColumns; columnIndex += 1) {
    let yOffset = CHART_PADDING_TOP;
    for (const node of columns[columnIndex]) {
      // support a precomputed requiredValue (raw units) so node height can account for
      // outgoing/incoming flows that exceed the node's own value
      const requiredRaw = node.requiredValue ?? node.value;
      const nodeHeight = Math.max(MIN_NODE_HEIGHT, requiredRaw * scale);
      const positionedNode = {
        ...node,
        y: yOffset,
        x: LABEL_SPACE + columnIndex * getColumnSpacing(numColumns, svgWidth),
        width: NODE_WIDTH,
        nodeHeight
      };
      allNodesFlat.push(positionedNode);
      yOffset += nodeHeight + NODE_GAP;
    }
  }

  return allNodesFlat;
}

/**
 * Seed the per-node `id -> y` offset map. Used as the starting cursor for both the
 * incoming (target) and outgoing (source) accumulators so the two cannot drift.
 */
function buildNodeOffsets(allNodesFlat: PositionedNode[]): Record<string, number> {
  const offsets: Record<string, number> = {};

  for (const node of allNodesFlat) {
    offsets[node.id] = node.y;
  }

  return offsets;
}

/** Allocate target-side vertical offsets for every link entering one node. */
function applyIncomingOffsets(
  nodeId: string,
  targetOffsets: Record<string, number>,
  linkTargetOffsets: Record<string, { top: number; bot: number }>,
  incomingByTarget: Record<string, DiagramLink[]>,
  scale: number
): void {
  const inLinks = incomingByTarget[nodeId];
  if (!inLinks) return;

  for (const link of inLinks) {
    const ribbonHeight = link.value * scale;
    const targetYTop = targetOffsets[link.target];
    const targetYBot = targetYTop + ribbonHeight;
    targetOffsets[link.target] = targetYBot;
    linkTargetOffsets[`${link.source}->${link.target}`] = {top: targetYTop, bot: targetYBot};
  }
}

/** Compute the target-side vertical span allocated to each link. */
function buildTargetOffsets(
  allNodesFlat: PositionedNode[],
  incomingByTarget: Record<string, DiagramLink[]>,
  scale: number
): Record<string, { top: number; bot: number }> {
  const targetOffsets = buildNodeOffsets(allNodesFlat);
  const linkTargetOffsets: Record<string, { top: number; bot: number }> = {};

  for (const node of allNodesFlat) {
    applyIncomingOffsets(node.id, targetOffsets, linkTargetOffsets, incomingByTarget, scale);
  }

  return linkTargetOffsets;
}

/** Convert links between positioned nodes into drawable ribbon geometry. */
function buildRibbons(
  nodeMap: Record<string, PositionedNode>,
  outgoingBySource: Record<string, DiagramLink[]>,
  incomingByTarget: Record<string, DiagramLink[]>,
  scale: number,
  allNodesFlat: PositionedNode[]
): PositionedRibbon[] {
  const sourceOffsets = buildNodeOffsets(allNodesFlat);

  const linkTargetOffsets = buildTargetOffsets(allNodesFlat, incomingByTarget, scale);
  const ribbons: PositionedRibbon[] = [];

  for (const node of allNodesFlat) {
    const outLinks = outgoingBySource[node.id];
    if (!outLinks) continue;

    for (const link of outLinks) {
      const source = nodeMap[link.source];
      const target = nodeMap[link.target];
      if (!source || !target) continue;

      const targetInfo = linkTargetOffsets[`${link.source}->${link.target}`];
      if (!targetInfo) continue;

      const ribbonHeight = link.value * scale;
      const sourceYTop = sourceOffsets[link.source];
      const sourceYBot = sourceYTop + ribbonHeight;
      sourceOffsets[link.source] = sourceYBot;

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

  // compute raw incoming/outgoing sums per node id from links (links use node ids like 'col:party')
  const outgoingRaw: Record<string, number> = {};
  const incomingRaw: Record<string, number> = {};
  for (const link of links) {
    outgoingRaw[link.source] = (outgoingRaw[link.source] ?? 0) + link.value;
    incomingRaw[link.target] = (incomingRaw[link.target] ?? 0) + link.value;
  }

  for (const node of nodes) {
    const requiredValue = Math.max(node.value, outgoingRaw[node.id] ?? 0, incomingRaw[node.id] ?? 0);
    columns[node.columnIndex].push({
      ...node,
      x: 0,
      y: 0,
      width: NODE_WIDTH,
      nodeHeight: 0,
      value: node.value,
      requiredValue,
    });
  }

  let maxColumnTotal = 0;
  for (const column of columns) {
    const total = column.reduce((sum, node) => sum + (node.requiredValue ?? node.value), 0);
    if (total > maxColumnTotal) {
      maxColumnTotal = total;
    }
  }

  const availableHeight = DIAGRAM_HEIGHT - CHART_PADDING_TOP - CHART_PADDING_BOTTOM;
  const scale = maxColumnTotal > 0 ? availableHeight / maxColumnTotal : 1;
  const positionedNodes = positionNodes(columns, numColumns, scale, availableWidth, selectedParty, sortMode);

  const nodeMap: Record<string, PositionedNode> = {};
  for (const node of positionedNodes) {
    nodeMap[node.id] = node;
  }

  const outgoingBySource = buildLinkGroups(links, 'source');
  const incomingByTarget = buildLinkGroups(links, 'target');
  sortGroupsByNodeY(outgoingBySource, nodeMap, 'target');
  sortGroupsByNodeY(incomingByTarget, nodeMap, 'source');

  const positionedRibbons = buildRibbons(
    nodeMap,
    outgoingBySource,
    incomingByTarget,
    scale,
    positionedNodes
  );

  let maxBottom = 0;
  for (const node of positionedNodes) {
    const bottom = node.y + node.nodeHeight;
    if (bottom > maxBottom) {
      maxBottom = bottom;
    }
  }

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
      className="fill-gray-300 text-sm font-semibold"
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
        fill="#1f2937"
        fillOpacity={0.95}
      />
      <text
        x={centerX}
        y={y + 18}
        textAnchor="middle"
        className="fill-gray-100 text-xs font-medium"
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
        className="fill-gray-200 text-xs font-medium"
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
                                          numColumns,
                                          electionLabels,
                                          selectedParty,
                                          sortMode = 'votes',
                                        }: Readonly<AlluvialDiagramProps>) {
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
    <div ref={containerRef} className="w-full">
      <svg
        width="100%"
        height={contentHeight}
        viewBox={`0 0 ${svgWidth} ${contentHeight}`}
        preserveAspectRatio="xMidYMid meet"
        className="block"
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
            text={`${hoveredRibbon.source.label} → ${hoveredRibbon.target.label}: ${hoveredRibbon.value.toLocaleString()} votes`}
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
              text={`${node.label}: ${node.value.toLocaleString()} votes`}
            />
          );
        })()}
      </svg>
    </div>
  );
}
