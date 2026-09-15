import { ApiProperty } from '@nestjs/swagger';
import {
    DEAL_AUDIT_FLAG,
    DEAL_AUDIT_STATUS,
    DealAuditFlagCode,
    DealAuditStatusCode,
} from '../constants/deal-audit.const';
import { DealAuditVerdict } from '../types/deal-audit.types';

/** Runtime-списки кодов — для Swagger enum и валидации (DTO-конвенции). */
export const DEAL_AUDIT_STATUS_CODES = Object.values(DEAL_AUDIT_STATUS);
export const DEAL_AUDIT_FLAG_CODES = Object.values(DEAL_AUDIT_FLAG);

/** Вердикт по одной сделке — то же, что уходит в поля карточки. */
export class DealAuditVerdictDto implements DealAuditVerdict {
    @ApiProperty({
        description: 'Bitrix ID сделки.',
        type: Number,
        example: 1234,
    })
    dealId: number;

    @ApiProperty({
        description: 'Название сделки на момент прогона.',
        type: String,
        example: 'ООО «Ромашка» — КонсультантПлюс',
    })
    title: string;

    @ApiProperty({
        description:
            'Bitrix ID ответственного; null — ответственный не назначен ' +
            '(сам по себе признак «забытости»).',
        type: Number,
        nullable: true,
        example: 42,
    })
    assignedById: number | null;

    @ApiProperty({
        description:
            'Худший сработавший признак — он же пишется в поле «ОП Аудит: ' +
            'статус» и годится как условие робота.',
        type: String,
        enum: DEAL_AUDIT_STATUS_CODES,
        example: DEAL_AUDIT_STATUS.noTask,
    })
    status: DealAuditStatusCode;

    @ApiProperty({
        description:
            'ВСЕ сработавшие признаки: сделка бывает одновременно без ' +
            'задачи и застрявшей в стадии.',
        type: [String],
        enum: DEAL_AUDIT_FLAG_CODES,
        isArray: true,
        example: [DEAL_AUDIT_FLAG.noTask, DEAL_AUDIT_FLAG.idle],
    })
    flags: readonly DealAuditFlagCode[];

    @ApiProperty({
        description:
            'Полных суток без активности по карточке; null — активность ' +
            'портал не отдал.',
        type: Number,
        nullable: true,
        example: 23,
    })
    idleDays: number | null;

    @ApiProperty({
        description:
            'Просрочка самой старой открытой задачи в сутках; 0 — ' +
            'просроченных задач нет.',
        type: Number,
        example: 5,
    })
    overdueDays: number;

    @ApiProperty({
        description:
            'Сколько суток сделка стоит в текущей стадии; null — дата ' +
            'перемещения неизвестна.',
        type: Number,
        nullable: true,
        example: 41,
    })
    stageDays: number | null;

    @ApiProperty({
        description: 'Сколько открытых задач нашлось по сделке и её компании.',
        type: Number,
        example: 0,
    })
    openTasks: number;

    @ApiProperty({
        description:
            'Расшифровка признаков по-русски — она же уходит в поле «ОП ' +
            'Аудит: расшифровка» и в сводку.',
        type: String,
        example: 'Без задач · без работы 23 дн. · в стадии «В оплате» 41 дн.',
    })
    comment: string;
}

/** Итог прогона аудита по одному порталу. */
export class DealAuditRunResponseDto {
    @ApiProperty({
        description: 'Домен портала, по которому выполнен прогон.',
        type: String,
        example: 'example.bitrix24.ru',
    })
    domain: string;

    @ApiProperty({
        description: 'Сколько открытых сделок воронки ОП проверено.',
        type: Number,
        example: 812,
    })
    scanned: number;

    @ApiProperty({
        description:
            'Сколько карточек реально размечено. Сделки с неизменившимся ' +
            'статусом пропускаются, поэтому число меньше проверенных.',
        type: Number,
        example: 37,
    })
    written: number;

    @ApiProperty({
        description: 'Сколько сделок признано забытыми (статус ≠ «Норма»).',
        type: Number,
        example: 124,
    })
    flagged: number;

    @ApiProperty({
        description:
            'Холостой ход: true — признаки посчитаны, но в карточки не ' +
            'записаны. Включается настройкой портала, флагом запроса либо ' +
            'автоматически, если поля аудита не установлены.',
        type: Boolean,
        example: true,
    })
    dryRun: boolean;

    @ApiProperty({
        description:
            'Разбивка «код статуса → количество сделок» по всей воронке.',
        type: Object,
        example: {
            [DEAL_AUDIT_STATUS.ok]: 688,
            [DEAL_AUDIT_STATUS.noTask]: 61,
            [DEAL_AUDIT_STATUS.forgotClose]: 12,
        },
    })
    byStatus: Record<string, number>;

    @ApiProperty({
        description:
            'Забытые сделки с расшифровкой. Отсортированы так же, как ' +
            'читались из воронки (по ID).',
        type: [DealAuditVerdictDto],
    })
    deals: DealAuditVerdictDto[];

    @ApiProperty({
        description:
            'Что помешало посчитать честно: не установлено поле, не ' +
            'прочитались задачи, упала запись. Пустой массив — прогон ' +
            'чистый.',
        type: [String],
        example: ['поля аудита не установлены — прогон выполнен как холостой'],
    })
    warnings: string[];
}
