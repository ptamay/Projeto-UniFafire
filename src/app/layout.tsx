import type { Metadata } from "next";
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="pt-BR" className={inter.variable}>
            <body>
                {children}
                <Toaster
                    position="top-right"
                    toastOptions={{
                        style: {
                            background: '#0f1d57',
                            color: '#e8f0ff',
                            border: '1px solid rgba(29,128,70,0.30)',
                            fontFamily: 'Inter, sans-serif',
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
