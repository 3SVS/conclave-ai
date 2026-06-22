/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Static developer placeholder — keep the build artifact tiny.
  images: { unoptimized: true },
};
export default nextConfig;
