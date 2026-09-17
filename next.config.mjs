/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: '/downloads/:path*', headers: [
      { key: 'Content-Type', value: 'application/vnd.android.package-archive' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
    ] }];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
