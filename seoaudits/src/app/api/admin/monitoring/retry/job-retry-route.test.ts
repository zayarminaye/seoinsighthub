import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/admin/monitoring/retry/[jobId]/route';
import { requireAdmin } from '@/lib/adminAuth';
import { currentUser } from '@clerk/nextjs/server';
import { logAdminAction } from '@/lib/adminAuditLog';

const queueGetJob = vi.fn();
const queueClose = vi.fn();
const jobRetry = vi.fn();

vi.mock('bullmq', () => ({
  Queue: class MockQueue {
    getJob = queueGetJob;
    close = queueClose;
  },
}));

vi.mock('@/lib/adminAuth', () => ({
  requireAdmin: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  currentUser: vi.fn(),
}));

vi.mock('@/lib/adminAuditLog', () => ({
  logAdminAction: vi.fn(),
}));

vi.mock('@/lib/redis', () => ({
  redis: {},
}));

describe('POST /api/admin/monitoring/retry/[jobId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    queueClose.mockResolvedValue(undefined);
    queueGetJob.mockResolvedValue({ retry: jobRetry });
    jobRetry.mockResolvedValue(undefined);
  });

  it('returns 403 when admin check fails', async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new Error('FORBIDDEN_ADMIN'));

    const req = { json: vi.fn().mockResolvedValue({ queue: 'audit-orchestrator' }) } as never;
    const res = await POST(req, { params: Promise.resolve({ jobId: 'j1' }) });
    const body = (await res.json()) as { error?: string };

    expect(res.status).toBe(403);
    expect(body.error).toBe('Forbidden');
  });

  it('returns 400 when queue is invalid', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(undefined);

    const req = { json: vi.fn().mockResolvedValue({ queue: 'invalid-queue' }) } as never;
    const res = await POST(req, { params: Promise.resolve({ jobId: 'j1' }) });
    const body = (await res.json()) as { error?: string };

    expect(res.status).toBe(400);
    expect(body.error).toBe('Invalid queue');
  });

  it('returns 404 when job is not found', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(undefined);
    queueGetJob.mockResolvedValue(null);

    const req = { json: vi.fn().mockResolvedValue({ queue: 'audit-orchestrator' }) } as never;
    const res = await POST(req, { params: Promise.resolve({ jobId: 'j404' }) });
    const body = (await res.json()) as { error?: string };

    expect(res.status).toBe(404);
    expect(body.error).toBe('Job not found');
    expect(queueClose).toHaveBeenCalledTimes(1);
  });

  it('retries job and logs admin action', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(undefined);
    vi.mocked(currentUser).mockResolvedValue({ id: 'admin_1' } as never);

    const req = { json: vi.fn().mockResolvedValue({ queue: 'audit-orchestrator' }) } as never;
    const res = await POST(req, { params: Promise.resolve({ jobId: 'j1' }) });
    const body = (await res.json()) as { ok?: boolean };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(jobRetry).toHaveBeenCalledTimes(1);
    expect(queueClose).toHaveBeenCalledTimes(1);
    expect(logAdminAction).toHaveBeenCalledWith({
      adminId: 'admin_1',
      action: 'job.retried',
      targetId: 'j1',
      details: { queue: 'audit-orchestrator' },
    });
  });

  it('returns 200 even when audit logging fails after retry', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(undefined);
    vi.mocked(currentUser).mockResolvedValue({ id: 'admin_1' } as never);
    vi.mocked(logAdminAction).mockRejectedValue(new Error('db down'));

    const req = { json: vi.fn().mockResolvedValue({ queue: 'audit-orchestrator' }) } as never;
    const res = await POST(req, { params: Promise.resolve({ jobId: 'j1' }) });
    const body = (await res.json()) as { ok?: boolean };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(jobRetry).toHaveBeenCalledTimes(1);
    expect(queueClose).toHaveBeenCalledTimes(1);
  });
});
