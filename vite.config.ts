/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Spotify's OAuth redirect URI must be http://127.0.0.1:6173 — bind IPv4
  // explicitly ("localhost" resolves to ::1 only on this setup).
  // strictPort: fail loudly if 6173 is taken rather than drifting to 6174,
  // which would silently break the Spotify OAuth redirect URI.
  server: { host: '127.0.0.1', port: 6173, strictPort: true },
  test: { environment: 'node' },
});
