import { Injectable } from '@nestjs/common';

import { ClientDto, ClientRegistrationRequestDto } from '../dto/client-registration.dto';
import { ClientRepository } from '../repositories/client.repository';
import { UserService } from '../../user/services/user.service';
import { Client } from 'generated/prisma';
import { UserResponseDto } from '../../user/dto/user-response.dto';

@Injectable()
export class BitrixClientService {
    constructor(
        private readonly clientRepository: ClientRepository,
        private readonly userService: UserService,
    ) { }

    async registrationClient(dto: ClientRegistrationRequestDto) {
        // Создаем клиента
        const client = await this.clientRepository.create({
            name: dto.name,
            email: dto.email,
            status: 'active',
            is_active: true,
        });

        if (!client) {
            throw new Error('Failed to create client');
        }

        // Создаем первого пользователя-владельца
        const ownerUser = await this.userService.createOwnerUser(Number(client.id), {
            name: dto.userName,
            surname: dto.userSurname,
            email: dto.email,
            password: dto.password,
        });

        return {
            client: this.mapToResponseDto(client),
            ownerUser,
        };
    }

    async findByEmail(email: string): Promise<ClientDto | null> {
        const client = await this.clientRepository.findByEmail(email);
        if (!client) {
            return null;
        }
        return this.mapToResponseDto(client);
    }

    async findById(id: number): Promise<ClientDto | null> {
        const client = await this.clientRepository.findById(id);
        if (!client) {
            return null;
        }
        return this.mapToResponseDto(client);
    }

    async findMany(): Promise<ClientDto[]> {
        const clients = await this.clientRepository.findMany();
        if (!clients) {
            return [];
        }
        return clients.map(this.mapToResponseDto);
    }

    async findByStatus(status: string): Promise<ClientDto[]> {
        const clients = await this.clientRepository.findByStatus(status);
        if (!clients) {
            return [];
        }
        return clients.map(this.mapToResponseDto);
    }

    async findByIsActive(isActive: boolean): Promise<ClientDto[]> {
        const clients = await this.clientRepository.findByIsActive(isActive);
        if (!clients) {
            return [];
        }
        return clients.map(this.mapToResponseDto);
    }

    async findByUserId(userId: number): Promise<ClientDto[]> {
        const clients = await this.clientRepository.findByUserId(userId);
        if (!clients) {
            return [];
        }
        return clients.map(this.mapToResponseDto);
    }

    async findByPortalId(portalId: number): Promise<ClientDto[]> {
        const clients = await this.clientRepository.findByPortalId(portalId);
        if (!clients) {
            return [];
        }
        return clients.map(this.mapToResponseDto);
    }

    async update(id: number, client: Partial<Client>): Promise<ClientDto | null> {
        const updatedClient = await this.clientRepository.update(id, client);
        if (!updatedClient) {
            return null;
        }
        return this.mapToResponseDto(updatedClient);
    }

    private mapToResponseDto(client: Client): ClientDto {
        return {
            id: Number(client.id),
            name: client.name,
            email: client.email ?? '',
            is_active: client.is_active ?? false,
            created_at: client.created_at ?? new Date(),
            updated_at: client.updated_at ?? new Date(),

        };
    }
}
