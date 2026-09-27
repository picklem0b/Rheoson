import { beforeEach, describe, expect, it, vi } from 'vitest';

import { busTransport, closeBus, initBus, publish, publishTo, subscribe, subscriberCount } from '../src/realtime/bus.js';

/**
 * The bus is a seam, and these tests pin the two properties the seam promises:
 * messages reach subscribers without any infrastructure, and the absence of
 * infrastructure is never an error. Redis itself is exercised in CI's compose
 * job, where there is a server to talk to.
 */

describe('realtime bus', () => {
  beforeEach(async () => {
    await closeBus();
  });

  it('defaults to the local transport when REDIS_URL is unset', async () => {
    const transport = await initBus();
    expect(transport).toBe('local');
    expect(busTransport()).toBe('local');
  });

  it('delivers a published event to every subscriber of that user', () => {
    const first = vi.fn();
    const second = vi.fn();
    subscribe('user_a', first);
    subscribe('user_a', second);

    publish('user_a', 'download:progress', { progress: 42 });

    expect(first).toHaveBeenCalledWith('download:progress', { progress: 42 });
    expect(second).toHaveBeenCalledWith('download:progress', { progress: 42 });
  });

  it('never leaks one user’s events to another', () => {
    const mine = vi.fn();
    const theirs = vi.fn();
    subscribe('user_a', mine);
    subscribe('user_b', theirs);

    publish('user_a', 'message:new', { id: 'm1' });

    expect(mine).toHaveBeenCalledTimes(1);
    expect(theirs).not.toHaveBeenCalled();
  });

  it('stops delivering after unsubscribe, and drops the empty channel', () => {
    // A per-test user: `subscriberCount` is global to the module, so reusing an
    // id would make this test depend on what ran before it.
    const userId = 'user_unsubscribe_case';
    const handler = vi.fn();
    const unsubscribe = subscribe(userId, handler);
    expect(subscriberCount(userId)).toBe(1);

    unsubscribe();
    publish(userId, 'x', {});

    expect(handler).not.toHaveBeenCalled();
    expect(subscriberCount(userId)).toBe(0);
  });

  it('survives a throwing subscriber without starving the others', () => {
    const broken = vi.fn(() => {
      throw new Error('socket already closed');
    });
    const healthy = vi.fn();
    const userId = 'user_throwing_case';
    subscribe(userId, broken);
    subscribe(userId, healthy);

    publish(userId, 'download:completed', { id: 'job1' });
    publish(userId, 'download:completed', { id: 'job2' });

    // The healthy subscriber sees both; the broken one is only called once,
    // because a handler that throws is removed from the channel.
    expect(healthy).toHaveBeenCalledTimes(2);
    expect(broken).toHaveBeenCalledTimes(1);
  });

  it('publishes to several users at once (both sides of a conversation)', () => {
    const a = vi.fn();
    const b = vi.fn();
    subscribe('user_a', a);
    subscribe('user_b', b);

    publishTo(['user_a', 'user_b'], 'message:new', { id: 'm1' });

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });
});
