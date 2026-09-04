import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "react-hot-toast";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
    title: "Sistema de Gestão de Chaves",
    description: "Sistema Institucional de Gestão de Chaves",
    icons: {
        icon: '/logo/unifafire_logo.png',
        apple: '/logo/unifafire_logo.png',
    },
    manifest: "/manifest.json",
};

// viewport-fit=cover: habilita env(safe-area-inset-*) em celulares com notch/home-bar.
// maximumScale=5: acessibilidade — nunca bloquear o zoom do usuário (WCAG 1.4.4).
export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
    themeColor: [
        { media: "(prefers-color-scheme: dark)", color: "#060B19" },
        { media: "(prefers-color-scheme: light)", color: "#0F1D57" },
    ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="pt-BR" className={inter.variable}>
            <body suppressHydrationWarning>
                {children}
                <Toaster
                    position="top-right"
                    toastOptions={{
                        style: {
                            background: 'var(--bg-elevated)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--border-strong)',
                            fontFamily: 'var(--font-inter), system-ui, sans-serif',
                            fontSize: '0.875rem',
                        },
                        success: { iconTheme: { primary: '#3dbf70', secondary: '#0f1d57' } },
                        error:   { iconTheme: { primary: '#f87171', secondary: '#0f1d57' } },
                    }}
                />
            </body>
        </html>
    );
}
