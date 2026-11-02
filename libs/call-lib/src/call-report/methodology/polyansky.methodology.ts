import type { Methodology, MethodologyCheckpoint } from './methodology.types';

/**
 * Встроенный конфиг методики Полянского — общий слой April. Разложен из трёх
 * документов ГАРАНТ (ai/tasks/ai-polyansky-method/2026-10-27-methodology-
 * materials.md, разделы 3 и 5; каталог утверждён владельцем 01.11.2026):
 * сюда вошли пункты классов «методика», «методика + код» и «код», которых
 * нет в ядре; пункты класса «ядро» уже проверяются разделами разбора,
 * «ядро+» (расширенный шаг, продвижение сделки) считаются для всех
 * порталов, «люди» и «справочник» в разбор не входят.
 *
 * Формулировки пунктов менеджер увидит дословно — без кодов и жаргона.
 * Строка таблицы `ai_methodologies` с тем же кодом в общем слое
 * перекрывает этот конфиг.
 */
export const POLYANSKY_METHODOLOGY_CODE = 'polyansky';

const REPEAT = ['refine', 'decision'] as const;

const CHECKPOINTS: MethodologyCheckpoint[] = [
    {
        code: 'common.final_summary',
        title: 'Резюмировал договорённости в конце разговора и получил подтверждение клиента',
        types: [
            'cold',
            'call',
            'presentation',
            'refine',
            'decision',
            'payment',
        ],
        evidence: 'quote',
        mandatory: true,
    },
    // --- Холодный звонок: УТП из трёх частей, без цены ---
    {
        code: 'cold.utp_unique',
        title: 'В поводе звонка есть новинка или уникальность',
        types: ['cold'],
        evidence: 'quote',
        mandatory: true,
    },
    {
        code: 'cold.utp_benefit',
        title: 'В поводе звонка названа выгода для клиента: время, риски, актуальность',
        types: ['cold'],
        evidence: 'quote',
        mandatory: true,
    },
    {
        code: 'cold.utp_cta',
        title: 'Повод звонка заканчивается призывом: посмотреть, протестировать, назначить показ',
        types: ['cold'],
        evidence: 'quote',
        mandatory: true,
    },
    {
        code: 'cold.no_bad_opener',
        title: 'Не начал с «хочу предложить услуги», «сотрудничество» или «рассказать о продукции»',
        types: ['cold'],
        evidence: 'fact',
        mandatory: true,
        hint: 'Запрещённые открывашки перечислены в регламенте методики.',
    },
    {
        code: 'cold.no_price',
        title: 'Не обсуждал стоимость и договор до презентации',
        types: ['cold'],
        evidence: 'fact',
        mandatory: true,
    },
    // --- Звонок под презентацию ---
    {
        code: 'call.diag_garant_exp',
        title: 'Выяснил, знаком ли клиент с Гарантом и какой у него опыт',
        types: ['call'],
        evidence: 'quote',
        mandatory: true,
        product: 'garant',
    },
    {
        code: 'call.email',
        title: 'Получил e-mail для доступа или зафиксировал причину отказа его дать',
        types: ['call'],
        evidence: 'quote',
        mandatory: true,
    },
    {
        code: 'call.offer_concrete',
        title: 'Предложение показа конкретное: 10–15 минут, бесплатный доступ, на задачах клиента',
        types: ['call'],
        evidence: 'quote',
        mandatory: true,
    },
    // --- Презентация ---
    {
        code: 'pres.format_agreed',
        title: 'Согласовал время и формат показа «от ваших задач»',
        types: ['presentation'],
        evidence: 'quote',
        mandatory: true,
    },
    {
        code: 'pres.needs_three_questions',
        title: 'Спросил, какими источниками пользуется клиент, что в них важно и что отнимает время',
        types: ['presentation'],
        evidence: 'quote',
        mandatory: true,
    },
    {
        code: 'pres.needs_confirmed',
        title: 'Резюмировал потребности вслух, расставил приоритеты, клиент согласился с планом показа',
        types: ['presentation'],
        evidence: 'quote',
        mandatory: true,
    },
    {
        code: 'pres.spirals_min',
        title: 'Полных спиралей «потребность → свойство → связка → выгода → вопрос» не меньше трёх',
        types: ['presentation'],
        evidence: 'fact',
        mandatory: true,
        rule: [{ op: 'gte', field: 'spiralsFull', value: 3 }],
    },
    {
        code: 'pres.block_no_need',
        title: 'Каждый показанный блок связан с потребностью клиента',
        types: ['presentation'],
        evidence: 'fact',
        mandatory: true,
        rule: [{ op: 'is', field: 'spiralsWithoutNeed', value: 0 }],
    },
    {
        code: 'pres.feedback_per_block',
        title: 'После каждого смыслового блока задал клиенту вопрос',
        types: ['presentation'],
        evidence: 'fact',
        mandatory: true,
        rule: [{ op: 'is', field: 'spiralsWithoutQuestion', value: 0 }],
    },
    {
        code: 'pres.iskra_real_question',
        title: 'ИСКРА показана на реальном вопросе клиента',
        types: ['presentation'],
        evidence: 'quote',
        mandatory: true,
        product: 'garant',
    },
    {
        code: 'pres.dialogue',
        title: 'Клиент говорил, а не слушал монолог',
        types: ['presentation'],
        evidence: 'fact',
        mandatory: true,
        rule: [{ op: 'within_norm', field: 'talkRatioPct' }],
    },
    {
        code: 'pres.objection_elicited',
        title: 'Сам спросил, что может помешать принять решение',
        types: ['presentation'],
        evidence: 'quote',
        mandatory: true,
    },
    {
        code: 'pres.summary_by_needs',
        title: 'Резюмировал показ через потребности клиента и спросил, остались ли вопросы',
        types: ['presentation'],
        evidence: 'quote',
        mandatory: true,
    },
    {
        code: 'pres.desire',
        title: 'Спросил, как клиент смотрит на сотрудничество и как будет решать задачи без этих возможностей',
        types: ['presentation'],
        evidence: 'quote',
        mandatory: true,
    },
    {
        code: 'pres.kit_12m',
        title: 'Предложил лицензию на 12 месяцев с максимальной скидкой, альтернативы на 6 и 3',
        types: ['presentation'],
        evidence: 'quote',
        mandatory: false,
    },
    {
        code: 'pres.invoice_why',
        title: 'Объяснил, что счёт фиксирует условия и ни к чему не обязывает',
        types: ['presentation'],
        evidence: 'quote',
        mandatory: true,
    },
    {
        code: 'pres.payment_when',
        title: 'Выяснил, когда возможна оплата и когда узнать решение',
        types: ['presentation'],
        evidence: 'quote',
        mandatory: true,
    },
    {
        code: 'pres.lpr_help',
        title: 'Предложил подключиться к разговору с руководителем или подготовить для него аргументы',
        types: ['presentation'],
        evidence: 'quote',
        mandatory: false,
    },
    // --- Повторный звонок: доработка и решение ---
    {
        code: 'rep.prev_agreement',
        title: 'Вспомнил конкретную прошлую договорённость: что клиент должен был сделать',
        types: [...REPEAT],
        evidence: 'quote',
        mandatory: true,
    },
    {
        code: 'rep.result_asked',
        title: 'Спросил о результате: что попробовали, как отнёсся руководитель, что сказали коллеги',
        types: [...REPEAT],
        evidence: 'quote',
        mandatory: true,
    },
    {
        code: 'rep.no_formal_question',
        title: 'Не ограничился формальным «ну что, подумали?», «определились?»',
        types: [...REPEAT],
        evidence: 'fact',
        mandatory: true,
    },
    {
        code: 'rep.opinion_value_first',
        title: 'Сначала получил мнение о ценности, потом перешёл к сомнениям',
        types: [...REPEAT],
        evidence: 'quote',
        mandatory: true,
    },
    {
        code: 'rep.barrier_steps',
        title: 'Отработал барьер по шагам: принял, уточнил, вернул к потребности, дал аргумент, получил обратную связь',
        types: [...REPEAT],
        evidence: 'quote',
        mandatory: true,
    },
    {
        code: 'rep.removal_checked',
        title: 'Проверил, снято ли возражение: «этот вопрос прояснили?»',
        types: [...REPEAT],
        evidence: 'quote',
        mandatory: true,
    },
    {
        code: 'rep.close_attempt',
        title: 'Сделал прямую попытку закрытия: предложил перейти к оформлению',
        types: [...REPEAT],
        evidence: 'quote',
        mandatory: true,
    },
    {
        code: 'rep.price_after_value',
        title: 'Вернулся к ценности, прежде чем обсуждать цену',
        types: [...REPEAT],
        evidence: 'quote',
        mandatory: true,
    },
    {
        code: 'rep.no_early_discount',
        title: 'Не предлагал скидку до выяснения причины сомнений',
        types: ['refine', 'decision', 'payment'],
        evidence: 'fact',
        mandatory: true,
    },
    {
        code: 'rep.invoice_followthrough',
        title: 'Договорился, что произойдёт после счёта: кто согласует и когда оплата',
        types: ['decision', 'payment'],
        evidence: 'quote',
        mandatory: true,
    },
    {
        code: 'rep.user_self_interest',
        title: 'Спросил, хотел бы клиент сам работать с системой как пользователь',
        types: [...REPEAT],
        evidence: 'quote',
        mandatory: false,
    },
];

export const POLYANSKY_METHODOLOGY: Methodology = {
    code: POLYANSKY_METHODOLOGY_CODE,
    title: 'Полянский',
    version: '1.0.0',
    types: ['cold', 'call', 'presentation', 'refine', 'decision', 'payment'],
    principles: [
        'Цена и договор в холодном звонке не обсуждаются: цель холодного — договорённость о показе.',
        'Скидка — только после выяснения причины сомнения.',
        'Конкурента не критикуем, с привычками клиента не спорим.',
        'Сначала ценность, потом сомнения: мнение клиента о пользе — до работы с возражением.',
        'Повторный звонок — не повторная презентация: один–три аргумента под потребности клиента.',
        'Счёт фиксирует условия и ни к чему не обязывает — так и объясняем клиенту.',
        'Каждый контакт заканчивается договорённостью с датой, временем, целью и действиями обеих сторон.',
    ],
    checkpoints: CHECKPOINTS,
    caps: [
        {
            code: 'pres.no_questions_after_blocks',
            title: 'нет вопросов клиенту после блоков показа',
            types: ['presentation'],
            when: [
                {
                    op: 'checkpoint_missed',
                    checkpoint: 'pres.feedback_per_block',
                },
            ],
            target: 'PRESENTATION',
            max: 7,
        },
        {
            code: 'cold.no_presentation_slot',
            title: 'холодный: не согласованы дата и время показа',
            types: ['cold'],
            when: [{ op: 'empty', field: 'nextStepDate' }],
            target: 'total',
            max: 6,
        },
        {
            code: 'cold.no_utp_cta',
            title: 'холодный: в поводе звонка нет призыва',
            types: ['cold'],
            when: [{ op: 'checkpoint_missed', checkpoint: 'cold.utp_cta' }],
            target: 'GREETING',
            max: 5,
        },
        {
            code: 'cold.contact_unknown',
            title: 'холодный: не уточнил, с кем говорит',
            types: ['cold'],
            when: [{ op: 'empty', field: 'interlocutorRole' }],
            target: 'total',
            max: 7,
        },
        {
            code: 'cold.no_diagnostics',
            title: 'холодный: не провёл диагностику',
            types: ['cold'],
            when: [{ op: 'is', field: 'needsFound', value: false }],
            target: 'total',
            max: 7,
        },
        {
            code: 'call.no_email',
            title: 'звонок под показ: нет e-mail и причины отказа его дать',
            types: ['call'],
            when: [{ op: 'checkpoint_missed', checkpoint: 'call.email' }],
            target: 'CLOSING',
            max: 7,
        },
        {
            code: 'cold.price_before_presentation',
            title: 'холодный: обсуждал стоимость до показа',
            types: ['cold'],
            when: [{ op: 'checkpoint_missed', checkpoint: 'cold.no_price' }],
            target: 'PRICE',
            max: 6,
        },
        {
            code: 'cold.vague_final',
            title: 'холодный: финал «созвонимся как-нибудь»',
            types: ['cold'],
            when: [{ op: 'is', field: 'nextStepSet', value: false }],
            target: 'CLOSING',
            max: 4,
        },
        {
            code: 'rep.formal_only',
            title: 'повторный: формальный вопрос и ни одной попытки закрытия',
            types: [...REPEAT],
            when: [
                {
                    op: 'checkpoint_missed',
                    checkpoint: 'rep.no_formal_question',
                },
                { op: 'checkpoint_missed', checkpoint: 'rep.close_attempt' },
            ],
            target: 'total',
            max: 4,
        },
        {
            code: 'rep.barrier_unchecked',
            title: 'повторный: снятие возражения не проверено',
            types: [...REPEAT],
            when: [
                { op: 'checkpoint_missed', checkpoint: 'rep.removal_checked' },
            ],
            target: 'total',
            max: 6,
        },
        {
            code: 'rep.agreement_incomplete',
            title: 'повторный: договорённость без даты, времени или цели',
            types: ['refine', 'decision', 'payment'],
            when: [{ op: 'is', field: 'nextStepComplete', value: false }],
            target: 'total',
            max: 7,
        },
        {
            code: 'rep.no_close_attempt',
            title: 'повторный: нет прямой попытки получить решение',
            types: [...REPEAT],
            when: [
                { op: 'checkpoint_missed', checkpoint: 'rep.close_attempt' },
            ],
            target: 'total',
            max: 8,
        },
    ],
    spirals: { enabled: true, minFull: 3, types: ['presentation'] },
    knowledge: {
        'product-facts': 'shared',
        'presentation-playbook': POLYANSKY_METHODOLOGY_CODE,
        'objection-playbook': POLYANSKY_METHODOLOGY_CODE,
        'sales-regulation': POLYANSKY_METHODOLOGY_CODE,
    },
};

/** Встроенные методики общего слоя по коду. */
export const BUILTIN_METHODOLOGIES: Readonly<Record<string, Methodology>> = {
    [POLYANSKY_METHODOLOGY_CODE]: POLYANSKY_METHODOLOGY,
};
