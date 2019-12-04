/**
 * naive error object serialization
 */
const serializeError = (err: Error | string) => {
  if (err instanceof Error) {
    return {
      message: err.message,
      name: err.name,
      stack: err.stack
    };
  }
  return err;
};

export { serializeError };
