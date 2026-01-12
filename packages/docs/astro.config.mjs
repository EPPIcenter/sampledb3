// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	site: 'https://docs.example.com',
	integrations: [
		starlight({
			title: 'SampleDB User Guide',
			description: 'Complete user guide for SampleDB laboratory sample management system',
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
						href: '/favicon.ico',
					},
				},
				{
					tag: 'link',
					attrs: {
						rel: 'icon',
						type: 'image/png',
						href: '/icon.png',
					},
				},
				{
					tag: 'link',
					attrs: {
						rel: 'apple-touch-icon',
						href: '/icon.png',
					},
				},
			],
			sidebar: [
				{
					label: 'Introduction',
					items: [
						{ label: 'Welcome', link: '/' },
					],
				},
				{
					label: 'Getting Started',
					items: [
						{ label: 'Initial Setup', link: '/guides/getting-started/setup/' },
						{ label: 'Dashboard Overview', link: '/guides/getting-started/dashboard/' },
					],
				},
				{
					label: 'Core Workflows',
					items: [
						{ label: 'Studies Management', link: '/guides/workflows/studies/' },
						{ label: 'Subjects & Specimens', link: '/guides/workflows/subjects-specimens/' },
						{ label: 'Container Management', link: '/guides/workflows/containers/' },
						{ label: 'Location Management', link: '/guides/workflows/locations/' },
					],
				},
				{
					label: 'Bulk Operations',
					items: [
						{ label: 'Bulk Import', link: '/guides/bulk-operations/import/' },
						{ label: 'Bulk Export', link: '/guides/bulk-operations/export/' },
						{ label: 'Container Movement', link: '/guides/bulk-operations/container-movement/' },
					],
				},
				{
					label: 'Specialized Features',
					items: [
						{ label: 'Blood Controls', link: '/guides/features/blood-controls/' },
						{ label: 'Derivations', link: '/guides/features/derivations/' },
						{ label: 'Collection Move', link: '/guides/features/collection-move/' },
					],
				},
				{
					label: 'Reference Data',
					items: [
						{ label: 'Overview', link: '/guides/reference-data/overview/' },
						{ label: 'Specimen Types', link: '/guides/reference-data/specimen-types/' },
						{ label: 'Units', link: '/guides/reference-data/units/' },
						{ label: 'Storage Types', link: '/guides/reference-data/storage-types/' },
						{ label: 'Locations', link: '/guides/reference-data/locations-ref/' },
						{ label: 'Other Reference Data', link: '/guides/reference-data/other/' },
					],
				},
				{
					label: 'Advanced Topics',
					items: [
						{ label: 'Barcode Export', link: '/guides/advanced/barcode-export/' },
						{ label: 'Statistics', link: '/guides/advanced/statistics/' },
						{ label: 'Search Functionality', link: '/guides/advanced/search/' },
						{ label: 'Application Settings', link: '/guides/advanced/settings/' },
					],
				},
				{
					label: 'Troubleshooting',
					items: [
						{ label: 'Common Issues', link: '/guides/troubleshooting/common-issues/' },
						{ label: 'Best Practices', link: '/guides/troubleshooting/best-practices/' },
						{ label: 'CSV Guidelines', link: '/guides/troubleshooting/csv-guidelines/' },
					],
				},
			],
		}),
	],
});
