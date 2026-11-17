import { ConfigService } from '@nestjs/config';
import { AiEntityDto } from '../../ai/dto/ai-entity.dto';
import { AiService } from '../../ai/services/ai.service';
import { CallPageLinkService } from '../call-page-link.service';
import { CALL_PAGE_LINK_TYPE } from '../call-page-link.util';

const DOMAIN = 'gsr.bitrix24.ru';

const recordOf = (fields: Partial<AiEntityDto>): AiEntityDto =>
    fields as AiEntityDto;

function harness(
    env: Record<string, string | undefined>,
    revocations: AiEntityDto[] = [],
) {
    const findByTranscriptionIds = jest.fn(() => Promise.resolve(revocations));
    const findByDomainTypesInPeriod = jest.fn(() =>
        Promise.resolve(revocations),
    );
    const ai = {
        findByTranscriptionIds,
        findByDomainTypesInPeriod,
        create: jest.fn(),
    };
    const config = { get: (key: string) => env[key] } as ConfigService;
    const service = new CallPageLinkService(config, ai as unknown as AiService);
    return { service, findByTranscriptionIds, findByDomainTypesInPeriod };
}

/**
 * Ссылки сразу для списка звонков — приложение «Отчёт» запрашивает их
 * пачкой для карточек витрины.
 */
describe('CallPageLinkService.urlsFor', () => {
    it('адреса строятся для каждого звонка и совпадают с одиночной выдачей', async () => {
        const { service } = harness({ AUTH_JWT_SECRET: 'secret' });

        const urls = await service.urlsFor(DOMAIN, ['10245', '10301']);

        expect([...urls.keys()]).toEqual(['10245', '10301']);
        expect(urls.get('10245')).toBe(await service.urlFor('10245'));
        expect(urls.get('10245')).toMatch(
            /^https:\/\/next\.april-app\.ru\/call\//,
        );
        expect(urls.get('10245')).not.toBe(urls.get('10301'));
    });

    it('отзывы читаются одним узким запросом по порталу — разборы звонков не загружаются', async () => {
        const { service, findByTranscriptionIds, findByDomainTypesInPeriod } =
            harness({ AUTH_JWT_SECRET: 'secret' });

        await service.urlsFor(DOMAIN, ['10245', '10301', '10302']);

        expect(findByDomainTypesInPeriod).toHaveBeenCalledTimes(1);
        const [domain, types] = findByDomainTypesInPeriod.mock
            .calls[0] as unknown as [string, string[]];
        expect(domain).toBe(DOMAIN);
        expect(types).toEqual([CALL_PAGE_LINK_TYPE]);
        expect(findByTranscriptionIds).not.toHaveBeenCalled();
    });

    it('у отозванного звонка адрес другой, у остальных — прежний', async () => {
        const plain = harness({ AUTH_JWT_SECRET: 'secret' });
        const before = await plain.service.urlsFor(DOMAIN, ['10245', '10301']);

        const revoked = harness({ AUTH_JWT_SECRET: 'secret' }, [
            recordOf({
                id: '900',
                type: CALL_PAGE_LINK_TYPE,
                transcription_id: '10245',
                user_result: { mark: 'new-mark' } as never,
            }),
        ]);
        const after = await revoked.service.urlsFor(DOMAIN, ['10245', '10301']);

        expect(after.get('10245')).not.toBe(before.get('10245'));
        expect(after.get('10301')).toBe(before.get('10301'));
    });

    it('нет секрета или пустой список — ссылок нет, база не читается', async () => {
        const noSecret = harness({});
        await expect(
            noSecret.service.urlsFor(DOMAIN, ['10245']),
        ).resolves.toEqual(new Map());
        expect(noSecret.findByDomainTypesInPeriod).not.toHaveBeenCalled();

        const empty = harness({ AUTH_JWT_SECRET: 'secret' });
        await expect(empty.service.urlsFor(DOMAIN, [])).resolves.toEqual(
            new Map(),
        );
        expect(empty.findByDomainTypesInPeriod).not.toHaveBeenCalled();
    });
});
