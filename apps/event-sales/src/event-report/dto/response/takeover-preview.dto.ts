import { ApiProperty } from '@nestjs/swagger';

/** Роли закрываемых сделок — для подписи в окне подтверждения. */
export const TAKEOVER_PREVIEW_DEAL_KINDS = ['base', 'xo', 'pres'] as const;
export type TakeoverPreviewDealKind =
    (typeof TAKEOVER_PREVIEW_DEAL_KINDS)[number];

/** Сделка в предпросмотре перехвата. */
export class TakeoverPreviewDealDto {
    @ApiProperty({
        description: 'Номер сделки в Битриксе.',
        type: Number,
        example: 217611,
    })
    id: number;

    @ApiProperty({
        description: 'Название сделки, как в карточке Битрикса.',
        type: String,
        example: 'Прозвон: ООО «УК «Би Хай»',
    })
    title: string;

    @ApiProperty({
        description:
            'Ответственный сделки — имя и фамилия; у сделки без ' +
            'ответственного — «без ответственного».',
        type: String,
        example: 'Марина Гончар',
    })
    ownerName: string;

    @ApiProperty({
        description:
            'Воронка закрываемой сделки: base — «ОП Основная» (закроется в ' +
            '«Дубль»), xo — «ОП Холодные», pres — «ОП Презентации». У ' +
            'забираемой и защищённых сделок — base.',
        type: String,
        enum: TAKEOVER_PREVIEW_DEAL_KINDS,
        example: 'base',
    })
    kind: TakeoverPreviewDealKind;
}

/**
 * Что сделает перехват клиента при отправке отчёта — для вопроса «Забрать
 * работу коллег себе?» в «Звонках». Только чтение: ничего не меняет.
 */
export class TakeoverPreviewDto {
    @ApiProperty({
        description:
            'Спрашивать ли менеджера: на портале включены перехват всей ' +
            'работы и подтверждение, и у клиента есть чужая работа. false — ' +
            'отправлять как обычно, без вопроса.',
        type: Boolean,
        example: true,
    })
    ask: boolean;

    @ApiProperty({
        description:
            'Сделка коллеги, которая перейдёт к отчитавшемуся вместе с её ' +
            'открытыми задачами; null — у менеджера своя основная сделка.',
        type: TakeoverPreviewDealDto,
        nullable: true,
    })
    takenDeal: TakeoverPreviewDealDto | null;

    @ApiProperty({
        description: 'Чужие сделки воронок ОП, которые закроются.',
        type: [TakeoverPreviewDealDto],
    })
    closeDeals: TakeoverPreviewDealDto[];

    @ApiProperty({
        description:
            'Сколько открытых задач забираемой сделки перейдёт к менеджеру.',
        type: Number,
        example: 1,
    })
    movedTasks: number;

    @ApiProperty({
        description: 'Сколько чужих открытых задач по клиенту закроется.',
        type: Number,
        example: 2,
    })
    closedTasks: number;

    @ApiProperty({
        description: 'Сколько чужих элементов «Презентаций» закроется.',
        type: Number,
        example: 0,
    })
    closedPresentations: number;

    @ApiProperty({
        description: 'Сколько чужих элементов «ЗПР» закроется.',
        type: Number,
        example: 0,
    })
    closedZpr: number;

    @ApiProperty({
        description:
            'Сделки коллег на защищённых стадиях: перехват их не тронет — ' +
            'менеджеру стоит договориться с ответственным.',
        type: [TakeoverPreviewDealDto],
    })
    protectedDeals: TakeoverPreviewDealDto[];
}
