import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { HuggingFaceInferenceEmbeddings } from '@langchain/community/embeddings/hf';
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { DirectoryLoader } from 'langchain/document_loaders/fs/directory';
import { pinecone } from '@/utils/pinecone-client';
import { NextApiRequest, NextApiResponse } from 'next';
import Namespace from '@/models/Namespace';

const filePath = process.env.NODE_ENV === 'production' ? '/tmp' : 'tmp';

export function convertToAscii(inputString: string) {
  const asciiString = inputString.replace(/[^\x00-\x7F]+/g, "");
  return asciiString;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { namespaceName,userEmail, chunkSize = '1000', overlapSize = '200' } = req.query;
  const PINECONE_INDEX_NAME = process.env.PINECONE_INDEX_NAME ?? '';

  try {
    if (!PINECONE_INDEX_NAME) {
      throw new Error('PINECONE_INDEX_NAME is not defined in environment variables.');
    }

    const existingNamespace = await Namespace.findOne({
      name: namespaceName as string,
    });

    if (!existingNamespace) {
      const newNamespace = new Namespace({
        userEmail: userEmail as string,
        name: namespaceName as string,
      });
      await newNamespace.save();
    }


    // Load files from directory
    const directoryLoader = new DirectoryLoader(filePath, {
      '.pdf': (path) => new PDFLoader(path),
    });

    const rawDocs = await directoryLoader.load();
    if (!rawDocs.length) {
      throw new Error('No documents found in the specified directory.');
    }

    // Split the documents into chunks
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: parseInt(chunkSize as string, 10),
      chunkOverlap: parseInt(overlapSize as string, 10),
    });

    const splitDocs = await textSplitter.splitDocuments(rawDocs);
    if (!splitDocs.length) {
      throw new Error('Failed to split documents into smaller chunks.');
    }

    // Generate embeddings
    const hfEmbeddings = new HuggingFaceInferenceEmbeddings({
      apiKey:process.env.HUGGING_FACE_API_KEY,
      model: 'Craig/paraphrase-MiniLM-L6-v2',
    });

    const texts = splitDocs.map((doc) => doc.pageContent);
    const embeddings = await hfEmbeddings.embedDocuments(texts);
    if (!embeddings || embeddings.length !== texts.length) {
      throw new Error('Failed to generate embeddings or mismatched embedding count.');
    }

    // Prepare upsert payload
    const vectors = splitDocs.map((doc, index) => ({
      id: `${namespaceName}-${index}`, // Unique ID
      values: embeddings[index], // Embedding vector
      metadata: { text: doc.pageContent }, // Metadata
    }));

    // Debugging: Log the vectors structure
    console.log('Upserting vectors to Pinecone:', JSON.stringify(vectors, null, 2));

    // Initialize Pinecone index
    const index = pinecone.Index(PINECONE_INDEX_NAME);
    const namespace = index.namespace(convertToAscii(namespaceName as string));

    // Upsert vectors in Pinecone
    await namespace.upsert(vectors);

    res.status(200).json({ message: 'Data ingestion complete' });
  } catch (error) {
    console.error('Error during data ingestion:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
}
