import { createPool } from '../../src/threadPool';

jest.mock('../../src/adapters/createWorker', () => ({
  createWorker: (loaderId: string) => {
    return {
      workerProxy: null,
      loaderId,
      workerId: null,
      terminate: jest.fn()
    };
  }
}));

describe('threadPool', () => {
  it('should able to create pool', () => {
    expect(createPool('id1')).toBeDefined();
  });
});
