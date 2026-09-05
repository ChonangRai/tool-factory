/**
 * Hands control back to the browser between units of batch work, so a long
 * conversion stays responsive without stalling.
 *
 * `requestAnimationFrame` must not be used for this. A backgrounded tab stops
 * firing it, which parks a conversion until the user comes back. Measured in a
 * hidden tab: rAF never fired at all, `setTimeout(0)` was throttled to roughly
 * 500ms per yield, while `scheduler.yield()` and `MessageChannel` both stayed
 * at about 0ms. Hence the order below.
 *
 * rAF is still the right tool for anything tied to painting -- just not for
 * driving a processing loop.
 */

interface SchedulerWithYield {
  yield?: () => Promise<void>;
}

const scheduler = (globalThis as { scheduler?: SchedulerWithYield }).scheduler;

/** A macrotask that browsers do not clamp the way they clamp timers. */
const yieldViaMessageChannel = (): Promise<void> =>
  new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      channel.port2.close();
      resolve();
    };
    channel.port2.postMessage(undefined);
  });

export const yieldToBrowser = async (): Promise<void> => {
  if (typeof scheduler?.yield === 'function') {
    try {
      await scheduler.yield();
      return;
    } catch {
      // Some engines expose it but reject outside a task context; fall back.
    }
  }

  if (typeof MessageChannel === 'function') {
    await yieldViaMessageChannel();
    return;
  }

  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
};
