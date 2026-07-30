import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  allowedDevOrigins: [
    'preview-chat-c76a4cbb-4f2a-49d6-93ba-63efda93d567.space-z.ai',
  ],
};

export default nextConfig;
