// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	site: 'https://docs.example.com',
	base: '/docs',
	trailingSlash: 'always',
	integrations: [
		starlight({
			title: 'SampleDB User Guide',
			description: 'User guide for SampleDB — specimen inventory and workflow for research and clinical labs',
			logo: {
				src: './src/assets/icon.png',
				alt: 'SampleDB',
				replacesTitle: false,
			},
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/withastro/starlight' },
			],
			customCss: [
				'./src/styles/custom.css',
			],
			head: [
				{
					tag: 'link',
					attrs: {
						rel: 'icon',
						type: 'image/x-icon',
						href: '/docs/favicon.ico',
					},
				},
				{
					tag: 'link',
					attrs: {
						rel: 'icon',
						type: 'image/png',
						href: '/docs/icon.png',
					},
				},
				{
					tag: 'link',
					attrs: {
						rel: 'apple-touch-icon',
						href: '/docs/icon.png',
					},
				},
			],
			sidebar: [
				{
					label: 'Introduction',
					items: [
						{ label: 'Welcome', slug: '' },
					],
				},
				{
					label: 'Getting Started',
					autogenerate: { directory: 'guides/getting-started' },
				},
				{
					label: 'Core Workflows',
					autogenerate: { directory: 'guides/workflows' },
				},
				{
					label: 'Bulk Operations',
					autogenerate: { directory: 'guides/bulk-operations' },
				},
				{
					label: 'Specialized Features',
					autogenerate: { directory: 'guides/features' },
				},
				{
					label: 'Reference Data',
					autogenerate: { directory: 'guides/reference-data' },
				},
				{
					label: 'Advanced Topics',
					autogenerate: { directory: 'guides/advanced' },
				},
				{
					label: 'Troubleshooting',
					autogenerate: { directory: 'guides/troubleshooting' },
				},
			],
		}),
	],
});
