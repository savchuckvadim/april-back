import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CounterEntity } from '@lib/portal-lib/konstructor';

/**
 * Счётчик конструктора (`counters`).
 *
 * Read-модель для фронта: список/детали счётчиков и результат create/update.
 * Все id сериализуются в number.
 */
export class CounterResponseDto {
    constructor(entity: CounterEntity) {
        this.id = Number(entity.id);
        this.name = entity.name;
        this.title = entity.title;
        this.createdAt = entity.created_at;
        this.updatedAt = entity.updated_at;
    }

    @ApiProperty({ description: 'ID счётчика', example: 1, type: Number })
    id: number;

    @ApiProperty({
        description: 'Системное имя счётчика',
        example: 'invoice_number',
        type: String,
    })
    name: string;

    @ApiProperty({
        description: 'Человекочитаемое название счётчика',
        example: 'Номер счёта',
        type: String,
    })
    title: string;

    @ApiPropertyOptional({
        description: 'Дата создания записи',
        example: '2026-06-22T08:00:00.000Z',
        type: String,
    })
    createdAt?: Date | null;

    @ApiPropertyOptional({
        description: 'Дата последнего обновления записи',
        example: '2026-06-22T08:00:00.000Z',
        type: String,
    })
    updatedAt?: Date | null;
}
