import { Pinecone } from '@pinecone-database/pinecone';

if (!process.env.PINECONE_ENVIRONMENT || !process.env.PINECONE_API_KEY) {
  throw new Error('Pinecone environment or api key vars missing');
}

async function initPinecone() {
  try {
    const pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY ?? ''
  });
    return pinecone;
  } catch (error) {
    console.log('error', error);
    throw new Error('Failed to initialize Pinecone Client');
  }
}


export const PINECONE_INDEX_NAME = process.env.PINECONE_INDEX_NAME ?? '';

export const pinecone = await initPinecone();
