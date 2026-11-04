import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NetAffil",
    short_name: "NetAffil",
    description: "The global affiliate marketplace.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f8faff",
    theme_color: "#2463eb",
    icons: [{ src: "/logo.png", sizes: "512x512", type: "image/png" }],
  };
}
