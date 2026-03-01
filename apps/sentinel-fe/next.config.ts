import type { NextConfig } from 'next'
import path from 'path'

const nextConfig: NextConfig = {
  transpilePackages: [
    '@sentinel/shared',
    '@deck.gl/core',
    '@deck.gl/layers',
    '@deck.gl/mapbox',
    '@deck.gl/aggregation-layers',
    'deck.gl',
    '@luma.gl/core',
    '@luma.gl/webgl',
    '@math.gl/core',
    '@math.gl/web-mercator',
  ],
  outputFileTracingRoot: path.join(__dirname, '../../'),
}

export default nextConfig
