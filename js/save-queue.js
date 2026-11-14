// Autosave queue. Each edit is applied to the screen at once ("apply") and sent to the server ("send").
// Sends for the same key run one after another, so two quick edits of one thing can't arrive out of
// order; different keys run in parallel. If a send fails, "revert" puts the screen back to the last
// saved value and the queue offers a retry that applies and sends the edit again.
export function createSaveQueue({ onChange = () => {} } = {}) {
  const tails = new Map();
  let pending = 0;
  let failure = null;
  let everSaved = false;

  function status() {
    if (pending > 0) return 'saving';
    if (failure) return 'error';
    return everSaved ? 'saved' : 'idle';
  }
  const notify = () => onChange(status());

  function submit(job) {
    if (job.apply) job.apply();
    pending += 1;
    notify();
    const previous = tails.get(job.key) || Promise.resolve();
    const run = previous
      .then(() => job.send())
      .then(
        () => { everSaved = true; },
        (error) => {
          if (job.revert) job.revert(error);
          failure = { job, error };
        },
      )
      .then(() => {
        pending -= 1;
        notify();
      });
    tails.set(job.key, run);
    return run;
  }

  function retry() {
    if (!failure) return Promise.resolve();
    const { job } = failure;
    failure = null;
    return submit(job);
  }

  return { submit, retry, status, isBusy: () => pending > 0, lastError: () => (failure ? failure.error : null) };
}
