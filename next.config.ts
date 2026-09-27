import type { NextConfig } from 'next';

const isGitHubPages = process.env.GITHUB_ACTIONS === 'true';

const nextConfig: NextConfig = {
	output: 'export',
	trailingSlash: true,
	...(isGitHubPages
		? {
				basePath: '/worms-js',
			}
		: {}),
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
