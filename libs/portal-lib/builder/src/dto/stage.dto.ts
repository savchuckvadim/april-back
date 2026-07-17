import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, IsString } from 'class-validator';
import { IStage } from '@lib/portal-lib/portal/interfaces/portal.interface';

/** Стадия воронки, как её отдавал Laravel (raw btx_stages). */
export class StageDto implements IStage {
    @ApiProperty({
        description: 'ID стадии в нашей БД',
        example: 7,
        type: Number,
    })
    @IsNumber()
    id!: number;

    @ApiProperty({
        description: 'Дата создания записи (ISO)',
        example: '2024-01-01T00:00:00.000Z',
        type: String,
        nullable: true,
        required: false,
    })
    @IsOptional()
    @IsString()
    created_at!: string;

    @ApiProperty({
        description: 'Дата обновления записи (ISO)',
        example: '2024-01-01T00:00:00.000Z',
        type: String,
        nullable: true,
        required: false,
    })
    @IsOptional()
    @IsString()
    updated_at!: string;

    @ApiProperty({
        description: 'ID родительской категории (btx_categories)',
        example: 2,
        type: Number,
    })
    @IsNumber()
    btx_category_id!: number;

    @ApiProperty({
        description: 'Системное имя стадии',
        example: 'cold_new',
        type: String,
    })
    @IsString()
    name!: string;

    @ApiProperty({
        description: 'Отображаемое название стадии',
        example: 'Новая',
        type: String,
    })
    @IsString()
    title!: string;

    @ApiProperty({
        description: 'Код стадии для ассоциаций',
        example: 'cold_new',
        type: String,
    })
    @IsString()
    code!: string;

    @ApiProperty({
        description: 'ID стадии в Битрикс',
        example: 'NEW',
        type: String,
    })
    @IsString()
    bitrixId!: string;

    @ApiProperty({
        description: 'Цвет стадии в Битрикс',
        example: '#39A8EF',
        type: String,
    })
    @IsString()
    color!: string;

    @ApiProperty({
        description: 'Активна ли стадия (0/1, как в Laravel)',
        enum: [0, 1],
    })
    @IsIn([0, 1])
    isActive!: number;
}
