import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { CallSalesAnalysisResultDto } from '../dto/call-sales-analysis.dto';

interface VibecodeTranscriptionResponse {
    text?: string;
}

interface VibecodeChatCompletionsResponse {
    choices?: { message?: { content?: string } }[];
}

const VIBECODE_BASE_URL = 'https://vibecode.bitrix24.tech/v1';
const TRANSCRIPTION_MODEL = 'bitrix/deepdml/faster-whisper-large-v3-turbo-ct2';
const ANALYSIS_MODEL = 'bitrix/bitrixgpt-5.5';

const CALL_ANALYSIS_SCHEMA = {
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

const ANALYSIS_SYSTEM_PROMPT = `Ты — AI-ассистент, анализирующий расшифровки телефонных звонков менеджеров по продажам.
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

@Injectable()
export class VibeCodeClient {
    private readonly logger = new Logger(VibeCodeClient.name);
    private readonly apiKey: string;

    constructor(private readonly configService: ConfigService) {
        const key = this.configService.get<string>('BITRIX_VIBE_TEST');
        if (!key) throw new Error('BITRIX_VIBE_TEST is not set');
        this.apiKey = key;
    }

    async transcribeAudio(buffer: Buffer, fileName: string): Promise<string> {
        this.logger.log(
            `Transcribing audio: ${fileName} (${buffer.length} bytes)`,
        );

        const formData = new FormData();
        formData.append('model', TRANSCRIPTION_MODEL);
        formData.append(
            'file',
            new Blob([buffer], { type: 'audio/mpeg' }),
            fileName,
        );

        const response = await fetch(
            `${VIBECODE_BASE_URL}/audio/transcriptions`,
            {
                method: 'POST',
                headers: { Authorization: `Bearer ${this.apiKey}` },
                body: formData,
            },
        );

        if (!response.ok) {
            const error = await response.text();
            throw new Error(
                `Vibecode transcription failed [${response.status}]: ${error}`,
            );
        }

        const data = (await response.json()) as VibecodeTranscriptionResponse;
        if (!data.text) {
            throw new Error('Empty transcription result from Vibecode');
        }

        this.logger.log(
            `Transcription done, length: ${data.text.length} chars`,
        );
        return data.text;
    }

    async analyzeTranscript(
        transcript: string,
    ): Promise<CallSalesAnalysisResultDto> {
        this.logger.log('Analyzing transcript with Vibecode LLM');

        const body = {
            model: ANALYSIS_MODEL,
            messages: [
                { role: 'system', content: ANALYSIS_SYSTEM_PROMPT },
                {
                    role: 'user',
                    content: `Проанализируй следующую расшифровку звонка:\n\n${transcript}`,
                },
            ],
            response_format: {
                type: 'json_schema',
                json_schema: {
                    name: 'call_sales_analysis',
                    strict: true,
                    schema: CALL_ANALYSIS_SCHEMA,
                },
            },
        };

        const response = await fetch(`${VIBECODE_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(
                `Vibecode analysis failed [${response.status}]: ${error}`,
            );
        }

        const data = (await response.json()) as VibecodeChatCompletionsResponse;

        const content = data.choices?.[0]?.message?.content;
        if (!content) throw new Error('Empty analysis result from Vibecode');

        const parsed: unknown = JSON.parse(content);
        return plainToInstance(CallSalesAnalysisResultDto, parsed);
    }
}
