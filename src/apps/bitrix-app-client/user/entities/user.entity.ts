import { User as PrismaUser } from 'generated/prisma';

export interface User extends PrismaUser {
    // Дополнительные поля или методы могут быть добавлены здесь
}

export enum UserRole {
    OWNER = 'owner',
    ADMIN = 'admin',
    USER = 'user',
    MANAGER = 'manager',
    DEVELOPER = 'developer',
    OTHER = 'other'
}

export interface CreateUserData {
    name: string;
    surname: string;
    email: string;
    password: string;
    client_id: bigint;
    role_id?: bigint;
    photo?: string;
    bitrix_id?: string;
}

export interface UpdateUserData {
    name?: string;
    surname?: string;
    email?: string;
    password?: string;
    photo?: string;
    bitrix_id?: string;
    role_id?: bigint;
}
