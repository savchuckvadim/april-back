import type { RequesterAccess } from '../../domain/access/perimeter.util';
import { CALL_PAGE_LINKS_MAX } from '../call-page.const';
import { CallPageLinksUseCase } from '../call-page-links.use-case';

const DOMAIN = 'gsr.bitrix24.ru';

/** Руководитель отдела: видит менеджеров 317 и 318. */
const HEAD: RequesterAccess = { role: 'op', visibleManagerIds: ['317', '318'] };
/** Видит всех. */
const CUP: RequesterAccess = { role: 'cup', visibleManagerIds: null };

/** Расшифровки портала: номер → менеджер. Чужого портала здесь нет. */
const ROWS: Record<string, string | null> = {
    '10245': '317',
    '10301': '318',
    '10302': '999',
    '10303': null,
};

const makeDeps = () => {
    const transcriptions = {
        findLiteByIds: jest.fn((_domain: string, ids: readonly string[]) =>
            Promise.resolve(
                ids
                    .filter(id => id in ROWS)
                    .map(id => ({ id, domain: DOMAIN, userId: ROWS[id] })),
            ),
        ),
    };
    const links = {
        urlsFor: jest.fn((_domain: string, ids: readonly string[]) =>
            Promise.resolve(
                new Map(ids.map(id => [id, `https://site/call/token-${id}`])),
            ),
        ),
    };
    const useCase = new CallPageLinksUseCase(
        transcriptions as never,
        links as never,
    );
    return { useCase, transcriptions, links };
};

describe('CallPageLinksUseCase', () => {
    it('ссылки выдаются только на звонки менеджеров из периметра — в порядке запроса', async () => {
        const { useCase, links } = makeDeps();

        const result = await useCase.execute(
            DOMAIN,
            ['10301', '10302', '10245', '10303'],
            HEAD,
        );

        expect(result).toEqual([
            { transcriptionId: '10301', url: 'https://site/call/token-10301' },
            { transcriptionId: '10245', url: 'https://site/call/token-10245' },
        ]);
        // Чужому менеджеру и звонку без менеджера ссылка даже не строится.
        expect(links.urlsFor).toHaveBeenCalledWith(DOMAIN, ['10301', '10245']);
    });

    it('тот, кто видит всех, получает и звонок без менеджера', async () => {
        const { useCase } = makeDeps();

        const result = await useCase.execute(DOMAIN, ['10302', '10303'], CUP);

        expect(result.map(item => item.transcriptionId)).toEqual([
            '10302',
            '10303',
        ]);
    });

    it('номер чужого портала или несуществующий молча пропускается', async () => {
        const { useCase, transcriptions } = makeDeps();

        const result = await useCase.execute(DOMAIN, ['555555', '10245'], CUP);

        expect(result.map(item => item.transcriptionId)).toEqual(['10245']);
        expect(transcriptions.findLiteByIds).toHaveBeenCalledWith(DOMAIN, [
            '555555',
            '10245',
        ]);
    });

    it('повторы в запросе схлопываются, лишнее сверх предела не читается', async () => {
        const { useCase, transcriptions } = makeDeps();
        const many = Array.from({ length: CALL_PAGE_LINKS_MAX + 20 }, (_, i) =>
            String(20000 + i),
        );

        await useCase.execute(DOMAIN, ['10245', '10245', ...many], CUP);

        const asked = (
            transcriptions.findLiteByIds.mock.calls[0] as unknown[]
        )[1] as string[];
        expect(asked).toHaveLength(CALL_PAGE_LINKS_MAX);
        expect(asked.filter(id => id === '10245')).toHaveLength(1);
    });

    it('никто из периметра не подошёл — ссылки не строятся вовсе', async () => {
        const { useCase, links } = makeDeps();

        await expect(useCase.execute(DOMAIN, ['10302'], HEAD)).resolves.toEqual(
            [],
        );
        await expect(useCase.execute(DOMAIN, [], HEAD)).resolves.toEqual([]);
        expect(links.urlsFor).not.toHaveBeenCalled();
    });
});
