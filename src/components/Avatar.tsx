import type { PublicProfile } from "@/lib/types";

const HUES = [18, 32, 145, 190, 220, 265, 320, 350];

export function Avatar({ profile, size = 28 }: { profile: Pick<PublicProfile, "id" | "display_name" | "avatar_url">; size?: number }) {
  if (profile.avatar_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={profile.avatar_url} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" />;
  }
  const hue = HUES[[...profile.id].reduce((a, c) => a + c.charCodeAt(0), 0) % HUES.length];
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.45, background: `hsl(${hue} 45% 42%)` }}
    >
      {profile.display_name.slice(0, 1).toUpperCase()}
    </span>
  );
}
