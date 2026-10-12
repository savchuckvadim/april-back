import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNumberString } from 'class-validator';

/**
 * Полный список порталов, к которым должен быть привязан шаблон КП.
 *
 * Семантика — СИНХРОНИЗАЦИЯ, а не добавление: порталы из списка, у которых
 * привязки нет, получают её; привязки к порталам, которых в списке нет,
 * удаляются. Пустой список снимает все привязки. Так админка с
 * мультиселектом порталов шлёт одно состояние целиком и не считает diff
 * на клиенте.
 */
export class SyncWordTemplatePortalsDto {
    @ApiProperty({
        description:
            'ID порталов (BIGINT, строками). Пустой массив — снять все привязки.',
        type: [String],
        example: ['7', '12'],
    })
    @IsArray()
    @IsNumberString({}, { each: true })
    portal_ids: string[];
}
