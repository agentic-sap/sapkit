/**
 * Reading a hook payload off stdin, with a deadline.
 *
 * Claude Code hands a hook its JSON on stdin and expects an answer on stdout.
 * Waiting for `end` alone is enough on a healthy run, but it is not the only
 * way the stream can behave: on Windows a hook launched without a real pipe can
 * sit on a handle that never ends, and a stream that has already finished before
 * the first listener is attached emits nothing at all. Either way the hook
 * hangs, and a hanging PreToolUse hook stalls the tool call behind it.
 *
 * So three things can end the wait, and whichever comes first wins:
 *   · `end`               — the normal path; return everything that arrived
 *   · the timeout         — return the partial payload and tear the stream down
 *   · `error`             — return '' , which every caller reads as "no payload"
 *
 * The already-ended stream is handled by one synchronous check after the
 * listeners are in place.
 *
 * Callers never see a rejection. A hook that cannot read its input still has to
 * print a decision, and it decides that from an empty string.
 */

/**
 * Read stdin to the end, or until `timeoutMs` elapses.
 *
 * @param {number} [timeoutMs=5000] deadline in milliseconds
 * @returns {Promise<string>} the payload; '' on stream error
 */
export async function readStdin(timeoutMs = 5000) {
  return new Promise((resolve) => {
    const chunks = [];
    let done = false;

    // Exactly one settlement: whichever path arrives first disarms the rest.
    const settle = (text) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(text);
    };
    const collected = () => Buffer.concat(chunks).toString('utf-8');

    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      // Detach and close the handle before answering — leaving it open keeps
      // the event loop alive and the process never exits.
      process.stdin.removeAllListeners();
      process.stdin.destroy();
      resolve(collected());
    }, timeoutMs);

    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => settle(collected()));
    process.stdin.on('error', () => settle(''));

    // Nothing will be emitted if the stream finished before we got here.
    if (process.stdin.readableEnded) settle(collected());
  });
}
