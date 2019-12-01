import { expose, proxyMarker, releaseProxy, transferHandlers, wrap } from 'comlink';

import { MessageChannel } from 'worker_threads';

const nodeEndpoint: Function = require('comlink/dist/umd/node-adapter');

const proxiesSet = new Set<any>();
/**
 * Override comlink's default proxy handler to use Node endpoints
 * https://github.com/GoogleChromeLabs/comlink/issues/313
 */
const setupTransferHandler = () => {
  for (const proxy of proxiesSet) {
    proxy[releaseProxy]();
  }
  proxiesSet.clear();

  transferHandlers.set('proxy', {
    canHandle: (obj: object) => obj && obj[proxyMarker],
    serialize: (obj: object) => {
      const { port1, port2 } = new MessageChannel();
      expose(obj, nodeEndpoint(port1));
      return [port2, [port2]] as any;
    },
    deserialize: (port) => {
      port = nodeEndpoint(port);
      port.start();
      const value = wrap(port);
      proxiesSet.add(value);
      return value;
    }
  });
};

export { setupTransferHandler };
