'use client';

import { SpeedInsights } from '@vercel/speed-insights/next';
import { semConsulta } from '@/lib/medicao-desempenho';

// TASK-126 (ADR-028) — o ÚNICO lugar que desenha o Speed Insights (há guarda).
//
// Componente de cliente próprio porque o `beforeSend` é uma função, e o layout
// raiz, que é Server Component, não pode passá-la adiante. Quem desenhasse
// `<SpeedInsights>` direto em outro lugar mandaria a URL com a query inteira.
export default function MedicaoDeDesempenho() {
    return <SpeedInsights beforeSend={semConsulta} />;
}
