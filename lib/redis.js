import IORedis from 'ioredis';

const url = process.env.REDIS_URL || 'redis://localhost:6379';

let connection;
export function getRedis() {
  if (!connection) {
    connection = new IORedis(url, {
      maxRetriesPerRequest: null, // required by BullMQ
      enableReadyCheck: false,
    });
    connection.on('error', (e) => console.error('Redis error', e?.message));
  }
  return connection;
}
