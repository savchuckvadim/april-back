import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Client } from 'generated/prisma';
import { ClientRepository } from '../repositories/client.repository';
import { CreateClientDto } from '../dto/create-client.dto';
import { UpdateClientDto } from '../dto/update-client.dto';
import { ClientResponseDto, ClientWithRelationsResponseDto } from '../dto/client-response.dto';
import { ClientWithRelations } from '../entity/client.entity';
import { UserResponseDto } from '@/apps/bitrix-app-client/user/dto/user-response.dto';
import { PortalResponseDto } from '@/apps/admin/portal/dto/portal-response.dto';

@Injectable()
export class ClientService {
    constructor(private readonly repository: ClientRepository) { }

    async create(dto: CreateClientDto): Promise<ClientResponseDto> {
        try {
            const client = await this.repository.create({
                name: dto.name,
                email: dto.email,
                status: dto.status || 'active',
                is_active: dto.is_active ?? true,
            });

            if (!client) {
                throw new BadRequestException('Failed to create client');
            }

            return this.mapToResponseDto(client);
        } catch (error) {
            if (error.code === 'P2002') {
                throw new BadRequestException('Client with this email already exists');
            }
            throw error;
        }
    }

    async findById(id: number): Promise<ClientResponseDto> {
        const client = await this.repository.findById(id);
        if (!client) {
            throw new NotFoundException(`Client with id ${id} not found`);
        }
        return this.mapToResponseDto(client);
    }

    async findByIdWithRelations(id: number): Promise<ClientWithRelationsResponseDto> {
        const client = await this.repository.findByIdWithRelations(id);
        if (!client) {
            throw new NotFoundException(`Client with id ${id} not found`);
        }
        return this.mapToResponseDtoWithRelations(client);
    }
    async findMany(): Promise<ClientResponseDto[]> {
        const clients = await this.repository.findMany();
        if (!clients) {
            return [];
        }
        return clients.map(this.mapToResponseDto);
    }

    async findByEmail(email: string): Promise<ClientResponseDto | null> {
        const client = await this.repository.findByEmail(email);
        if (!client) {
            return null;
        }
        return this.mapToResponseDto(client);
    }

    async findByStatus(status: string): Promise<ClientResponseDto[]> {
        const clients = await this.repository.findByStatus(status);
        if (!clients) {
            return [];
        }
        return clients.map(this.mapToResponseDto);
    }

    async findByIsActive(isActive: boolean): Promise<ClientResponseDto[]> {
        const clients = await this.repository.findByIsActive(isActive);
        if (!clients) {
            return [];
        }
        return clients.map(this.mapToResponseDto);
    }

    async update(id: number, dto: UpdateClientDto): Promise<ClientResponseDto> {
        const client = await this.repository.findById(id);
        if (!client) {
            throw new NotFoundException(`Client with id ${id} not found`);
        }

        try {
            const updatedClient = await this.repository.update(id, dto);
            if (!updatedClient) {
                throw new BadRequestException('Failed to update client');
            }
            return this.mapToResponseDto(updatedClient);
        } catch (error) {
            if (error.code === 'P2002') {
                throw new BadRequestException('Client with this email already exists');
            }
            throw error;
        }
    }

    async delete(id: number): Promise<void> {
        const client = await this.repository.findById(id);
        if (!client) {
            throw new NotFoundException(`Client with id ${id} not found`);
        }

        await this.repository.delete(id);
    }

    private mapToResponseDto(client: Client): ClientResponseDto {
        return {
            id: Number(client.id),
            name: client.name,
            email: client.email,
            status: client.status,
            is_active: client.is_active,
            created_at: client.created_at,
            updated_at: client.updated_at,
        };
    }

    private mapToResponseDtoWithRelations(client: ClientWithRelations): ClientWithRelationsResponseDto {
        return {
            ...this.mapToResponseDto(client),
            users: client.users?.map(user => new UserResponseDto(user)) || [],
            portal: client.portal ? new PortalResponseDto(client.portal) : null,
        };
    }
}

