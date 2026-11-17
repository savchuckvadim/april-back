/**
 * DTO итога записей в ленту сделок за прогон движения сделок (вторая
 * волна, 17.11.2026) — часть состояния прогона и дневного снимка.
 * Оформление — ai/rules/dto-conventions.md.
 */
import { ApiProperty } from '@nestjs/swagger';
import {
    DEAL_MOVEMENT_NOTE_KIND,
    type DealMovementNoteKind,
} from '@lib/portal-lib/store/app-settings/lib/deal-movement-note-kinds.const';
import type { DealMovementNotesSummary } from '../../contracts/deal-movement-notes.types';

export class AiAnalyticsDealMovementNotesDto
    implements DealMovementNotesSummary
{
    @ApiProperty({
        description: 'Запись в ленту сделок включена настройкой портала.',
        example: true,
        type: Boolean,
    })
    enabled: boolean;

    @ApiProperty({
        description:
            'Вид записи: comment — комментарий, log_message — служебная ' +
            'запись журнала; null — запись выключена.',
        enum: Object.values(DEAL_MOVEMENT_NOTE_KIND),
        example: DEAL_MOVEMENT_NOTE_KIND.comment,
        type: String,
        nullable: true,
    })
    kind: DealMovementNoteKind | null;

    @ApiProperty({
        description:
            'Записей в плане прогона (в пределах лимита ночи); у подсчёта — ' +
            'сколько записали бы.',
        example: 100,
        type: Number,
    })
    planned: number;

    @ApiProperty({
        description: 'Записано в ленты сделок.',
        example: 97,
        type: Number,
    })
    written: number;

    @ApiProperty({
        description:
            'Не удалось записать: статус останется несказанным до следующей ночи.',
        example: 3,
        type: Number,
    })
    failed: number;

    @ApiProperty({
        description: 'Отложено лимитом записей за ночь.',
        example: 20,
        type: Number,
    })
    deferredLimit: number;

    @ApiProperty({
        description:
            'Отложено защитой от метаний: по сделке писали меньше трёх суток назад.',
        example: 5,
        type: Number,
    })
    deferredQuiet: number;

    @ApiProperty({
        description: 'Подсказок «что сделать» от модели вошло в записи.',
        example: 48,
        type: Number,
    })
    texts: number;

    @ApiProperty({
        description:
            'Вызовов модели без годной подсказки: сбой или меньше двух строк после проверки.',
        example: 2,
        type: Number,
    })
    textsFailed: number;
}
