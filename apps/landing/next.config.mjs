/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // No image optimization yet — keep build artifact tiny.
  images: { unoptimized: true },
};
export default nextConfig;
