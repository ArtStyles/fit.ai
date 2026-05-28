/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'wger.de',
        pathname: '/media/**',
      },
    ],
  },
};

export default nextConfig;
