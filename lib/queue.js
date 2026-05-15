import { Queue, QueueEvents } from 'bullmq';
import { getRedis } from './redis';

const QUEUE_NAME = 'webhook-events';

let queue;
export function getQueue() {
  if (!queue) {
    queue = new Queue(QUEUE_NAME, {
      connection: getRedis(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { age: 60 * 60 * 24, count: 5000 },
        removeOnFail: { age: 60 * 60 * 24 * 7 },
      },
    });
  }
  return queue;
}

export const WEBHOOK_QUEUE = QUEUE_NAME;
