/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Spotify's OAuth redirect URI must be http://127.0.0.1:5173 — bind IPv4
  // explicitly ("localhost" resolves to ::1 only on this setup).
  server: { host: '127.0.0.1', port: 5173 },
  test: { environment: 'node' },
});
