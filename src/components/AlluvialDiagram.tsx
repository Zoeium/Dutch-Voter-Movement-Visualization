import { useMemo, useState, useRef, useEffect } from 'react';
import type { DiagramNode, DiagramLink } from '@/types';

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

function getBaseId(id: string): string {
  const idx = id.indexOf(':');
  return idx >= 0 ? id.slice(idx + 1) : id;
}

function getColumnSpacing(numColumns: number, svgWidth: number): number {
  const chartAreaWidth = svgWidth - LABEL_SPACE * 2;
  return numColumns > 1 ? chartAreaWidth / (numColumns - 1) : 0;
}

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
    if (aBase === 'not_voted') return -1;
    if (bBase === 'not_voted') return -1;
    if (sortMode === 'alphabetical') {
      return a.label.localeCompare(b.label);
    }
    return b.value - a.value;
  });
}

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
      const nodeHeight = Math.max(MIN_NODE_HEIGHT, node.value * scale);
      const positionedNode = { ...node, y: yOffset, x: LABEL_SPACE + columnIndex * getColumnSpacing(numColumns, svgWidth), width: NODE_WIDTH, nodeHeight };
      allNodesFlat.push(positionedNode);
      yOffset += nodeHeight + NODE_GAP;
    }
  }

  return allNodesFlat;
}

function initializeTargetOffsets(allNodesFlat: PositionedNode[]): Record<string, number> {
  const targetOffsets: Record<string, number> = {};

  for (const node of allNodesFlat) {
    targetOffsets[node.id] = node.y;
  }

  return targetOffsets;
}

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
    linkTargetOffsets[`${link.source}->${link.target}`] = { top: targetYTop, bot: targetYBot };
  }
}

function buildTargetOffsets(
  allNodesFlat: PositionedNode[],
  incomingByTarget: Record<string, DiagramLink[]>,
  scale: number
): Record<string, { top: number; bot: number }> {
  const targetOffsets = initializeTargetOffsets(allNodesFlat);
  const linkTargetOffsets: Record<string, { top: number; bot: number }> = {};

  for (const node of allNodesFlat) {
    applyIncomingOffsets(node.id, targetOffsets, linkTargetOffsets, incomingByTarget, scale);
  }

  return linkTargetOffsets;
}

function getRibbonPath(
  source: PositionedNode,
  target: PositionedNode,
  sourceYTop: number,
  sourceYBot: number,
  targetYTop: number,
  targetYBot: number
): string {
  const sourceX = source.x + source.width;
  const targetX = target.x;
  const midX = (sourceX + targetX) / 2;

  return (
    `M ${sourceX} ${sourceYTop}` +
    ` C ${midX} ${sourceYTop}, ${midX} ${targetYTop}, ${targetX} ${targetYTop}` +
    ` L ${targetX} ${targetYBot}` +
    ` C ${midX} ${targetYBot}, ${midX} ${sourceYBot}, ${sourceX} ${sourceYBot}` +
    ` Z`
  );
}

function buildRibbons(
  nodeMap: Record<string, PositionedNode>,
  outgoingBySource: Record<string, DiagramLink[]>,
  incomingByTarget: Record<string, DiagramLink[]>,
  scale: number,
  allNodesFlat: PositionedNode[]
): PositionedRibbon[] {
  const sourceOffsets: Record<string, number> = {};

  for (const node of allNodesFlat) {
    sourceOffsets[node.id] = node.y;
  }

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
        path: getRibbonPath(source, target, sourceYTop, sourceYBot, targetInfo.top, targetInfo.bot),
      });
    }
  }

  return ribbons.sort((a, b) => b.value - a.value);
}

function computeDiagramLayout(
  nodes: DiagramNode[],
  links: DiagramLink[],
  numColumns: number,
  selectedParty: string | null,
  sortMode: SortMode,
  containerWidth: number
): { positionedNodes: PositionedNode[]; positionedRibbons: PositionedRibbon[]; svgWidth: number; contentHeight: number } {
  const availableWidth = Math.max(containerWidth, 600);
  const columns: PositionedNode[][] = Array.from({ length: numColumns }, () => []);

  for (const node of nodes) {
    columns[node.columnIndex].push({
      ...node,
      x: 0,
      y: 0,
      width: NODE_WIDTH,
      nodeHeight: 0,
      value: node.value,
    });
  }

  let maxColumnTotal = 0;
  for (const column of columns) {
    const total = column.reduce((sum, node) => sum + node.value, 0);
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

function DiagramLabel({ label, x }: Readonly<DiagramLabelProps>) {
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
  onHover: (ribbon: PositionedRibbon) => void;
  onLeave: () => void;
}

function DiagramRibbon({ ribbon, active, isHovered, onHover, onLeave }: Readonly<DiagramRibbonProps>) {
  let fillOpacity = 0.06;
  if (active) {
    fillOpacity = isHovered ? 0.7 : 0.35;
  }

  return (
    <path
      d={ribbon.path}
      fill={ribbon.color}
      fillOpacity={fillOpacity}
      stroke="none"
      style={{ transition: 'fill-opacity 0.2s ease', cursor: 'pointer' }}
      onMouseEnter={() => onHover(ribbon)}
      onMouseLeave={onLeave}
    />
  );
}

interface DiagramNodeGlyphProps {
  node: PositionedNode;
  isActive: boolean;
  isLastColumn: boolean;
  onHover: (id: string) => void;
  onLeave: () => void;
}

function DiagramNodeGlyph({ node, isActive, isLastColumn, onHover, onLeave }: Readonly<DiagramNodeGlyphProps>) {
  const textProps = isLastColumn
    ? { x: node.x + node.width + 6, textAnchor: 'start' as const }
    : { x: node.x - 6, textAnchor: 'end' as const };

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
        style={{ transition: 'fill-opacity 0.2s ease', cursor: 'pointer' }}
        onMouseEnter={() => onHover(node.id)}
        onMouseLeave={onLeave}
      />
      <text
        x={textProps.x}
        y={node.y + node.nodeHeight / 2}
        dy="0.35em"
        textAnchor={textProps.textAnchor}
        className="fill-gray-200 text-xs font-medium"
        style={{ pointerEvents: 'none' }}
      >
        {node.label}
      </text>
    </g>
  );
}

export default function AlluvialDiagram({
  nodes,
  links,
  numColumns,
  electionLabels,
  selectedParty,
  sortMode = 'votes',
}: Readonly<AlluvialDiagramProps>) {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [hoveredRibbon, setHoveredRibbon] = useState<PositionedRibbon | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(1200);

  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const { positionedNodes, positionedRibbons, svgWidth, contentHeight } = useMemo(
    () => computeDiagramLayout(nodes, links, numColumns, selectedParty, sortMode, containerWidth),
    [nodes, links, numColumns, selectedParty, sortMode, containerWidth]
  );

  const isRibbonActive = (ribbon: PositionedRibbon): boolean => {
    if (!hoveredNode) return true;
    return ribbon.source.id === hoveredNode || ribbon.target.id === hoveredNode;
  };

  return (
    <div ref={containerRef} className="w-full">
      <svg width={svgWidth} height={contentHeight} className="block" style={{ width: '100%' }}>
        {electionLabels.map((label) => {
          const x = LABEL_SPACE + electionLabels.indexOf(label) * getColumnSpacing(numColumns, svgWidth) + NODE_WIDTH / 2;
          return <DiagramLabel key={label} label={label} x={x} />;
        })}

        {positionedRibbons.map((ribbon) => (
          <DiagramRibbon
            key={`${ribbon.source.id}-${ribbon.target.id}-${ribbon.value}`}
            ribbon={ribbon}
            active={isRibbonActive(ribbon)}
            isHovered={hoveredRibbon === ribbon}
            onHover={(nextRibbon) => {
              setHoveredRibbon(nextRibbon);
              setHoveredNode(null);
            }}
            onLeave={() => setHoveredRibbon(null)}
          />
        ))}

        {positionedNodes.map((node) => (
          <DiagramNodeGlyph
            key={node.id}
            node={node}
            isActive={!hoveredNode || hoveredNode === node.id}
            isLastColumn={node.columnIndex === numColumns - 1}
            onHover={setHoveredNode}
            onLeave={() => setHoveredNode(null)}
          />
        ))}

        {hoveredRibbon && (
          <g style={{ pointerEvents: 'none' }}>
            <rect
              x={svgWidth / 2 - 140}
              y={contentHeight - 44}
              width={280}
              height={30}
              rx={6}
              fill="#1f2937"
              fillOpacity={0.95}
            />
            <text
              x={svgWidth / 2}
              y={contentHeight - 25}
              textAnchor="middle"
              className="fill-gray-100 text-xs font-medium"
            >
              {hoveredRibbon.source.label} → {hoveredRibbon.target.label}: {hoveredRibbon.value.toLocaleString()} votes
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
