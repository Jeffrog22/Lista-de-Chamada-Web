import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'

import { cloudflare } from "@cloudflare/vite-plugin";

const normalizeVersionToken = (token: string) => {
  const candidate = String(token || '').trim();
  if (!candidate) return '';
  if (candidate.toLowerCase().startsWith('v.')) return candidate;
  return `v.${candidate}`;
};

const findVersionToken = (text: string) => {
  if (!text) return '';

  const quotedMatch = text.match(/'((?:v\.)?\d+(?:\.\d+)*(?:-[\w.]+)?)'/i);
  if (quotedMatch?.[1]) return normalizeVersionToken(quotedMatch[1]);

  const anyMatch = text.match(/(?:^|\s)(v\.\d+(?:\.\d+)*(?:-[\w.]+)?)(?=\s|$|[.,;:!?])/i);
  if (anyMatch?.[1]) return normalizeVersionToken(anyMatch[1]);

  const simpleQuotedMatch = text.match(/'((?:\d+(?:\.\d+)*(?:-[\w.]+)?))'/i);
  if (simpleQuotedMatch?.[1]) return normalizeVersionToken(simpleQuotedMatch[1]);

  const simpleAnyMatch = text.match(/(?:^|\s)(\d+(?:\.\d+)*(?:-[\w.]+)?)(?=\s|$|[.,;:!?])/i);
  if (simpleAnyMatch?.[1]) return normalizeVersionToken(simpleAnyMatch[1]);

  return '';
};

const resolveVersionFromCommitMessage = () => {
  try {
    const message = execSync('git log -1 --pretty=%B', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    return findVersionToken(message);
  } catch {
    return '';
  }
};

const resolveVersionFromCommitSubject = () => {
  try {
    const subject = execSync('git log -1 --pretty=%s', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    return findVersionToken(subject);
  } catch {
    return '';
  }
};

const resolveVersionFromGitTag = () => {
  try {
    const exact = execSync('git describe --tags --exact-match', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    if (exact) return normalizeVersionToken(exact.replace(/^refs\/tags\//, ''));
  } catch {}

  try {
    const latest = execSync('git describe --tags --abbrev=0', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    if (latest) return normalizeVersionToken(latest.replace(/^refs\/tags\//, ''));
  } catch {}

  return '';
};

const resolveBuildVersion = () => {
  const explicit = (process.env.VITE_APP_VERSION || process.env.APP_VERSION || '').trim();
  if (explicit) {
    return explicit.startsWith('v.') ? explicit : `v.${explicit}`;
  }

  const fromCommitMessage = resolveVersionFromCommitMessage();
  if (fromCommitMessage) {
    return fromCommitMessage;
  }

  const fromCommitSubject = resolveVersionFromCommitSubject();
  if (fromCommitSubject) {
    return fromCommitSubject;
  }

  const fromTag = resolveVersionFromGitTag();
  if (fromTag) {
    return fromTag;
  }

  const fromEnv = (process.env.RENDER_GIT_COMMIT || process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || '').trim();
  const short = fromEnv ? fromEnv.slice(0, 7) : 'local';
  return `v.${short}`;
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), cloudflare()],
  define: {
    __APP_VERSION__: JSON.stringify(resolveBuildVersion()),
  },
})