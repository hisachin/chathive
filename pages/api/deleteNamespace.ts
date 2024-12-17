import { pinecone } from '@/utils/pinecone-client';
import { NextApiRequest, NextApiResponse } from 'next';
import connectDB from '@/utils/mongoConnection';
import Namespace from '@/models/Namespace';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { namespace, userEmail } = req.query as {
    namespace?: string;
    userEmail?: string;
  };

  const targetIndex = process.env.PINECONE_INDEX_NAME;

  // Validate environment variable
  if (!targetIndex) {
    return res.status(500).json({ error: 'Pinecone index name is not configured.' });
  }

  // Validate query parameters
  if (!namespace || !userEmail) {
    return res.status(400).json({ error: 'Missing required query parameters: namespace or userEmail.' });
  }

  try {
    // Initialize Pinecone index
    const index = pinecone.Index(targetIndex);

    // Delete the namespace from Pinecone
    // await index.delete({
    //   deleteRequest: {
    //     namespace,
    //     deleteAll: true,
    //   },
    // });

    // Connect to MongoDB and delete namespace entry
    await connectDB();
    const result = await Namespace.deleteOne({ name: namespace, userEmail });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Namespace not found in the database.' });
    }

    res.status(200).json({ message: 'Namespace deleted successfully.' });
  } catch (error: any) {
    console.error('Error deleting namespace:', error.message);
    res.status(500).json({ error: 'Failed to delete the namespace.' });
  }
}
