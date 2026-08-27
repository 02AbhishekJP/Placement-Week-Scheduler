// Prisma client singleton for the server
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default prisma;
