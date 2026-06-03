import { Body, Controller, Post, Query } from '@nestjs/common';
import { ColdCallQueryDto } from '../dto/cold.dto';
import { BxWebHookDto } from '@/apps/ork-documents/act/ork-act.dto';
import { ColdHookSilinceEndpointService } from '../services/silence/cold-hook-silince-endpoint.service';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Event Sales Cold Hook')
@Controller('event-sales-hook')
export class EventSalesHookController {
    constructor(
        private readonly hookEdpointService: ColdHookSilinceEndpointService,
    ) {}

    @Post('cold-call')
    async coldCall(@Body() body: BxWebHookDto, @Query() dto: ColdCallQueryDto) {
        const domain = body.auth.domain;
        return this.hookEdpointService.createColdCallHook(domain, dto);
    }
}
