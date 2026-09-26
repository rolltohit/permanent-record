export function Artwork({ src, alt, size = 96, className = "" }: { src: string | null; alt: string; size?: number; className?: string }) {
  if (!src) {
    return (
      <div
        aria-hidden
        className={`flex shrink-0 items-center justify-center rounded-xl bg-surface-2 text-3xl text-muted ${className}`}
        style={{ width: size, height: size }}
      >
        ♪
      </div>
    );
  }
  return (
    // Artwork comes from many CDNs (Apple, Spotify, YouTube), so we skip next/image.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
      className={`shrink-0 rounded-xl object-cover shadow-sm ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
