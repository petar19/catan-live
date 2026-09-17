export interface Section {
  id: string;
  label: string;
}

/** Sticky row of shortcut links that scroll to a section further down the
 * same page — used on the game detail and combined stats pages, both of
 * which stack a lot of charts vertically. */
export function SectionNav({ sections }: { sections: Section[] }) {
  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <nav className="section-nav">
      {sections.map((s) => (
        <button key={s.id} onClick={() => scrollTo(s.id)}>
          {s.label}
        </button>
      ))}
    </nav>
  );
}
