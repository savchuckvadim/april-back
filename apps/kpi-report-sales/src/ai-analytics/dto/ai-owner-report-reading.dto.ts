import { ApiProperty } from '@nestjs/swagger';
import {
    OWNER_REPORT_TONES,
    type OwnerReportAttentionItem,
    type OwnerReportGlossaryItem,
    type OwnerReportTone,
} from '@lib/sales-ai-analytics';

/**
 * Помощь читателю отчёта собственнику: «На что обратить внимание» и
 * словарь терминов (просьба владельца 07.11.2026 — объяснить названия
 * человеку, который видит отчёт впервые).
 */

export class AiOwnerReportAttentionDto implements OwnerReportAttentionItem {
    @ApiProperty({
        description:
            'Серьёзность пункта: bad — утечка, warn — провал управления, neutral — пояснение о данных.',
        enum: OWNER_REPORT_TONES,
        example: 'bad',
    })
    tone: OwnerReportTone;

    @ApiProperty({
        description: 'Что не так, с масштабом.',
        type: String,
        example: 'Отложено без даты возврата: 54 из 70 (77 %)',
    })
    title: string;

    @ApiProperty({
        description: 'Одно действие.',
        type: String,
        example:
            'Требовать дату следующего контакта в CRM по каждому отложенному разговору.',
    })
    action: string;
}

export class AiOwnerReportGlossaryItemDto implements OwnerReportGlossaryItem {
    @ApiProperty({
        description: 'Термин отчёта.',
        type: String,
        example: 'Шаг вперёд',
    })
    term: string;

    @ApiProperty({
        description: 'Что он значит — одной-двумя фразами.',
        type: String,
        example:
            'Разговор закончился делом: назначен показ, выдан доступ, отправлено предложение или счёт.',
    })
    meaning: string;
}
