import { MongoClient } from 'mongodb';

const dbName = process.env.DB_NAME || 'ig_automation';

let clientPromise;

function getClientPromise() {
  const uri = process.env.MONGO_URL;
  if (!uri) {
    throw new Error('MONGO_URL environment variable is required');
  }

  if (!global._mongoClientPromise) {
    const client = new MongoClient(uri);
    global._mongoClientPromise = client.connect();
  }

  return global._mongoClientPromise;
}

export async function getDb() {
  clientPromise = getClientPromise();
  const c = await clientPromise;
  return c.db(dbName);
}
