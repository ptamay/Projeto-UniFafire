import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Turbopack sem opções: o Next 16 exige a chave declarada, ainda que vazia.
  turbopack: {},

  // O `withPWA` do `@ducanh2912/next-pwa` saiu na TASK-129 (ADR-030). O plugin só
  // age no callback `webpack`, e o build do Next 16 é Turbopack: em nenhum build
  // ele gerou o service worker nem o script que o registra. O PWA do sistema é o
  // `public/manifest.json`. Service worker novo entra por Change Request próprio.

  // `allowedDevOrigins` saiu na TASK-082 junto com o resto da topologia de rede
  // interna (TASK-079). Ele liberava um IP fixo da rede da instituição para o
  // servidor de desenvolvimento — endereço que deixou de existir quando o acesso
  // virou uma URL. O comentário sobre `instrumentation.ts` saiu junto: o arquivo
  // foi removido na TASK-084.
};

export default nextConfig;
