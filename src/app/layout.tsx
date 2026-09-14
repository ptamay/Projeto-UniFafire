import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Next } from "next/font/google";
import "./globals.css";
import { Toaster } from "react-hot-toast";
import MedicaoDeDesempenho from "./components/MedicaoDeDesempenho";
import { deveMedirDesempenho } from "@/lib/medicao-desempenho";
import { SCRIPT_TEMA } from "@/lib/tema";

// TASK-132 (ADR-031): desenhada pelo Braille Institute para baixa visão — I/l/1, O/0
// e a/o não se confundem. Quem guia as telas são funcionários de apoio e porteiros,
// parte com pouca instrução e com a fonte do celular aumentada. Fonte variável: um
// arquivo cobre os três pesos da escala (400, 600, 700).
// O next/font não tem métricas desta família para ajustar a fonte reserva (avisa
// "Failed to find font override values" no build): a reserva é declarada aqui, sem
// ajuste automático. O custo é um leve reflow na troca, que o Speed Insights mede.
const fonteSistema = Atkinson_Hyperlegible_Next({
    subsets: ["latin"],
    variable: "--font-sistema",
    fallback: ["system-ui", "sans-serif"],
    adjustFontFallback: false,
});

export const metadata: Metadata = {
    title: "Sistema de Gestão de Chaves",
    description: "Sistema Institucional de Gestão de Chaves",
    icons: {
        icon: '/logo/unifafire_logo.png',
        // Tela inicial do iOS (ADR-030): quadrado e opaco — o iOS pinta de preto
        // o que for transparente.
        apple: '/icons/apple-touch-icon.png',
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
        // suppressHydrationWarning no <html>: o SCRIPT_TEMA acrescenta "light-mode" antes
        // da hidratação, e a classe do servidor não a tem — é esperado, não defeito.
        <html lang="pt-BR" className={fonteSistema.variable} suppressHydrationWarning>
            <head>
                {/* Tema antes da primeira pintura: segue o aparelho, a escolha salva vence
                    (TASK-132 · ADR-031). Num useEffect, quem prefere claro veria a tela
                    piscar escura a cada carregamento. */}
                <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
            </head>
            <body suppressHydrationWarning>
                {children}
                <Toaster
                    position="top-right"
                    toastOptions={{
                        style: {
                            background: 'var(--bg-elevated)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--border-strong)',
                            fontFamily: 'var(--font-sistema), system-ui, sans-serif',
                            fontSize: 'var(--fs-2)',
                        },
                        success: { iconTheme: { primary: '#3dbf70', secondary: '#0f1d57' } },
                        error:   { iconTheme: { primary: '#f87171', secondary: '#0f1d57' } },
                    }}
                />
                {/* Desempenho no navegador, só num deploy da Vercel (ADR-028). */}
                {deveMedirDesempenho(process.env) && <MedicaoDeDesempenho />}
            </body>
        </html>
    );
}
