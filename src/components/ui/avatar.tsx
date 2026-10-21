import { cn } from "@/lib/cn";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "؟";
  if (parts.length === 1) return parts[0].slice(0, 2);
  return `${parts[0][0]}${parts[parts.length - 1][0]}`;
}

const sizes = {
  xs: "size-8 text-[11px]",
  sm: "size-10 text-sm",
  md: "size-12 text-base",
  lg: "size-16 text-xl",
  xl: "size-24 text-3xl",
};

/**
 * Generated avatar: a soft gradient from the user's hue with their initials.
 * Uploaded photos (`src`) take precedence once profiles support them.
 */
export function Avatar({
  name,
  hue,
  src,
  size = "md",
  online,
  className,
}: {
  name: string;
  hue: number;
  src?: string;
  size?: keyof typeof sizes;
  online?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <span
        className={cn("grid place-items-center overflow-hidden rounded-full font-bold text-white", sizes[size])}
        style={{
          background: `linear-gradient(135deg, hsl(${hue} 85% 68%), hsl(${(hue + 40) % 360} 75% 52%))`,
        }}
        aria-hidden={!src}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={name} className="size-full object-cover" />
        ) : (
          initials(name)
        )}
      </span>
      {online && (
        <span className="absolute end-0 bottom-0 size-3 rounded-full border-2 border-white bg-mint-500" aria-hidden />
      )}
    </span>
  );
}
