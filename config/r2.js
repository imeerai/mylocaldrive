const { S3Client } = require('@aws-sdk/client-s3');
const { NodeHttpHandler } = require('@smithy/node-http-handler');

const required = ['R2_ENDPOINT', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'];
const missing = required.filter((name) => !process.env[name]);

if (missing.length) {
  console.warn(`R2 client missing config: ${missing.join(', ')}`);
}

const client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  maxAttempts: Number(process.env.R2_MAX_ATTEMPTS || 2),
  requestHandler: new NodeHttpHandler({
    connectionTimeout: Number(process.env.R2_CONNECTION_TIMEOUT_MS || 10000),
    socketTimeout: Number(process.env.R2_SOCKET_TIMEOUT_MS || 120000),
  }),
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
  },
  forcePathStyle: true
});

module.exports = client;
