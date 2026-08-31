/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },

  devIndicators: {
    buildActivity: false,
    buildActivityPosition: "bottom-right",
  },

  images: {
    unoptimized: true,
  },
};

export default nextConfig;
