import { afterEach, expect, it, vi } from 'vitest';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { Context } from '@deepseek-ai/cordis';
import type { JobOutcome } from '@deepseek-ai/dsh-jobs';
import type { KicadIpcClient } from '../src/ipc/client.js';
import type { FreeroutingClient } from '../src/proxy/freerouting-client.js';
import type { RouteHandlers } from '../src/proxy/routing-contracts.js';
import { UpstreamServiceError } from '../src/proxy/upstream-errors.js';
import { ResourceGuard, resourceLimits } from '../src/runs/resource-guard.js';
import * as computeClient from '../src/runs/compute-client.js';
import { activeHelperPids } from '../src/ipc/helper-processes.js';
import { z } from 'zod';
import type { FreeroutingLauncher } from '../src/runs/launcher.js';
import { RunService } from '../src/runs/run-service.js';
import { RunStore } from '../src/runs/run-store.js';
import { EditorLifecycle } from '../src/runs/editor-lifecycle.js';
import { statusResponse } from '../src/runs/contracts.js';
import { previewDsn, previewSes } from './preview-fixture.js';

const services: RunService[] = [],
  stores: RunStore[] = [];
afterEach(async () => {
  for (const service of services.splice(0)) {
    await service.dispose();
  }
  for (const store of stores.splice(0)) {
    store.dispose();
  }
  vi.restoreAllMocks();
  vi.useRealTimers();
});
function harness(realtime = false, resourcesEnabled: boolean | ResourceGuard = false) {
  let enginePid: number | undefined;
  let resourceStop: ((reason: Error) => void) | undefined;
  const runs = new RunStore({ maxPendingRuns: 4, resultTtlMs: 3600000 });
  stores.push(runs);
  let done!: Promise<JobOutcome>;
  const ctx = {
    logger: { info: vi.fn() },
    jobs: {
      start: (job: { run: () => { done: Promise<JobOutcome> } }) => {
        done = job.run().done;
        return 'editor-close-job';
      },
    },
  } as unknown as Context;
  const clean = { count: 0, violations: [], truncated: false };
  const bound = {
    target: { instance: '45016:fixture-birth', boardPath: 'E:/isolated-test.kicad_pcb' },
    importStarted: false,
    exportDsn: vi.fn(async () => Buffer.from(previewDsn)),
    repairDsn: vi.fn(async () => Buffer.from(previewDsn)),
    reviewSession: vi.fn(async () => clean),
    designReportArtifact: vi.fn(async () => Buffer.from('{}')),
    importSession: vi.fn(async (..._args: unknown[]) => ({
      outcome: 'committed',
      tracks: 2,
      vias: 1,
      designReport: clean,
    })),
    previewSession: vi.fn(async () => ({ outcome: 'committed', tracks: 2, vias: 1 })),
    clearPreview: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    fillZones: vi.fn(),
    stopComputation: vi.fn(async () => {}),
  };
  let closed = false;
  const shutdown = vi.fn(async () => {});
  const watch: EditorLifecycle = new EditorLifecycle({
    probe: async () => (closed ? 'closed' : 'alive'),
    onClosed: (ids) => service.editorClosed(ids),
    shutdown,
    onError: vi.fn(),
  });
  const router = {
    route: vi.fn(async (..._args: unknown[]) => ({
      sesBase64: Buffer.from(previewSes).toString('base64'),
      state: 'COMPLETED',
    })),
  };
  const service = new RunService(
    ctx,
    runs,
    router as unknown as FreeroutingClient,
    { open: async () => bound } as unknown as KicadIpcClient,
    {
      ensureUp: async () => {
        enginePid = 60_002;
      },
      get pid() {
        return enginePid;
      },
      shutdown,
    } as unknown as FreeroutingLauncher,
    watch,
    resourcesEnabled instanceof ResourceGuard
      ? resourcesEnabled
      : resourcesEnabled
        ? ({
            watch: async (_pids: unknown, stop: (reason: Error) => void) => {
              resourceStop = stop;
              return () => {};
            },
          } as ResourceGuard)
        : undefined,
  );
  services.push(service);
  const run = runs.create(
    'route',
    { fast: true, realtime, fillZonesAfterRoute: false, drawtimeSec: 5, skipNets: [], routeOnlyNets: [] },
    { id: 'close-owner' } as Agent,
  );
  return {
    run,
    runs,
    service,
    stopResources: () => resourceStop?.(new UpstreamServiceError('RESOURCE_LIMIT', 429, 'memory protection')),
    bound,
    router,
    watch,
    shutdown,
    done: () => done,
    closeEditor: async () => {
      closed = true;
      await watch.check();
    },
  };
}

it('cancels in-progress routing on editor exit, records the reason and stops the idle engine', async () => {
  const h = harness();
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  h.router.route.mockImplementation(async (...args: unknown[]) => {
    const signal = args[4] as AbortSignal;
    started();
    return new Promise((_resolve, reject) =>
      signal.addEventListener('abort', () => reject(signal.reason), { once: true }),
    );
  });
  await h.service.start(h.run);
  await ready;
  await h.closeEditor();
  const outcome = await h.done();
  expect(outcome.status).toBe('killed');
  expect(outcome.detail).toContain('编辑器已关闭');
  expect(h.run.state).toBe('cancelled');
  expect(statusResponse(h.run).process?.events.some((event) => event.text.includes('编辑器已关闭'))).toBe(true);
  expect(h.shutdown).toHaveBeenCalledTimes(1);
  expect(h.bound.importSession).not.toHaveBeenCalled();
  expect(h.bound.close).toHaveBeenCalledTimes(1);
});

it('keeps uncertainty when the closed editor prevents preview cleanup instead of claiming an unchanged board', async () => {
  const h = harness(true);
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  h.bound.clearPreview.mockRejectedValue(
    new UpstreamServiceError('IMPORT_UNCERTAIN', 409, 'preview cleanup unconfirmed'),
  );
  h.router.route.mockImplementation(async (...args: unknown[]) => {
    await (args[3] as RouteHandlers).onIntermediate?.(Buffer.from(previewSes).toString('base64'));
    const signal = args[4] as AbortSignal;
    started();
    return new Promise((_resolve, reject) =>
      signal.addEventListener('abort', () => reject(signal.reason), { once: true }),
    );
  });
  await h.service.start(h.run);
  await ready;
  await h.closeEditor();
  await h.done();
  expect(h.run.state).toBe('failed');
  expect(h.run.error?.code).toBe('IMPORT_UNCERTAIN');
  expect(statusResponse(h.run).user_message).toContain('暂时无法确认');
  expect(h.shutdown).toHaveBeenCalledTimes(1);
  expect(h.bound.importSession).not.toHaveBeenCalled();
});

it('cancels a pending repair and does not start a second routing attempt after editor exit', async () => {
  const h = harness();
  h.bound.reviewSession.mockResolvedValue({ count: 1, violations: [], truncated: false });
  await h.service.start(h.run);
  await h.done();
  expect(h.run.state).toBe('repair_pending');
  await h.closeEditor();
  expect(h.run.state).toBe('cancelled');
  expect(h.router.route).toHaveBeenCalledTimes(1);
  expect(h.bound.repairDsn).not.toHaveBeenCalled();
  expect(h.shutdown).toHaveBeenCalledTimes(1);
});

it('does not force-stop a final import; reports the committed copper and closes Java', async () => {
  const h = harness();
  let finish!: () => void, started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  h.bound.importSession.mockImplementation(async () => {
    h.bound.importStarted = true;
    started();
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    return { outcome: 'committed', tracks: 2, vias: 1, designReport: { count: 0, violations: [], truncated: false } };
  });
  await h.service.start(h.run);
  await ready;
  await h.closeEditor();
  expect(h.shutdown).toHaveBeenCalledTimes(1);
  expect(h.bound.close).not.toHaveBeenCalled();
  finish();
  await h.done();
  expect(h.run.output?.routing.imported).toBe(true);
  expect(h.run.output?.routing.warning).toContain('取消时新走线已添加到板子');
  expect(h.bound.fillZones).not.toHaveBeenCalled();
});

it('resource protection stops compute, clears only its preview and retains the last usable SES', async () => {
  const h = harness(true, true);
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  h.router.route.mockImplementation(async (...args: unknown[]) => {
    await (args[3] as RouteHandlers).onIntermediate?.(Buffer.from(previewSes).toString('base64'));
    const signal = args[4] as AbortSignal;
    started();
    return new Promise((_resolve, reject) =>
      signal.addEventListener('abort', () => reject(signal.reason), { once: true }),
    );
  });
  await h.service.start(h.run);
  await ready;
  h.stopResources();
  await h.done();
  expect(h.run.state).toBe('failed');
  expect(h.run.error?.code).toBe('RESOURCE_LIMIT');
  expect(h.shutdown).toHaveBeenCalled();
  expect(h.bound.stopComputation).toHaveBeenCalled();
  expect(h.bound.clearPreview).toHaveBeenCalled();
  expect(Buffer.from(h.run.artifact!.content).toString()).toBe(previewSes);
  expect(h.bound.importSession).not.toHaveBeenCalled();
});

it('rejects another board request while the first is active and includes its existing identifier', async () => {
  const h = harness();
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  h.router.route.mockImplementation(async (...args: unknown[]) => {
    const signal = args[4] as AbortSignal;
    started();
    return new Promise((_resolve, reject) =>
      signal.addEventListener('abort', () => reject(signal.reason), { once: true }),
    );
  });
  await h.service.start(h.run);
  await ready;
  const second = h.runs.create('route', h.run.parameters, { id: 'another-owner' } as Agent);
  await expect(h.service.start(second)).rejects.toMatchObject({
    code: 'BOARD_RUN_ACTIVE',
    message: expect.stringContaining(h.run.id),
  });
  expect(second.state).toBe('failed');
  await h.closeEditor();
  await h.done();
});

it('preserves uncertain board state when memory protection and preview cleanup fail together', async () => {
  const h = harness(true, true);
  h.bound.clearPreview.mockRejectedValue(new UpstreamServiceError('IMPORT_UNCERTAIN', 409, '检查板子'));
  h.router.route.mockImplementation(async (...args: unknown[]) => {
    const handlers = args[3] as { onIntermediate: (encoded: string) => Promise<void> };
    await handlers.onIntermediate(Buffer.from(previewSes).toString('base64'));
    h.stopResources();
    throw new Error('stopped');
  });
  await h.service.start(h.run);
  await h.done();
  expect(h.run.error?.code).toBe('IMPORT_UNCERTAIN');
  expect(h.bound.importSession).not.toHaveBeenCalled();
});

function memorySampler() {
  const MiB = 1024 * 1024;
  const privateBytes = new Map([
    [45016, 3072 * MiB],
    [process.pid, 3072 * MiB],
    [60_002, 512 * MiB],
    [60_003, 128 * MiB],
  ]);
  const roots: number[][] = [];
  // Only the OS transport is replaced. Real ResourceGuard and RunService decide
  // which roots to sample, whether to stop, and how to finish preview/import work.
  const command = vi.spyOn(computeClient, 'computeCommand').mockImplementation(async (_python, request, schema) => {
    const sample = z.object({ command: z.literal('sample'), pids: z.array(z.number()) }).parse(request);
    roots.push([...sample.pids]);
    return schema.parse({
      available: 4 * 1024 * MiB,
      commitAvailable: 4 * 1024 * MiB,
      total: 8 * 1024 * MiB,
      processes: sample.pids.map((pid) => ({ pid, private: privateBytes.get(pid) ?? 0, working: 0 })),
    });
  });
  return { guard: new ResourceGuard(() => 'fixture-python'), privateBytes, roots, command };
}

it('keeps routing with a large editor and discovers Java and helpers launched after monitoring starts', async () => {
  vi.useFakeTimers();
  const memory = memorySampler();
  const h = harness(true, memory.guard);
  const finish = Promise.withResolvers<void>();
  h.router.route.mockImplementation(async (...args: unknown[]) => {
    const signal = args[4] as AbortSignal;
    signal.throwIfAborted();
    await finish.promise;
    signal.throwIfAborted();
    return { sesBase64: Buffer.from(previewSes).toString('base64'), state: 'COMPLETED' };
  });
  try {
    await h.service.start(h.run);
    await vi.waitFor(() => expect(h.router.route).toHaveBeenCalledOnce());
    expect(h.run.error).toBeUndefined();
    expect(h.run.state).toBe('running');
    expect(memory.roots[0]).toEqual([]);
    activeHelperPids.add(60_003);
    await vi.advanceTimersByTimeAsync(resourceLimits.sampleIntervalMs);
    expect(memory.roots.at(-1)).toEqual([60_002, 60_003]);
    expect(h.run.state).toBe('running');
    expect(h.shutdown).not.toHaveBeenCalled();
    expect(h.bound.stopComputation).not.toHaveBeenCalled();
  } finally {
    activeHelperPids.delete(60_003);
    finish.resolve();
    await h.done();
  }
  expect(h.run.state).toBe('succeeded');
  expect(h.bound.importSession).toHaveBeenCalledOnce();
  const samples = memory.command.mock.calls.length;
  await vi.advanceTimersByTimeAsync(resourceLimits.sampleIntervalMs * 2);
  expect(memory.command).toHaveBeenCalledTimes(samples);
});

it('stops an oversized Java despite a large shared editor, clears preview and retains its usable result', async () => {
  vi.useFakeTimers();
  const memory = memorySampler();
  const h = harness(true, memory.guard);
  h.router.route.mockImplementation(async (...args: unknown[]) => {
    await (args[3] as RouteHandlers).onIntermediate?.(Buffer.from(previewSes).toString('base64'));
    const signal = args[4] as AbortSignal;
    return new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
  });
  await h.service.start(h.run);
  await vi.waitFor(() => expect(h.bound.previewSession).toHaveBeenCalledOnce());
  memory.privateBytes.set(60_002, resourceLimits.processPrivateBytes + 1);
  await vi.advanceTimersByTimeAsync(resourceLimits.sampleIntervalMs);
  const outcome = await h.done();
  expect(memory.roots.at(-1)).toEqual([60_002]);
  expect(outcome.status).toBe('failed');
  expect(h.run.error?.code).toBe('RESOURCE_LIMIT');
  expect(h.shutdown).toHaveBeenCalledOnce();
  expect(h.bound.stopComputation).toHaveBeenCalledOnce();
  expect(h.bound.clearPreview).toHaveBeenCalled();
  expect(Buffer.from(h.run.artifact!.content).toString()).toBe(previewSes);
  expect(h.bound.importSession).not.toHaveBeenCalled();
  expect(h.bound.close).toHaveBeenCalledOnce();
  const samples = memory.command.mock.calls.length;
  await vi.advanceTimersByTimeAsync(resourceLimits.sampleIntervalMs * 2);
  expect(memory.command).toHaveBeenCalledTimes(samples);
});

it('waits for an in-flight board import when Java exceeds its limit and preserves committed copper', async () => {
  vi.useFakeTimers();
  const memory = memorySampler();
  const h = harness(false, memory.guard);
  h.run.parameters.fillZonesAfterRoute = true;
  const finish = Promise.withResolvers<void>();
  h.bound.importSession.mockImplementation(async () => {
    h.bound.importStarted = true;
    await finish.promise;
    return { outcome: 'committed', tracks: 2, vias: 1, designReport: { count: 0, violations: [], truncated: false } };
  });
  let settled = false;
  try {
    await h.service.start(h.run);
    void h.done().then(() => {
      settled = true;
    });
    await vi.waitFor(() => expect(h.bound.importStarted).toBe(true));
    memory.privateBytes.set(60_002, resourceLimits.processPrivateBytes + 1);
    await vi.advanceTimersByTimeAsync(resourceLimits.sampleIntervalMs);
    expect(h.shutdown).toHaveBeenCalledOnce();
    expect(h.bound.stopComputation).toHaveBeenCalledOnce();
    expect(settled).toBe(false);
    expect(h.bound.close).not.toHaveBeenCalled();
  } finally {
    finish.resolve();
    await h.done();
  }
  expect(h.run.state).toBe('succeeded');
  expect(h.run.output?.routing).toMatchObject({ imported: true, tracks: 2, vias: 1 });
  expect(h.run.output?.routing.warning).toContain('取消时新走线已添加到板子');
  expect(h.bound.fillZones).not.toHaveBeenCalled();
  expect(h.bound.close).toHaveBeenCalledOnce();
});
