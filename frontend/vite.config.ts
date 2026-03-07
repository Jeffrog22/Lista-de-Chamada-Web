import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const resolveBuildVersion = () => {
  const explicit = (process.env.VITE_APP_VERSION || process.env.APP_VERSION || '').trim();
  if (explicit) {
    return explicit.startsWith('v.') ? explicit : `v.${explicit}`;
  }

  const fromEnv = (process.env.RENDER_GIT_COMMIT || process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || '').trim();
  const short = fromEnv ? fromEnv.slice(0, 7) : 'local';
  return `v.${short}`;
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(resolveBuildVersion()),
  },
})
