import clsx from "clsx";

type Props = {
  arabicTitle: string;
  englishTitle: string;
  description: string;
  href: string;
  external?: boolean;
  badge?: string;
};

export default function ToolCard({
  arabicTitle,
  englishTitle,
  description,
  href,
  external,
  badge,
}: Props) {
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      data-cursor="hover"
      className={clsx(
        "block rounded-2xl border border-ink-700/40 bg-ink-900/60 p-6",
        "backdrop-blur transition",
        "hover:border-ember-400/60 hover:bg-ink-900"
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-2xl font-medium tracking-tight">{arabicTitle}</h3>
        {badge && (
          <span className="text-[10px] uppercase tracking-[0.22em] text-ember-400">
            {badge}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-ink-400" dir="ltr">
        {englishTitle}
      </p>
      <p className="mt-4 text-ink-300 leading-relaxed">{description}</p>
    </a>
  );
}
