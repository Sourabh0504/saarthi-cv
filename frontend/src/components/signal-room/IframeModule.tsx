/**
 * Embeds an existing, untouched Saarthi page in-place inside the Signal Room
 * shell — used for pages with their own large, independent, working
 * implementation (Creative dashboard, Analytics Explore, Pinned Charts,
 * Reports) that shouldn't be re-implemented or risked just to fit inside
 * this shell. The sidebar/top bar stay mounted; only this frame's content
 * changes — satisfies "no redirect to a new screen" without touching the
 * embedded page's own code at all.
 */
export function IframeModule({ src, title }: { src: string; title: string }) {
  return (
    <div className="h-[calc(100dvh-8rem)] w-full overflow-hidden rounded-2xl border border-sr-border bg-sr-card/60 backdrop-blur-2xl shadow-[var(--sr-shadow-sm)]">
      <iframe src={src} title={title} className="h-full w-full border-0" />
    </div>
  );
}
