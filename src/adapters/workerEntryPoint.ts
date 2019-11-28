/**
 * Interface to allow running specified task in worker threads,
 * exposed via comlink proxy.
 */
const taskRunner = (() => {
  return {
    isAvailable: () => false,
    run: (..._args: Array<any>) => {
      /* noop */
    }
  };
})();

export { taskRunner };
