import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConstSmartDescriptor } from '@lib/portal-lib/pbx/const-smart-registry';

/** Const-смарт из реестра галереи (доступен к установке из констант). */
export class ConstSmartRegistryItemDto
    implements Omit<ConstSmartDescriptor, 'description' | 'buildInstallFields'>
{
    @ApiProperty({
        description:
            'Ключ установки — передаётся в POST install-const как kind.',
        example: 'aicall',
        type: String,
    })
    kind: string;

    @ApiProperty({
        description:
            'smarts.type (матчинг установленной строки по type+group).',
        example: 'aicall',
        type: String,
    })
    type: string;

    @ApiProperty({
        description: 'smarts.group.',
        example: 'sales',
        type: String,
    })
    group: string;

    @ApiProperty({
        description: 'Код смарта в Bitrix (`${type}_${group}`).',
        example: 'aicall_sales',
        type: String,
    })
    code: string;

    @ApiProperty({
        description: 'Русское название смарта.',
        example: 'AI-анализ звонков',
        type: String,
    })
    title: string;

    @ApiProperty({
        description: 'Источник смарта — всегда const для этого реестра.',
        example: 'const',
        enum: ['const'],
    })
    source: 'const';

    @ApiProperty({
        description:
            'Число полей по const-конфигу (эталон, не факт установки).',
        example: 86,
        type: Number,
    })
    fieldsCount: number;

    @ApiProperty({
        description: 'Есть ли у смарта воронки/стадии.',
        example: false,
        type: Boolean,
    })
    hasCategories: boolean;

    @ApiPropertyOptional({
        description: 'Короткое описание для карточки галереи.',
        example: 'Разборы звонков AI-агентом...',
        type: String,
    })
    description?: string;
}

/** Ответ реестра const-смартов. */
export class SmartRegistryResponseDto {
    @ApiProperty({
        description: 'Const-смарты, доступные к установке из констант.',
        type: [ConstSmartRegistryItemDto],
    })
    items: ConstSmartRegistryItemDto[];
}
