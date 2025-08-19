/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true, // 開発時に潜在的なバグを警告
  experimental: {
    appDir: true, // App Router を有効化（/app ディレクトリ利用）
  },
  distDir: '.next', // ビルド出力先（これはデフォルトなので省略可能）
  pageExtensions: ['ts', 'tsx', 'js', 'jsx'], // 対象とするページ拡張子（src対応に便利）
};

module.exports = nextConfig;