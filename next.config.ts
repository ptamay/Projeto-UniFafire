import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true
});

const nextConfig: NextConfig = {
  // Turbopack sem opções: o Next 16 exige a chave declarada, ainda que vazia.
  turbopack: {},

  // `allowedDevOrigins` saiu na TASK-082 junto com o resto da topologia de rede
  // interna (TASK-079). Ele liberava um IP fixo da rede da instituição para o
  // servidor de desenvolvimento — endereço que deixou de existir quando o acesso
  // virou uma URL. O comentário sobre `instrumentation.ts` saiu junto: o arquivo
  // foi removido na TASK-084.
};

export default withPWA(nextConfig);
