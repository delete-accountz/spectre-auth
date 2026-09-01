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

  async redirects() {
    return [
      { source: "/logs", destination: "/dashboard/logs", permanent: false },
    ];
  },
};

export default nextConfig;
