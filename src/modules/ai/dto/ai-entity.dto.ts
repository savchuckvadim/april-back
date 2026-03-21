import { ApiProperty } from '@nestjs/swagger';
import { AiEntity } from '../entity/ai.entity';
import { AiCreateDto } from './ai-create.dto';

export class AiEntityDto extends AiCreateDto {
    constructor(aiEntity: AiEntity) {
        super();
        this.id = aiEntity.id;
        this.provider = aiEntity.provider ?? '';
        this.activity_id = aiEntity.activity_id ?? '';
        this.file_id = aiEntity.file_id ?? '';
        this.in_comment = aiEntity.in_comment;
        this.in_report = aiEntity.in_report;
        this.report_item_id = aiEntity.report_item_id ?? '';
        this.status = aiEntity.status ?? '';
        this.result = aiEntity.result ?? '';
        this.symbols_count = aiEntity.symbols_count ?? 0;
        this.tokens_count = aiEntity.tokens_count ?? 0;
        this.price = aiEntity.price ?? 0;
        this.domain = aiEntity.domain ?? '';
        this.user_id = aiEntity.user_id ?? 0;
        this.user_name = aiEntity.user_name ?? '';
        this.entity_type = aiEntity.entity_type ?? '';
        this.entity_id = aiEntity.entity_id ?? 0;
        this.entity_name = aiEntity.entity_name ?? '';
        this.user_result = aiEntity.user_result ?? null;
        this.report_result = aiEntity.report_result ?? '';
        this.user_comment = aiEntity.user_comment ?? '';
        this.owner_comment = aiEntity.owner_comment ?? '';
        this.user_mark = aiEntity.user_mark ?? '';
        this.owner_mark = aiEntity.owner_mark ?? '';
        this.app = aiEntity.app ?? '';
        this.department = aiEntity.department ?? '';
        this.type = aiEntity.type ?? '';
        this.model = aiEntity.model ?? '';
        this.portal_id = aiEntity.portal_id ?? '';
        this.transcription_id = aiEntity.transcription_id ?? '';
        this.createdAt = aiEntity.created_at ?? new Date();
        this.updatedAt = aiEntity.updated_at ?? new Date();
    }

    @ApiProperty({
        description: 'ID записи AI',
        example: '1',
        type: String,
    })
    id: string;

    @ApiProperty({
        description: 'Дата создания',
        example: '2021-01-01T00:00:00.000Z',
        type: Date,
    })
    createdAt: Date;

    @ApiProperty({
        description: 'Дата обновления',
        example: '2021-01-01T00:00:00.000Z',
        type: Date,
    })
    updatedAt: Date;

    @ApiProperty({
        description: 'Провайдер',
        example: 'openai',
        type: String,
    })
    provider: string;

    @ApiProperty({
        description: 'ID активности',
        example: '123',
        type: String,
    })
    activity_id: string;

    @ApiProperty({
        description: 'ID файла',
        example: '456',
        type: String,
    })
    file_id: string;

    @ApiProperty({
        description: 'В комментарии',
        example: false,
        type: Boolean,
    })
    in_comment: boolean;

    @ApiProperty({
        description: 'В отчете',
        example: false,
        type: Boolean,
    })
    in_report: boolean;

    @ApiProperty({
        description: 'ID элемента отчета',
        example: '789',
        type: String,
    })
    report_item_id: string;

    @ApiProperty({
        description: 'Статус',
        example: 'pending',
        type: String,
    })
    status: string;

    @ApiProperty({
        description: 'Результат',
        example: 'Результат обработки',
        type: String,
    })
    result: string;

    @ApiProperty({
        description: 'Количество символов',
        example: 1000,
        type: Number,
    })
    symbols_count: number;

    @ApiProperty({
        description: 'Количество токенов',
        example: 100.5,
        type: Number,
    })
    tokens_count: number;

    @ApiProperty({
        description: 'Цена',
        example: 0.01,
        type: Number,
    })
    price: number;

    @ApiProperty({
        description: 'Домен',
        example: 'example.com',
        type: String,
    })
    domain: string;

    @ApiProperty({
        description: 'ID пользователя',
        example: 1,
        type: Number,
    })
    user_id: number;

    @ApiProperty({
        description: 'Имя пользователя',
        example: 'Иван Иванов',
        type: String,
    })
    user_name: string;

    @ApiProperty({
        description: 'Тип сущности',
        example: 'activity',
        type: String,
    })
    entity_type: string;

    @ApiProperty({
        description: 'ID сущности',
        example: 123,
        type: Number,
    })
    entity_id: number;

    @ApiProperty({
        description: 'Название сущности',
        example: 'Активность',
        type: String,
    })
    entity_name: string;

    @ApiProperty({
        description: 'Результат пользователя',
        example: {},
        type: Object,
    })
    user_result: any;

    @ApiProperty({
        description: 'Результат отчета',
        example: 'Результат отчета',
        type: String,
    })
    report_result: string;

    @ApiProperty({
        description: 'Комментарий пользователя',
        example: 'Комментарий',
        type: String,
    })
    user_comment: string;

    @ApiProperty({
        description: 'Комментарий владельца',
        example: 'Комментарий владельца',
        type: String,
    })
    owner_comment: string;

    @ApiProperty({
        description: 'Оценка пользователя',
        example: 'good',
        type: String,
    })
    user_mark: string;

    @ApiProperty({
        description: 'Оценка владельца',
        example: 'excellent',
        type: String,
    })
    owner_mark: string;

    @ApiProperty({
        description: 'Приложение',
        example: 'app',
        type: String,
    })
    app: string;

    @ApiProperty({
        description: 'Отдел',
        example: 'sales',
        type: String,
    })
    department: string;

    @ApiProperty({
        description: 'Тип',
        example: 'transcription',
        type: String,
    })
    type: string;

    @ApiProperty({
        description: 'Модель',
        example: 'gpt-4',
        type: String,
    })
    model: string;

    @ApiProperty({
        description: 'ID портала',
        example: '1',
        type: String,
    })
    portal_id: string;

    @ApiProperty({
        description: 'ID транскрипции',
        example: '1',
        type: String,
    })
    transcription_id: string;
}
