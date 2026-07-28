import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'line' : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // The directory import runs here too: `/lugares` and `/proveedores` are
    // public routes now, and testing them against an empty table would prove
    // nothing about the records visitors actually see.
    command: `npm run db:reset && npm run db:seed && npm run directory:import -- --apply && npx next dev --port ${PORT}`,
    port: PORT,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      APP_ENV: 'test',
      EMAIL_ADAPTER: 'fake',
      SESSION_SECRET: 'e2e-only-session-secret-not-a-real-secret-000000',
      // The suite signs in as many seeded users from one address. Ignored when
      // APP_ENV=production, where the limit stays at 5/hour.
      LOGIN_REQUESTS_PER_HOUR: '50',
      LOCAL_HOST_MAP: `localhost:${PORT}=suanas-mx,pergolas.localhost:${PORT}=pergolas-mx`,
    },
  },
});
