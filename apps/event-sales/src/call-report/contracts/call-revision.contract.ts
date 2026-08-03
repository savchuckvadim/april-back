import {
    CALL_REPORT_COACHING_CODES,
    CALL_REPORT_RISK_FLAG_CODES,
} from '@lib/call-lib';
import { DEEP_ANALYSIS_CORE_RULES } from './call-deep-analysis.contract';

/**
 * Контракт НОЧНОГО РЕВИЗОРА (Фаза 3 плана ai/tasks/call-analysis-v2-plan.md,
 * двухтактная модель пользователя): второй такт анализа — проход ПО
 * СУЩНОСТИ (сделке/лиду), а не по звонку. Онлайн-разбор оценивает звонок
 * сам по себе; ревизор смотрит на клиента ЦЕЛИКОМ: все разборы за окно +
 * история — и корректирует картину: невыполненные обещания, рекомендации
 * по сделке, риски, приоритет разбора.
 */

export const CALL_REVISION_SCHEMA: Record<string, unknown> = {
    type: 'object',
    properties: {
        /** Сводка по клиенту на сегодня: где сделка, что происходит. */
        entitySummary: { type: 'string' },
        /**
         * Обещания из прошлых звонков, о которых в свежих разговорах ни
         * слова: «обещали КП в среду — не отправлено/не упомянуто».
         */
        unkeptPromises: { type: 'array', items: { type: 'string' } },
        /** Рекомендации ПО СДЕЛКЕ (не по технике менеджера): что делать дальше. */
        dealRecommendations: { type: 'array', items: { type: 'string' } },
        riskFlags: {
            type: 'array',
            items: { type: 'string', enum: [...CALL_REPORT_RISK_FLAG_CODES] },
        },
        coachingPriority: {
            type: ['string', 'null'],
            enum: [...CALL_REPORT_COACHING_CODES, null],
        },
    },
    required: [
        'entitySummary',
        'unkeptPromises',
        'dealRecommendations',
        'riskFlags',
        'coachingPriority',
    ],
    additionalProperties: false,
};

export const CALL_REVISION_PROMPT = `${DEEP_ANALYSIS_CORE_RULES}

ТЫ — НОЧНОЙ РЕВИЗОР. Днём каждый звонок клиента был разобран по отдельности;
твоя задача — посмотреть на клиента ЦЕЛИКОМ и скорректировать картину:
- сопоставь свежие разговоры с историей: какие обещания и договорённости из
  прошлых звонков НЕ выполнены и даже не упомянуты — перечисли их конкретно
  (что обещали, когда, чем закончилось);
- собери рекомендации ПО СДЕЛКЕ: не «как менеджеру говорить», а что делать
  дальше с ЭТИМ клиентом, с конкретикой из разговоров (первым пунктом —
  заготовка первой фразы следующего контакта);
- riskFlags — что должно попасть на стол руководителю по итогам ДНЯ у этого
  клиента (невыполненное обещание — это риск promise);
- coachingPriority — вырос ли приоритет разбора менеджера с руководителем
  с учётом повторяющихся проблем; null — если по дневным разборам менять
  нечего;
- entitySummary — 3-5 предложений: где сейчас сделка, что произошло за день,
  что дальше.

НЕ пересматривай оценки отдельных звонков — они уже выставлены. Не выдумывай:
каждое утверждение опирается на приложенные разборы и историю.`;

/** Один звонок сущности в выжимке для ревизора. */
export interface RevisionCallDigest {
    startedAt: string | null;
    summary: string | null;
    nextStep: string | null;
    score: number | null;
}

/** Пользовательская часть запроса ревизора. */
export function buildRevisionUserContent(
    passportBlock: string,
    fresh: RevisionCallDigest[],
    history: RevisionCallDigest[],
): string {
    const render = (items: RevisionCallDigest[]): string =>
        items.length
            ? items
                  .map(item => {
                      const date = item.startedAt
                          ? new Date(item.startedAt).toLocaleString('ru-RU')
                          : 'дата неизвестна';
                      const score =
                          item.score != null
                              ? ` (оценка ${item.score}/10)`
                              : '';
                      const next = item.nextStep
                          ? `\n  Следующий шаг: ${item.nextStep}`
                          : '';
                      return `- [${date}]${score} ${item.summary ?? 'резюме отсутствует'}${next}`;
                  })
                  .join('\n')
            : '- нет данных';
    return (
        `${passportBlock}\n\n` +
        `РАЗБОРЫ СВЕЖИХ ЗВОНКОВ (за ревизуемый период):\n${render(fresh)}\n\n` +
        `ИСТОРИЯ ПРОШЛЫХ ЗВОНКОВ:\n${render(history)}`
    );
}
