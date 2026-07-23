import { CallTypeRegistryService } from '../services/call-type-registry.service';

const DOMAIN = 'test.bitrix24.ru';

/** Документ реестра в формате базы знаний (readAll). */
const doc = (source: string, types: unknown, fileName = 'call-types.json') => ({
    fileName,
    kind: 'call-type-registry',
    source,
    text: JSON.stringify({ types }),
});

const makeService = (options?: {
    sharedDocs?: ReturnType<typeof doc>[];
    clientDocs?: ReturnType<typeof doc>[];
    readError?: boolean;
}) => {
    const knowledgeContent = {
        readAll: options?.readError
            ? jest.fn().mockRejectedValue(new Error('storage down'))
            : jest
                  .fn()
                  .mockImplementation((domain: string | undefined) =>
                      Promise.resolve(
                          domain === undefined
                              ? (options?.sharedDocs ?? [])
                              : [
                                    ...(options?.sharedDocs ?? []),
                                    ...(options?.clientDocs ?? []),
                                ],
                      ),
                  ),
    };
    return {
        service: new CallTypeRegistryService(knowledgeContent as never),
        knowledgeContent,
    };
};

describe('CallTypeRegistryService', () => {
    it('без документов — встроенный реестр из конфига смарта', async () => {
        const { service } = makeService();
        const registry = await service.resolve(DOMAIN);
        expect(registry.source).toBe('builtin');
        expect(registry.codes).toEqual([
            'cold',
            'call',
            'presentation',
            'decision',
            'payment',
            'other',
        ]);
        expect(registry.types.cold.knowledgeKind).toBe('call-analysis-cold');
        expect(registry.types.cold.title).toContain('Холодный');
    });

    it('общий документ переопределяет профиль встроенного типа (частично)', async () => {
        const { service } = makeService({
            sharedDocs: [
                doc('shared', [
                    { code: 'cold', talkRatioNorm: { min: 20, max: 40 } },
                ]),
            ],
        });
        const registry = await service.resolve(DOMAIN);
        expect(registry.source).toBe('knowledge');
        expect(registry.types.cold.talkRatioNorm).toEqual({
            min: 20,
            max: 40,
        });
        // Остальные поля не затёрты.
        expect(registry.types.cold.knowledgeKind).toBe('call-analysis-cold');
    });

    it('клиентский документ добавляет свой тип ПОВЕРХ общего', async () => {
        const { service } = makeService({
            sharedDocs: [
                doc('shared', [{ code: 'cold', focus: 'общий фокус' }]),
            ],
            clientDocs: [
                doc(DOMAIN, [
                    {
                        code: 'renewal',
                        title: 'Перезаключение',
                        focus: 'Продление договора',
                    },
                    { code: 'cold', focus: 'клиентский фокус' },
                ]),
            ],
        });
        const registry = await service.resolve(DOMAIN);
        expect(registry.codes).toContain('renewal');
        expect(registry.types.renewal.knowledgeKind).toBe(
            'call-analysis-renewal',
        );
        // Клиентский слой применяется после общего.
        expect(registry.types.cold.focus).toBe('клиентский фокус');
    });

    it('битый JSON и невалидные коды пропускаются, реестр не ломается', async () => {
        const { service } = makeService({
            sharedDocs: [
                {
                    fileName: 'broken.json',
                    kind: 'call-type-registry',
                    source: 'shared',
                    text: 'не json',
                },
                doc('shared', [
                    { code: 'BAD CODE' },
                    { code: 'ok_type', title: 'Ок' },
                ]),
            ],
        });
        const registry = await service.resolve(DOMAIN);
        expect(registry.codes).toContain('ok_type');
        expect(registry.codes).not.toContain('BAD CODE');
    });

    it('ошибка базы знаний — встроенный реестр без исключения', async () => {
        const { service } = makeService({ readError: true });
        const registry = await service.resolve(DOMAIN);
        expect(registry.source).toBe('builtin');
        expect(registry.codes).toHaveLength(6);
    });

    it('кэш: одно чтение на серию вызовов; invalidate сбрасывает', async () => {
        const { service, knowledgeContent } = makeService();
        await service.resolve(DOMAIN);
        await service.resolve(DOMAIN);
        // readAll зовётся дважды на резолюцию (shared + client).
        expect(knowledgeContent.readAll).toHaveBeenCalledTimes(2);
        service.invalidate(DOMAIN);
        await service.resolve(DOMAIN);
        expect(knowledgeContent.readAll).toHaveBeenCalledTimes(4);
    });
});
