import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsArray, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ERQField } from './erq-field.dto';

export class ERQBankItem {
    @ApiProperty({
        description: 'ID банковских реквизитов',
        example: 123,
    })
    @IsNumber()
    id: number;

    @ApiProperty({
        description: 'Поля банковских реквизитов',
        type: [ERQField],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ERQField)
    fields: ERQField[];

    constructor(data: Partial<ERQBankItem> = {}) {
        this.id = data?.id || 0;
        this.fields = data?.fields || [];
    }
}

export class ERQBank {
    @ApiProperty({
        description: 'Список банковских реквизитов',
        type: [ERQBankItem],
        required: false,
    })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ERQBankItem)
    items: ERQBankItem[] | null;

    @ApiProperty({
        description: 'Текущие банковские реквизиты',
        type: ERQBankItem,
        required: false,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => ERQBankItem)
    current: ERQBankItem | null;

    constructor(data: Partial<ERQBank> = {}) {
        this.items = data?.items ?? [];
        this.current = data?.current ?? null;
    }
}
