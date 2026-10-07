import path from 'node:path';
import type { NextConfig } from 'next';

const isGitHubPages = process.env.GITHUB_ACTIONS === 'true';

const nextConfig: NextConfig = {
	allowedDevOrigins: ['127.0.0.1'],
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
	webpack(config, { dev, isServer }) {
		if (dev && !isServer) {
			config.module.rules.push({
				test: /[/\\]mini-css-extract-plugin[/\\]hmr[/\\]hotModuleReplacement\.js$/,
				use: path.resolve('scripts/css-hmr-safe-remove.cjs'),
			});
		}
		config.module.rules.push({
			test: /\.glsl$|\.frag$|\.vert$/i,
			use: 'raw-loader',
		});
		return config;
	},
};

export default nextConfig;
