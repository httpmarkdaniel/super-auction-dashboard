import SectionHeader from "./SectionHeader";

// One narrative beat: a question the section answers, the visuals that
// answer it, then a hairline divider before the next beat — not just
// another row in an undifferentiated grid.
export default function StorySection({ title, insight, children, last = false }) {
  return (
    <section className={last ? "" : "pb-8 mb-8 border-b border-[var(--border)]"}>
      <SectionHeader title={title} insight={insight} />
      {children}
    </section>
  );
}
