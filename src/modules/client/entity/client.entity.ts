
import {  Portal, Client as PrismaClient, User } from 'generated/prisma';

export interface ClientEntity extends PrismaClient { }

export interface ClientWithRelations extends ClientEntity {
    portal?: Portal | null;
    users: User[] | null;
}

