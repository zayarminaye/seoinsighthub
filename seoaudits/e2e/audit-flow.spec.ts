import { expect, test } from '@playwright/test';

async function setSession(
  page: import('@playwright/test').Page,
  session: {
    clerkId: string;
    email: string;
    name: string;
    role: 'admin' | 'user';
    plan: 'free' | 'starter' | 'pro' | 'enterprise';
  }
) {
  const sessionRes = await page.request.post('/api/e2e/session', {
    data: session,
  });
  expect(sessionRes.ok()).toBeTruthy();
}

async function seedSessionAndAudit(page: import('@playwright/test').Page) {
  await setSession(page, {
    clerkId: 'e2e-admin',
    email: 'e2e-admin@example.com',
    name: 'E2E Admin',
    role: 'admin',
    plan: 'starter',
  });

  const bootstrapRes = await page.request.post('/api/e2e/bootstrap', {
    data: { targetDomain: 'https://fixture.local' },
  });
  expect(bootstrapRes.ok()).toBeTruthy();
  const body = (await bootstrapRes.json()) as { data?: { auditId?: string } };
  const auditId = body.data?.auditId;
  expect(auditId).toBeTruthy();

  const enablePdfRes = await page.request.patch('/api/admin/features/export.pdf', {
    data: {
      enabled: true,
      plans: ['free', 'starter', 'pro', 'enterprise'],
      description: 'PDF report export',
    },
  });
  expect(enablePdfRes.ok()).toBeTruthy();
  const enableCsvRes = await page.request.patch('/api/admin/features/export.csv', {
    data: {
      enabled: true,
      plans: ['free', 'starter', 'pro', 'enterprise'],
      description: 'CSV data export',
    },
  });
  expect(enableCsvRes.ok()).toBeTruthy();
  const enableJsonRes = await page.request.patch('/api/admin/features/export.json', {
    data: {
      enabled: true,
      plans: ['free', 'starter', 'pro', 'enterprise'],
      description: 'JSON data export',
    },
  });
  expect(enableJsonRes.ok()).toBeTruthy();

  return auditId as string;
}

test.describe('Audit Report E2E', () => {
  test.describe.configure({ mode: 'serial' });

  test('renders completed report and export endpoints work', async ({ page }) => {
    const auditId = await seedSessionAndAudit(page);

    await page.goto(`/audits/${auditId}`);
    await expect(page.locator('[data-slot="badge"]', { hasText: 'COMPLETED' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'PDF' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pages CSV' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Issues CSV' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'JSON' })).toBeVisible();

    const pagesCsvRes = await page.request.get(`/api/audits/${auditId}/export/pages-csv`);
    expect(pagesCsvRes.ok()).toBeTruthy();
    const csvText = await pagesCsvRes.text();
    expect(csvText).toContain('URL,HTTP Status');

    const issuesCsvRes = await page.request.get(`/api/audits/${auditId}/export/issues-csv`);
    expect(issuesCsvRes.ok()).toBeTruthy();
    const issuesCsv = await issuesCsvRes.text();
    expect(issuesCsv).toContain('Severity,Step');

    const jsonRes = await page.request.get(`/api/audits/${auditId}/export/json`);
    expect(jsonRes.ok()).toBeTruthy();
    const jsonBody = (await jsonRes.json()) as { id?: string };
    expect(jsonBody.id).toBe(auditId);
  });

  test('admin feature toggle immediately affects export enforcement', async ({ page }) => {
    const auditId = await seedSessionAndAudit(page);

    const disablePdfRes = await page.request.patch('/api/admin/features/export.pdf', {
      data: {
        enabled: false,
        plans: ['free', 'starter', 'pro', 'enterprise'],
        description: 'PDF report export',
      },
    });
    expect(disablePdfRes.ok()).toBeTruthy();

    const deniedPdfRes = await page.request.get(`/api/audits/${auditId}/export/pdf`);
    expect(deniedPdfRes.status()).toBe(403);
    const deniedBody = (await deniedPdfRes.json()) as { error?: string };
    expect(deniedBody.error).toContain('disabled by admin');

    const enablePdfRes = await page.request.patch('/api/admin/features/export.pdf', {
      data: {
        enabled: true,
        plans: ['free', 'starter', 'pro', 'enterprise'],
        description: 'PDF report export',
      },
    });
    expect(enablePdfRes.ok()).toBeTruthy();

    const okPdfRes = await page.request.get(`/api/audits/${auditId}/export/pdf`);
    expect(okPdfRes.ok()).toBeTruthy();
    expect(okPdfRes.headers()['content-type']).toContain('application/pdf');
  });

  test('free user step visibility reflects admin feature plan configuration', async ({ page }) => {
    await setSession(page, {
      clerkId: 'e2e-admin',
      email: 'e2e-admin@example.com',
      name: 'E2E Admin',
      role: 'admin',
      plan: 'starter',
    });

    const disableFreeAuthority = await page.request.patch('/api/admin/features/audit.steps.authority', {
      data: {
        enabled: true,
        plans: ['starter', 'pro', 'enterprise'],
        description: 'Steps 15-18 Authority pillar',
      },
    });
    expect(disableFreeAuthority.ok()).toBeTruthy();

    await setSession(page, {
      clerkId: 'e2e-free-user',
      email: 'e2e-free@example.com',
      name: 'E2E Free',
      role: 'user',
      plan: 'free',
    });

    await page.goto('/audits/new');
    await expect(page.getByText('Authority')).toHaveCount(0);
    await expect(page.getByText('Step 15')).toHaveCount(0);

    await setSession(page, {
      clerkId: 'e2e-admin',
      email: 'e2e-admin@example.com',
      name: 'E2E Admin',
      role: 'admin',
      plan: 'starter',
    });
    const restoreFreeAuthority = await page.request.patch('/api/admin/features/audit.steps.authority', {
      data: {
        enabled: true,
        plans: ['free', 'starter', 'pro', 'enterprise'],
        description: 'Steps 15-18 Authority pillar',
      },
    });
    expect(restoreFreeAuthority.ok()).toBeTruthy();
  });
});
