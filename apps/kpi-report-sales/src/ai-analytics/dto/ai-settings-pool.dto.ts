import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

/**
 * Согласие портала на обезличенный пул порталов в ответе `settings/get`
 * (Фаза 4): включено ли участие и с какой даты. Вынесено в отдельный файл,
 * чтобы не раздувать `ai-settings.dto.ts`; запрос на изменение — блок
 * `pool` сохранения настроек.
 */
export class AiSettingsPoolStateDto {
    @ApiProperty({
        description:
            'Портал участвует в обезличенном пуле порталов: общие нормы и ' +
            'сезонность подмешиваются к расчёту, данные портала без имени ' +
            'уходят в общую копилку.',
        type: Boolean,
        example: false,
    })
    @IsBoolean()
    optIn: boolean;

    @ApiProperty({
        description:
            'День, с которого действует согласие (YYYY-MM-DD или ISO 8601); ' +
            'null — согласия нет.',
        type: String,
        nullable: true,
        example: '2026-09-29',
    })
    @IsOptional()
    @IsString()
    consentAt: string | null;
}
