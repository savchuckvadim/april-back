import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';
import { FrontPortalDto } from './front-portal.dto';

/**
 * Тело ответа эндпоинта POST front/portal. Глобальный ResponseInterceptor
 * оборачивает его в {resultCode: 0, data: {portal}} — фронт читает data.portal.
 */
export class FrontPortalResponseDto {
    @ApiProperty({
        description: 'Модель портала для фронта',
        type: FrontPortalDto,
    })
    @ValidateNested()
    @Type(() => FrontPortalDto)
    portal!: FrontPortalDto;
}
