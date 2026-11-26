/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  // The app type-checks cleanly, so a type error now fails the build instead of reaching the counter.
  // (It was ignored while the app carried several hundred of them, which hid real crashes.)
  typescript: {
    ignoreBuildErrors: false,
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
