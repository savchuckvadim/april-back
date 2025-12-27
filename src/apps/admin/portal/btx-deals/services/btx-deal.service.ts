import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { btx_deals } from 'generated/prisma';
import { BtxDealRepository } from '../repositories/btx-deal.repository';
import { CreateBtxDealDto } from '../dto/create-btx-deal.dto';
import { UpdateBtxDealDto } from '../dto/update-btx-deal.dto';
import { BtxDealResponseDto } from '../dto/btx-deal-response.dto';

@Injectable()
export class BtxDealService {
    constructor(private readonly repository: BtxDealRepository) { }

    async create(dto: CreateBtxDealDto): Promise<BtxDealResponseDto> {
        try {
            const deal = await this.repository.create({
                name: dto.name,
                title: dto.title,
                code: dto.code,
                portal_id: BigInt(dto.portal_id),
            });

            if (!deal) {
                throw new BadRequestException('Failed to create deal');
            }

            return this.mapToResponseDto(deal);
        } catch (error) {
            throw error;
        }
    }

    async findById(id: number): Promise<BtxDealResponseDto> {
        const deal = await this.repository.findById(id);
        if (!deal) {
            throw new NotFoundException(`Deal with id ${id} not found`);
        }
        return this.mapToResponseDto(deal);
    }

    async findMany(): Promise<BtxDealResponseDto[]> {
        const deals = await this.repository.findMany();
        if (!deals) {
            return [];
        }
        return deals.map(this.mapToResponseDto);
    }

    async findByPortalId(portalId: number): Promise<BtxDealResponseDto[]> {
        const deals = await this.repository.findByPortalId(portalId);
        if (!deals) {
            return [];
        }
        return deals.map(this.mapToResponseDto);
    }

    async update(id: number, dto: UpdateBtxDealDto): Promise<BtxDealResponseDto> {
        const deal = await this.repository.findById(id);
        if (!deal) {
            throw new NotFoundException(`Deal with id ${id} not found`);
        }

        try {
            const updateData: Partial<btx_deals> = {};
            if (dto.name !== undefined) updateData.name = dto.name;
            if (dto.title !== undefined) updateData.title = dto.title;
            if (dto.code !== undefined) updateData.code = dto.code;
            if (dto.portal_id !== undefined) updateData.portal_id = BigInt(dto.portal_id);

            const updatedDeal = await this.repository.update(id, updateData);
            if (!updatedDeal) {
                throw new BadRequestException('Failed to update deal');
            }
            return this.mapToResponseDto(updatedDeal);
        } catch (error) {
            throw error;
        }
    }

    async delete(id: number): Promise<void> {
        const deal = await this.repository.findById(id);
        if (!deal) {
            throw new NotFoundException(`Deal with id ${id} not found`);
        }

        await this.repository.delete(id);
    }

    private mapToResponseDto(deal: btx_deals): BtxDealResponseDto {
        return {
            id: Number(deal.id),
            name: deal.name,
            title: deal.title,
            code: deal.code,
            portal_id: Number(deal.portal_id),
            created_at: deal.created_at,
            updated_at: deal.updated_at,
        };
    }
}

