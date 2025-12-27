import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Portal } from 'generated/prisma';
import { AdminPortalRepository } from '../repositories/portal.repository';
import { CreatePortalDto } from '../dto/create-portal.dto';
import { UpdatePortalDto } from '../dto/update-portal.dto';
import { PortalResponseDto } from '../dto/portal-response.dto';

@Injectable()
export class AdminPortalService {
    constructor(private readonly repository: AdminPortalRepository) {}

    async create(dto: CreatePortalDto): Promise<PortalResponseDto> {
        try {
            const portal = await this.repository.create({
                domain: dto.domain,
                key: dto.key,
                C_REST_CLIENT_ID: dto.C_REST_CLIENT_ID,
                C_REST_CLIENT_SECRET: dto.C_REST_CLIENT_SECRET,
                C_REST_WEB_HOOK_URL: dto.C_REST_WEB_HOOK_URL,
                number: dto.number ?? 0,
                client_id: dto.client_id ? BigInt(dto.client_id) : null,
            });

            if (!portal) {
                throw new BadRequestException('Failed to create portal');
            }

            return this.mapToResponseDto(portal);
        } catch (error) {
            if (error.code === 'P2002') {
                throw new BadRequestException('Portal with this domain already exists');
            }
            throw error;
        }
    }

    async findById(id: number): Promise<PortalResponseDto> {
        const portal = await this.repository.findById(id);
        if (!portal) {
            throw new NotFoundException(`Portal with id ${id} not found`);
        }
        return this.mapToResponseDto(portal);
    }

    async findMany(): Promise<PortalResponseDto[]> {
        const portals = await this.repository.findMany();
        if (!portals) {
            return [];
        }
        return portals.map(this.mapToResponseDto);
    }

    async findByDomain(domain: string): Promise<PortalResponseDto | null> {
        const portal = await this.repository.findByDomain(domain);
        if (!portal) {
            return null;
        }
        return this.mapToResponseDto(portal);
    }

    async findByClientId(clientId: number): Promise<PortalResponseDto[]> {
        const portals = await this.repository.findByClientId(clientId);
        if (!portals) {
            return [];
        }
        return portals.map(this.mapToResponseDto);
    }

    async update(id: number, dto: UpdatePortalDto): Promise<PortalResponseDto> {
        const portal = await this.repository.findById(id);
        if (!portal) {
            throw new NotFoundException(`Portal with id ${id} not found`);
        }

        try {
            const updateData: Partial<Portal> = {};
            if (dto.domain !== undefined) updateData.domain = dto.domain;
            if (dto.key !== undefined) updateData.key = dto.key;
            if (dto.C_REST_CLIENT_ID !== undefined) updateData.C_REST_CLIENT_ID = dto.C_REST_CLIENT_ID;
            if (dto.C_REST_CLIENT_SECRET !== undefined) updateData.C_REST_CLIENT_SECRET = dto.C_REST_CLIENT_SECRET;
            if (dto.C_REST_WEB_HOOK_URL !== undefined) updateData.C_REST_WEB_HOOK_URL = dto.C_REST_WEB_HOOK_URL;
            if (dto.number !== undefined) updateData.number = dto.number;
            if (dto.client_id !== undefined) updateData.client_id = dto.client_id ? BigInt(dto.client_id) : null;

            const updatedPortal = await this.repository.update(id, updateData);
            if (!updatedPortal) {
                throw new BadRequestException('Failed to update portal');
            }
            return this.mapToResponseDto(updatedPortal);
        } catch (error) {
            if (error.code === 'P2002') {
                throw new BadRequestException('Portal with this domain already exists');
            }
            throw error;
        }
    }

    async delete(id: number): Promise<void> {
        const portal = await this.repository.findById(id);
        if (!portal) {
            throw new NotFoundException(`Portal with id ${id} not found`);
        }

        await this.repository.delete(id);
    }

    private mapToResponseDto(portal: Portal): PortalResponseDto {
        return {
            id: Number(portal.id),
            domain: portal.domain,
            key: portal.key,
            client_id: portal.client_id ? Number(portal.client_id) : null,
            C_REST_CLIENT_ID: portal.C_REST_CLIENT_ID,
            C_REST_CLIENT_SECRET: portal.C_REST_CLIENT_SECRET,
            C_REST_WEB_HOOK_URL: portal.C_REST_WEB_HOOK_URL,
            number: portal.number,
            created_at: portal.created_at,
            updated_at: portal.updated_at,
        };
    }
}

