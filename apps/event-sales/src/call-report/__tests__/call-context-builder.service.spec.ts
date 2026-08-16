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
    // Слепок портала без наших полей: детект заявки работает по
    // UF-полям лидогена и SOURCE_ID самого лида.
    const portalModel = {
        getEntityFieldByCode: jest.fn().mockReturnValue(null),
        getFieldBitrixId: jest.fn(),
    };
    const pbxService = {
        init: jest.fn().mockResolvedValue({ bitrix, PortalModel: portalModel }),
    };
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
    );
    return { service, api, transcriptionStore };
};

describe('CallContextBuilderService', () => {
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
        const { service } = makeDeps({ dealContactId: 44 });
        const passport = await service.build(row() as never);
        expect(passport.crmContactId).toBe(44);
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
