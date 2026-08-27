/**
 * Реестр известных kind'ов базы знаний: что означает каждый раздел и кто
 * его читает. Используется админкой, чтобы редактор материалов показывал
 * человеческие названия и не превращался в «магические папки».
 *
 * Kind'ы вне реестра допустимы (создаются загрузкой документа) —
 * в выдаче они помечаются known=false.
 */

/**
 * Виды документов базы знаний — единый источник правды (ai/rules/pbx-typing.md).
 *
 * РОЛЕВОЕ РАЗДЕЛЕНИЕ (Фаза 2 плана ai/tasks/rag-driven-analysis-plan.md):
 * материалы работают по-разному и должны подмешиваться в разные точки —
 * норма разговора, регламент, факты о продукте, плейбуки, эталоны оценок.
 */
export const KNOWLEDGE_KINDS = {
    general: 'general',
    resume: 'resume',
    recomendation: 'recomendation',
    callClassify: 'call-classify',
    callTypeRegistry: 'call-type-registry',
    /** Устаревший общий слой Фазы 1: читается как алиас sales-script. */
    callAnalysisBase: 'call-analysis-base',
    salesScript: 'sales-script',
    salesRegulation: 'sales-regulation',
    productFacts: 'product-facts',
    objectionPlaybook: 'objection-playbook',
    presentationPlaybook: 'presentation-playbook',
    callEtalon: 'call-etalon',
} as const;

export type KnowledgeKind =
    (typeof KNOWLEDGE_KINDS)[keyof typeof KNOWLEDGE_KINDS];

export interface KnowledgeKindInfo {
    /** Слаг kind'а (имя папки). */
    kind: string;
    /** Человеческое название для UI. */
    title: string;
    /** Что лежит внутри и на что влияет. */
    description: string;
    /** Кто читает материалы этого kind'а. */
    consumer: string;
    /**
     * Может ли клиент править этот вид в своём кабинете. false — вид
     * ведёт April: эталоны оценок правит не проверяемая сторона.
     */
    clientEditable: boolean;
}

export const KNOWN_KNOWLEDGE_KINDS: readonly KnowledgeKindInfo[] = [
    {
        kind: 'general',
        title: 'Общие материалы',
        description:
            'Материалы компании, подмешиваются к ЛЮБОМУ kind при сборке контекста.',
        consumer: 'все RAG-запросы и агент',
        clientEditable: false,
    },
    {
        kind: 'resume',
        title: 'Контекст резюме звонка',
        description:
            'RAG-материалы для резюме звонка (скрипты, стандарты) — контур 1.',
        consumer: 'GigaChat resume / объединённый анализ',
        clientEditable: true,
    },
    {
        kind: 'recomendation',
        title: 'Контекст рекомендаций',
        description:
            'RAG-материалы для рекомендаций менеджеру (методология оценки) — контур 1.',
        consumer: 'GigaChat recomendation / объединённый анализ',
        clientEditable: true,
    },
    {
        kind: 'call-classify',
        title: 'Инструкция классификатора звонков',
        description:
            'Полностью ЗАМЕЩАЕТ встроенную инструкцию определения типа звонка. ' +
            'Коды ответа фиксированы схемой — документ меняет критерии выбора.',
        consumer: 'классификатор конвейера (tier-1, VibeCode)',
        clientEditable: true,
    },
    {
        kind: 'call-type-registry',
        title: 'Реестр типов звонков (JSON)',
        description:
            'JSON-документ с типами звонков и их профилями (релевантность ' +
            'разделов, речевые нормы, kind инструкции). Клиентский документ ' +
            'переопределяет/дополняет общий; без документов действует ' +
            'встроенный реестр (CALL_REPORT_TYPE_PROFILES).',
        consumer: 'классификатор, пакет агента, отчёты',
        clientEditable: true,
    },
    {
        kind: 'call-analysis-cold',
        title: 'Анализ: холодный звонок',
        description: 'Инструкция/скрипт глубокого анализа холодных звонков.',
        consumer: 'ночной агент (tier-3)',
        clientEditable: true,
    },
    {
        kind: 'call-analysis-site-lead',
        title: 'Анализ: заявка с сайта',
        description:
            'Инструкция анализа первых звонков по входящим заявкам с сайта ' +
            '(прайс, демо-доступ, документ, семинар, Искра): легализация, ' +
            'фильтр ЦА, перевод в показ системы.',
        consumer: 'ночной агент (tier-3)',
        clientEditable: true,
    },
    {
        kind: 'call-analysis-call',
        title: 'Анализ: звонок под презентацию',
        description:
            'Инструкция анализа звонков с целью договориться о презентации.',
        consumer: 'ночной агент (tier-3)',
        clientEditable: true,
    },
    {
        kind: 'call-analysis-presentation',
        title: 'Анализ: презентация',
        description: 'Инструкция анализа презентаций.',
        consumer: 'ночной агент (tier-3)',
        clientEditable: true,
    },
    {
        kind: 'call-analysis-decision',
        title: 'Анализ: звонок по решению',
        description: 'Инструкция анализа звонков стадии принятия решения.',
        consumer: 'ночной агент (tier-3)',
        clientEditable: true,
    },
    {
        kind: 'call-analysis-payment',
        title: 'Анализ: звонок по оплате',
        description: 'Инструкция анализа звонков по оплате.',
        consumer: 'ночной агент (tier-3)',
        clientEditable: true,
    },
    {
        kind: 'call-analysis-other',
        title: 'Анализ: нетиповой звонок',
        description: 'Инструкция анализа нетиповых звонков.',
        consumer: 'ночной агент (tier-3)',
        clientEditable: true,
    },
    // --- Роли материалов в разборе (Фаза 2 rag-driven-analysis-plan.md) ---
    {
        kind: 'sales-script',
        title: 'Скрипт разговора',
        description:
            'Норма разговора: как должен строиться звонок, обязательные ' +
            'шаги и формулировки. Влияет на ВСЕ оценки разбора и на ' +
            'проверку по регламенту.',
        consumer: 'все проходы разбора + пост-анализ',
        clientEditable: true,
    },
    {
        kind: 'sales-regulation',
        title: 'Регламент отдела продаж',
        description:
            'Что запрещено и что обязательно: обещания клиенту, сроки, ' +
            'согласования, запрещённые формулировки.',
        consumer: 'фокус «движение сделки» + пост-анализ',
        clientEditable: true,
    },
    {
        kind: 'product-facts',
        title: 'Факты о продукте, комплектах и ценах',
        description:
            'Источник правды для ФАКТЧЕКА: что входит в комплекты, цены, ' +
            'условия. По нему ловятся неверные утверждения менеджера.',
        consumer: 'фактчек пост-анализа',
        clientEditable: true,
    },
    {
        kind: 'objection-playbook',
        title: 'Плейбук отработки возражений',
        description:
            'Как отвечать на типовые возражения: приёмы и готовые реплики.',
        consumer: 'фокус «содержание продажи» + пост-анализ',
        clientEditable: true,
    },
    {
        kind: 'presentation-playbook',
        title: 'Методология презентации (хвост и 5К)',
        description:
            'Как проводится показ под задачи клиента, чеклист хвоста и 5К, ' +
            'закрытие на дату решения. Презентация — самый дорогой звонок ' +
            'воронки, поэтому её разбор идёт по этому документу отдельно.',
        consumer: 'презентационный контур разбора + пост-анализ',
        clientEditable: true,
    },
    {
        kind: 'call-etalon',
        title: 'Эталонные разборы РОПа',
        description:
            'Примеры звонков с выставленными оценками — калибровка шкалы: ' +
            'что такое 8, а что 4. Ведёт April, клиенту недоступно: ' +
            'проверяемая сторона не правит эталон, по которому её оценивают.',
        consumer: 'синтез фокус-разбора',
        clientEditable: false,
    },
    {
        kind: 'call-analysis-base',
        title: 'Базовые стандарты (устаревший вид)',
        description:
            'Общий слой Фазы 1. Читается как алиас «Скрипта разговора» — ' +
            'новые документы загружайте в sales-script.',
        consumer: 'все проходы разбора (legacy)',
        clientEditable: true,
    },
];
