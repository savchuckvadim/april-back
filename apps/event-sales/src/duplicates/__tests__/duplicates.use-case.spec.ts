import {
    DuplicateSearchService,
    RelatedEntitiesService,
    SignalFieldMapService,
} from '@lib/portal-lib/pbx-duplicate';
import { DuplicatesUseCase } from '../use-cases/duplicates.use-case';
import {
    DuplicateDetailsRequestDto,
    SearchDuplicatesRequestDto,
} from '../dto/duplicates.dto';

/**
 * Одинаковые одновременные запросы фрейма (история, контакты, пересечения
 * открылись разом) — один поход в Битрикс, а не три.
 */
const deferred = <T>() => {
    let resolve: (value: T) => void = () => undefined;
    const promise = new Promise<T>(done => (resolve = done));
    return { promise, resolve };
};

const makeUseCase = () => {
    const getRelated = jest.fn();
    const search = jest.fn();
    const useCase = new DuplicatesUseCase(
        { search } as unknown as DuplicateSearchService,
        { getRelated } as unknown as RelatedEntitiesService,
        {} as SignalFieldMapService,
    );
    return { useCase, getRelated, search };
};

const detailsDto = {
    domain: 'a.bitrix24.ru',
    entityType: 'DEAL',
    entityId: 31077,
} as unknown as DuplicateDetailsRequestDto;

describe('DuplicatesUseCase', () => {
    it('одновременные запросы связей одного клиента — одно чтение', async () => {
        const { useCase, getRelated } = makeUseCase();
        const pending = deferred<object>();
        getRelated.mockReturnValue(pending.promise);

        const first = useCase.getDetails(detailsDto);
        const second = useCase.getDetails(detailsDto);
        pending.resolve({ deals: [] });

        expect(await first).toEqual({ deals: [] });
        expect(await second).toEqual({ deals: [] });
        expect(getRelated).toHaveBeenCalledTimes(1);
    });

    it('другой клиент или «с закрытыми» — отдельное чтение', async () => {
        const { useCase, getRelated } = makeUseCase();
        getRelated.mockResolvedValue({ deals: [] });

        await useCase.getDetails(detailsDto);
        await useCase.getDetails({ ...detailsDto, entityId: 1 });
        await useCase.getDetails({ ...detailsDto, includeClosed: true });

        expect(getRelated).toHaveBeenCalledTimes(3);
    });

    it('чтение упало — ошибка не запоминается, следующий запрос читает заново', async () => {
        const { useCase, getRelated } = makeUseCase();
        getRelated
            .mockRejectedValueOnce(new Error('Битрикс сейчас не ответил'))
            .mockResolvedValueOnce({ deals: [1] });

        await expect(useCase.getDetails(detailsDto)).rejects.toThrow(
            'Битрикс сейчас не ответил',
        );
        expect(await useCase.getDetails(detailsDto)).toEqual({ deals: [1] });
    });

    it('одновременные одинаковые поиски склеиваются, но не кэшируются', async () => {
        const { useCase, search } = makeUseCase();
        const pending = deferred<object>();
        search.mockReturnValueOnce(pending.promise).mockResolvedValue({ n: 2 });
        const dto = {
            domain: 'a.bitrix24.ru',
            entityType: 'COMPANY',
            entityId: 431,
        } as unknown as SearchDuplicatesRequestDto;

        const first = useCase.searchDuplicates(dto);
        const second = useCase.searchDuplicates(dto);
        pending.resolve({ n: 1 });
        await Promise.all([first, second]);
        // Поиск кэширует себя сам — здесь повтор идёт к нему.
        await useCase.searchDuplicates(dto);

        expect(search).toHaveBeenCalledTimes(2);
    });
});
