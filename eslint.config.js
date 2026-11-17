/**
 * eslint.config.js — the linter's rules (ESLint 9+ "flat" config).
 *
 *   npx eslint js        (or: eslint js, if it's installed globally)
 *
 * No plugins or presets, so it runs with ESLint alone: the core rules that
 * catch real mistakes (undefined names, unused imports and variables,
 * unreachable code, duplicate keys, …), with the browser globals the app
 * uses listed below. Style is left to the code's own conventions.
 */

const browser = Object.fromEntries([
  'window', 'document', 'navigator', 'location', 'history', 'localStorage', 'sessionStorage', 'console',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'queueMicrotask',
  'URL', 'URLSearchParams', 'Blob', 'File', 'FileReader', 'FormData', 'Image', 'Audio', 'MediaRecorder', 'DOMParser', 'XMLSerializer',
  'IntersectionObserver', 'ResizeObserver', 'MutationObserver', 'BroadcastChannel', 'structuredClone', 'crypto', 'TextEncoder', 'TextDecoder',
  'fetch', 'getComputedStyle', 'matchMedia', 'performance', 'atob', 'btoa', 'CSS', 'AbortController', 'Event', 'CustomEvent', 'KeyboardEvent', 'HashChangeEvent',
  'HTMLElement', 'HTMLInputElement', 'HTMLCanvasElement', 'Element', 'Node', 'NodeFilter', 'SVGElement', 'DataTransfer', 'ClipboardItem', 'Notification',
  'ArrayBuffer', 'DataView', 'Uint8Array', 'Uint8ClampedArray', 'Float32Array', 'Intl', 'globalThis', 'CompressionStream', 'DecompressionStream',
  'Response', 'Headers', 'Request', 'ImageData', 'OffscreenCanvas', 'createImageBitmap', 'PointerEvent', 'MouseEvent', 'TouchEvent', 'screen', 'alert', 'confirm', 'prompt',
].map((name) => [name, 'readonly']));

export default [
  {
    files: ['js/**/*.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: browser },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { args: 'none', varsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }],
      'no-unreachable': 'error',
      'no-dupe-keys': 'error',
      'no-duplicate-case': 'error',
      'no-dupe-else-if': 'error',
      'no-self-assign': 'error',
      'no-self-compare': 'error',
      'no-const-assign': 'error',
      'no-import-assign': 'error',
      'no-func-assign': 'error',
      'no-cond-assign': ['error', 'except-parens'],
      'no-constant-binary-expression': 'error',
      'no-unsafe-negation': 'error',
      'no-unsafe-finally': 'error',
      'no-sparse-arrays': 'error',
      'use-isnan': 'error',
      'valid-typeof': 'error',
      'no-debugger': 'error',
      'no-redeclare': 'error',
      'no-shadow-restricted-names': 'error',
      'no-useless-catch': 'error',
      'no-empty-pattern': 'error',
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': ['error', { destructuring: 'all' }],
    },
  },
];
