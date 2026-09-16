import type { Metadata } from "next";
import { Heebo, Geist_Mono } from "next/font/google";
import { getLocale, getMessages } from "next-intl/server";
import { I18nProvider } from "@/i18n/client-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { QueryProvider } from "@/components/query-provider";
import { dirFor, isLocale, defaultLocale } from "@/i18n/routing";
import "./globals.css";

const heebo = Heebo({
  variable: "--app-font",
  subsets: ["hebrew", "latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "מעקב כלכלי",
  description: "תוכנת מעקב כלכלי אישי עם סיווג אוטומטי",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const rawLocale = await getLocale();
  const locale = isLocale(rawLocale) ? rawLocale : defaultLocale;
  const messages = await getMessages();
  const dir = dirFor(locale);
  return (
    <html
      lang={locale}
      dir={dir}
      className={`${heebo.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <I18nProvider locale={locale} messages={messages as Record<string, unknown>}>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <QueryProvider>
              <TooltipProvider>
                {children}
                <Toaster />
              </TooltipProvider>
            </QueryProvider>
          </ThemeProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
