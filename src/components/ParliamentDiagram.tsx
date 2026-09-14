import {useMemo, useState} from 'react';
import type {CoalitionData, PartyInfo} from '@/types';
import {getPartyColor, getPartyDisplayName, resolvePartyName} from '@/data/loader';

interface ParliamentDiagramProps {
  coalitions: CoalitionData[];
  parties: PartyInfo[];
}

interface PartyBlock {
  party: string;
  displayName: string;
  color: string;
  seats: number;
  isCoalition: boolean;
  columnIndex: number;
}

export default function ParliamentDiagram({coalitions, parties}: Readonly<ParliamentDiagramProps>) {
  const [hoveredParty, setHoveredParty] = useState<string | null>(null);

  const blocks = useMemo(() => {
    const allBlocks: PartyBlock[] = [];

    coalitions.forEach((coalition, colIndex) => {
      const coalitionSet = new Set(coalition.coalition);

      // Sort parties: coalition first (by seats desc), then opposition (by seats desc)
      const partiesWithSeats = Object.entries(coalition.seats)
        .filter(([, seats]) => seats > 0)
        .map(([party, seats]) => ({
          party,
          seats,
          isCoalition: coalitionSet.has(party),
        }));

      const coalitionParties = partiesWithSeats
        .filter(p => p.isCoalition)
        .sort((a, b) => b.seats - a.seats);

      const oppositionParties = partiesWithSeats
        .filter(p => !p.isCoalition)
        .sort((a, b) => b.seats - a.seats);

      [...coalitionParties, ...oppositionParties].forEach((p) => {
        allBlocks.push({
          party: p.party,
          displayName: getPartyDisplayName(p.party, parties),
          color: getPartyColor(p.party, parties),
          seats: p.seats,
          isCoalition: p.isCoalition,
          columnIndex: colIndex,
        });
      });
    });

    return allBlocks;
  }, [coalitions, parties]);

  const years = coalitions.map(c => c.year);
  const columns = coalitions.length;

  if (columns === 0) {
    return <div className="text-gray-400 text-center py-8">No coalition data available</div>;
  }

  const blockHeight = 40;
  const blockWidth = 120;
  const gap = 80;
  const chartWidth = columns * (blockWidth + gap);
  const labelSpace = 100;
  const svgWidth = chartWidth + labelSpace * 2;

  // Calculate max parties in any column for height
  const maxPartiesInColumn = Math.max(
    ...coalitions.map(c => Object.values(c.seats).filter(s => s > 0).length)
  );
  const svgHeight = maxPartiesInColumn * (blockHeight + 10) + 100;

  return (
    <div className="relative w-full overflow-x-auto">
      <svg width={svgWidth} height={svgHeight} className="block">
        {/* Draw connections between same parties */}
        {blocks.map((block, i) => {
          const nextBlocks = blocks.filter(
            b => b.columnIndex === block.columnIndex + 1 &&
            (b.party === block.party ||
             resolvePartyName(b.party, parties) === resolvePartyName(block.party, parties))
          );

          return nextBlocks.map((nextBlock) => {
            const blocksInCol = blocks.filter(b => b.columnIndex === block.columnIndex);
            const blocksInNextCol = blocks.filter(b => b.columnIndex === nextBlock.columnIndex);

            const yIndex = blocksInCol.indexOf(block);
            const nextYIndex = blocksInNextCol.indexOf(nextBlock);

            // Find coalition divider position
            const coalitionEndIndex = blocksInCol.findIndex(b => !b.isCoalition) - 1;
            const nextCoalitionEndIndex = blocksInNextCol.findIndex(b => !b.isCoalition) - 1;

            const extraGap = 30;
            const y1 = 50 + yIndex * (blockHeight + 10) + (yIndex > coalitionEndIndex ? extraGap : 0) + blockHeight / 2;
            const y2 = 50 + nextYIndex * (blockHeight + 10) + (nextYIndex > nextCoalitionEndIndex ? extraGap : 0) + blockHeight / 2;

            const x1 = labelSpace + block.columnIndex * (blockWidth + gap) + blockWidth;
            const x2 = labelSpace + nextBlock.columnIndex * (blockWidth + gap);

            const isHovered = hoveredParty === block.party || hoveredParty === nextBlock.party;

            return (
              <path
                key={`${i}-${nextBlock.party}-${nextBlock.columnIndex}`}
                d={`M ${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`}
                stroke={block.color}
                strokeWidth={isHovered ? 3 : 2}
                fill="none"
                opacity={hoveredParty && !isHovered ? 0.1 : 0.4}
                style={{transition: 'all 0.2s ease'}}
              />
            );
          });
        })}

        {/* Draw party blocks */}
        {coalitions.map((coalition, colIndex) => {
          const colBlocks = blocks.filter(b => b.columnIndex === colIndex);
          const coalitionEndIndex = colBlocks.findIndex(b => !b.isCoalition) - 1;
          const extraGap = 30;

          return (
            <g key={colIndex}>
              {/* Year label */}
              <text
                x={labelSpace + colIndex * (blockWidth + gap) + blockWidth / 2}
                y={30}
                textAnchor="middle"
                className="fill-gray-300 text-sm font-bold"
              >
                {years[colIndex]}
              </text>

              {/* Coalition divider */}
              {coalitionEndIndex >= 0 && (
                <line
                  x1={labelSpace + colIndex * (blockWidth + gap) - 10}
                  x2={labelSpace + colIndex * (blockWidth + gap) + blockWidth + 10}
                  y1={50 + (coalitionEndIndex + 1) * (blockHeight + 10) + extraGap / 2}
                  y2={50 + (coalitionEndIndex + 1) * (blockHeight + 10) + extraGap / 2}
                  stroke="#4b5563"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                />
              )}

              {/* Party blocks */}
              {colBlocks.map((block, blockIndex) => {
                const y = 50 + blockIndex * (blockHeight + 10) + (blockIndex > coalitionEndIndex ? extraGap : 0);
                const x = labelSpace + colIndex * (blockWidth + gap);
                const isHovered = hoveredParty === block.party;

                return (
                  <g
                    key={`${colIndex}-${block.party}`}
                    onMouseEnter={() => setHoveredParty(block.party)}
                    onMouseLeave={() => setHoveredParty(null)}
                    style={{cursor: 'pointer'}}
                  >
                    <rect
                      x={x}
                      y={y}
                      width={blockWidth}
                      height={blockHeight}
                      fill={block.color}
                      rx={4}
                      opacity={hoveredParty && !isHovered ? 0.3 : 1}
                      style={{transition: 'opacity 0.2s ease'}}
                    />
                    <text
                      x={x + blockWidth / 2}
                      y={y + blockHeight / 2}
                      textAnchor="middle"
                      dy="0.35em"
                      className="fill-white text-xs font-semibold pointer-events-none"
                    >
                      {block.displayName} ({block.seats})
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}

        {/* Legend */}
        <g transform={`translate(${labelSpace}, ${svgHeight - 40})`}>
          <text className="fill-gray-400 text-xs font-medium" y={0}>
            Above dashed line: Coalition
          </text>
          <text className="fill-gray-400 text-xs font-medium" y={15}>
            Below dashed line: Opposition
          </text>
        </g>
      </svg>
    </div>
  );
}
