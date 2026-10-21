import type { MetadataRoute } from "next";

/** Lets visitors "Add to Home Screen" so the prototype opens like an installed app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "فهمني · Fahimni",
    short_name: "فهمني",
    description: "دروس خصوصية لطلبة الجامعة — Private tutoring for university students",
    lang: "ar",
    dir: "rtl",
    start_url: "/ar",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f5f4fa",
    theme_color: "#f5f4fa",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
