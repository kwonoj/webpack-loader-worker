type WorkerAdapter = (
  options: any
) => {
  run: (context: any, evts: any) => Promise<any>;
};

export { WorkerAdapter };
