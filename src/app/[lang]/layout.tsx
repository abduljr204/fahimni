import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { directions, hasLocale, locales } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { Providers } from "../providers";
import "../globals.css";

const plex = IBM_Plex_Sans_Arabic({
  variable: "--font-plex",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: LayoutProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  const dict = getDictionary(lang);
  return {
    title: { default: dict.meta.title, template: `%s · ${dict.common.appName}` },
    description: dict.meta.description,
    applicationName: dict.common.appName,
    appleWebApp: { capable: true, title: dict.common.appName, statusBarStyle: "default" },
    alternates: { languages: { ar: "/ar", en: "/en" } },
  };
}

export const viewport: Viewport = {
  themeColor: "#f5f4fa",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = getDictionary(lang);

  return (
    <html lang={lang} dir={directions[lang]} className={`${plex.variable} h-full antialiased`}>
      <body className="min-h-full">
        <Providers locale={lang} dict={dict}>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
