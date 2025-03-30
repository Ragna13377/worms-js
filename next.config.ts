import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
	images: {
		unoptimized: true,
	},
	webpack(config) {
		config.module.rules.push({
			test: /\.glsl$|\.frag$|\.vert$/i,
			use: 'raw-loader',
		});
		return config;
	},
};

export default nextConfig;
