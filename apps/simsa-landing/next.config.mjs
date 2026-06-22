/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Static marketing entry — keep the build artifact tiny.
  images: { unoptimized: true },
};
export default nextConfig;
