import { NextApiRequest, NextApiResponse } from 'next';
import { PineconeStore } from '@langchain/pinecone';
import { HuggingFaceInferenceEmbeddings } from '@langchain/community/embeddings/hf';
import connectDB from '@/utils/mongoConnection';
import { makeChain } from '@/utils/makechain';
import { pinecone, PINECONE_INDEX_NAME } from '@/utils/pinecone-client';
import Message from '@/models/Message';
import { convertToAscii } from './consume';


export async function getMatchesFromEmbeddings(
  embeddings: number[],
  selectedNamespace: string
) {
  try {
    const PINECONE_INDEX_NAME = process.env.PINECONE_INDEX_NAME ?? '';
    const pineconeIndex = pinecone.Index(PINECONE_INDEX_NAME);
    const namespace = pineconeIndex.namespace(convertToAscii(selectedNamespace));
    const queryResult = await namespace.query({
      topK: 5,
      vector: embeddings,
      includeMetadata: true,
    });
    return queryResult.matches || [];
  } catch (error) {
    console.log("error querying embeddings", error);
    throw error;
  }
}

export async function getQualifyingDocs(matches:any) {
  const qualifyingDocs = matches.filter(
    (match:any) => match.score && match.score > 0.1
  );

  type Metadata = {
    text: string;
    pageNumber: number;
  };

  let docs = qualifyingDocs.map((match:any) => (match.metadata as Metadata).text);
  // 5 vectors
  return docs.join("\n").substring(0, 3000);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const {
    question,
    history,
    chatId,
    selectedNamespace,
    userEmail,
    returnSourceDocuments,
    modelTemperature,
  } = req.body;

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!question) {
    return res.status(400).json({ message: 'No question in the request' });
  }

  await connectDB();

  const sanitizedQuestion = question.trim().replaceAll('\n', ' ');

  try {
    const index = pinecone.Index(PINECONE_INDEX_NAME);

    // Generate embeddings
    const hfEmbeddings = new HuggingFaceInferenceEmbeddings({
      apiKey: process.env.HUGGING_FACE_API_KEY,
      model: 'Craig/paraphrase-MiniLM-L6-v2',
    });

    const vectorStore = await PineconeStore.fromExistingIndex(
      hfEmbeddings,
      {
        pineconeIndex: index,
        namespace: selectedNamespace,
      },
    );

    const retriever = vectorStore.asRetriever({
      callbacks: [
        {
          handleRetrieverEnd(documents) {
            resolveWithDocuments(documents);
          },
        },
      ],
    });

    const userMessage = new Message({
      sender: 'user',
      content: sanitizedQuestion,
      chatId: chatId,
      namespace: selectedNamespace,
      userEmail: userEmail,
    });

    await userMessage.save();

    const chain = makeChain(retriever);

    const pastMessages = history
      .map((message: [string, string]) => {
        return [`Human: ${message[0]}`, `Assistant: ${message[1]}`].join('\n');
      })
      .join('\n');

    const response = await chain.invoke({
      question: sanitizedQuestion,
      chat_history: pastMessages,
    });

    const botMessage = new Message({
      sender: 'bot',
      content: response,
      chatId: chatId,
      namespace: selectedNamespace,
      userEmail: userEmail,
      sourceDocs: [],
    });

    await botMessage.save();

    res
      .status(200)
      .json({ text: response, sourceDocuments: [] });
  } catch (error: any) {
    console.log('error error error error', error);
    res.status(500).json({ error: error.message || 'Something went wrong' });
  }
}
