/**
 * «План CRM» строки менеджера: самоотчёт менеджера в списке KPI — сколько
 * звонков и презентаций он сам запланировал в CRM (записи «План») и
 * сколько отметил состоявшимися (записи «Состоялся»). Это НЕ план
 * руководителя: план руководителя (поля «План: …» сотрудника) — в
 * planTargets строки и в блоке «Планы» вкладки KPI.
 */
import { ApiProperty } from '@nestjs/swagger';
import type { AttentionDiscipline } from '@lib/sales-ai-analytics';

/** План CRM: запланировано менеджером / сделано за период (самоотчёт). */
export class AiDisciplineDto implements AttentionDiscipline {
    @ApiProperty({
        description:
            'Звонков запланировано менеджером в CRM за период (записи «План» ' +
            'списка KPI, строка отчёта call_plan) — не план руководителя.',
        type: Number,
        example: 40,
    })
    callPlan: number;

    @ApiProperty({
        description:
            'Звонков отмечено состоявшимися за период (строка отчёта ' +
            'call_done — «Звонок» таблицы KPI).',
        type: Number,
        example: 33,
    })
    callDone: number;

    @ApiProperty({
        description:
            'Презентаций запланировано менеджером в CRM за период (записи ' +
            '«План», строка отчёта presentation_plan) — не план руководителя.',
        type: Number,
        example: 12,
    })
    presentationPlan: number;

    @ApiProperty({
        description:
            'Презентаций проведено за период (строка отчёта ' +
            'presentation_done — «Презентация» таблицы KPI).',
        type: Number,
        example: 10,
    })
    presentationDone: number;
}
