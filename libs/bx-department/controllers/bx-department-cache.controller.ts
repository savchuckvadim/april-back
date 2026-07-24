import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BxDepartmentCacheService } from '../services/bx-department-cache.service';
import {
    BxDepartmentCacheResetRequestDto,
    BxDepartmentCacheResetResponseDto,
} from '../dto/bx-department-cache.dto';

@ApiTags('Bitrix Domain Department')
@Controller('bx/department/cache')
export class BxDepartmentCacheController {
    constructor(private readonly service: BxDepartmentCacheService) {}

    @ApiOperation({
        summary: 'Сбросить кэш отделов и команд в Redis',
        description:
            'Удаляет закэшированные данные bx-department (структура отделов, ' +
            'полный отдел, команды) по конкретному домену, а без домена — ' +
            'по всем порталам. Redis общий для всех приложений монорепы, ' +
            'поэтому сброс действует на все приложения сразу.',
    })
    @ApiBody({
        type: BxDepartmentCacheResetRequestDto,
        description: 'Домен портала; не указан — сбросить по всем порталам.',
    })
    @ApiOkResponse({
        type: BxDepartmentCacheResetResponseDto,
        description: 'Количество удалённых ключей и использованные паттерны.',
    })
    @Post('reset')
    @HttpCode(200)
    async reset(
        @Body() dto: BxDepartmentCacheResetRequestDto,
    ): Promise<BxDepartmentCacheResetResponseDto> {
        return await this.service.reset(dto.domain);
    }
}
