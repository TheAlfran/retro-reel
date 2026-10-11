import { defineConfig } from 'vite';

// Keep packaged images relative to their JS bundle inside VS Code webviews.
export default defineConfig({ base: './' });
