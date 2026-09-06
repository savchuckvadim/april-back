import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString } from 'class-validator';

/** Запрос последнего снапшота аудита по домену. */
export class AiAnalyticsAuditLatestQueryDto {
    @ApiProperty({
        description: 'Домен портала Bitrix24.',
        example: 'april.bitrix24.ru',
    })
    @IsString()
    @IsNotEmpty({ message: 'domain обязателен' })
    @Transform(({ value }: { value: unknown }) =>
        typeof value === 'string' ? value.trim().toLowerCase() : value,
    )
    domain: string;
}
