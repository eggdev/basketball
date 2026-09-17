import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@fantasy-basketball/auth', '@fantasy-basketball/fantasy'],
};

export default nextConfig;
