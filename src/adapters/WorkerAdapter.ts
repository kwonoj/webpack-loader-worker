type WorkerAdapter = (
  options: any
) => {
  run: (context: any) => Promise<any>;
};

export { WorkerAdapter };
