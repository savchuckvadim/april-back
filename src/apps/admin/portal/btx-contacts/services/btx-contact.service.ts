import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { btx_contacts } from 'generated/prisma';
import { BtxContactRepository } from '../repositories/btx-contact.repository';
import { CreateBtxContactDto } from '../dto/create-btx-contact.dto';
import { UpdateBtxContactDto } from '../dto/update-btx-contact.dto';
import { BtxContactResponseDto } from '../dto/btx-contact-response.dto';

@Injectable()
export class BtxContactService {
    constructor(private readonly repository: BtxContactRepository) {}

    async create(dto: CreateBtxContactDto): Promise<BtxContactResponseDto> {
        try {
            const contact = await this.repository.create({
                name: dto.name,
                title: dto.title,
                code: dto.code,
                portal_id: BigInt(dto.portal_id),
            });

            if (!contact) {
                throw new BadRequestException('Failed to create contact');
            }

            return this.mapToResponseDto(contact);
        } catch (error) {
            throw error;
        }
    }

    async findById(id: number): Promise<BtxContactResponseDto> {
        const contact = await this.repository.findById(id);
        if (!contact) {
            throw new NotFoundException(`Contact with id ${id} not found`);
        }
        return this.mapToResponseDto(contact);
    }

    async findMany(): Promise<BtxContactResponseDto[]> {
        const contacts = await this.repository.findMany();
        if (!contacts) {
            return [];
        }
        return contacts.map(this.mapToResponseDto);
    }

    async findByPortalId(portalId: number): Promise<BtxContactResponseDto[]> {
        const contacts = await this.repository.findByPortalId(portalId);
        if (!contacts) {
            return [];
        }
        return contacts.map(this.mapToResponseDto);
    }

    async update(id: number, dto: UpdateBtxContactDto): Promise<BtxContactResponseDto> {
        const contact = await this.repository.findById(id);
        if (!contact) {
            throw new NotFoundException(`Contact with id ${id} not found`);
        }

        try {
            const updateData: Partial<btx_contacts> = {};
            if (dto.name !== undefined) updateData.name = dto.name;
            if (dto.title !== undefined) updateData.title = dto.title;
            if (dto.code !== undefined) updateData.code = dto.code;
            if (dto.portal_id !== undefined) updateData.portal_id = BigInt(dto.portal_id);

            const updatedContact = await this.repository.update(id, updateData);
            if (!updatedContact) {
                throw new BadRequestException('Failed to update contact');
            }
            return this.mapToResponseDto(updatedContact);
        } catch (error) {
            throw error;
        }
    }

    async delete(id: number): Promise<void> {
        const contact = await this.repository.findById(id);
        if (!contact) {
            throw new NotFoundException(`Contact with id ${id} not found`);
        }

        await this.repository.delete(id);
    }

    private mapToResponseDto(contact: btx_contacts): BtxContactResponseDto {
        return {
            id: Number(contact.id),
            name: contact.name,
            title: contact.title,
            code: contact.code,
            portal_id: Number(contact.portal_id),
            created_at: contact.created_at,
            updated_at: contact.updated_at,
        };
    }
}

