import { ApiProperty } from '@nestjs/swagger';
import {
    IsString,
    IsNumber,
    IsBoolean,
    IsOptional,
    IsObject,
} from 'class-validator';

export class AiUpdateDto {
    @ApiProperty({
        description: 'Провайдер',
        required: false,
        example: 'openai',
        type: String,
    })
    @IsString()
    @IsOptional()
    provider?: string;

    @ApiProperty({
        description: 'ID активности',
        required: false,
        example: '123',
        type: String,
    })
    @IsString()
    @IsOptional()
    activity_id?: string;

    @ApiProperty({
        description: 'ID файла',
        required: false,
        example: '456',
        type: String,
    })
    @IsString()
    @IsOptional()
    file_id?: string;

    @ApiProperty({
        description: 'В комментарии',
        required: false,
        example: false,
        type: Boolean,
    })
    @IsBoolean()
    @IsOptional()
    in_comment?: boolean;

    @ApiProperty({
        description: 'В отчете',
        required: false,
        example: false,
        type: Boolean,
    })
    @IsBoolean()
    @IsOptional()
    in_report?: boolean;

    @ApiProperty({
        description: 'ID элемента отчета',
        required: false,
        example: '789',
        type: String,
    })
    @IsString()
    @IsOptional()
    report_item_id?: string;

    @ApiProperty({
        description: 'Статус',
        required: false,
        example: 'pending',
        type: String,
    })
    @IsString()
    @IsOptional()
    status?: string;

    @ApiProperty({
        description: 'Результат',
        required: false,
        example: 'Результат обработки',
        type: String,
    })
    @IsString()
    @IsOptional()
    result?: string;

    @ApiProperty({
        description: 'Количество символов',
        required: false,
        example: 1000,
        type: Number,
    })
    @IsNumber()
    @IsOptional()
    symbols_count?: number;

    @ApiProperty({
        description: 'Количество токенов',
        required: false,
        example: 100.5,
        type: Number,
    })
    @IsNumber()
    @IsOptional()
    tokens_count?: number;

    @ApiProperty({
        description: 'Цена',
        required: false,
        example: 0.01,
        type: Number,
    })
    @IsNumber()
    @IsOptional()
    price?: number;

    @ApiProperty({
        description: 'Домен',
        required: false,
        example: 'example.com',
        type: String,
    })
    @IsString()
    @IsOptional()
    domain?: string;

    @ApiProperty({
        description: 'ID пользователя',
        required: false,
        example: 1,
        type: Number,
    })
    @IsNumber()
    @IsOptional()
    user_id?: number;

    @ApiProperty({
        description: 'Имя пользователя',
        required: false,
        example: 'Иван Иванов',
        type: String,
    })
    @IsString()
    @IsOptional()
    user_name?: string;

    @ApiProperty({
        description: 'Тип сущности',
        required: false,
        example: 'activity',
        type: String,
    })
    @IsString()
    @IsOptional()
    entity_type?: string;

    @ApiProperty({
        description: 'ID сущности',
        required: false,
        example: 123,
        type: Number,
    })
    @IsNumber()
    @IsOptional()
    entity_id?: number;

    @ApiProperty({
        description: 'Название сущности',
        required: false,
        example: 'Активность',
        type: String,
    })
    @IsString()
    @IsOptional()
    entity_name?: string;

    @ApiProperty({
        description: 'Результат пользователя',
        required: false,
        example: {},
        type: Object,
    })
    @IsObject()
    @IsOptional()
    user_result?: any;

    @ApiProperty({
        description: 'Результат отчета',
        required: false,
        example: 'Результат отчета',
        type: String,
    })
    @IsString()
    @IsOptional()
    report_result?: string;

    @ApiProperty({
        description: 'Комментарий пользователя',
        required: false,
        example: 'Комментарий',
        type: String,
    })
    @IsString()
    @IsOptional()
    user_comment?: string;

    @ApiProperty({
        description: 'Комментарий владельца',
        required: false,
        example: 'Комментарий владельца',
        type: String,
    })
    @IsString()
    @IsOptional()
    owner_comment?: string;

    @ApiProperty({
        description: 'Оценка пользователя',
        required: false,
        example: 'good',
        type: String,
    })
    @IsString()
    @IsOptional()
    user_mark?: string;

    @ApiProperty({
        description: 'Оценка владельца',
        required: false,
        example: 'excellent',
        type: String,
    })
    @IsString()
    @IsOptional()
    owner_mark?: string;

    @ApiProperty({
        description: 'Приложение',
        required: false,
        example: 'app',
        type: String,
    })
    @IsString()
    @IsOptional()
    app?: string;

    @ApiProperty({
        description: 'Отдел',
        required: false,
        example: 'sales',
        type: String,
    })
    @IsString()
    @IsOptional()
    department?: string;

    @ApiProperty({
        description: 'Тип',
        required: false,
        example: 'transcription',
        type: String,
    })
    @IsString()
    @IsOptional()
    type?: string;

    @ApiProperty({
        description: 'Модель',
        required: false,
        example: 'gpt-4',
        type: String,
    })
    @IsString()
    @IsOptional()
    model?: string;

    @ApiProperty({
        description: 'ID портала',
        required: false,
        example: '1',
        type: String,
    })
    @IsString()
    @IsOptional()
    portal_id?: string;

    @ApiProperty({
        description: 'ID транскрипции',
        required: false,
        example: '1',
        type: String,
    })
    @IsString()
    @IsOptional()
    transcription_id?: string;
}
