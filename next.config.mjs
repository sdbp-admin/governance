/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  output: "export",
  basePath: "/governance",
  assetPrefix: "/governance/",
  trailingSlash: true,
};

export default nextConfig;
