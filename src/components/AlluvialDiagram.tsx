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
  sourceYBot: number;
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

  const { positionedNodes, positionedRibbons, svgWidth, contentHeight } = useMemo(() => {
    const availableWidth = Math.max(containerWidth, 600);
    const chartAreaWidth = availableWidth - LABEL_SPACE * 2;
    const columnSpacing = numColumns > 1
      ? chartAreaWidth / (numColumns - 1)
      : 0;

    // Group nodes by column
    const columns: PositionedNode[][] = Array.from({ length: numColumns }, () => []);

    // Compute inflow/outflow per node
    const nodeInflow: Record<string, number> = {};
    const nodeOutflow: Record<string, number> = {};
    for (const link of links) {
      nodeOutflow[link.source] = (nodeOutflow[link.source] ?? 0) + link.value;
      nodeInflow[link.target] = (nodeInflow[link.target] ?? 0) + link.value;
    }

    // Determine the base party name for each node (strip column prefix)
    const getBaseId = (id: string): string => {
      const idx = id.indexOf(':');
      return idx >= 0 ? id.slice(idx + 1) : id;
    };

    // Sort: selected party first, then by value descending
    const selectedBase = selectedParty ? getBaseId(selectedParty) : null;

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

    for (const col of columns) {
      col.sort((a, b) => {
        const aBase = getBaseId(a.id);
        const bBase = getBaseId(b.id);
        if (selectedBase) {
          const aMatch = aBase === selectedBase;
          const bMatch = bBase === selectedBase;
          if (aMatch && !bMatch) return -1;
          if (bMatch && !aMatch) return 1;
        }
        if (sortMode === 'alphabetical') {
          return a.label.localeCompare(b.label);
        }
        return b.value - a.value;
      });
    }

    // Scale: find the column with the most total value
    let maxColumnTotal = 0;
    for (const col of columns) {
      const total = col.reduce((sum, n) => sum + n.value, 0);
      if (total > maxColumnTotal) maxColumnTotal = total;
    }

    const availableHeight = DIAGRAM_HEIGHT - CHART_PADDING_TOP - CHART_PADDING_BOTTOM;
    const scale = maxColumnTotal > 0 ? availableHeight / maxColumnTotal : 1;

    // Position nodes vertically
    for (const col of columns) {
      let yOffset = CHART_PADDING_TOP;
      for (const node of col) {
        const nodeHeight = Math.max(MIN_NODE_HEIGHT, node.value * scale);
        node.nodeHeight = nodeHeight;
        node.y = yOffset;
        yOffset += nodeHeight + NODE_GAP;
      }
    }

    // Position x for each column
    const colStartX = LABEL_SPACE;
    for (let c = 0; c < numColumns; c++) {
      for (const node of columns[c]) {
        node.x = colStartX + c * columnSpacing;
      }
    }

    // Build node lookup
    const nodeMap: Record<string, PositionedNode> = {};
    for (const col of columns) {
      for (const node of col) {
        nodeMap[node.id] = node;
      }
    }

    // Build ordered link lists per source and target node
    // Source: order outgoing ribbons by the Y position of their target node (top target = first)
    // Target: order incoming ribbons by the Y position of their source node (top source = first)
    const outgoingBySource: Record<string, DiagramLink[]> = {};
    const incomingByTarget: Record<string, DiagramLink[]> = {};

    for (const link of links) {
      if (!outgoingBySource[link.source]) outgoingBySource[link.source] = [];
      if (!incomingByTarget[link.target]) incomingByTarget[link.target] = [];
      outgoingBySource[link.source].push(link);
      incomingByTarget[link.target].push(link);
    }

    // Sort outgoing by target node Y position (so top target gets first ribbon slot)
    for (const sourceId in outgoingBySource) {
      outgoingBySource[sourceId].sort((a, b) => {
        const targetA = nodeMap[a.target];
        const targetB = nodeMap[b.target];
        if (!targetA || !targetB) return 0;
        return targetA.y - targetB.y;
      });
    }

    // Sort incoming by source node Y position (so top source gets first ribbon slot)
    for (const targetId in incomingByTarget) {
      incomingByTarget[targetId].sort((a, b) => {
        const sourceA = nodeMap[a.source];
        const sourceB = nodeMap[b.source];
        if (!sourceA || !sourceB) return 0;
        return sourceA.y - sourceB.y;
      });
    }

    // Compute ribbon endpoints by stacking flows on each node
    const sourceOffsets: Record<string, number> = {};
    const targetOffsets: Record<string, number> = {};

    const allNodesFlat = columns.flat();
    for (const node of allNodesFlat) {
      sourceOffsets[node.id] = node.y;
      targetOffsets[node.id] = node.y;
    }

    const ribbons: PositionedRibbon[] = [];

    // Process ribbons in a deterministic order: iterate through source nodes top-to-bottom,
    // and for each source, iterate its outgoing links in target-Y order
    for (const node of allNodesFlat) {
      const outLinks = outgoingBySource[node.id];
      if (!outLinks) continue;
      for (const link of outLinks) {
        const source = nodeMap[link.source];
        const target = nodeMap[link.target];
        if (!source || !target) continue;

        const ribbonHeight = link.value * scale;

        const sourceYTop = sourceOffsets[link.source];
        const sourceYBot = sourceYTop + ribbonHeight;
        sourceOffsets[link.source] = sourceYBot;

        // For target, we need to find this link's position in the incoming order
        // We'll use a separate offset tracking based on incoming order
      }
    }

    // Reset target offsets and process in incoming order
    for (const node of allNodesFlat) {
      targetOffsets[node.id] = node.y;
    }

    // Build a map from link to its target offset
    const linkTargetOffsets: Record<string, { top: number; bot: number }> = {};

    for (const node of allNodesFlat) {
      const inLinks = incomingByTarget[node.id];
      if (!inLinks) continue;
      for (const link of inLinks) {
        const ribbonHeight = link.value * scale;
        const targetYTop = targetOffsets[link.target];
        const targetYBot = targetYTop + ribbonHeight;
        targetOffsets[link.target] = targetYBot;

        linkTargetOffsets[`${link.source}->${link.target}`] = { top: targetYTop, bot: targetYBot };
      }
    }

    // Now build the actual ribbons using both source and target offsets
    // Reset source offsets
    for (const node of allNodesFlat) {
      sourceOffsets[node.id] = node.y;
    }

    for (const node of allNodesFlat) {
      const outLinks = outgoingBySource[node.id];
      if (!outLinks) continue;
      for (const link of outLinks) {
        const source = nodeMap[link.source];
        const target = nodeMap[link.target];
        if (!source || !target) continue;

        const ribbonHeight = link.value * scale;

        const sourceYTop = sourceOffsets[link.source];
        const sourceYBot = sourceYTop + ribbonHeight;
        sourceOffsets[link.source] = sourceYBot;

        const targetInfo = linkTargetOffsets[`${link.source}->${link.target}`];
        if (!targetInfo) continue;

        const targetYTop = targetInfo.top;
        const targetYBot = targetInfo.bot;

        const sourceX = source.x + source.width;
        const targetX = target.x;
        const midX = (sourceX + targetX) / 2;

        const path =
          `M ${sourceX} ${sourceYTop}` +
          ` C ${midX} ${sourceYTop}, ${midX} ${targetYTop}, ${targetX} ${targetYTop}` +
          ` L ${targetX} ${targetYBot}` +
          ` C ${midX} ${targetYBot}, ${midX} ${sourceYBot}, ${sourceX} ${sourceYBot}` +
          ` Z`;

        ribbons.push({
          source,
          target,
          sourceYTop,
          sourceYBot,
          targetYTop,
          targetYBot,
          value: link.value,
          color: link.color,
          path,
        });
      }
    }

    // Sort ribbons by value descending so smaller ribbons render on top
    ribbons.sort((a, b) => b.value - a.value);

    // Compute actual content height
    let maxBottom = 0;
    for (const node of allNodesFlat) {
      const bottom = node.y + node.nodeHeight;
      if (bottom > maxBottom) maxBottom = bottom;
    }
    const actualHeight = Math.ceil(maxBottom + CHART_PADDING_BOTTOM);

    return {
      positionedNodes: allNodesFlat,
      positionedRibbons: ribbons,
      svgWidth: availableWidth,
      contentHeight: actualHeight,
    };
  }, [nodes, links, numColumns, containerWidth, selectedParty, sortMode]);

  const isRibbonActive = (ribbon: PositionedRibbon): boolean => {
    if (!hoveredNode) return true;
    return ribbon.source.id === hoveredNode || ribbon.target.id === hoveredNode;
  };

  return (
    <div ref={containerRef} className="w-full">
      <svg
        width={svgWidth}
        height={contentHeight}
        className="block"
        style={{ width: '100%' }}
      >
        {/* Election column labels */}
        {electionLabels.map((label, i) => {
          const chartAreaWidth = svgWidth - LABEL_SPACE * 2;
          const columnSpacing = numColumns > 1
            ? chartAreaWidth / (numColumns - 1)
            : 0;
          const x = LABEL_SPACE + i * columnSpacing + NODE_WIDTH / 2;
          return (
            <text
              key={`label-${i}`}
              x={x}
              y={22}
              textAnchor="middle"
              className="fill-gray-300 text-sm font-semibold"
            >
              {label}
            </text>
          );
        })}

        {/* Ribbons (flows) */}
        {positionedRibbons.map((ribbon, i) => {
          const active = isRibbonActive(ribbon);
          const isHovered = hoveredRibbon === ribbon;
          return (
            <path
              key={`ribbon-${i}`}
              d={ribbon.path}
              fill={ribbon.color}
              fillOpacity={active ? (isHovered ? 0.7 : 0.35) : 0.06}
              stroke="none"
              style={{ transition: 'fill-opacity 0.2s ease', cursor: 'pointer' }}
              onMouseEnter={() => {
                setHoveredRibbon(ribbon);
                setHoveredNode(null);
              }}
              onMouseLeave={() => {
                setHoveredRibbon(null);
              }}
            />
          );
        })}

        {/* Nodes (party bars) */}
        {positionedNodes.map((node) => {
          const isActive = !hoveredNode || hoveredNode === node.id;
          return (
            <g key={`node-${node.id}`}>
              <rect
                x={node.x}
                y={node.y}
                width={node.width}
                height={node.nodeHeight}
                rx={2}
                fill={node.color}
                fillOpacity={isActive ? 1 : 0.3}
                style={{ transition: 'fill-opacity 0.2s ease', cursor: 'pointer' }}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
              />
              {node.columnIndex === numColumns - 1 ? (
                <text
                  x={node.x + node.width + 6}
                  y={node.y + node.nodeHeight / 2}
                  dy="0.35em"
                  className="fill-gray-200 text-xs font-medium"
                  style={{ pointerEvents: 'none' }}
                >
                  {node.label}
                </text>
              ) : (
                <text
                  x={node.x - 6}
                  y={node.y + node.nodeHeight / 2}
                  dy="0.35em"
                  textAnchor="end"
                  className="fill-gray-200 text-xs font-medium"
                  style={{ pointerEvents: 'none' }}
                >
                  {node.label}
                </text>
              )}
            </g>
          );
        })}

        {/* Tooltip */}
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
