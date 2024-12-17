import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { RunnableSequence, RunnableMap } from '@langchain/core/runnables';
import { StringOutputParser } from '@langchain/core/output_parsers';
import type { Document } from 'langchain/document';
import { HfInference } from '@huggingface/inference';

const CONDENSE_TEMPLATE = `Given the following conversation and a follow-up question, rephrase the follow-up question to be a standalone question.

<chat_history>
  {chat_history}
</chat_history>

Follow-Up Input: {question}
Standalone question:`;

const QA_TEMPLATE = `You are an expert researcher. Use the following pieces of context to answer the question at the end.
If you don't know the answer, just say you don't know. DO NOT try to make up an answer.
If the question is not related to the context or chat history, politely respond that you are tuned to only answer questions that are related to the context.

<context>
  {context}
</context>

<chat_history>
  {chat_history}
</chat_history>

Question: {question}
Helpful answer in markdown:`;

const hf = new HfInference(process.env.HUGGING_FACE_API_KEY);

const combineDocumentsFn = (docs: Document[], separator = '\n\n') => {
  const serializedDocs = docs.map((doc) => doc.pageContent);
  return serializedDocs.join(separator);
};

const hfModelInference = async (input:string):Promise<string> => {
  const response = await hf.textGeneration({
    model: 'google/flan-t5-base', // Open-source Hugging Face model
    inputs: input,
    parameters: {
      max_length: 500,
      temperature: 0.3,
    },
  });
  return response.generated_text.trim();
};

const hfModelAdapter = async (input: any): Promise<string> => {
  if (typeof input === 'string') {
    return hfModelInference(input);
  } else if (input.toString) {
    return hfModelInference(input.toString());
  }
  throw new Error('Invalid input for Hugging Face inference');
};

export const makeChain = (retriever: any) => {
  const condenseQuestionPrompt =
    ChatPromptTemplate.fromTemplate(CONDENSE_TEMPLATE);
  const answerPrompt = ChatPromptTemplate.fromTemplate(QA_TEMPLATE);

  // const model = new ChatOpenAI({
  //   temperature: 0, // Adjust temperature for creativity
  //   modelName: 'gpt-3.5-turbo', // Change to gpt-4 if available
  // });

  // Rephrase the initial question into a standalone question
  const standaloneQuestionChain = RunnableSequence.from([
    condenseQuestionPrompt,
    hfModelAdapter,
    new StringOutputParser(),
  ]);

  // Retrieve documents and combine them into context
  const retrievalChain = retriever.pipe(combineDocumentsFn);

  // Generate an answer to the standalone question
  const answerChain = RunnableMap.from({
    context: RunnableSequence.from([
      (input) => input.question,
      retrievalChain,
    ]),
    chat_history: (input:any) => input.chat_history,
    question: (input:any) => input.question,
  })
    .pipe(answerPrompt)
    .pipe(hfModelAdapter)
    .pipe(new StringOutputParser());

  // Chain together the standalone question generation and answering
  const conversationalRetrievalQAChain = RunnableMap.from({
    question: standaloneQuestionChain,
    chat_history: (input:any) => input.chat_history,
  }).pipe(answerChain);

  return conversationalRetrievalQAChain;
};
