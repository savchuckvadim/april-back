import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SupportGuideService } from '../support-guide.service';
import {
    SupportGuideQueryDto,
    SupportGuideResponseDto,
} from './dto/support-guide.dto';

/**
 * Путеводитель по поддержке клиентов в админке: концепция, как
 * пользоваться, алгоритм, ключи, что не сделано и живой чек-лист
 * готовности портала линии (по образцу каталога хуков).
 */
@ApiTags('Admin Support monitor')
@Controller('admin/support')
export class SupportGuideAdminController {
    constructor(private readonly guide: SupportGuideService) {}

    @Get('guide')
    @ApiOperation({
        summary: 'Путеводитель по поддержке клиентов',
        description:
            'Тексты раздела «Поддержка» админки и чек-лист «что осталось, чтобы ' +
            'заработало» по настройкам портала линии. Только чтение.',
    })
    @ApiOkResponse({
        type: SupportGuideResponseDto,
        description: 'Путеводитель и чек-лист.',
    })
    async get(
        @Query() query: SupportGuideQueryDto,
    ): Promise<SupportGuideResponseDto> {
        return this.guide.build(query.domain);
    }
}
