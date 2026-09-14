import { AUDIT_RULES } from './ai-analytics-audit.recommend';

/**
 * Самоописание аудита данных AI-аналитики ОП — ЕДИНЫЙ текст для Swagger
 * (описание операций), README и тела ответа (поле `about`), чтобы UI
 * админки показывал ровно то же, что и документация: что делает ручка,
 * откуда берёт данные, что считает, как читать результат и кто может
 * запускать. Меняется здесь — меняется везде.
 */

/** Один считаемый показатель отчёта (ключ в `report`). */
export interface AiAnalyticsAuditAboutItem {
    /** Ключ в `report` (totals, coverage, …). */
    code: string;
    title: string;
    description: string;
}

/** Раздел результата и правило его чтения. */
export interface AiAnalyticsAuditAboutSection {
    /** Номер раздела в markdown (1–8). */
    order: number;
    title: string;
    howToRead: string;
}

export interface AiAnalyticsAuditAbout {
    title: string;
    purpose: string;
    /** Источники данных — только БД приложения. */
    sources: string[];
    /** Чего аудит НЕ делает (границы). */
    notDoing: string[];
    computes: AiAnalyticsAuditAboutItem[];
    resultSections: AiAnalyticsAuditAboutSection[];
    /** Правило рекомендации по порогам — с фактическими константами кода. */
    recommendationRule: string;
    /** Где хранится результат и кто его пишет. */
    storage: string;
    /** Кто и при каком признаке портала может запускать. */
    access: string;
    /** Как запустить: CLI, ручка, крон. */
    howToRun: string[];
}

const R = AUDIT_RULES;

export const AI_ANALYTICS_AUDIT_ABOUT: AiAnalyticsAuditAbout = {
    title: 'Аудит данных AI-аналитики отдела продаж',
    purpose:
        'Отвечает на вопрос «на каких данных мы строим аналитику»: достаточно ' +
        'ли разобранных звонков на менеджера и тип, насколько они сопоставимы ' +
        'между месяцами и версиями разбора, какая доля звонков вообще не ' +
        'попадает в слой качества. По результату выбираются пороги «мало ' +
        'данных» (n < 8 / 20 / 30) и минимальная длительность звонка для ' +
        'разбора — ДО того, как включать нормы, оценки и советы по менеджерам.',
    sources: [
        'transcriptions — звонки конвейера разбора (статус done, dedup_key задан), ' +
            'дата звонка call_started_at (иначе created_at), длительность, менеджер user_id, домен',
        'ais type = agent-analysis — глубокий разбор (user_result: callType, ' +
            'versions, nextStep.date, sections[].alternatives, objections[].quote)',
        'ais type = call-classify — дешёвая классификация типа звонка (result)',
        'настройки портала kpi-sales — только признак разрешения ai_analytics_audit_enabled',
    ],
    notDoing: [
        'не обращается к Bitrix24 и к внешним LLM — только БД приложения',
        'не читает тексты транскриптов: только метаданные строк и user_result разборов',
        'ничего не меняет в данных, кроме записи снапшота отчёта в ais (если save = true)',
        'не ставит оценок менеджерам и не делает выводов о людях — только о полноте данных',
    ],
    computes: [
        {
            code: 'totals',
            title: 'Итоги окна',
            description:
                'Сколько транскрипций прочитано, сколько вне окна, сколько звонков ' +
                'в окне, у скольких есть менеджер, сколько имеют глубокий разбор.',
        },
        {
            code: 'coverage',
            title: 'Покрытие менеджера по месяцам',
            description:
                'Доля звонков с заполненным user_id по месяцам — с 24.08.2026 ' +
                'менеджер пишется всегда, раньше пропусков много; по этой таблице ' +
                'видно, с какого месяца сопоставимы оценки по людям.',
        },
        {
            code: 'pivots',
            title: 'Разборы по ячейкам менеджер × тип × месяц',
            description:
                'Число разборов n в каждой ячейке и сводные таблицы по менеджерам ' +
                'и типам; жирным — ячейки с n ≥ ' +
                R.cellMinN +
                ' (минимум для оценки).',
        },
        {
            code: 'analyzedInCellsPct',
            title: 'Доля разборов в «достаточных» ячейках',
            description:
                'Какая доля всех разборов окна лежит в ячейках с n ≥ ' +
                R.cellMinN +
                ' (и отдельно — по ячейкам менеджер × месяц без разбивки по типу).',
        },
        {
            code: 'noise',
            title: 'Шум типов',
            description:
                'Доля звонков с типом «другое» и «нерелевантный» по месяцам — ' +
                'индикатор точности классификатора и мусора в выборке.',
        },
        {
            code: 'duration',
            title: 'Длительности',
            description:
                'Квантили p10 / p50 / p90 длительности звонка и доля коротких ' +
                'звонков (< порога разбора портала — минимума карты ' +
                'min_duration_sec_by_type; без настроек портала ' +
                R.shortCallSec +
                ' с) — по всему окну и по месяцам. Фактический порог отчёта — ' +
                'в report.rules.shortCallSec.',
        },
        {
            code: 'versions',
            title: 'Версии разбора',
            description:
                'Сколько разборов сделано каждой версией промпта/рубрики ' +
                '(user_result.versions, иначе agentVersion) по месяцам — границы ' +
                'сопоставимости трендов.',
        },
        {
            code: 'fields',
            title: 'Заполненность полей разбора',
            description:
                'Доля разборов, где есть дата следующего шага, фразы «как лучше» ' +
                'и цитаты возражений — от этого зависят пульс, дайджест и повестка.',
        },
        {
            code: 'depth',
            title: 'Глубина истории ais',
            description:
                'Первая дата и число записей классификации и глубокого разбора ' +
                'по домену — сколько истории вообще накоплено.',
        },
        {
            code: 'recommendation',
            title: 'Рекомендация по порогам',
            description:
                'Автоматический вывод по правилу ниже: оставить пороги плана ' +
                'или снизить, нужен ли дешёвый контур для коротких звонков.',
        },
    ],
    resultSections: [
        {
            order: 1,
            title: 'Покрытие user_id по месяцам',
            howToRead:
                'Месяцы с покрытием < 95 % не годятся для сравнения менеджеров между собой.',
        },
        {
            order: 2,
            title: 'Разборы по ячейкам менеджер × тип × месяц',
            howToRead:
                'Смотри, у кого и по какому типу набирается n ≥ ' +
                R.cellMinN +
                '; пустые ячейки — тип для этого менеджера пока не оценивается.',
        },
        {
            order: 3,
            title: 'Доля «другое» и «нерелевантный»',
            howToRead:
                'Рост доли «другое» после смены промпта или на новом портале — ' +
                'сигнал перекалибровать классификатор (type-stats).',
        },
        {
            order: 4,
            title: 'Длительности и доля коротких звонков',
            howToRead:
                'Если короткие звонки — большинство, слой качества описывает ' +
                'меньшую часть работы менеджера; см. рекомендацию.',
        },
        {
            order: 5,
            title: 'Разборы по версиям',
            howToRead:
                'Тренд считается только внутри одной версии; граница версии — разрыв ряда.',
        },
        {
            order: 6,
            title: 'Заполненность полей user_result',
            howToRead:
                'Низкая доля даты следующего шага — пульс будет «мало данных»; ' +
                'нет alternatives — дайджест менеджерам пуст.',
        },
        {
            order: 7,
            title: 'Глубина ais',
            howToRead:
                'Первая дата глубокого разбора — раньше неё истории качества нет.',
        },
        {
            order: 8,
            title: 'Рекомендация по порогам и minDurationSec',
            howToRead:
                'Итоговый вывод аудита для решения владельца; правило — в поле recommendationRule.',
        },
    ],
    recommendationRule:
        'Если меньше ' +
        R.cellShareMinPct +
        ' % разборов окна лежит в ячейках с n ≥ ' +
        R.cellMinN +
        ' — пороги «мало данных» стоит снизить (данных на ячейку не хватает). ' +
        'Если доля звонков короче порога разбора портала ' +
        '(report.rules.shortCallSec — минимум карты min_duration_sec_by_type, ' +
        'без настроек портала ' +
        R.shortCallSec +
        ' с) превышает ' +
        R.shortShareMaxPct +
        ' % — нужен дешёвый контур классификации коротких звонков ' +
        '(ЛПР / секретарь / недозвон), иначе они остаются вне аналитики.',
    storage:
        'Результат (markdown + структурированный report) пишется снапшотом в ' +
        'таблицу ais: type = ai-analytics-audit, app = ai-analytics; ' +
        'source = admin (ручка) или cron (месячный снапшот). Последний снапшот ' +
        'домена читается через GET admin/ai-analytics/audit/latest.',
    access:
        'Запуск — только SUPER_USER (JWT + роль) и только для портала, у ' +
        'которого в настройках kpi-sales включён признак ' +
        'ai_analytics_audit_enabled («Аудит и калибровка данных разрешены»). ' +
        'Без признака ручка отвечает 403, а месячный крон портал пропускает. ' +
        'Чтение последнего снапшота признаком не ограничено.',
    howToRun: [
        'Админ-ручка: POST admin/ai-analytics/audit { domain, months?, timeZone?, save? } — синхронно, секунды',
        'Последний снапшот: GET admin/ai-analytics/audit/latest?domain=…',
        'Месячный крон kpi-report-sales: 1-го числа 04:10 МСК по порталам с признаком, jobId по домену и месяцу',
        'CLI на сервере: npm run audit:ai-analytics -- --domain <домен> [--months 6] — тот же код, отчёт в ai/tasks',
    ],
};

/** Markdown-версия самоописания — для README и Swagger-описаний. */
export function renderAuditAboutMarkdown(
    about: AiAnalyticsAuditAbout = AI_ANALYTICS_AUDIT_ABOUT,
): string {
    const list = (items: string[]): string =>
        items.map(item => `- ${item}`).join('\n');
    return [
        `## ${about.title}`,
        '',
        about.purpose,
        '',
        '**Источники данных**',
        list(about.sources),
        '',
        '**Чего аудит не делает**',
        list(about.notDoing),
        '',
        '**Что считает** (ключи `report`)',
        list(
            about.computes.map(
                item => `\`${item.code}\` — ${item.title}: ${item.description}`,
            ),
        ),
        '',
        '**Разделы отчёта и как их читать**',
        list(
            about.resultSections.map(
                section =>
                    `${section.order}. ${section.title} — ${section.howToRead}`,
            ),
        ),
        '',
        `**Правило рекомендации.** ${about.recommendationRule}`,
        '',
        `**Хранение.** ${about.storage}`,
        '',
        `**Доступ.** ${about.access}`,
        '',
        '**Как запустить**',
        list(about.howToRun),
    ].join('\n');
}

/** Короткое описание операции для Swagger (первые строки самоописания). */
export function renderAuditAboutSummary(
    about: AiAnalyticsAuditAbout = AI_ANALYTICS_AUDIT_ABOUT,
): string {
    return (
        about.purpose +
        '\n\nСчитает: ' +
        about.computes.map(item => item.title.toLowerCase()).join(', ') +
        '.\n\nПравило рекомендации: ' +
        about.recommendationRule +
        '\n\nДоступ: ' +
        about.access
    );
}
