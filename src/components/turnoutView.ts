// What the turnout chart shows, shared by the chart and the URL handling in App.

export type ScaleMode = 'absolute' | 'percentage';
export type SegmentKind = 'valid' | 'blanco' | 'invalid' | 'notVoted';
export const SEGMENT_KINDS: readonly SegmentKind[] = ['valid', 'blanco', 'invalid', 'notVoted'];

/** Counts or shares of the electorate, and which categories are hidden. */
export interface TurnoutView {
  scale: ScaleMode;
  hidden: SegmentKind[];
}

export const DEFAULT_TURNOUT_VIEW: TurnoutView = {scale: 'absolute', hidden: []};
