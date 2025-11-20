import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json';

/** @type {import('vite').UserConfig} */
export default { 
    build: { 
        sourcemap: true,
    },
    plugins: [
        VitePWA({
            registerType: 'autoUpdate',
            workbox: {
                globPatterns: ['**/*.{js,css,html,ico,png,svg,json,mcm,woff2}'],
                // 5MB
                maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
            },
            includeAssets: ['favicon.ico', 'robots.txt', 'apple-touch-icon.png'],
            manifest: {
                name: 'ECHO CORP - BlackBox Viewer',
                short_name: 'ECHO BlackBox',
                description: 'Advanced flight log analysis tool for ECHO CORP drone systems',
                theme_color: '#00f3ff',
                icons: [
                    {
                        src: '/images/icon-128x128.png',
                        sizes: '128x128',
                        type: 'image/png',
                    },
                    {
                        src: '/images/icon-192x192.png',
                        sizes: '192x192',
                        type: 'image/png',
                    },
                    {
                        src: '/images/icon-256x256.png',
                        sizes: '256x256',
                        type: 'image/png',
                    },
                    {
                        src: '/images/icon-512x512.png',
                        sizes: '512x512',
                        type: 'image/png',
                    },
                ],
                file_handlers: [{
                    action: "/",
                    accept: {
                      "application/octet-stream": [".bbl", ".bfl"],
                    },
                }],
            },
        }),
    ],
    define: {
        '__APP_VERSION__': JSON.stringify(pkg.version),
    },
}