import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "moorings.ms Turnaround Dashboard",
    short_name: "moorings.ms",
    description: "Fleet turnaround scheduling and reporting command deck",
    start_url: "/",
    display: "standalone",
    background_color: "#edf6ff",
    theme_color: "#0369a1",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
