/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // The existing screens carry type errors from Firebase Studio. New server
    // and sync code is checked separately and strictly: `npm run typecheck:new`.
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

module.exports = nextConfig;
