import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Rec Room",
    short_name: "Rec Room",
    description: "Music recommendations from your friends.",
    start_url: "/",
    display: "standalone",
    background_color: "#15110d",
    theme_color: "#15110d",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
