import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resetMessagingState, sendMessage } from '../src/services/messaging.service.js';
import { ApiError, copyForCode, wireErrorShape } from './helpers/errors.js';

/**
 * M2 messaging tests — DB-free by design.
 *
 * The service is written so validation, rate limiting, share rules and error
 * codes are pure logic ahead of the first DB round-trip; these tests pin that
 * layer. DB-backed flows (conversation creation, seq ordering) get integration
 * coverage once the compose stack exists — recorded in 04-plan.md.
 */

describe('DCCNN error surface', () => {
  it('ApiError renders the shared wire format', () => {
    const err = new ApiError('MVA02', 400, 'Message needs text or a share');
    expect(err.message).toBe('Message needs text or a share [ERROR_CODE: MVA02]');
    expect(err.code).toBe('MVA02');
    expect(err.status).toBe(400);
  });

  it('copyForCode resolves registered codes and degrades for unknown ones', () => {
    expect(copyForCode('MLM01')).toBeTruthy();
    expect(copyForCode('ZZZ99')).toBe('ZZZ99');
  });

  it('wireErrorShape emits the client contract', () => {
    const shape = wireErrorShape(new ApiError('MNF02', 404, 'User not found'));
    expect(shape).toEqual({
      status: 404,
      error: copyForCode('MNF02'),
      code: 'MNF02',
      detail: 'User not found',
    });
  });
});

describe('sendMessage validation (pre-DB guards)', () => {
  beforeEach(() => resetMessagingState());
  afterEach(() => resetMessagingState());

  it('rejects an empty message with MVA01 before touching the database', async () => {
    await expect(
      sendMessage({ senderId: 'dev_user_a', peerId: 'dev_user_b', body: '   ', share: null }),
    ).rejects.toMatchObject({ code: 'MVA01', status: 400 });
  });

  it('rejects unknown share types with MVA03', async () => {
    await expect(
      sendMessage({
        senderId: 'dev_user_a',
        peerId: 'dev_user_b',
        body: null,
        share: { type: 'sticker' as never, id: 'x', title: 'x' },
      }),
    ).rejects.toMatchObject({ code: 'MVA03', status: 400 });
  });

  it('rate-limits the sender at MESSAGE_RATE_PER_MIN with MLM01', async () => {
    const send = () =>
      sendMessage({ senderId: 'dev_user_a', peerId: 'dev_user_b', body: 'hi', share: null });

    // All sends pass validation then hit the DB — except we can't without a DB.
    // assertRate runs BEFORE getOrCreateConversation, so hammering enough times
    // must eventually raise MLM01 regardless of DB outcome.
    let sawRateLimit = false;
    let other = 0;
    for (let i = 0; i < 35; i++) {
      try {
        await send();
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === 'MLM01') {
          sawRateLimit = true;
          break;
        }
        other++;
      }
    }
    expect(sawRateLimit, `expected MLM01 within 35 sends (saw ${other} other errors)`).toBe(true);
  });
});
