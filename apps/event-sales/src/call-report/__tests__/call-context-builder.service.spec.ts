import { CallContextBuilderService } from '../services/call-context-builder.service';

const row = (overrides?: Record<string, unknown>) => ({
    id: '115',
    domain: 'test.bitrix24.ru',
    activityId: '901',
    entityType: 'deal',
    entityId: '555',
    callStartedAt: new Date('2026-07-30T10:00:00Z'),
    text: 'текст',
    ...overrides,
});

const makeDeps = (options?: {
    dealStage?: string | null;
    leadStatus?: string;
    /** Дополнительные поля лида (для детекта «лид — заявка»). */
    leadFields?: Record<string, unknown>;
    /** Контакт сделки и его карточка (для подсказки специализации). */
    dealContactId?: number;
    contactPost?: string;
    contactName?: string;
    contactComments?: string;
    /** Компания сделки и её карточка. */
    dealCompanyId?: number;
    companyTitle?: string;
    companyComments?: string;
    /** Записи «ОП История» (UF_CRM_OP_MHISTORY) в строке сделки. */
    dealOpHistory?: string[];
    direction?: string;
    phoneMatches?: Record<string, number[]>;
    history?: { id: string; callStartedAt: Date | null }[];
    resumeByTranscription?: Record<string, string>;
}) => {
    const api = {
        call: jest.fn((method: string) => {
            if (method === 'crm.deal.get') {
                return Promise.resolve(
                    options?.dealStage === null
                        ? {}
                        : {
                              result: {
                                  STAGE_ID: options?.dealStage ?? 'C5:PREP',
                                  CATEGORY_ID: 5,
                                  CONTACT_ID: options?.dealContactId,
                                  COMPANY_ID: options?.dealCompanyId,
                                  UF_CRM_OP_MHISTORY: options?.dealOpHistory,
                              },
                          },
                );
            }
            if (method === 'crm.contact.get') {
                return Promise.resolve({
                    result: {
                        POST: options?.contactPost,
                        NAME: options?.contactName,
                        COMMENTS: options?.contactComments,
                    },
                });
            }
            if (method === 'crm.company.get') {
                return Promise.resolve({
                    result: {
                        TITLE: options?.companyTitle,
                        COMMENTS: options?.companyComments,
                    },
                });
            }
            if (method === 'crm.lead.get') {
                return Promise.resolve({
                    result: {
                        STATUS_ID: options?.leadStatus ?? 'NEW',
                        ...options?.leadFields,
                    },
                });
            }
            if (method === 'crm.duplicate.findbycomm') {
                return Promise.resolve({
                    result: options?.phoneMatches ?? {},
                });
            }
            return Promise.resolve({});
        }),
    };
    const bitrix = {
        api,
        activity: {
            getAllFresh: jest.fn().mockResolvedValue({
                activities: [
                    {
                        ID: '901',
                        DIRECTION: options?.direction ?? '2',
                        COMMUNICATIONS: [{ VALUE: '+79997776655' }],
                    },
                ],
            }),
        },
    };
    // Слепок портала: из наших полей заведено только op_mhistory —
    // детект заявки работает по UF-полям лидогена и SOURCE_ID лида.
    const portalModel = {
        getEntityFieldByCode: jest.fn((entity: string, code: string) =>
            code === 'op_mhistory' ? { code } : null,
        ),
        getFieldBitrixId: jest.fn().mockReturnValue('UF_CRM_OP_MHISTORY'),
    };
    const pbxService = {
        init: jest.fn().mockResolvedValue({ bitrix, PortalModel: portalModel }),
    };
    // Кэш паспорта: по умолчанию промах (get→null), запись — no-op.
    const redisClient = {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue('OK'),
    };
    const redisService = { getClient: () => redisClient };
    const transcriptionStore = {
        findRecentByEntity: jest.fn().mockResolvedValue(options?.history ?? []),
    };
    const aiService = {
        findByTranscriptionIds: jest.fn().mockResolvedValue(
            Object.entries(options?.resumeByTranscription ?? {}).map(
                ([transcriptionId, resume]) => ({
                    transcription_id: transcriptionId,
                    type: 'call-resume',
                    result: resume,
                }),
            ),
        ),
    };
    const service = new CallContextBuilderService(
        pbxService as never,
        transcriptionStore as never,
        aiService as never,
        redisService as never,
    );
    return { service, api, transcriptionStore, redisClient };
};

describe('CallContextBuilderService', () => {
    it('кэш: готовый паспорт из Redis отдаётся без походов в CRM; свежий — кэшируется', async () => {
        const { service, api, redisClient } = makeDeps();
        redisClient.get.mockResolvedValueOnce(
            JSON.stringify({ certainty: 'rich', stageId: 'C5:CACHED' }),
        );
        const cached = await service.build(row() as never);
        expect(cached.stageId).toBe('C5:CACHED');
        expect(api.call).not.toHaveBeenCalled();

        // Промах кэша → сборка + запись в кэш с TTL.
        const fresh = await service.build(row() as never);
        expect(fresh.certainty).toBe('rich');
        expect(redisClient.set).toHaveBeenCalledWith(
            'call-report:passport:115',
            expect.any(String),
            'EX',
            expect.any(Number),
        );
    });

    it('сделка со стадией → certainty=rich, стадия и воронка в паспорте', async () => {
        const { service } = makeDeps({ dealStage: 'C5:EXECUTING' });
        const passport = await service.build(row() as never);
        expect(passport.certainty).toBe('rich');
        expect(passport.stageId).toBe('C5:EXECUTING');
        expect(passport.categoryId).toBe('5');
        expect(passport.direction).toBe('outgoing');
    });

    it('лид → certainty=lead со статусом; identity не ищется', async () => {
        const { service, api } = makeDeps({ leadStatus: 'IN_PROCESS' });
        const passport = await service.build(
            row({ entityType: 'lead', entityId: '77' }) as never,
        );
        expect(passport.certainty).toBe('lead');
        expect(passport.leadStatusId).toBe('IN_PROCESS');
        expect(api.call).not.toHaveBeenCalledWith(
            'crm.duplicate.findbycomm',
            expect.anything(),
        );
        // Признаков заявки нет → вид работы «холодный», подсказки нет.
        expect(passport.leadWorkKind).toBe('cold');
        expect(service.renderClassifyHint(passport)).toBeNull();
    });

    it('персона контакта сделки (имя, должность, заметки) попадает в паспорт', async () => {
        const { service } = makeDeps({
            dealContactId: 44,
            contactPost: 'Главный бухгалтер',
            contactName: 'Мария',
            contactComments: '<p>Работает в 1С,  [b]просила счёт[/b]</p>',
        });
        const passport = await service.build(row() as never);
        expect(passport.contactPosition).toBe('Главный бухгалтер');
        expect(passport.contactName).toBe('Мария');
        // Разметка вычищена, пробелы схлопнуты.
        expect(passport.crmNotes).toBe('Работает в 1С, просила счёт');
        const prompt = service.renderForPrompt(passport);
        expect(prompt).toContain('Собеседник по данным CRM: Мария');
        expect(prompt).toContain('должность «Главный бухгалтер»');
        expect(prompt).toContain('Заметки менеджера из CRM');
    });

    it('компания и контакт сделки сохраняются для долива связей', async () => {
        const { service } = makeDeps({ dealContactId: 44, dealCompanyId: 33 });
        const passport = await service.build(row() as never);
        expect(passport.crmContactId).toBe(44);
        expect(passport.crmCompanyId).toBe(33);
    });

    it('записи «ОП История» сделки попадают в паспорт (хвост, без разметки)', async () => {
        const { service } = makeDeps({
            dealOpHistory: [
                '01.05 первый контакт',
                '12.05 <b>просили перезвонить</b>',
            ],
        });
        const passport = await service.build(row() as never);
        expect(passport.opHistory).toEqual([
            '01.05 первый контакт',
            '12.05 просили перезвонить',
        ]);
        expect(service.renderForPrompt(passport)).toContain(
            '«ОП История» из CRM',
        );
    });

    it('карточка компании сделки: название и заметки в паспорте', async () => {
        const { service } = makeDeps({
            dealCompanyId: 33,
            companyTitle: 'ООО «Гарант-Сервис Ростов»',
            companyComments:
                'Продление в ноябре, <b>работают с Консультантом</b>',
        });
        const passport = await service.build(row() as never);
        expect(passport.companyTitle).toBe('ООО «Гарант-Сервис Ростов»');
        expect(passport.companyNotes).toBe(
            'Продление в ноябре, работают с Консультантом',
        );
        const prompt = service.renderForPrompt(passport);
        expect(prompt).toContain('Компания клиента по данным CRM');
        expect(prompt).toContain('Заметки менеджера о компании');
    });

    it('должность из POST лида; пустая строка → null', async () => {
        const { service } = makeDeps({
            leadFields: { POST: '  Юрист  ' },
        });
        const passport = await service.build(
            row({ entityType: 'lead', entityId: '77' }) as never,
        );
        expect(passport.contactPosition).toBe('Юрист');

        const { service: bare } = makeDeps({ leadFields: { POST: '' } });
        const emptyPassport = await bare.build(
            row({ entityType: 'lead', entityId: '77' }) as never,
        );
        expect(emptyPassport.contactPosition).toBeNull();
    });

    it('лид с полем лидогена → заявка: строка в паспорте и подсказка классификатору', async () => {
        const { service } = makeDeps({
            leadFields: { UF_CRM_REG_NUMBER: 'A-771' },
        });
        const passport = await service.build(
            row({ entityType: 'lead', entityId: '77' }) as never,
        );
        expect(passport.leadWorkKind).toBe('request');
        expect(service.renderForPrompt(passport)).toContain('ВХОДЯЩЕЙ ЗАЯВКОЙ');
        expect(service.renderClassifyHint(passport)).toContain('site_lead');
    });

    it('без CRM-привязки → naked + suspected identity по номеру', async () => {
        const { service } = makeDeps({
            phoneMatches: { CONTACT: [3012905], DEAL: [] },
        });
        const passport = await service.build(
            row({ entityType: null, entityId: null }) as never,
        );
        expect(passport.certainty).toBe('naked');
        expect(passport.identity).toEqual([
            {
                entityType: 'CONTACT',
                entityId: 3012905,
                confidence: 'suspected',
            },
        ]);
        // Паспорт — подсказка, не приговор: в промпте это помечено как догадка.
        expect(service.renderForPrompt(passport)).toContain('suspected');
        expect(service.renderForPrompt(passport)).toContain(
            'НЕ штрафуй за «неуместность»',
        );
    });

    it('история сущности попадает в паспорт с резюме прошлых звонков', async () => {
        const { service } = makeDeps({
            history: [
                { id: '90', callStartedAt: new Date('2026-07-20T09:00:00Z') },
            ],
            resumeByTranscription: { '90': 'Обещали выслать КП в среду' },
        });
        const passport = await service.build(row() as never);
        expect(passport.history).toHaveLength(1);
        expect(passport.history[0].resume).toContain('КП');
        expect(service.renderForPrompt(passport)).toContain(
            'невыполненные обещания',
        );
    });

    it('Bitrix недоступен → паспорт деградирует в naked, но собирает историю', async () => {
        const { service } = makeDeps({
            history: [{ id: '90', callStartedAt: null }],
        });
        (service as unknown as { pbxService: { init: jest.Mock } }).pbxService =
            { init: jest.fn().mockRejectedValue(new Error('portal down')) };
        const passport = await service.build(row() as never);
        expect(passport.certainty).toBe('naked');
        expect(passport.history).toHaveLength(1);
    });
});
