import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'

const resolveVersionFromCommitSubject = () => {
  try {
    const subject = execSync('git log -1 --pretty=%s', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    if (!subject) return '';

    const match = subject.match(/'([^']+)'/);
    if (!match || !match[1]) return '';

    const token = match[1].trim();
    if (!token) return '';
    return token.startsWith('v.') ? token : `v.${token}`;
  } catch {
    return '';
  }
};

const resolveBuildVersion = () => {
  const explicit = (process.env.VITE_APP_VERSION || process.env.APP_VERSION || '').trim();
  if (explicit) {
    return explicit.startsWith('v.') ? explicit : `v.${explicit}`;
  }

  const fromCommitSubject = resolveVersionFromCommitSubject();
  if (fromCommitSubject) {
    return fromCommitSubject;
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
