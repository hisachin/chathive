import mongoose from 'mongoose';
import { NextApiRequest, NextApiResponse } from 'next';
import connectDB from '@/utils/mongoConnection';
import { getSession } from 'next-auth/react';
import { ChatModel,IChat } from '@/models/ChatModel';

const getNamespacesChats = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const session = await getSession({ req });

    if (!session) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const ChatModelTyped = ChatModel as mongoose.Model<IChat>;

    const userEmail = req.query.userEmail as string;
    const namespace = req.query.namespace as string;

    await connectDB();
    let namespaceChats: string[] = await ChatModelTyped.find({namespace,userEmail});
    namespaceChats  = namespaceChats.length ? namespaceChats.map((chat:any) => chat.chatId) : [];
    res.status(200).json(namespaceChats);
  } catch (error) {
    console.log('error', error);
    res.status(500).json({ message: 'Failed to get namespaces' });
  }
};

export default getNamespacesChats;
