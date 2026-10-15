import { HookCatalogEntry } from '../hook-catalog.types';

/**
 * Холодный обзвон v1 — заморожен. Источники —
 * `apps/event-sales/src/cold-hook/**`,
 * `apps/event-sales/src/lead-hook/controllers/lead-hook.controller.ts`,
 * правило «cold-hook (v1) не трогаем» из `SALES_HOOKS_GUIDE.md`, разделы
 * «Отличия от v1» и «Известное наследие v1» в `front/docs/cold-hook-v2.md`.
 */
export const COLD_CALL_ENTRY: HookCatalogEntry = {
    code: 'cold-call',
    title: 'Холодный обзвон v1 (заморожен)',
    family: 'cold-hook',
    kind: 'webhook',
    summary:
        'Первая версия холодного старта по компании: закрывает открытые ' +
        'сделки и задачи компании, ставит основную в «Холодные», заводит ' +
        'ХО-сделку, задачу и KPI. Заморожен: PHP-хук и старые роботы ' +
        'продолжают его звать, развитие идёт в cold-call-v2.',
    theory: `## Статус

Хук **заморожен** (правило \`SALES_HOOKS_GUIDE.md\`: «cold-hook (v1) не трогаем»): код не меняется, новые порталы и роботы настраиваются на \`cold-call-v2\`. PHP-хук по-прежнему зовёт v1, поэтому ручка живёт параллельно с v2 — у каждой свой silence-буфер и своя очередь.

## Что делает

Холодный старт **только по компании**. Все параметры события обязательны в query (\`responsible\`, \`created\`, \`deadline\`, \`name\`, \`isTmc\`) — чтения полей карточки нет. Ведёт себя как \`cold-call-v2\` с \`force=Y\`: всегда забирает клиента, закрывая открытые сделки четырёх воронок (ОП Основная / ОП Холодные / Презентации / ТМЦ) по компании в стадию \`double\`/\`noresult\` их воронки (кроме свежей открытой основной) и открытые задачи группы обзвона по \`CO_\` компании; затем обновляет компанию полями ХО, ставит основную в «Холодные» (существующую или новую), ХО-сделку в «ОП Холодные» (\`cold_plan\`), задачу «Холодный обзвон <name>» с привязками \`CO_\` + \`D_\` основной + \`D_\` ХО и строки KPI/истории «Холодный звонок Запланирован <name>».

## Чего нет по сравнению с v2

| v1 | v2 |
|---|---|
| вход-сделка теряется: берётся только её \`COMPANY_ID\`, хук матчится по \`company.ID === entityId\`; сделка без компании не обрабатывается | вход-сделка доходит до создания, корень без компании — сама сделка |
| элементы смартов «Презентации»/«ЗПР» и даты планов закрываемых сделок не трогаются | закрываются |
| задачи закрываются только по \`CO_\` | и по \`D_\` сделок компании |
| ХО-сделка без ссылки \`to_base_sales\` | ссылка пишется |
| записей ленты и push нет; \`force\` нет — всегда забирает | лента, push, \`force=N\` умеет уступать |
| «Перспективность клиента» искалась не в том справочнике и не заполнялась | заполняется |
| адресный ХО не принимает заявку, лиды и контакты не переназначаются | «адресный ХО везде» |

## Известное наследие (общее с v2)

Модель событийных полей для новой сущности не пишет UF-поля: новая ХО-сделка получает только название, стадию, ответственного и компанию.

## Лид-вариант

\`POST …/event-sales-lead-hook/cold-call\` — аналог легаси \`FullEventFlowLeadController::cold\`: находит или создаёт компанию для лида, привязывает лид (\`COMPANY_ID\`) и запускает v1-обработчик по компании **синхронно, без silence-буфера**; постановщик — пользователь 1 (как в легаси). Для входа заявок в обзвон стандарт портала — хук «Лид → работа» (\`isXo=Y\`), а не этот.`,
    howItWorks: `1. **Приём.** \`POST …/event-sales-hook/cold-call\` — домен из \`auth.domain\`, параметры в query, все обязательны. Хук ложится в silence-буфер с ключом \`XO_event_sales_cold_call_<домен>_<responsible>\` (окно 1,5 с), джоб \`EVENT_COLD_CALL\`, очередь \`EVENT_SALES_COLD_CALL\` — окна по одному.
2. **Компании окна.** Для \`entityType=company\` — \`entityId\`; для \`deal\` — \`COMPANY_ID\` сделки (сама сделка дальше не участвует). \`contact\`/\`lead\` пропускаются.
3. **Закрытие.** Открытые сделки воронок ОП Основная / ОП Холодные / Презентации / ТМЦ по \`COMPANY_ID\` (стадии без \`fail\`/\`noresult\`/\`double\`/\`not_call\`/\`success\` в коде) → стадия \`double\`/\`noresult\` своей воронки, кроме свежей открытой основной (max ID). Открытые задачи группы обзвона с привязкой \`CO_<компания>\` → complete. Свой батч до создания.
4. **Создание — одна batch-группа на компанию.** Update компании событийными полями ХО; основная: update сохранённой или новая в «Холодные»; ХО-сделка в «ОП Холодные»; задача «Холодный обзвон <name>» (\`CO_\` + \`D_\` основной + \`D_\` ХО) в группе задач отдела продаж; элементы KPI/истории «Холодный звонок Запланирован <name>» (\`event_type=xo\`, \`event_action=plan\`). Один flush на окно.
5. **Лид-вариант** выполняет шаги 3–4 сразу в HTTP-запросе одним хуком, ответ — \`processed: true\` с \`companyId\` и \`companyCreated\`.

## Идемпотентность

Защиты от повторов внутри окна нет: два хука по одной компании в одном окне дадут две группы создания. Повторная постановка по компании закрывает прежнюю задачу (по \`CO_\`) и ставит новую. Меток доставки (\`op_xo_revive_*\`) v1 не пишет — крон «Подстраховка холодного обзвона» работает только с v2.`,
    triggers: [
        'PHP-хук (легаси) — по-прежнему зовёт cold-call',
        'Роботы и БП порталов, ещё не переведённые на cold-call-v2',
        'Лид-вариант event-sales-lead-hook/cold-call — полный event-флоу лида (аналог легаси FullEventFlowLeadController::cold), синхронно',
    ],
    endpoints: [
        {
            kind: 'webhook',
            method: 'POST',
            path: '/api/event-sales-hook/cold-call',
            description:
                'Хук холодного звонка v1: тело — стандартное тело вебхука (домен из auth.domain), все параметры в query и обязательны. Ответ — факт приёма в silence-буфер.',
            example:
                'POST https://api.event-sales.april-app.ru/api/event-sales-hook/cold-call?entityType=company&entityId={{ID}}&responsible=user_{{Ответственный}}&created=user_{{Автор}}&deadline=01.07.2026%2010:00:00&name=Обзвон&isTmc=N',
        },
        {
            kind: 'webhook',
            method: 'POST',
            path: '/api/event-sales-lead-hook/cold-call',
            description:
                'Лид-вариант: находит или создаёт компанию для лида, привязывает лид и запускает v1-флоу по компании сразу, без silence-буфера. Ответ — processed, companyId, companyCreated.',
            example:
                'POST https://api.event-sales.april-app.ru/api/event-sales-lead-hook/cold-call?leadId={{ID}}&assigned=user_{{Ответственный}}&deadline=01.07.2026%2010:00:00&name=Обзвон',
        },
    ],
    params: [
        {
            name: 'entityType',
            where: 'query',
            required: true,
            values: 'company / contact / deal / lead',
            description:
                'Обрабатывается только company; для deal берётся компания сделки, contact и lead пропускаются.',
        },
        {
            name: 'entityId',
            where: 'query',
            required: true,
            description: 'Идентификатор сущности.',
        },
        {
            name: 'responsible',
            where: 'query',
            required: true,
            values: 'user_123',
            description: 'Ответственный за звонок. Из карточки не читается.',
        },
        {
            name: 'created',
            where: 'query',
            required: true,
            values: 'user_123',
            description: 'Постановщик звонка.',
        },
        {
            name: 'deadline',
            where: 'query',
            required: true,
            values: 'DD.MM.YYYY HH:mm:ss',
            description: 'Срок звонка по локальному времени портала.',
        },
        {
            name: 'name',
            where: 'query',
            required: true,
            description: 'Название события («Холодный обзвон <name>»).',
        },
        {
            name: 'isTmc',
            where: 'query',
            required: true,
            values: 'Y / N',
            description: 'Признак работы с ТМЦ (телемаркетинговый центр).',
        },
        {
            name: 'leadId',
            where: 'query',
            required: true,
            description:
                'Лид-вариант: лид, для которого ищется/создаётся компания и ставится звонок по ней.',
        },
        {
            name: 'assigned',
            where: 'query',
            required: true,
            values: 'user_123',
            description:
                'Лид-вариант: ответственный за звонок (в легаси — поле assigned).',
        },
    ],
    settings: [],
    pbxFields: [
        {
            entity: 'company',
            code: 'xo_name',
            role: 'writes',
            required: false,
            note: 'Название события.',
        },
        {
            entity: 'company',
            code: 'xo_date',
            role: 'writes',
            required: false,
            note: 'Дата обзвона (срок звонка).',
        },
        {
            entity: 'company',
            code: 'xo_responsible',
            role: 'writes',
            required: false,
            note: 'Ответственный ХО (из query; из карточки не читается).',
        },
        {
            entity: 'company',
            code: 'xo_created',
            role: 'writes',
            required: false,
            note: 'Постановщик ХО.',
        },
        {
            entity: 'company',
            code: 'manager_op',
            role: 'writes',
            required: false,
            note: '«Менеджер по продажам Гарант» = ответственный.',
        },
        {
            entity: 'company',
            code: 'call_next_date',
            role: 'writes',
            required: false,
            note: 'Дата следующего события = срок звонка.',
        },
        {
            entity: 'company',
            code: 'call_next_name',
            role: 'writes',
            required: false,
            note: 'Тема следующего события.',
        },
        {
            entity: 'company',
            code: 'call_last_date',
            role: 'writes',
            required: false,
            note: 'Дата последнего события.',
        },
        {
            entity: 'company',
            code: 'op_history',
            role: 'writes',
            required: false,
            note: 'История строкой.',
        },
        {
            entity: 'company',
            code: 'op_mhistory',
            role: 'writes',
            required: false,
            note: 'История списком.',
        },
        {
            entity: 'company',
            code: 'op_current_status',
            role: 'writes',
            required: false,
            note: '«Холодный обзвон <name>».',
        },
        {
            entity: 'company',
            code: 'op_work_status',
            role: 'writes',
            required: false,
            note: '«В работе».',
        },
        {
            entity: 'company',
            code: 'op_prospects_type',
            role: 'writes',
            required: false,
            note: 'В v1 item искался в справочнике op_work_status — поле молча оставалось пустым.',
        },
        {
            entity: 'deal',
            code: 'xo_name',
            role: 'writes',
            required: false,
            note: 'Те же событийные поля пишутся на существующую основную сделку.',
        },
        {
            entity: 'deal',
            code: 'xo_date',
            role: 'writes',
            required: false,
            note: 'На существующую основную.',
        },
        {
            entity: 'deal',
            code: 'xo_responsible',
            role: 'writes',
            required: false,
            note: 'На существующую основную.',
        },
        {
            entity: 'deal',
            code: 'manager_op',
            role: 'writes',
            required: false,
            note: 'На существующую основную.',
        },
    ],
    stages: [
        {
            entity: 'deal',
            code: 'sales_cold',
            required: true,
            note: 'Основная ставится сюда; не сопоставлена — основная не создаётся и не обновляется.',
        },
        {
            entity: 'deal',
            code: 'sales_double',
            required: true,
            note: 'Закрывающая стадия (double/noresult) воронки ОП для остальных открытых сделок компании.',
        },
        {
            entity: 'deal',
            code: 'sales_not_call',
            required: false,
            note: '«Не Беспокоить» открытой работой не считается — сделка не закрывается и не перехватывается.',
        },
    ],
    kbDocs: ['m10', 's1'],
    related: ['cold-call-v2', 'lead-to-work'],
    install: `1. **Ничего нового не ставить**: v1 заморожен, новые порталы и роботы настраиваются на \`cold-call-v2\`.
2. Пока робот или PHP-хук ещё зовут \`cold-call\`: нужны те же поля ХО на компании (\`xo_name\`, \`xo_date\`, \`xo_responsible\`, \`xo_created\`), воронки «ОП Основная» (стадии «Холодные» и «Не состоялась») и «ОП Холодные» (\`cold_plan\`), группа задач отдела продаж; все параметры передавать в query.
3. **Переключение**: поменять адрес вебхука на \`…/event-sales-hook/cold-call-v2\` (параметры совместимы) и при необходимости добавить \`force=Y\` там, где клиента нужно забирать безусловно.`,
    verify: `- Ответ ручки: \`accepted: true\`, \`keyPrefix\` вида \`XO_event_sales_cold_call_…\`; лог \`Cold hooks handling finished\` с \`companiesCount\`.
- У компании: задача «Холодный обзвон …» с привязками \`CO_\`, \`D_\` основной и \`D_\` ХО-сделки; основная в «Холодные»; ХО-сделка в «ОП Холодные» без ссылки на основную.
- Следа в ленте и push нет — v1 их не пишет; меток «хук отправлен» тоже нет.
- Обзвон ставили из сделки без компании и ничего не произошло — v1 обрабатывает только компании: переключайтесь на \`cold-call-v2\`.
- Тесты: \`npx jest apps/event-sales/src/cold-hook\`.`,
    warnings: [
        'Заморожен: правки — только в cold-call-v2 (SALES_HOOKS_GUIDE).',
        'Вход-сделка теряется: обрабатывается только её компания; сделка без компании не обрабатывается вовсе.',
        'Всегда забирает клиента (как force=Y) — без записи в ленте и без уведомления прежнему владельцу.',
        'Все параметры только в query: кириллица и «#» в названии ломали адрес вебхука.',
        'Меток доставки не пишет — крон «Подстраховка холодного обзвона» недоехавшие хуки v1 не досылает.',
        'Лид-вариант выполняется синхронно, без буфера и без схлопывания повторов.',
    ],
    operationHook: null,
};
