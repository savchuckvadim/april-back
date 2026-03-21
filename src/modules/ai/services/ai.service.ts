import { Injectable, NotFoundException } from '@nestjs/common';
import { AiEntity } from '../entity/ai.entity';
import { AiRepository } from '../repository/ai.repository';
import { AiCreateDto } from '../dto/ai-create.dto';
import { AiEntityDto } from '../dto/ai-entity.dto';
import { AiUpdateDto } from '../dto/ai-update.dto';

@Injectable()
export class AiService {
    constructor(private readonly aiRepository: AiRepository) {}

    async create(createAiDto: AiCreateDto): Promise<AiEntityDto> {
        const aiEntity = new AiEntity();
        Object.assign(aiEntity, createAiDto);
        const newAi = await this.aiRepository.create(aiEntity);
        if (!newAi) throw new NotFoundException('AI record not created');
        return new AiEntityDto(newAi);
    }

    async findAll(): Promise<AiEntityDto[]> {
        const aiRecords = await this.aiRepository.findMany();
        if (!aiRecords) return [];
        return aiRecords.map(ai => new AiEntityDto(ai));
    }

    async findById(id: string): Promise<AiEntityDto> {
        const aiEntity = await this.aiRepository.findById(id);
        if (!aiEntity) throw new NotFoundException('AI record not found');
        return new AiEntityDto(aiEntity);
    }

    async update(id: string, updateAiDto: AiUpdateDto): Promise<AiEntityDto> {
        const aiEntity = new AiEntity();
        Object.assign(aiEntity, { id, ...updateAiDto });
        const updatedAi = await this.aiRepository.update(aiEntity);
        if (!updatedAi) throw new NotFoundException('AI record not updated');
        return new AiEntityDto(updatedAi);
    }

    async findByDomain(domain: string): Promise<AiEntityDto[]> {
        const aiRecords = await this.aiRepository.findByDomain(domain);
        if (!aiRecords) return [];
        return aiRecords.map(ai => new AiEntityDto(ai));
    }

    async findByDomainAndUser(
        domain: string,
        userId: string,
    ): Promise<AiEntityDto[]> {
        const aiRecords = await this.aiRepository.findByDomainAndUser(
            domain,
            userId,
        );
        if (!aiRecords) return [];
        return aiRecords.map(ai => new AiEntityDto(ai));
    }
}
