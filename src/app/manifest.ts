import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "moorings.ms Planning Intelligence",
    short_name: "moorings.ms",
    description: "Moorings Power operational planning and workforce decision engine",
    start_url: "/",
    display: "standalone",
    background_color: "#edf6ff",
    theme_color: "#0369a1",
    icons: [
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/apple-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
