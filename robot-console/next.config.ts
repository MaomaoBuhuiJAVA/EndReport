import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  devIndicators: false,
  experimental: { cpus: 1, webpackMemoryOptimizations: true },
  serverExternalPackages: ["ali-oss", "pdfjs-dist", "pdfkit", "pptxgenjs", "mammoth", "word-extractor", "@embedpdf/fonts-sc"],
  outputFileTracingIncludes: {
    "/api/science-resources/recognize": [
      "./node_modules/pdfjs-dist/legacy/build/pdf.mjs",
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "./node_modules/pdfjs-dist/package.json",
      "./node_modules/pdfjs-dist/cmaps/**/*",
      "./node_modules/pdfjs-dist/standard_fonts/**/*",
      "./node_modules/@napi-rs/canvas/**/*",
      "./node_modules/@napi-rs/canvas-*/**/*",
    ],
    "/api/ai-chat": [
      "./node_modules/pdfkit/js/**/*",
      "./node_modules/@embedpdf/fonts-sc/fonts/NotoSansHans-Regular.otf",
      "./node_modules/pdfjs-dist/legacy/build/pdf.mjs",
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "./node_modules/pdfjs-dist/package.json",
      "./node_modules/pdfjs-dist/cmaps/**/*",
      "./node_modules/pdfjs-dist/standard_fonts/**/*",
      "./node_modules/@napi-rs/canvas/**/*",
      "./node_modules/@napi-rs/canvas-*/**/*",
    ],
  },
};

export default nextConfig;
