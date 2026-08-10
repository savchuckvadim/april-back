import {
    DuplicateEntityType,
    DuplicateSearchLevel,
    DuplicateSearchResult,
    DuplicateSignalKind,
    SEARCH_VIA,
} from '@lib/portal-lib/pbx-duplicate';
import {
    entityCardUrl,
    formatDuplicateTimelineComment,
} from '../lib/duplicate-timeline.formatter';

const baseResult = (
    over: Partial<DuplicateSearchResult> = {},
): DuplicateSearchResult => ({
    domain: 'd.b24.ru',
    signals: {
        phones: ['9192569798'],
        emails: [],
        inns: ['4826000000'],
        titles: [],
    },
    origins: [],
    candidates: [],
    level: DuplicateSearchLevel.DEEP,
    fromCache: false,
    batchCommands: 4,
    batchRequests: 1,
    warnings: [],
    ...over,
});

describe('duplicate-timeline.formatter', () => {
    it('карточка кандидата: тип, счёт, признаки и ссылка', () => {
        const comment = formatDuplicateTimelineComment(
            'd.b24.ru',
            baseResult({
                candidates: [
                    {
                        entityType: DuplicateEntityType.COMPANY,
                        entityTypeId: 4,
                        id: 431,
                        title: 'ООО Ромашка',
                        score: 95,
                        reasons: [
                            {
                                kind: DuplicateSignalKind.INN,
                                value: '4826000000',
                                via: SEARCH_VIA.RQ_INN,
                                weight: 95,
                            },
                            {
                                kind: DuplicateSignalKind.PHONE,
                                value: '9192569798',
                                via: SEARCH_VIA.FINDBYCOMM,
                                weight: 80,
                            },
                        ],
                    },
                ],
            }),
            'глубокая',
        );

        expect(comment).toContain('[B]Проверка на дубли (глубокая)[/B]');
        expect(comment).toContain('Найдено кандидатов: 1.');
        expect(comment).toContain('[B]Компания[/B] ООО Ромашка — 95 баллов');
        expect(comment).toContain('ИНН 4826000000 (реквизиты)');
        expect(comment).toContain('телефон 9192569798 (телефон/email базы)');
        expect(comment).toContain('https://d.b24.ru/crm/company/details/431/');
        expect(comment).toContain('телефоны — 1, ИНН — 1');
    });

    it('пустой результат: «Дубликаты не найдены»', () => {
        const comment = formatDuplicateTimelineComment(
            'd.b24.ru',
            baseResult(),
            'быстрая',
        );
        expect(comment).toContain('Дубликаты не найдены.');
    });

    it('хвост длинного списка сворачивается в «и ещё N»', () => {
        const candidates = Array.from({ length: 10 }, (_, index) => ({
            entityType: DuplicateEntityType.LEAD,
            entityTypeId: 1,
            id: index + 1,
            title: `Лид ${index + 1}`,
            score: 40,
            reasons: [],
        }));
        const comment = formatDuplicateTimelineComment(
            'd.b24.ru',
            baseResult({ candidates }),
            'глубокая',
        );
        expect(comment).toContain('… и ещё 3');
    });

    it('entityCardUrl строит корректный адрес карточки', () => {
        expect(entityCardUrl('d.b24.ru', DuplicateEntityType.DEAL, 12)).toBe(
            'https://d.b24.ru/crm/deal/details/12/',
        );
    });
});
