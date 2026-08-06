import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import { createClient } from "@/lib/supabase/server";
import { buildBranding } from "@/lib/branding";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Steve 4/29 #13: site title is admin-editable from /admin/content (Site
// Branding section). Falls back to defaults if site_content is empty or
// the DB is unreachable during build.
export async function generateMetadata(): Promise<Metadata> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("site_content")
      .select("key, value")
      .eq("section", "branding");
    const branding = buildBranding(data);
    return {
      title: `${branding.name} - ${branding.tagline}`,
      description:
        "Residential and business marketing platform. We connect property owners, tenants, and businesses with the marketing services they need.",
      icons: branding.faviconUrl
        ? {
            icon: branding.faviconUrl,
            shortcut: branding.faviconUrl,
            apple: branding.faviconUrl,
          }
        : undefined,
    };
  } catch {
    return {
      title: "Nexuma Marketing - Residential & Business Marketing",
      description:
        "Residential and business marketing platform. We connect property owners, tenants, and businesses with the marketing services they need.",
    };
  }
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // @ts-expect-error next-themes requires suppressHydrationMismatch on html
      suppressHydrationMismatch
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
