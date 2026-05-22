import { Body, Get, Param } from '@nestjs/common';
import { AiEventService } from '../services/ai.event.service';
import { UpdateAiByEventDto } from '../dto/ai-updtae-by-event';
import { AiEntityDto } from '../dto/ai-entity.dto';

export class AiEventController {
    constructor(private readonly aiEventService: AiEventService) {}

    @Get()
    public async updateAiByEvent(
        @Param('aiId') aiId: string,
        @Param('transcriptionId') transcriptionId: string,
        @Body() updateAiEventDto: UpdateAiByEventDto,
    ): Promise<AiEntityDto> {
        return await this.aiEventService.update(
            aiId,
            transcriptionId,
            updateAiEventDto,
        );
    }
}
