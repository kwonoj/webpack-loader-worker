import { createPool } from '../../src/threadPool';
const { configureWorkerMock } = require('../../src/adapters/createWorker');
const nanoid: typeof import('nanoid') = require('nanoid');

jest.mock('../../src/adapters/createWorker', () => {
  let workerId = 1;
  let _workerCreateDelegate: Function = jest.fn(() => jest.fn());

  return {
    createWorker: (loaderId: string) => {
      return {
        workerProxy: _workerCreateDelegate(loaderId, workerId),
        loaderId,
        workerId: workerId++,
        terminate: jest.fn()
      };
    },
    configureWorkerMock: (workerCreateDelegate: Function) => {
      _workerCreateDelegate = workerCreateDelegate;
    }
  };
});

describe('threadPool', () => {
  it('should able to create pool', () => {
    expect(createPool('id1')).toBeDefined();
  });

  it('should able to run task', async () => {
    const task = {
      value: nanoid()
    };

    const workerMock = () => {
      return {
        run: (value: typeof task) => Promise.resolve(value.context.value)
      };
    };

    configureWorkerMock(workerMock);

    const pool = createPool('id2');
    const result = await pool.runTask(task);

    expect(result).toEqual(task.value);
  });

  it('should able to run task more than maxworkers size', async () => {
    const tasks = [
      { value: nanoid() },
      { value: nanoid() },
      { value: nanoid() },
      { value: nanoid() },
      { value: nanoid() }
    ];

    const workerMock = () => {
      let running = false;
      return {
        isAvailable: () => Promise.resolve(!running),
        run: (task: any) => {
          running = true;
          return new Promise((resolve) => {
            setTimeout(() => {
              resolve(task.context.value);
              running = false;
            }, 50);
          });
        }
      };
    };

    configureWorkerMock(workerMock);

    const pool = createPool('id3', 4);
    const results = await Promise.all(tasks.map((task) => pool.runTask(task)));

    expect(results).toEqual(tasks.map((task) => task.value));
  });

  it('should handle error', async () => {
    const workerMock = () => {
      return {
        isAvailable: () => Promise.resolve(true),
        run: (value: any) => (value.context.reject !== true ? Promise.resolve(1) : Promise.reject('error'))
      };
    };

    configureWorkerMock(workerMock);
    const pool = createPool('id4', 2);
    // worker task exception should not take down pool subscription
    expect(pool.runTask({ reject: true })).rejects.toEqual('error');

    const result = await pool.runTask({});
    expect(result).toEqual(1);
  });
});
