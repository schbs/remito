import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // La demo lee las facturas ficticias, el set dorado y las respuestas grabadas de Gemini desde data/ en el servidor.
  outputFileTracingIncludes: {
    "/**": ["./data/facturas/**", "./data/golden/**", "./data/extraccion/**"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};

export default nextConfig;
