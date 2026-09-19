import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const port = 3000;
const dataDir = path.resolve('test-results', `data-${process.pid}`);

export default defineConfig({
  testDir: './test',
  testMatch: '**/*.e2e.spec.mjs',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['line'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  outputDir: 'test-results/playwright',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm start',
    url: `http://127.0.0.1:${port}/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      PORT: String(port),
      EMAIL_INTAKE_TEST_MODE: '1',
      EMAIL_INTAKE_ALLOWED_DOMAINS: 'trustedfm.co.uk',
      OPSBOARD_DATA_DIR: dataDir,
      COMPLIANCE_DB_PATH: path.join(dataDir, 'opsboard.sqlite'),
      COMPLIANCE_EXPORT_DIR: path.join(dataDir, 'exports'),
    },
  },
});
