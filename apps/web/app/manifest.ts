import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Affylitics",
    short_name: "Affylitics",
    description: "The affiliate network that pays you where you live.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#faf8ff",
    theme_color: "#216be9",
    icons: [{ src: "/logo.png", sizes: "512x512", type: "image/png" }],
  };
}
