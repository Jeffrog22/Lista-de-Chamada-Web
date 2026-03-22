import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'

const resolveVersionFromCommitSubject = () => {
  try {
    const subject = execSync('git log -1 --pretty=%s', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    if (!subject) return '';

    const quotedMatch = subject.match(/'((?:v\.)?\d+(?:\.\d+)*(?:-[\w.]+)?)'/i);
    const rawQuotedToken = quotedMatch?.[1]?.trim() || '';
    if (rawQuotedToken) {
      return rawQuotedToken.toLowerCase().startsWith('v.') ? rawQuotedToken : `v.${rawQuotedToken}`;
    }

    const directMatch = subject.match(/^\s*(v\.\d+(?:\.\d+)*(?:-[\w.]+)?)/i);
    const rawDirectToken = directMatch?.[1]?.trim() || '';
    if (rawDirectToken) {
      return rawDirectToken.toLowerCase().startsWith('v.') ? rawDirectToken : `v.${rawDirectToken}`;
    }

    return '';
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
