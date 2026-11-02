import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import {
    METHODOLOGY_CODE_PATTERN,
    MethodologyConfigDto,
} from '@lib/call-lib/call-report/methodology';

/** Пределы помощника — зеркало валидации. */
export const METHODOLOGY_ASSIST_LIMITS = {
    text: 400_000,
    domain: 255,
    title: 255,
} as const;

/** Поля формы помощника (multipart: файл отдельно). */
export class MethodologyAssistBodyDto {
    @ApiPropertyOptional({
        description:
            'Текст документа методики, если файла нет (можно вставить ' +
            'скопированный текст). С файлом — добавляется к извлечённому тексту.',
        type: String,
        maxLength: METHODOLOGY_ASSIST_LIMITS.text,
    })
    @IsOptional()
    @IsString()
    @MaxLength(METHODOLOGY_ASSIST_LIMITS.text)
    text?: string;

    @ApiPropertyOptional({
        description:
            'Домен портала — его ключи и порядок провайдеров для вызова ' +
            'модели; пусто — общие ключи приложения.',
        example: 'gsr.bitrix24.ru',
        type: String,
        maxLength: METHODOLOGY_ASSIST_LIMITS.domain,
    })
    @IsOptional()
    @IsString()
    @MaxLength(METHODOLOGY_ASSIST_LIMITS.domain)
    domain?: string;

    @ApiPropertyOptional({
        description:
            'Желаемый код методики (латиница, цифры, дефис); пусто — предложит модель.',
        example: 'garant-voronezh',
        type: String,
    })
    @IsOptional()
    @IsString()
    @Matches(METHODOLOGY_CODE_PATTERN)
    code?: string;

    @ApiPropertyOptional({
        description: 'Желаемое название методики; пусто — предложит модель.',
        example: 'Методика Воронежа',
        type: String,
        maxLength: METHODOLOGY_ASSIST_LIMITS.title,
    })
    @IsOptional()
    @IsString()
    @MaxLength(METHODOLOGY_ASSIST_LIMITS.title)
    title?: string;
}

/** Черновик методики от помощника: правит человек, автопринятия нет. */
export class MethodologyAssistResultDto {
    @ApiProperty({
        description:
            'Черновик конфига методики (объект Methodology), прошедший ' +
            'валидатор; null — модель не собрала валидный конфиг, см. errors.',
        type: () => MethodologyConfigDto,
        nullable: true,
    })
    draft: MethodologyConfigDto | null;

    @ApiProperty({
        description: 'Ошибки валидатора по ответу модели (пусто при успехе).',
        example: [],
        type: [String],
    })
    errors: string[];

    @ApiProperty({
        description:
            'Предупреждения: усечение текста, отброшенные пункты, пустые блоки.',
        example: ['Текст документа усечён до 40 000 знаков'],
        type: [String],
    })
    warnings: string[];

    @ApiProperty({
        description: 'Знаков текста ушло модели.',
        example: 23150,
        type: Number,
    })
    textChars: number;

    @ApiProperty({
        description: 'Кто ответил: код провайдера шлюза.',
        example: 'vibecode',
        type: String,
        nullable: true,
    })
    provider: string | null;

    @ApiProperty({
        description: 'Фактическая модель провайдера.',
        example: 'bitrix/bitrixgpt-5.5',
        type: String,
        nullable: true,
    })
    model: string | null;
}
