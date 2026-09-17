import { fileURLToPath } from 'node:url';

import { withEve } from 'eve/next';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@fantasy-basketball/fantasy'],
};

export default withEve(nextConfig, {
  eveRoot: fileURLToPath(new URL('../../', import.meta.url)),
});
