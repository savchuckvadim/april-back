import {
    EnumQuestionnaireChannel,
    EnumQuestionnairePurpose,
    isQuestionnaireDisabledByEventTypes,
    QuestionnaireCatalog,
    QuestionnaireCatalogEntry,
    QuestionnaireCatalogItem,
} from '@lib/portal-lib/store/questionnaires';
import {
    QuestionnaireAnswerPurpose,
    QuestionnaireSmartAnswer,
} from './questionnaire-smart-answer.type';

/** Пара «вопрос — ответ» ровно в том виде, в каком её прислал фрейм. */
export interface QuestionnaireAnswerLike {
    questionnaire: string;
    item: string;
    value: string;
}

export interface BuildQuestionnaireSmartAnswersInput {
    /** Каталог домена (Redis-кэш 5 минут) — ЕДИНСТВЕННЫЙ источник адресов. */
    catalog: QuestionnaireCatalog;
    /** Ответы из payload отчёта; пусто — снимок пустой. */
    answers: readonly QuestionnaireAnswerLike[];
    /** `kind` смарта потока: 'presentation' | 'zpr'. */
    smartKind: string;
    /** Выключатель «анкеты типа события выключены» (коды типов). */
    disabledEventTypes: readonly string[];
}

/**
 * Снимок ответов анкеты для ОДНОГО смарта.
 *
 * Источник правды — КАТАЛОГ, а не payload. Неизвестный код вопроса, вопрос
 * не смарт-канала, вопрос чужого смарта и вопрос погашенной анкеты в снимок
 * не попадают: payload фрейма это данные, а не команда, и портал не должен
 * уметь записать произвольное поле произвольного смарта.
 *
 * Сама функция при этом МОЛЧИТ, и намеренно: её зовут по одному разу на
 * каждый смарт отчёта, и «вопрос чужого смарта» здесь — норма, его несёт
 * соседний вызов. Что не унесёт НИКТО, считает
 * {@link findLostQuestionnaireAnswers} — один раз на отчёт, там же и
 * логируется.
 *
 * Ни одного вызова Битрикса — тот же принцип, что у
 * `buildPresentationSurveySnapshot`: снимок собирается в основном пути
 * отчёта, где всё уже загружено.
 */
export const buildQuestionnaireSmartAnswers = (
    input: BuildQuestionnaireSmartAnswersInput,
): QuestionnaireSmartAnswer[] => {
    if (!input.answers.length) return [];

    const index = indexSmartItems(
        input.catalog,
        input.smartKind,
        input.disabledEventTypes,
    );
    if (index.size === 0) return [];

    const snapshot: QuestionnaireSmartAnswer[] = [];
    const seen = new Set<string>();
    for (const answer of input.answers) {
        const key = answerKey(answer);
        // Дубль ключа в payload — первый ответ и есть ответ: перезапись
        // молча меняла бы смысл того, что менеджер видел на экране.
        if (seen.has(key)) continue;
        const found = index.get(key);
        if (!found) continue;

        const value = String(answer.value ?? '').trim();
        // Пустой ответ — это не ответ: он уехал бы пустой строкой поверх
        // поля, которое мог заполнить кто-то другой.
        if (!value) continue;

        seen.add(key);
        snapshot.push(toSmartAnswer(key, found.entry, found.item, value));
    }
    return snapshot;
};

/** Ответ, который не унесёт НИ ОДИН поток отчёта, и почему. */
export interface QuestionnaireAnswerLoss {
    /** `qCode:itemCode` — тот же ключ, что у снимка и у логов записи. */
    key: string;
    /** Заголовок вопроса; пусто — вопроса в каталоге уже нет. */
    title: string;
    /** Причина в тех же словах, что и предупреждения записи. */
    reason: string;
}

export interface FindLostQuestionnaireAnswersInput {
    catalog: QuestionnaireCatalog;
    answers: readonly QuestionnaireAnswerLike[];
    disabledEventTypes: readonly string[];
}

/**
 * Ответы, которые в элемент смарта не уедут ВООБЩЕ, — с причиной на каждый.
 *
 * Зачем отдельной функцией, а не предупреждениями из снимка. Снимок
 * собирается по разу на КАЖДЫЙ смарт отчёта (презентации, ЗПР), и в каждом
 * вызове ответы соседнего смарта законно отбрасываются: предупреждай о них
 * снимок — половина лога была бы ложной, а вторая половина двоилась бы. Что
 * ответ потерян, видно только по каталогу ЦЕЛИКОМ и ровно один раз на
 * отчёт — здесь.
 *
 * Чего здесь НЕТ и почему:
 *  - «вопрос чужого смарта» — его несёт соседний поток; а что поток не
 *    поставлен вовсе, ловит `warnOrphanAnswers` диспетчера (он один знает
 *    состав джобов);
 *  - пустой ответ — это не ответ, терять в нём нечего.
 */
export const findLostQuestionnaireAnswers = (
    input: FindLostQuestionnaireAnswersInput,
): QuestionnaireAnswerLoss[] => {
    if (!input.answers.length) return [];

    const index = indexCatalogItems(input.catalog, input.disabledEventTypes);
    const losses: QuestionnaireAnswerLoss[] = [];
    // Ключи, которые СВОЙ поток унесёт: только они делают следующий
    // ответ с тем же ключом дублем — ровно как в снимке выше.
    const carried = new Set<string>();
    // Про каждый ключ говорим один раз: повторять одну и ту же причину
    // столько раз, сколько строк в payload, — это шум, а не расследование.
    const told = new Set<string>();

    for (const answer of input.answers) {
        const key = answerKey(answer);
        if (told.has(key)) continue;

        if (carried.has(key)) {
            told.add(key);
            losses.push({
                key,
                title: index.get(key)?.item.title ?? '',
                reason:
                    'ключ повторяется в отчёте — записан первый ответ, ' +
                    'остальные отброшены',
            });
            continue;
        }

        const found = index.get(key);
        if (!found) {
            told.add(key);
            losses.push({
                key,
                title: '',
                reason:
                    'такого вопроса в каталоге портала нет — анкету ' +
                    'изменили после того, как менеджер её открыл',
            });
            continue;
        }

        // Пустое до причин: пустой ответ не теряется, его просто нет.
        if (!String(answer.value ?? '').trim()) continue;

        const reason = lossReason(found);
        if (!reason) {
            carried.add(key);
            continue;
        }
        told.add(key);
        losses.push({ key, title: found.item.title, reason });
    }
    return losses;
};

/** Почему ответ не уедет; null — уедет своим потоком. */
const lossReason = (found: IndexedItem): string | null => {
    if (found.disabled) {
        return (
            `анкета «${found.entry.title}» выключена типом события ` +
            'в настройках портала'
        );
    }
    if (found.item.channel !== EnumQuestionnaireChannel.smart) {
        return (
            `вопрос канала «${found.item.channel}» — в элемент смарта ` +
            'такие не пишутся; фрейм прислал его по ошибке'
        );
    }
    if (!found.item.smart?.kind) {
        return 'у вопроса не указан смарт — каталог собран неполно';
    }
    if (!found.item.field?.name) {
        return 'у вопроса нет имени поля — каталог собран неполно';
    }
    return null;
};

interface IndexedItem {
    entry: QuestionnaireCatalogEntry;
    item: QuestionnaireCatalogItem;
    /** Анкета погашена выключателем по типам события. */
    disabled: boolean;
}

/**
 * Ключ ответа. Формула одна на снимок и на разбор потерь: разъедься они —
 * разбор объяснял бы не то, что отбросил снимок.
 */
const answerKey = (answer: QuestionnaireAnswerLike): string =>
    `${answer.questionnaire}:${answer.item}`;

/** `qCode:itemCode` → ЛЮБОЙ вопрос каталога, вместе с приговором анкеты. */
const indexCatalogItems = (
    catalog: QuestionnaireCatalog,
    disabledEventTypes: readonly string[],
): Map<string, IndexedItem> => {
    const index = new Map<string, IndexedItem>();
    for (const entry of catalog.questionnaires) {
        const disabled = isQuestionnaireDisabledByEventTypes(
            entry.conditions,
            disabledEventTypes,
        );
        for (const item of entry.items) {
            index.set(`${entry.code}:${item.code}`, { entry, item, disabled });
        }
    }
    return index;
};

/**
 * `qCode:itemCode` → вопрос каталога, адресованный ЭТОМУ смарту.
 *
 * Отбор идёт по тому же индексу, что и разбор потерь: одна формула ключа и
 * одно правило выключателя на обоих — иначе разбор объяснял бы не то, что
 * отбросил снимок.
 */
const indexSmartItems = (
    catalog: QuestionnaireCatalog,
    smartKind: string,
    disabledEventTypes: readonly string[],
): Map<string, IndexedItem> => {
    const index = new Map<string, IndexedItem>();
    for (const [key, found] of indexCatalogItems(catalog, disabledEventTypes)) {
        // Страховка от старого фрейма: он про выключатель не знает и
        // ответы погашенной анкеты всё равно пришлёт.
        if (found.disabled) continue;
        if (found.item.channel !== EnumQuestionnaireChannel.smart) continue;
        if (found.item.smart?.kind !== smartKind) continue;
        // Компиляция без имени поля смарт-вопрос не выпускает, но
        // читаем мы каталог из кэша — проверить дешевле, чем потом
        // искать причину пустого предупреждения.
        if (!found.item.field?.name) continue;
        index.set(key, found);
    }
    return index;
};

const toSmartAnswer = (
    key: string,
    entry: QuestionnaireCatalogEntry,
    item: QuestionnaireCatalogItem,
    value: string,
): QuestionnaireSmartAnswer => ({
    key,
    purpose: toAnswerPurpose(entry.purpose),
    // `field.name` проверен индексом — компилятор об этом не знает.
    fieldName: item.field?.name ?? '',
    fieldType: item.field?.type ?? null,
    control: item.control,
    value,
    title: item.title,
    optionTitle:
        item.options.find(option => option.code === value)?.title ?? null,
});

/**
 * Назначение анкеты → элемент, в который поедет ответ. Совпадает с делением
 * джобов `kind: 'plan' | 'report'` дословно, поэтому отдельного поля в
 * каталоге заводить не пришлось.
 */
const toAnswerPurpose = (
    purpose: EnumQuestionnairePurpose,
): QuestionnaireAnswerPurpose =>
    purpose === EnumQuestionnairePurpose.plan ? 'plan' : 'report';
