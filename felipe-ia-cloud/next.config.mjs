/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  experimental: {
    serverActions: {
      bodySizeLimit: '12mb'
    }
  },
  async rewrites() {
    return [
      {
        source: '/',
        has: [
          {
            type: 'host',
            value: 'new-ai-transsalomao.vercel.app'
          }
        ],
        destination: '/new'
      }
    ];
  }
};

export default nextConfig;
