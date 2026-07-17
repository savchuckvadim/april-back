import { Portal, Client as PrismaClient, User } from 'generated/prisma';

export type ClientEntity = PrismaClient;

export interface ClientWithRelations extends ClientEntity {
    portal?: Portal | null;
    users: User[] | null;
}
