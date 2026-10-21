import { expect, it } from 'vitest';
import { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { JobOutcome } from '@deepseek-ai/dsh-jobs';
import type { SessionId } from '@deepseek-ai/dsh-session';
import { RunService } from '../src/runs/run-service.js';
import { RunStore } from '../src/runs/run-store.js';
import type { KicadIpcClient } from '../src/ipc/client.js';
import type { FreeroutingClient } from '../src/proxy/freerouting-client.js';

/** Minimal registry shape the service depends on; the owner contract is the subject. */
interface StartSpec {
  owner?: unknown;
  run: () => { cancel: (reason?: unknown) => void; done: Promise<JobOutcome> };
}

function registry(start: (spec: StartSpec) => string): { start: (spec: StartSpec) => string } {
  return { start };
}

function fixture(ctx: Context) {
  const runs = new RunStore({ maxPendingRuns: 1, resultTtlMs: 3600000 });
  const report = { count: 0, violations: [], truncated: false };
  const ipc = {
    open: async () => ({
      target: { boardPath: 'fixture.kicad_pcb' },
      exportDsn: async () => Buffer.from('(pcb (network (net GND (pins J1-1 J2-1))))'),
      reviewSession: async () => report,
      designReportArtifact: async () => undefined,
      importSession: async () => ({ outcome: 'committed', tracks: 1, vias: 0, designReport: report }),
      close: async () => {},
    }),
  } as unknown as KicadIpcClient;
  const router = {
    route: async () => ({ sesBase64: Buffer.from('(session fixture)').toString('base64'), state: 'COMPLETED' }),
  } as unknown as FreeroutingClient;
  return { runs, service: new RunService(ctx, runs, router, ipc) };
}

function parameters() {
  return {
    drawtimeSec: 5,
    fast: false,
    realtime: false,
    fillZonesAfterRoute: false,
    skipNets: [],
    routeOnlyNets: [],
  };
}

async function settle(runs: RunStore, id: string) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = runs.require(id).state;
    if (state === 'succeeded' || state === 'failed') {
      return state;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('run did not settle');
}

it('starts the job with the owning session id expected by the DSH 0.2.1 registry', async () => {
  const ctx = new Context();
  const sessionId = 'routing-owner' as SessionId;
  const owner = { id: sessionId, session: { id: sessionId }, ctx } as Agent;
  const accepted: unknown[] = [];
  const settled: Promise<JobOutcome>[] = [];
  Object.assign(ctx, {
    jobs: registry((spec) => {
      accepted.push(spec.owner);
      const hooks = spec.run();
      settled.push(hooks.done);
      return 'pcb-freerouting-1';
    }),
  });
  const { runs, service } = fixture(ctx);
  try {
    const run = runs.create('route', parameters(), owner);
    expect(await service.start(run)).toBe('pcb-freerouting-1');
    expect(accepted).toEqual([sessionId]);
    expect(await settle(runs, run.id)).toBe('succeeded');
    expect(runs.require(run.id).output?.routing.imported).toBe(true);
    await Promise.all(settled);
  } finally {
    await service.dispose();
    runs.dispose();
    await ctx.fiber.dispose();
  }
});

it('reports a job-start failure instead of a generic routing sentence', async () => {
  const ctx = new Context();
  Object.assign(ctx, {
    jobs: registry(() => {
      throw new Error('background job limit reached for this owner (limit: 1)');
    }),
  });
  const { runs, service } = fixture(ctx);
  const sessionId = 'routing-owner' as SessionId;
  const owner = { id: sessionId, session: { id: sessionId }, ctx } as Agent;
  try {
    const run = runs.create('route', parameters(), owner);
    await expect(service.start(run)).rejects.toMatchObject({
      code: 'JOB_START_FAILED',
      message: expect.stringContaining('background job limit reached'),
    });
  } finally {
    await service.dispose();
    runs.dispose();
    await ctx.fiber.dispose();
  }
});
