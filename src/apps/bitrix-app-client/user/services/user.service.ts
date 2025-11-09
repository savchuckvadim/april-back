import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { UserRepository } from '../repositories/user.repository';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { UserResponseDto } from '../dto/user-response.dto';
import { UserRole } from '../entities/user.entity';
import { encrypt, decrypt } from '@/lib/utils/crypt.util';
import { User } from 'generated/prisma';

@Injectable()
export class UserService {
    constructor(
        private readonly userRepository: UserRepository,
    ) { }

    async createUser(createUserDto: CreateUserDto): Promise<UserResponseDto | null> {
        // Проверяем, существует ли пользователь с таким email
        const existingUser = await this.userRepository.findByEmail(createUserDto.email);
        if (existingUser) {
            throw new ConflictException('User with this email already exists');
        }

        // Проверяем, что client_id существует (это должно быть проверено в client service)
        const user = await this.userRepository.create({
            name: createUserDto.name,
            surname: createUserDto.surname,
            email: createUserDto.email,
            password: createUserDto.password,
            client_id: BigInt(createUserDto.client_id),
            photo: createUserDto.photo,
            bitrix_id: createUserDto.bitrix_id,
            role_id: createUserDto.role_id ? BigInt(createUserDto.role_id) : BigInt(1), // По умолчанию роль user
        });

        if (!user) {
            return null;
        }
        return this.mapToResponseDto(user);
    }

    async createOwnerUser(clientId: number, userData: Omit<CreateUserDto, 'client_id'>): Promise<User | null> {
        // Создаем пользователя-владельца при регистрации клиента
        const user = await this.userRepository.create({
            name: userData.name,
            surname: userData.surname,
            email: userData.email,
            password: userData.password,
            client_id: BigInt(clientId),
            photo: userData.photo,
            bitrix_id: userData.bitrix_id,
            role_id: BigInt(1), // Роль owner (предполагаем, что role_id = 1 для owner)
        });

        if (!user) {
            return null;
        }

        return user;
    }

    // async createOwnerUser(clientId: number, userData: Omit<CreateUserDto, 'client_id'>): Promise<UserResponseDto | null> {
    //     // Создаем пользователя-владельца при регистрации клиента
    //     const user = await this.userRepository.create({
    //         name: userData.name,
    //         surname: userData.surname,
    //         email: userData.email,
    //         password: userData.password,
    //         client_id: BigInt(clientId),
    //         photo: userData.photo,
    //         bitrix_id: userData.bitrix_id,
    //         role_id: BigInt(1), // Роль owner (предполагаем, что role_id = 1 для owner)
    //     });

    //     if (!user) {
    //         return null;
    //     }

    //     return this.mapToResponseDto(user);
    // }

    async findUserById(id: number): Promise<UserResponseDto | null> {
        const user = await this.userRepository.findById(id);
        if (!user) {
            return null;
        }
        return this.mapToResponseDto(user);
    }

    async findUserByEmail(email: string): Promise<User | null> {
        const user = await this.userRepository.findByEmail(email);
        if (!user) {
            return null;
        }
        return user; // this.mapToResponseDto(user);
    }

    async findUsersByClientId(clientId: number): Promise<UserResponseDto[]> {
        const users = await this.userRepository.findByClientId(clientId);
        if (!users) {
            return [];
        }
        return users.map(user => this.mapToResponseDto(user));
    }

    async findUserByBitrixId(bitrixId: string): Promise<UserResponseDto | null> {
        const user = await this.userRepository.findByBitrixId(bitrixId);
        if (!user) {
            return null;
        }
        return this.mapToResponseDto(user);
    }

    async findAllUsers(): Promise<UserResponseDto[]> {
        const users = await this.userRepository.findMany();
        if (!users) {
            return [];
        }
        return users.map(user => this.mapToResponseDto(user));
    }

    async updateUser(id: number, updateUserDto: UpdateUserDto): Promise<UserResponseDto> {
        // Проверяем, существует ли пользователь
        const existingUser = await this.userRepository.findById(id);
        if (!existingUser) {
            throw new NotFoundException(`User with ID ${id} not found`);
        }

        // Если обновляется email, проверяем, что он не занят другим пользователем
        if (updateUserDto.email && updateUserDto.email !== existingUser.email) {
            const userWithEmail = await this.userRepository.findByEmail(updateUserDto.email);
            if (userWithEmail && userWithEmail.id !== BigInt(id)) {
                throw new ConflictException('User with this email already exists');
            }
        }

        const updatedUser = await this.userRepository.update(id, {
            name: updateUserDto.name,
            surname: updateUserDto.surname,
            email: updateUserDto.email,
            password: updateUserDto.password,
            photo: updateUserDto.photo,
            bitrix_id: updateUserDto.bitrix_id,
            role_id: updateUserDto.role_id ? BigInt(updateUserDto.role_id) : undefined,
        });

        if (!updatedUser) {
            throw new BadRequestException('Failed to update user');
        }

        return this.mapToResponseDto(updatedUser);
    }

    async updateUserByEmail(email: string, updateUserDto: UpdateUserDto): Promise<UserResponseDto> {
        const updatedUser = await this.userRepository.updateByEmail(email, {
            ...updateUserDto,
            password: updateUserDto.password ? encrypt(updateUserDto.password) : undefined,
            role_id: updateUserDto.role_id ? BigInt(updateUserDto.role_id) : undefined,
            client_id: updateUserDto.client_id ? BigInt(updateUserDto.client_id) : undefined,
        });
        if (!updatedUser) {
            throw new BadRequestException('Failed to update user');
        }
        return this.mapToResponseDto(updatedUser);
    }

    async deleteUser(id: number): Promise<void> {
        const user = await this.userRepository.findById(id);
        if (!user) {
            throw new NotFoundException(`User with ID ${id} not found`);
        }

        const deleted = await this.userRepository.delete(id);
        if (!deleted) {
            throw new BadRequestException('Failed to delete user');
        }
    }

    async findOwnerByClientId(clientId: number): Promise<UserResponseDto> {
        const owner = await this.userRepository.findOwnerByClientId(clientId);
        if (!owner) {
            throw new NotFoundException(`Owner for client ${clientId} not found`);
        }
        return this.mapToResponseDto(owner);
    }

    async findUsersByRoleId(roleId: number): Promise<UserResponseDto[]> {
        const users = await this.userRepository.findByRoleId(roleId);
        if (!users) {
            return [];
        }
        return users.map(user => this.mapToResponseDto(user));
    }

    async findActiveUsersByClientId(clientId: number): Promise<UserResponseDto[]> {
        const users = await this.userRepository.findActiveUsersByClientId(clientId);
        if (!users) {
            return [];
        }
        return users.map(user => this.mapToResponseDto(user));
    }

    async validateUserCredentials(email: string, password: string): Promise<UserResponseDto | null> {
        const user = await this.userRepository.findByEmail(email);
        if (!user) {
            return null;
        }

        // Расшифровываем сохраненный пароль и сравниваем с введенным
        const decryptedPassword = decrypt(user.password);
        if (password !== decryptedPassword) {
            return null;
        }

        return this.mapToResponseDto(user);
    }

    public getUserDto(user: User): UserResponseDto {
        return this.mapToResponseDto(user);
    }

    private mapToResponseDto(user: User): UserResponseDto {
        return {
            id: Number(user.id),
            name: user.name,
            surname: user.surname,
            email: user.email ?? '',
            password: user.password,
            photo: user.photo ?? undefined,
            role_id: Number(user.role_id),
            email_verified_at: user.email_verified_at ?? undefined,
            bitrix_id: user.bitrix_id ?? undefined,
            client_id: Number(user.client_id),
            created_at: user.created_at ?? undefined,
            updated_at: user.updated_at ?? undefined,
        };
    }
}
