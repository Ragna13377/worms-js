import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
	baseDirectory: __dirname,
});

const eslintConfig = [
	...compat.config({
		extends: ['next/core-web-vitals', 'next/typescript', 'prettier'],
		plugins: ['prettier'],
		rules: {
			'no-unused-vars': 'off',
			'@typescript-eslint/no-unused-vars': ['warn'],
			'react/react-in-jsx-scope': 'off',
			'react/self-closing-comp': 'warn',
			'react/void-dom-elements-no-children': 'warn',
			'react/jsx-boolean-value': ['warn', 'never'],
			'react/jsx-key': 'warn',
			'react/jsx-max-props-per-line': ['warn', { maximum: 7 }],
			'react/jsx-max-depth': ['warn', { max: 8 }],
			'arrow-body-style': ['warn', 'as-needed'],
			'jsx-quotes': ['warn', 'prefer-single'],
			'valid-typeof': 'warn',
			'prettier/prettier': [
				'warn',
				{
					usePrettierrc: true,
				},
			],
			quotes: [2, 'single', { avoidEscape: true }],
		},
	}),
	{
		ignores: [
			'node_modules',
			'public',
			'dist',
			'build',
			'webpack/*.js',
			'package*.json',
			'.eslintrc.js',
			'**/*.d.ts',
			'storybook-static',
		],
	},
];

export default eslintConfig;
