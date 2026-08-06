const serverless = require('serverless-http');
const store = require('../../src/store');
const { createApp } = require('../../server-app');

let handlerPromise = null;

exports.handler = async (event, context) => {
  // Netlify Blobs needs the invocation event to authenticate (lambda-compat
  // functions); safe to call on every invocation.
  store.initBlobs(event);
  if (!handlerPromise) handlerPromise = Promise.resolve(serverless(createApp()));
  const h = await handlerPromise;
  return h(event, context);
};
