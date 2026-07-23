/**
 * Контракт классификации звонка (classifyCall): strict JSON-схема
 * (коды типов/ролей — из конфига смарта, compile-time связка) и
 * ДЕФОЛТНАЯ инструкция. Инструкция подменяема без деплоя: документ
 * kind='call-classify' в базе знаний замещает её (см.
 * CallClassifyInstructionService в call-report).
 */
import {
    CALL_REPORT_CALL_TYPE_CODES,
    CALL_REPORT_INTERLOCUTOR_CODES,
} from '@lib/portal-lib/pbx/pbx-aicall-smart';

/** Лимит транскрипта для классификации: типа звонка хватает и по началу разговора. */
export const CLASSIFICATION_TRANSCRIPT_LIMIT = 30_000;

export const CALL_CLASSIFICATION_SCHEMA = {
    type: 'object',
    properties: {
        callType: {
            type: 'string',
            enum: [...CALL_REPORT_CALL_TYPE_CODES],
        },
        interlocutorRole: {
            type: 'string',
            enum: [...CALL_REPORT_INTERLOCUTOR_CODES],
        },
        confidence: { type: 'number' },
        reason: { type: 'string' },
    },
    required: ['callType', 'interlocutorRole', 'confidence', 'reason'],
    additionalProperties: false,
};

/**
 * Дефолтная инструкция классификации. Подменяется без деплоя: положите
 * документ в базу знаний kind='call-classify' (общую или домена) — конвейер
 * передаст его текст сюда через параметр systemPrompt (см.
 * CallClassifyInstructionService в call-report).
 */
export const DEFAULT_CLASSIFICATION_SYSTEM_PROMPT = `Ты классифицируешь расшифровки телефонных звонков менеджеров по продажам ИПО ГАРАНТ.
Определи тип звонка и с кем в итоге говорил менеджер.

callType — тип звонка (ровно один код):
- 'cold' — холодный звонок: менеджер впервые выходит на компанию, пытается пройти секретаря / выйти на ЛПР
- 'call' — повторный звонок, цель которого договориться о презентации продукта
- 'presentation' — сама презентация: менеджер подробно показывает/рассказывает продукт под потребности
- 'decision' — звонок по принятию решения: клиент уже видел продукт, обсуждается решение о покупке
- 'payment' — звонок по оплате: счёт, договор, сроки оплаты
- 'other' — не подходит ни под один тип (сервисный, ошибочный, личный и т.п.)

interlocutorRole — с кем говорили:
- 'lpr' — лицо, принимающее решение (директор, главбух, руководитель)
- 'user' — потенциальный пользователь продукта, но не ЛПР
- 'secretary' — секретарь / ресепшн, до содержательного собеседника не дошли
- 'other' — автоответчик, не та организация, не удалось определить

confidence — уверенность 0..1 (0.9+ — очевидно; ниже 0.6 — сомнительно, тип определён по косвенным признакам).
reason — 1-2 предложения на русском: почему выбраны такие коды.`;
