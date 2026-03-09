// ─── LevelBadge — small colored pill showing the user's level ──────
// Level thresholds: Newcomer (0-49), Regular (50-199), Contributor (200-499),
//                   Veteran (500-999), Elite (1000+)

interface LevelBadgeProps {
  level: string;
  className?: string;
}

const LEVEL_COLORS: Record<
  string,
  { bg: string; text: string; border: string }
> = {
  Newcomer: { bg: "#55555522", text: "#888", border: "#55555544" },
  Regular: { bg: "#2980b922", text: "#5ba3d9", border: "#2980b944" },
  Contributor: { bg: "#27ae6022", text: "#4abd7c", border: "#27ae6044" },
  Veteran: { bg: "#e67e2222", text: "#f09b4a", border: "#e67e2244" },
  Elite: { bg: "#9b59b622", text: "#c77dff", border: "#9b59b644" },
};

export default function LevelBadge({ level, className = "" }: LevelBadgeProps) {
  const colors = LEVEL_COLORS[level] ?? LEVEL_COLORS.Newcomer;
  return (
    <span
      className={`inline-flex items-center font-mono uppercase tracking-wider ${className}`}
      style={{
        fontSize: 9,
        lineHeight: 1,
        padding: "2px 5px",
        borderRadius: 4,
        backgroundColor: colors.bg,
        color: colors.text,
        border: `1px solid ${colors.border}`,
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      {level}
    </span>
  );
}
