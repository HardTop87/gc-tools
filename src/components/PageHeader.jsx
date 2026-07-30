// Einheitlicher Seitenkopf unter der TopBar: links Titel + Kontextzeile,
// rechts die Kopf-Aktionen als Sekundär-Buttons.
export function PageHeader({ title, context, children }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-5">
      <div>
        <h1 className="text-[22px] font-semibold tracking-[-0.015em] text-ink">{title}</h1>
        {context && <div className="mt-[5px] text-[13px] text-dim">{context}</div>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function SecondaryButton({ icon: Icon, label, onClick, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="inline-flex h-9 items-center gap-1.5 rounded-[9px] border border-line2 bg-surface px-[13px] text-[12.5px] text-dim transition-colors hover:text-ink"
    >
      {Icon && <Icon size={14} />}
      {label}
    </button>
  );
}
