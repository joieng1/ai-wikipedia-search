/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next 16+: `experimental.serverComponentsExternalPackages` moved to `serverExternalPackages`.
  // Keep native/node-only deps external to avoid bundling issues.
  serverExternalPackages: ["sharp", "onnxruntime-node", "better-sqlite3"],
};

export default nextConfig;
