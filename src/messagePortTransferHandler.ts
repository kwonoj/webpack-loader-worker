import { expose, transferHandlers, proxyMarker, wrap } from 'comlink';
import { MessageChannel } from "worker_threads";
const nodeEndpoint: Function = require('comlink/dist/umd/node-adapter');

// Override comlink's default proxy handler to use Node endpoints
// https://github.com/GoogleChromeLabs/comlink/issues/313
const setupTransferHandler = () => {
  transferHandlers.set('proxy', {
    canHandle: obj => obj && obj[proxyMarker],
    serialize: obj => {
      const { port1, port2 } = new MessageChannel()
      expose(obj, nodeEndpoint(port1))
      return [port2, [port2]] as any
    },
    deserialize: port => {
      port = nodeEndpoint(port)
      port.start()
      return wrap(port)
    }
  });
}

export {
  setupTransferHandler
}