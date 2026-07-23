/**
 * Контракт анализа звонка (analyzeTranscript): strict JSON-схема ответа
 * bitrixgpt + системный промпт. Вынесен из клиента, чтобы HTTP-логика и
 * предметные инструкции жили отдельно; схема — источник правды формата
 * CallSalesAnalysisResultDto (flow-коды event-sales).
 */

export const CALL_ANALYSIS_SCHEMA = {
    type: 'object',
    properties: {
        summary: { type: 'string' },
        wasProductive: { type: 'boolean' },
        callOutcome: {
            type: 'string',
            enum: ['заинтересован', 'отказ', 'перенос', 'нет_ответа', 'другое'],
        },
        nextCallPlanned: { type: 'boolean' },
        nextCallDate: { type: ['string', 'null'] },
        nextCallGoal: { type: ['string', 'null'] },
        clientSentiment: {
            type: 'string',
            enum: ['positive', 'neutral', 'negative'],
        },
        clientNeeds: { type: 'array', items: { type: 'string' } },
        objections: { type: 'array', items: { type: 'string' } },
        keyPoints: { type: 'array', items: { type: 'string' } },
        agreedActions: { type: 'array', items: { type: 'string' } },
        flow: {
            type: 'object',
            properties: {
                report: {
                    type: 'object',
                    properties: {
                        resultStatus: {
                            type: 'string',
                            enum: ['result', 'noresult', 'expired'],
                        },
                        noresultReasonCode: {
                            type: ['string', 'null'],
                            enum: [
                                null,
                                'secretar',
                                'nopickup',
                                'nonumber',
                                'busy',
                                'noresult_notime',
                                'nocontact',
                                'giveup',
                                'bay',
                                'wrong',
                                'auto',
                            ],
                        },
                    },
                    required: ['resultStatus', 'noresultReasonCode'],
                    additionalProperties: false,
                },
                plan: {
                    type: 'object',
                    properties: {
                        isPlanned: { type: 'boolean' },
                        typeCode: {
                            type: ['string', 'null'],
                            enum: [
                                null,
                                'cold',
                                'warm',
                                'presentation',
                                'hot',
                                'moneyAwait',
                                'supply',
                            ],
                        },
                        name: { type: 'string' },
                        deadlineDate: { type: ['string', 'null'] },
                    },
                    required: ['isPlanned', 'typeCode', 'name', 'deadlineDate'],
                    additionalProperties: false,
                },
            },
            required: ['report', 'plan'],
            additionalProperties: false,
        },
    },
    required: [
        'summary',
        'wasProductive',
        'callOutcome',
        'nextCallPlanned',
        'nextCallDate',
        'nextCallGoal',
        'clientSentiment',
        'clientNeeds',
        'objections',
        'keyPoints',
        'agreedActions',
        'flow',
    ],
    additionalProperties: false,
};

export const ANALYSIS_SYSTEM_PROMPT = `Ты — AI-ассистент, анализирующий расшифровки телефонных звонков менеджеров по продажам.
Твоя задача — извлечь структурированную информацию из разговора и заполнить все поля.

Правила базового анализа:
- wasProductive: true если разговор состоялся и принёс результат (интерес, договорённость, перенос), false если клиент не взял трубку или сразу отказался
- callOutcome: определи итог из ['заинтересован', 'отказ', 'перенос', 'нет_ответа', 'другое']
- clientSentiment: оцени общий тон клиента из ['positive', 'neutral', 'negative']
- nextCallDate: если договорились о дате — верни в формате YYYY-MM-DD, иначе null
- Все текстовые поля заполняй на русском языке
- Если информации недостаточно — оставь массивы пустыми, строки — пустой строкой

Правила секции flow (для CRM-флоу event-sales):

flow.report — отчёт о текущем звонке:
- resultStatus:
  - 'result' если разговор состоялся и принёс результат (был контакт, договорились о чём-то)
  - 'noresult' если не получилось пообщаться (не взяли трубку, секретарь, занято) — без переноса
  - 'expired' если был контакт, но договорились перенести / встретиться позже
- noresultReasonCode (только когда resultStatus='noresult', иначе null):
  - 'secretar' — не пустил секретарь
  - 'nopickup' — недозвон, трубку не берут
  - 'nonumber' — нет такого номера
  - 'busy' — занято
  - 'noresult_notime' — перенесли по причине нет времени
  - 'nocontact' — контактного лица нет на месте
  - 'giveup' — просят оставить номер
  - 'bay' — не интересует, до свидания
  - 'wrong' — отвечает не та организация
  - 'auto' — автоответчик

flow.plan — планируемое следующее событие:
- isPlanned: true если из разговора понятно что будет следующий контакт; false если не запланирован
- typeCode (если isPlanned=true; иначе null):
  - 'cold' — первичный холодный звонок
  - 'warm' — обычный повторный звонок (по умолчанию для большинства случаев)
  - 'presentation' — назначена презентация / встреча
  - 'hot' — горячий контакт, клиент в стадии принятия решения
  - 'moneyAwait' — ждём оплаты
  - 'supply' — по поставке
- name: краткое название планируемого события (например 'Перезвонить уточнить решение')
- deadlineDate: дата следующего контакта YYYY-MM-DD или null если не названа в разговоре`;
