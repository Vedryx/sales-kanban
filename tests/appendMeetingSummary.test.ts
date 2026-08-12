import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Tests for `appendMeetingSummary()` in @/lib/leads/write.
// The helper needs to:
//   1. $push onto sk_lead_state.meetingSummaries
//   2. work whether or not the state doc already exists (upsert)
//   3. write a `meeting_summary` activity to sk_activities
// We mock the Mongo layer + writeActivity so the test only exercises the
// wiring, not real DB behaviour.

const m = vi.hoisted(() => ({
  updateOneMock: vi.fn(),
  writeActivityMock: vi.fn(),
}));

vi.mock('@/lib/mongo', () => ({
  getDb: vi.fn().mockResolvedValue({
    collection: () => ({ updateOne: m.updateOneMock }),
  }),
}));

vi.mock('@/lib/activities/write', () => ({
  writeActivity: m.writeActivityMock,
}));

import { appendMeetingSummary } from '@/lib/leads/write';

beforeEach(() => {
  vi.clearAllMocks();
  m.updateOneMock.mockResolvedValue({ acknowledged: true, upsertedCount: 0 });
});
afterEach(() => {
  vi.clearAllMocks();
});

describe('appendMeetingSummary', () => {
  it('$pushes summary onto sk_lead_state with upsert', async () => {
    const result = await appendMeetingSummary({
      placeId: 'lead-1',
      text: 'demo went well; interested in Pulse',
      sdrEmail: 'sdr@vedryxtech.com',
      sdrName: 'Test SDR',
    });

    expect(m.updateOneMock).toHaveBeenCalledOnce();
    const [filter, update, opts] = m.updateOneMock.mock.calls[0];
    expect(filter).toEqual({ leadPlaceId: 'lead-1' });
    expect(opts).toEqual({ upsert: true });

    const upd = update as {
      $push: { meetingSummaries: unknown };
      $set: Record<string, unknown>;
      $setOnInsert: Record<string, unknown>;
    };
    // The pushed summary matches the returned summary
    expect(upd.$push.meetingSummaries).toEqual(result);
    expect(result.text).toBe('demo went well; interested in Pulse');
    expect(result.by).toBe('sdr@vedryxtech.com');
    expect(typeof result.id).toBe('string');
    expect(result.id.length).toBeGreaterThan(0);
    expect(new Date(result.at).toString()).not.toBe('Invalid Date');

    // Upsert-safe: setOnInsert stamps leadPlaceId + createdAt + default stage
    expect(upd.$setOnInsert.stage).toBe('new');
    expect(upd.$setOnInsert.createdAt).toBeInstanceOf(Date);
    expect(upd.$set.leadPlaceId).toBe('lead-1');
    expect(upd.$set.updatedBy).toBe('sdr@vedryxtech.com');
  });

  it('writes a meeting_summary activity alongside the push', async () => {
    const result = await appendMeetingSummary({
      placeId: 'lead-2',
      text: 'connected on call, sending pitch',
      sdrEmail: 'sdr@vedryxtech.com',
      sdrName: 'Test SDR',
    });

    expect(m.writeActivityMock).toHaveBeenCalledOnce();
    const arg = m.writeActivityMock.mock.calls[0][0];
    expect(arg.type).toBe('meeting_summary');
    expect(arg.leadPlaceId).toBe('lead-2');
    expect(arg.sdrEmail).toBe('sdr@vedryxtech.com');
    expect(arg.payload.id).toBe(result.id);
    expect(arg.payload.textLength).toBe('connected on call, sending pitch'.length);
  });

  it('is upsert-safe when state doc does not exist (upsertedCount=1)', async () => {
    // Simulate the "no prior state doc" case — Mongo returns upsertedCount=1
    // and the $setOnInsert fields land. We only assert the update shape is
    // the same as the existing-doc case, since Mongo does the merge.
    m.updateOneMock.mockResolvedValueOnce({
      acknowledged: true,
      upsertedCount: 1,
      upsertedId: 'new-id',
    });

    const result = await appendMeetingSummary({
      placeId: 'lead-fresh',
      text: 'first note ever',
      sdrEmail: 'sdr@vedryxtech.com',
    });

    expect(result.text).toBe('first note ever');
    expect(m.updateOneMock).toHaveBeenCalledOnce();
    const [, update] = m.updateOneMock.mock.calls[0];
    expect((update as { $push: unknown }).$push).toBeDefined();
    expect((update as { $setOnInsert: unknown }).$setOnInsert).toBeDefined();
  });
});
