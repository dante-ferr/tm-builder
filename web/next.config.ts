import type {NextConfig} from 'next';

const devBackend = process.env.TM_BUILDER_API_ORIGIN || 'http://127.0.0.1:8765';

const nextConfig: NextConfig = {
  output: process.env.NODE_ENV === 'development' ? undefined : 'export',
  // Development uses Next's server; exported builds use the Python server.
  ...(process.env.NODE_ENV === 'development' ? {
    async rewrites() {
      return [{source: '/api/:path*', destination: `${devBackend}/api/:path*`}];
    },
  } : {}),
};

export default nextConfig;
