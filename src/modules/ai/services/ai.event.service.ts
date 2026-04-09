import { Injectable, NotFoundException } from '@nestjs/common';
import { AiEntity } from '../entity/ai.entity';
import { AiRepository } from '../repository/ai.repository';

import { AiEntityDto } from '../dto/ai-entity.dto';
import { TranscriptionStoreService } from '@/modules/transcription/services/transcription.store.service';
import { UpdateAiByEventDto } from '../dto/ai-updtae-by-event';

@Injectable()
export class AiEventService {
    constructor(
        private readonly aiRepository: AiRepository,
        private readonly transcriptionStoreService: TranscriptionStoreService,
    ) {}

    async update(
        aiId: string,
        transcriptionId: string,
        data: UpdateAiByEventDto,
    ): Promise<AiEntityDto> {
        console.log('aiId', aiId);
        console.log('transcriptionId', transcriptionId);
        console.log('data', data);
        const aiEntity = new AiEntity();
        Object.assign(aiEntity, { aiId, ...data.ai });
        const updatedAi = await this.aiRepository.update(aiEntity);
        if (!updatedAi) throw new NotFoundException('AI record not updated');
        return new AiEntityDto(updatedAi);
    }
}
