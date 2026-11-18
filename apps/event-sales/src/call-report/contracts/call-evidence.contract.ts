import {
    FIVE_K_ITEM_KEYS,
    HVOST_STEP_KEYS,
    callTypeHasChecklists,
} from '@lib/call-lib';
import { MOMENT_SEC_SCHEMA } from './call-report-facts.contract';

/**
 * Цитаты и время в звонке у разделов, пунктов «хвоста» и 5К и у потребностей
 * (задание focus-v3.4, проект ai/tasks/2026-11-18-quotes-seconds-design.md):
 * по ним страница разбора ставит кнопку «Показать в разговоре». Поля только
 * ДОБАВЛЯЮТСЯ рядом с прежними: `asWas` остаётся пересказом, булевы
 * `hvostSteps` / `fiveKItems` не меняются (на них поля карточки, сверка
 * презентаций и недельный отчёт), `needs` собирает код из `needItems`.
 *
 * Вместе с цитатами включается решение владельца 18.11.2026: «хвост» и 5К
 * спрашиваются только у презентации — у остальных типов их в задании нет.
 *
 * Выключатель: пока он false, задание модели прежнее байт в байт (это держит
 * тест), версия промпта не меняется. Включение — QUOTE_EVIDENCE_ENABLED = true
 * (версия станет focus-v3.4, см. call-report-versions.const.ts). Проверка
 * разбора на звонке из админки включает цитаты явно, не трогая выключатель.
 */
export const QUOTE_EVIDENCE_ENABLED = false;

/** Как строить задание фокус-проходов. */
export interface FocusPassOptions {
    /** Цитаты и время (и «хвост»/5К только у презентации). */
    quoteEvidence: boolean;
    /** Тип звонка, с которым идёт разбор (приор классификатора). */
    callType: string | null;
}

/**
 * Спрашивать ли у модели «хвост» и 5К для этого типа звонка (при
 * включённых цитатах): то же правило, что у показа разбора —
 * callTypeHasChecklists (решение владельца 18.11.2026: только презентация).
 */
export function checklistsAskedFor(callType: string | null): boolean {
    return callTypeHasChecklists(callType);
}

/** Цитата и секунда раздела — дописываются в схему записи раздела. */
export const SECTION_EVIDENCE_PROPERTIES = {
    quote: { type: ['string', 'null'] },
    startSec: MOMENT_SEC_SCHEMA,
} as const;

/** Потребность клиента с местом в разговоре; `needs` собирает из них код. */
export const NEED_ITEMS_SCHEMA = {
    type: 'array',
    items: {
        type: 'object',
        properties: {
            need: { type: 'string' },
            quote: { type: ['string', 'null'] },
            startSec: MOMENT_SEC_SCHEMA,
        },
        required: ['need', 'quote', 'startSec'],
        additionalProperties: false,
    },
} as const;

/** Места пунктов чек-листа: только пункты со значением true. */
function checklistEvidenceSchema(keys: readonly string[]) {
    return {
        type: ['array', 'null'],
        items: {
            type: 'object',
            properties: {
                key: { type: 'string', enum: [...keys] },
                quote: { type: 'string' },
                startSec: MOMENT_SEC_SCHEMA,
            },
            required: ['key', 'quote', 'startSec'],
            additionalProperties: false,
        },
    } as const;
}

export const HVOST_EVIDENCE_SCHEMA = checklistEvidenceSchema(HVOST_STEP_KEYS);
export const FIVE_K_EVIDENCE_SCHEMA = checklistEvidenceSchema(FIVE_K_ITEM_KEYS);

/** Общие правила цитат — первым абзацем блока цитат в каждом проходе. */
export const EVIDENCE_QUOTE_RULES = `ЦИТАТЫ И ВРЕМЯ — по ним страница разбора показывает место в записи.
Каждая цитата quote — ОДНА реплика из расшифровки, скопированная дословно,
символ в символ, 6–15 слов подряд: без пересказа, без «…» внутри, без метки
[mm:ss] и подписи говорящего. startSec — секунда начала этой реплики по
метке [mm:ss] перед ней ([03:15] → 195); меток нет — null. Цитату, которой
в разговоре нет, и выдуманную секунду код отбрасывает.`;

export const SECTION_EVIDENCE_SPEC = `- sections[].quote / sections[].startSec — ДОКАЗАТЕЛЬСТВО ОЦЕНКИ раздела:
  реплика, на которой держится оценка (удачный приём — его реплика, провал —
  реплика, где этап сорвался). Этап не прозвучал или relevance 0 — null.
  asWas остаётся пересказом «как было».`;

export const NEED_ITEMS_SPEC = `- needItems — выявленные потребности клиента, по одной на запись: need —
  потребность коротко своими словами; quote / startSec — реплика, где она
  прозвучала (обычно слова клиента), реплики не найти — null. Потребностей
  нет — пустой массив.`;

export const CHECKLIST_EVIDENCE_SPEC = `- hvostEvidence / fiveKEvidence — где в разговоре раскрыт каждый пункт со
  значением true: одна запись на пункт — key (ключ пункта как в hvostSteps /
  fiveKItems), quote / startSec — реплика, где тема прозвучала. Пункты false
  и null сюда не попадают.
- hvostAnalysis и fiveKAnalysis — обычный текст строками, по блоку на
  строку, не JSON и не запись словаря.`;

/** Блок цитат в конце задания прохода: общие правила и поля этого прохода. */
export function renderEvidenceBlock(specs: readonly string[]): string {
    return `\n\n${EVIDENCE_QUOTE_RULES}\n${specs.join('\n')}`;
}
