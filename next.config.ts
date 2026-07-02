import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true
});

const nextConfig: NextConfig = {
  /* config options here */
  // instrumentation.ts é habilitado por padrão desde o Next 15 —
  // experimental.instrumentationHook não existe mais no Next 16.
  // As per suggestion: setting empty turbopack config
  // Note: Depending on exact Next 16 schema, it might be in experimental or top level.
  // The error said "setting an empty turbopack config in your Next config file (e.g. `turbopack: {}`)"
  turbopack: {}
};

export default withPWA(nextConfig);
