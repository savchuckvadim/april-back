import { Injectable } from '@nestjs/common';
import { User } from 'generated/prisma';
import { PrismaService } from 'src/core/prisma';
import { UserRepository } from './user.repository';
import { decrypt, encrypt } from '@/lib/utils/crypt.util';


@Injectable()
export class UserPrismaRepository implements UserRepository {
    constructor(private readonly prisma: PrismaService) { }

    async create(user: Partial<User>): Promise<User | null> {
        try {
            // Хешируем пароль
            const hashedPassword = encrypt(user.password as string);

            const result = await this.prisma.user.create({
                data: {
                    name: user.name!,
                    surname: user.surname!,
                    email: user.email!,
                    password: hashedPassword,
                    client_id: user.client_id!,
                    role_id: user.role_id || BigInt(1), // По умолчанию роль user
                    photo: user.photo,
                    bitrix_id: user.bitrix_id,
                },
            });
            return result;
        } catch (error) {
            console.error('Error creating user:', error);
            return null;
        }
    }

    async findById(id: number): Promise<User | null> {
        try {
            const result = await this.prisma.user.findUnique({
                where: { id: BigInt(id) },
                include: {
                    clients: true,
                },
            });
            return result;
        } catch (error) {
            console.error('Error finding user by id:', error);
            return null;
        }
    }

    async findByEmail(email: string): Promise<User | null> {
        try {
            const result = await this.prisma.user.findUnique({
                where: { email: email },
                include: {
                    clients: true,
                },
            });
            return result;
        } catch (error) {
            console.error('Error finding user by email:', error);
            return null;
        }
    }

    async findByClientId(clientId: number): Promise<User[] | null> {
        try {
            const result = await this.prisma.user.findMany({
                where: { client_id: BigInt(clientId) },
                include: {
                    clients: true,
                },
            });
            return result;
        } catch (error) {
            console.error('Error finding users by client id:', error);
            return null;
        }
    }

    async findByBitrixId(bitrixId: string): Promise<User | null> {
        try {
            const result = await this.prisma.user.findFirst({
                where: { bitrix_id: bitrixId },
                include: {
                    clients: true,
                },
            });
            return result;
        } catch (error) {
            console.error('Error finding user by bitrix id:', error);
            return null;
        }
    }

    async findMany(): Promise<User[] | null> {
        try {
            const result = await this.prisma.user.findMany({
                include: {
                    clients: true,
                },
            });
            return result;
        } catch (error) {
            console.error('Error finding all users:', error);
            return null;
        }
    }

    async update(id: number, user: Partial<User>): Promise<User | null> {
        try {
            const updateData: any = {
                name: user.name,
                surname: user.surname,
                email: user.email,
                photo: user.photo,
                bitrix_id: user.bitrix_id,
                role_id: user.role_id,
            };

            // Если пароль предоставлен, хешируем его
            if (user.password) {
                updateData.password = encrypt(user.password as string);
            }

            const result = await this.prisma.user.update({
                where: { id: BigInt(id) },
                data: updateData,
                include: {
                    clients: true,
                },
            });
            return result;
        } catch (error) {
            console.error('Error updating user:', error);
            return null;
        }
    }

    async updateByEmail(email: string, user: Partial<User>): Promise<User | null> {
        let result: User | null = null;
        try {
            result = await this.prisma.user.update({
                where: { email: email },
                data: user,
            });
        } catch (error) {
            console.error('Error updating user by email:', error);
            return null;
        }
        return result;
    }
    async delete(id: number): Promise<boolean> {
        try {
            await this.prisma.user.delete({
                where: { id: BigInt(id) },
            });
            return true;
        } catch (error) {
            console.error('Error deleting user:', error);
            return false;
        }
    }

    async findOwnerByClientId(clientId: number): Promise<User | null> {
        try {
            // Предполагаем, что роль owner имеет role_id = 1 или специальный код
            const result = await this.prisma.user.findFirst({
                where: {
                    client_id: BigInt(clientId),
                    // Здесь нужно будет добавить логику для определения роли owner
                    // Пока ищем по role_id = 1, но это нужно будет настроить
                    role_id: BigInt(1)
                },
                include: {
                    clients: true,
                },
            });
            return result;
        } catch (error) {
            console.error('Error finding owner by client id:', error);
            return null;
        }
    }

    async findByRoleId(roleId: number): Promise<User[] | null> {
        try {
            const result = await this.prisma.user.findMany({
                where: { role_id: BigInt(roleId) },
                include: {
                    clients: true,
                },
            });
            return result;
        } catch (error) {
            console.error('Error finding users by role id:', error);
            return null;
        }
    }

    async findActiveUsersByClientId(clientId: number): Promise<User[] | null> {
        try {
            // Предполагаем, что активные пользователи - это те, у которых email_verified_at не null
            const result = await this.prisma.user.findMany({
                where: {
                    client_id: BigInt(clientId),
                    email_verified_at: { not: null }
                },
                include: {
                    clients: true,
                },
            });
            return result;
        } catch (error) {
            console.error('Error finding active users by client id:', error);
            return null;
        }
    }
}
