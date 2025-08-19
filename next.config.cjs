/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true, // �J�����ɐ��ݓI�ȃo�O���x��
  experimental: {
    appDir: true, // App Router ��L�����i/app �f�B���N�g�����p�j
  },
  distDir: '.next', // �r���h�o�͐�i����̓f�t�H���g�Ȃ̂ŏȗ��\�j
  pageExtensions: ['ts', 'tsx', 'js', 'jsx'], // �ΏۂƂ���y�[�W�g���q�isrc�Ή��ɕ֗��j
};

module.exports = nextConfig;