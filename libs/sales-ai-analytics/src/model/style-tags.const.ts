import { StyleAxisCode, StyleAxisUnit } from './style-axes.const';

/**
 * Словарь подписей стиля (документ `ai/tasks/ai-analytics-manager-style.md`,
 * раздел 2.4). Оси — в соседнем `style-axes.const.ts`.
 *
 * Тексты подписей живут в коде (не в LLM и не в настройках): подпись — это
 * глагольный факт с частотой и опорой, никогда существительное-ярлык.
 * Одна подпись = одна ось (составных подписей нет), парные подписи одной оси
 * взаимоисключающие, всего подписей не больше `STYLE_TAG_LIMITS.maxTags`.
 */

/** Ярус подписи: «по данным» или «похоже» (документ 3.5). */
export const STYLE_TAG_TIERS = ['data', 'likely'] as const;
export type StyleTagTier = (typeof STYLE_TAG_TIERS)[number];

/** Пределы словаря: подписей не больше трёх, порог «остаточной валентности». */
export const STYLE_TAG_LIMITS = {
    maxTags: 3,
    /** p_ROPE входа для подписей, которые звучат оценочно (документ 2.4). */
    strictPIn: 0.9,
} as const;

export interface StyleTagDescriptor {
    code: string;
    axis: StyleAxisCode;
    /** Полюс оси: +1 — верхний, −1 — нижний. */
    pole: 1 | -1;
    /** Короткий глагольный заголовок (не существительное-ярлык). */
    title: string;
    /** Факт с частотой: «чаще коллег …». */
    fact: string;
    /** Что это значит на практике. */
    meaning: string;
    /** Чего это НЕ значит — обязательная часть карточки. */
    notMeaning: string;
    /** Порог p_ROPE входа; 0,9 у подписей с остаточной валентностью. */
    pIn: number;
}

/**
 * Двенадцать подписей документа 2.4. Ось `funnel_focus` и отрицательный
 * полюс `rhythm` не подписываются: подпись читалась бы как приговор или как
 * исход, поэтому пары для них здесь намеренно нет.
 */
export const STYLE_TAGS = [
    {
        code: 'leads_dialog',
        axis: 'initiative',
        pole: 1,
        title: 'задаёт ход разговора',
        fact: 'чаще коллег задаёт ход разговора',
        meaning: 'берёт инициативу и ведёт разговор',
        notMeaning:
            'не «говорит слишком много»: норма типа проверяется отдельно',
        pIn: 0.8,
    },
    {
        code: 'listens',
        axis: 'initiative',
        pole: -1,
        title: 'даёт говорить клиенту',
        fact: 'чаще коллег даёт говорить клиенту',
        meaning: 'клиент говорит больше, реплики клиента длиннее',
        notMeaning: 'не «пассивен»',
        pIn: STYLE_TAG_LIMITS.strictPIn,
    },
    {
        code: 'explores',
        axis: 'inquiry',
        pole: 1,
        title: 'задаёт вопросы до презентации',
        fact: 'чаще коллег задаёт вопросы до презентации',
        meaning: 'идёт от вопросов, потребности выявляет до показа решения',
        notMeaning: 'не «тянет время» и не «опытнее»: стаж учтён оффсетом',
        pIn: 0.8,
    },
    {
        code: 'presents_first',
        axis: 'inquiry',
        pole: -1,
        title: 'показывает решение до вопросов',
        fact: 'чаще коллег показывает решение до вопросов',
        meaning: 'рано показывает решение, работает инсайтом',
        notMeaning: 'не «стреляет вслепую»: это отдельный факт с интервалом',
        pIn: 0.8,
    },
    {
        code: 'persistent',
        axis: 'persistence',
        pole: 1,
        title: 'дожимает',
        fact: 'чаще коллег возвращается после переноса или отказа',
        meaning: 'возвращается к клиенту, делает больше попыток',
        notMeaning: 'не «давит на клиента»: риск-флаги — отдельный контур',
        pIn: STYLE_TAG_LIMITS.strictPIn,
    },
    {
        code: 'gives_time',
        axis: 'persistence',
        pole: -1,
        title: 'даёт время',
        fact: 'реже коллег делает повторные попытки',
        meaning: 'меньше касаний на лид, длинные горизонты следующего шага',
        notMeaning: 'не «бросает лиды»: доля отказа от работы показана рядом',
        pIn: STYLE_TAG_LIMITS.strictPIn,
    },
    {
        code: 'clarifies',
        axis: 'objection_response',
        pole: 1,
        title: 'уточняет возражение',
        fact: 'на возражение чаще коллег отвечает уточняющим вопросом',
        meaning: 'работает с возражением через вопросы',
        notMeaning: 'не «лучше отрабатывает возражения»: это уровень',
        pIn: 0.8,
    },
    {
        code: 'price_upfront',
        axis: 'price_position',
        pole: 1,
        title: 'называет цену сразу',
        fact: 'чаще коллег называет цену в первой трети разговора',
        meaning: 'не откладывает разговор о цене',
        notMeaning: 'не «продаёт ценой»',
        pIn: 0.8,
    },
    {
        code: 'value_first',
        axis: 'price_position',
        pole: -1,
        title: 'называет цену после ценности',
        fact: 'чаще коллег называет цену после потребностей и презентации',
        meaning: 'сначала ценность, потом цена',
        notMeaning: 'не «прячет цену»',
        pIn: 0.8,
    },
    {
        code: 'fast',
        axis: 'tempo',
        pole: 1,
        title: 'работает короткими контактами',
        fact: 'больше коллег коротких контактов в рабочий день',
        meaning: 'быстро отвечает, делает много коротких звонков',
        notMeaning: 'не «поверхностный»: оценки разговора — это уровень',
        pIn: STYLE_TAG_LIMITS.strictPIn,
    },
    {
        code: 'thorough',
        axis: 'tempo',
        pole: -1,
        title: 'говорит дольше и реже',
        fact: 'реже коллег звонит, но разговоры длиннее',
        meaning: 'меньше контактов в день, длинные разговоры',
        notMeaning: 'не «медленный»',
        pIn: 0.8,
    },
    {
        code: 'methodical',
        axis: 'rhythm',
        pole: 1,
        title: 'держит ровный ритм',
        fact: 'ведёт дневные объёмы ровнее коллег, без всплесков',
        meaning: 'повторяемый процесс и соблюдение обещанных дат',
        notMeaning: 'не «дисциплинированнее»: план CRM — отдельный сигнал',
        pIn: 0.8,
    },
] as const satisfies readonly StyleTagDescriptor[];

export type StyleTagCode = (typeof STYLE_TAGS)[number]['code'];

export const STYLE_TAG_CODES: readonly StyleTagCode[] = STYLE_TAGS.map(
    tag => tag.code,
);

/**
 * Подпись полюса оси по знаку отклонения. Ось без подписи на этом полюсе
 * (`funnel_focus`, отрицательный полюс `rhythm`) — undefined.
 */
export function styleTagFor(
    axis: StyleAxisCode,
    delta: number,
): StyleTagDescriptor | undefined {
    if (!Number.isFinite(delta) || delta === 0) {
        return undefined;
    }
    const pole = delta > 0 ? 1 : -1;
    return STYLE_TAGS.find(tag => tag.axis === axis && tag.pole === pole);
}

/** Число с запятой-разделителем — тексты подписей русские. */
export const styleNumber = (value: number, digits = 2): string =>
    value.toFixed(digits).replace('.', ',');

export interface StyleTagLabelInput {
    tier: StyleTagTier;
    /** Объём в единице оси. */
    n: number;
    /** Минимум единиц для яруса «по данным». */
    minN: number;
    /** Коллег в норме. */
    peers: number;
    unit: StyleAxisUnit;
}

const UNIT_TITLES: Record<StyleAxisUnit, string> = {
    calls: 'разборов',
    leads: 'лидов',
    objections: 'возражений',
    workdays: 'рабочих дней',
    deals: 'сделок',
};

/**
 * Текст подписи: «по данным» — факт с объёмом и числом коллег, «похоже» —
 * тот же факт с явной оговоркой «данных пока мало: n из min». Слово
 * «значимо» в текстах запрещено (план §6).
 */
export function styleTagLabel(
    descriptor: StyleTagDescriptor,
    input: StyleTagLabelInput,
): string {
    const unit = UNIT_TITLES[input.unit];
    if (input.tier === 'likely') {
        return `похоже: ${descriptor.fact} (данных пока мало: ${input.n} из ${input.minN} ${unit})`;
    }
    return `${descriptor.fact} (n = ${input.n} ${unit}, коллег в норме ${input.peers})`;
}
