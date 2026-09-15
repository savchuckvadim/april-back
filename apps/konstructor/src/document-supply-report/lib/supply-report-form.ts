/**
 * Форма «Отчёт о поставке» — та же, что отдавал Laravel
 * (`SupplyController::getSupplyReportData`, строки 3512-4232).
 *
 * Почему константа, а не генерация: фронт-конструктор рисует форму по этим
 * полям и по ним же мержит текущие значения из сделки (коды `supply_*` в
 * `contract-supply-reducer.ts`). Любое расхождение кода/порядка ломает форму,
 * поэтому список перенесён дословно; закомментированных в Laravel полей здесь
 * просто нет.
 */

/** Элемент выпадающего списка поля формы (SelectItem на фронте). */
export interface SupplyReportFormSelectItem {
    id: number;
    code: string;
    name: string;
    title: string;
}

/** Поле формы отчёта о поставке (RqItem на фронте). */
export interface SupplyReportFormField {
    type: 'date' | 'select' | 'string' | 'text' | 'file';
    name: string;
    value: string | SupplyReportFormSelectItem;
    items?: SupplyReportFormSelectItem[];
    isRequired: boolean;
    code: string;
    group: 'supply';
    isActive: boolean;
    isDisable: boolean;
    order: number;
    includes: string[];
    supplies: string[];
    contractType: string[];
    component?: string;
}

/** Типы клиента, для которых поле показывается (в Laravel одинаковы у всех). */
const INCLUDES = ['org', 'org_state', 'ip', 'advokat', 'fiz'];
/** Виды размещения, для которых поле показывается. */
const SUPPLIES = ['internet', 'proxima'];
/** Типы договора, для которых поле показывается. */
const CONTRACT_TYPES = ['service', 'lic', 'abon', 'key'];

const yesNoItems = (): SupplyReportFormSelectItem[] => [
    { id: 0, code: 'yes', name: 'Да', title: 'Да' },
    { id: 1, code: 'no', name: 'Нет', title: 'Нет' },
];

const noItem = (): SupplyReportFormSelectItem => ({
    id: 1,
    code: 'no',
    name: 'Нет',
    title: 'Нет',
});

/**
 * 15 активных полей формы отчёта о поставке.
 *
 * Возвращается новая копия на каждый вызов: фронт присылает форму обратно
 * заполненной, поэтому значения по умолчанию мутировать нельзя.
 */
export const getSupplyReportFormFields = (): SupplyReportFormField[] => [
    {
        type: 'date',
        name: 'Дата продажи',
        value: '',
        isRequired: true,
        code: 'sale_date',
        isActive: true,
        isDisable: false,
        order: 0,
        includes: [...INCLUDES],
        supplies: [...SUPPLIES],
        contractType: [...CONTRACT_TYPES],
        group: 'supply',
        component: 'base_one',
    },
    {
        type: 'select',
        name: 'Передана в ОРК',
        value: noItem(),
        items: yesNoItems(),
        isRequired: true,
        code: 'in_ork',
        group: 'supply',
        isActive: false,
        isDisable: false,
        order: 2,
        includes: [...INCLUDES],
        supplies: [...SUPPLIES],
        contractType: [...CONTRACT_TYPES],
    },
    {
        type: 'date',
        name: 'Клиент ждет звонка от менеджера ОРК',
        value: '',
        isRequired: true,
        code: 'client_call_date',
        group: 'supply',
        isActive: true,
        isDisable: false,
        order: 2,
        includes: [...INCLUDES],
        supplies: [...SUPPLIES],
        contractType: [...CONTRACT_TYPES],
        component: 'base_one',
    },
    {
        type: 'select',
        name: 'Занесена в АРМ',
        value: noItem(),
        items: yesNoItems(),
        isRequired: true,
        code: 'in_arm',
        group: 'supply',
        isActive: false,
        isDisable: false,
        order: 3,
        includes: [...INCLUDES],
        supplies: [...SUPPLIES],
        contractType: [...CONTRACT_TYPES],
    },
    {
        type: 'select',
        name: 'Особенности оплаты клиентом счетов',
        value: {
            id: 1,
            code: 'commers',
            name: 'Коммерческие',
            title: 'Коммерческие',
        },
        isRequired: true,
        code: 'invoice_pay_type',
        group: 'supply',
        isActive: false,
        isDisable: false,
        order: 5,
        includes: [...INCLUDES],
        supplies: [...SUPPLIES],
        contractType: [...CONTRACT_TYPES],
        items: [
            { id: 0, code: 'budget', name: 'Бюджетники', title: 'Бюджетники' },
            {
                id: 1,
                code: 'commers',
                name: 'Коммерческие',
                title: 'Коммерческие',
            },
        ],
        component: 'client',
    },
    {
        type: 'select',
        name: 'Как у них с финансами',
        value: { id: 0, code: 'small', name: 'Мелкий', title: 'Мелкий' },
        items: [
            { id: 0, code: 'small', name: 'Мелкий', title: 'Мелкий' },
            { id: 1, code: 'medium', name: 'Средний', title: 'Средний' },
            { id: 2, code: 'big', name: 'Крупный', title: 'Крупный' },
        ],
        isRequired: true,
        code: 'finance',
        group: 'supply',
        isActive: false,
        isDisable: false,
        order: 4,
        includes: [...INCLUDES],
        supplies: [...SUPPLIES],
        contractType: [...CONTRACT_TYPES],
        component: 'client',
    },
    {
        type: 'select',
        name: 'Создавался ли Договор',
        value: noItem(),
        items: yesNoItems(),
        isRequired: true,
        code: 'is_contract_done',
        group: 'supply',
        isActive: true,
        isDisable: false,
        order: 6,
        includes: [...INCLUDES],
        supplies: [...SUPPLIES],
        contractType: [...CONTRACT_TYPES],
        component: 'contract',
    },
    {
        type: 'string',
        name: 'Дата и номер',
        value: '',
        isRequired: false,
        code: 'contract_number',
        group: 'supply',
        isActive: false,
        isDisable: false,
        order: 7,
        includes: [...INCLUDES],
        supplies: [...SUPPLIES],
        contractType: [...CONTRACT_TYPES],
        component: 'contract',
    },
    {
        type: 'select',
        name: 'Судьба договора',
        value: {
            id: 0,
            code: 'in_progress',
            name: 'На подписи у клиента',
            title: 'На подписи у клиента',
        },
        items: [
            {
                id: 0,
                code: 'in_progress',
                name: 'На подписи у клиента',
                title: 'На подписи у клиента',
            },
            { id: 1, code: 'done', name: 'Подписан', title: 'Подписан' },
            { id: 2, code: 'edo', name: 'ЭДОм', title: 'ЭДОм' },
        ],
        isRequired: false,
        code: 'contract_result',
        group: 'supply',
        isActive: false,
        isDisable: false,
        order: 8,
        includes: [...INCLUDES],
        supplies: [...SUPPLIES],
        contractType: [...CONTRACT_TYPES],
        component: 'contract',
    },
    {
        type: 'file',
        // орфография Laravel сохранена намеренно: менеджер видит то же название
        name: 'Текyщий договор',
        value: '',
        isRequired: false,
        code: 'current_contract',
        group: 'supply',
        isActive: false,
        isDisable: false,
        order: 7,
        includes: [...INCLUDES],
        supplies: [...SUPPLIES],
        contractType: [...CONTRACT_TYPES],
        component: 'contract',
    },
    {
        type: 'select',
        name: 'Создавался ли Счет',
        value: noItem(),
        items: yesNoItems(),
        isRequired: true,
        code: 'is_invoice_done',
        group: 'supply',
        isActive: true,
        isDisable: false,
        order: 9,
        includes: [...INCLUDES],
        supplies: [...SUPPLIES],
        contractType: [...CONTRACT_TYPES],
        component: 'invoice',
    },
    {
        type: 'string',
        name: 'Дата и номер',
        value: '',
        isRequired: false,
        code: 'invoice_number',
        group: 'supply',
        isActive: false,
        isDisable: false,
        order: 10,
        includes: [...INCLUDES],
        supplies: [...SUPPLIES],
        contractType: [...CONTRACT_TYPES],
        component: 'invoice',
    },
    {
        type: 'select',
        name: 'Его судьба',
        value: { id: 0, code: 'done', name: 'Оплачен', title: 'Оплачен' },
        items: [
            { id: 0, code: 'done', name: 'Оплачен', title: 'Оплачен' },
            {
                id: 1,
                code: 'in_progress',
                name: 'На оплате',
                title: 'На оплате',
            },
        ],
        isRequired: false,
        code: 'invoice_result',
        group: 'supply',
        isActive: false,
        isDisable: false,
        order: 11,
        includes: [...INCLUDES],
        supplies: [...SUPPLIES],
        contractType: [...CONTRACT_TYPES],
        component: 'invoice',
    },
    {
        type: 'file',
        name: 'Текущий счет',
        value: '',
        isRequired: false,
        code: 'current_invoice',
        group: 'supply',
        isActive: false,
        isDisable: false,
        order: 10,
        includes: [...INCLUDES],
        supplies: [...SUPPLIES],
        contractType: [...CONTRACT_TYPES],
        component: 'invoice',
    },
    {
        type: 'text',
        name: 'Описание ситуации, примечания, дополнительные сведения',
        value: '',
        isRequired: true,
        code: 'situation_comments',
        group: 'supply',
        isActive: true,
        isDisable: false,
        order: 14,
        includes: [...INCLUDES],
        supplies: [...SUPPLIES],
        contractType: [...CONTRACT_TYPES],
    },
];

/** Статический селект «Тип клиента» — Laravel отдаёт его в init как есть. */
export const getClientTypeSelect = () => ({
    type: 'select',
    name: 'Тип клиента',
    value: {
        id: 0,
        code: 'org',
        name: 'Организация Коммерческая',
        title: 'Организация Коммерческая',
    },
    isRequired: true,
    code: 'type',
    items: [
        {
            id: 0,
            code: 'org',
            name: 'Организация Коммерческая',
            title: 'Организация Коммерческая',
        },
        {
            id: 1,
            code: 'org_state',
            name: 'Организация Бюджетная',
            title: 'Организация Бюджетная',
        },
        {
            id: 2,
            code: 'ip',
            name: 'Индивидуальный предприниматель',
            title: 'Индивидуальный предприниматель',
        },
        {
            id: 4,
            code: 'fiz',
            name: 'Физическое лицо',
            title: 'Физическое лицо',
        },
    ],
    includes: ['org', 'org_state', 'ip', 'advokat', 'fiz'],
    group: 'rq',
    isActive: true,
    isDisable: false,
    order: 0,
});
