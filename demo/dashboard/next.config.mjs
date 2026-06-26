/** @type {import('next').NextConfig} */
const nextConfig = {
  // Server runtime (route handlers fire real HTTP + gRPC) — not a static export.
  // `standalone` gives a self-contained server bundle for a tiny Docker image.
  output: 'standalone',
  // grpc-js / proto-loader load files & use dynamic requires — keep them as
  // plain node_modules requires instead of bundling them into the server.
  serverExternalPackages: ['@grpc/grpc-js', '@grpc/proto-loader'],
};

export default nextConfig;
