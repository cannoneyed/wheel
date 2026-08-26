import {
  createHighlighter,
  escapeHtml,
  type HighlightToken,
} from '@tanstack/highlight/core';
import { css } from '@tanstack/highlight/languages/css';
import { html } from '@tanstack/highlight/languages/html';
import { js } from '@tanstack/highlight/languages/js';
import { json } from '@tanstack/highlight/languages/json';
import { jsx } from '@tanstack/highlight/languages/jsx';
import { markdown } from '@tanstack/highlight/languages/markdown';
import { plaintext } from '@tanstack/highlight/languages/plaintext';
import { shell } from '@tanstack/highlight/languages/shell';
import { ts } from '@tanstack/highlight/languages/ts';
import { tsx } from '@tanstack/highlight/languages/tsx';

const highlighter = createHighlighter({
  fallbackLanguage: 'plaintext',
  languages: [css, html, js, json, jsx, markdown, plaintext, shell, ts, tsx],
});

export type SyntaxLanguage =
  | 'bash'
  | 'css'
  | 'javascript'
  | 'json'
  | 'jsx'
  | 'markdown'
  | 'plaintext'
  | 'tsx'
  | 'typescript'
  | 'xml';

const aliases: Readonly<Record<string, SyntaxLanguage>> = {
  bash: 'bash',
  css: 'css',
  html: 'xml',
  javascript: 'javascript',
  js: 'javascript',
  jsx: 'jsx',
  json: 'json',
  markdown: 'markdown',
  md: 'markdown',
  plaintext: 'plaintext',
  shell: 'bash',
  text: 'plaintext',
  ts: 'typescript',
  tsx: 'tsx',
  typescript: 'typescript',
  xml: 'xml',
};

const engineLanguages: Readonly<Record<SyntaxLanguage, string>> = {
  bash: 'shell',
  css: 'css',
  javascript: 'js',
  json: 'json',
  jsx: 'jsx',
  markdown: 'markdown',
  plaintext: 'plaintext',
  tsx: 'tsx',
  typescript: 'ts',
  xml: 'html',
};

function renderToken(token: HighlightToken): string {
  const value = escapeHtml(token.value);
  return token.className === undefined
    ? value
    : `<span class="wheel-Code-token wheel-Code-token--${token.className}">${value}</span>`;
}

/** Resolves public language aliases without using automatic language detection. */
export function syntaxLanguage(language?: string | undefined): SyntaxLanguage {
  return language === undefined ? 'plaintext' : (aliases[language.toLowerCase()] ?? 'plaintext');
}

/** Returns escaped design-system token markup for trusted insertion into Wheel Code. */
export function highlightSyntax(source: string, language?: string | undefined): string {
  const resolvedLanguage = syntaxLanguage(language);
  return highlighter
    .tokenize(source, { lang: engineLanguages[resolvedLanguage] })
    .tokens.map(renderToken)
    .join('');
}
