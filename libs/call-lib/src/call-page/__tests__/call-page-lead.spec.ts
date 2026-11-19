import { ConfigService } from '@nestjs/config';
import { AiEntityDto } from '../../ai/dto/ai-entity.dto';
import { AiService } from '../../ai/services/ai.service';
import { CallPageLeadService } from '../call-page-lead.service';
import {
    buildCallPageLeadToken,
    CALL_PAGE_LEAD_TTL_SEC,
    callPageLeadPayloadOf,
    verifyCallPageLeadToken,
    type CallPageLeadPayload,
} from '../call-page-lead.util';
import { CallPageLinkService } from '../call-page-link.service';
import {
    buildCallPageToken,
    CALL_PAGE_LINK_TYPE,
} from '../call-page-link.util';

const SECRET = 'test-secret';
const DOMAIN = 'gsr.bitrix24.ru';
const NOW_SEC = 1_790_000_000;

const payloadOf = (
    overrides: Partial<CallPageLeadPayload> = {},
): CallPageLeadPayload => ({
    ...callPageLeadPayloadOf(
        {
            domain: DOMAIN,
            userId: '447',
            role: 'leader',
            transcriptionId: '10245',
        },
        NOW_SEC,
    ),
    ...overrides,
});

const callTokenOf = (id: string, mark = ''): string => {
    const token = buildCallPageToken(SECRET, id, mark);
    if (token === null) throw new Error('ссылка звонка не построена');
    return token;
};

describe('личный ключ руководителя: чистые функции', () => {
    it('верный ключ проходит и отдаёт нагрузку, срок — 7 дней', () => {
        const token = buildCallPageLeadToken(SECRET, payloadOf());
        const check = verifyCallPageLeadToken(SECRET, token, NOW_SEC);

        expect(check).toEqual({ status: 'ok', payload: payloadOf() });
        expect(payloadOf().e - NOW_SEC).toBe(CALL_PAGE_LEAD_TTL_SEC);
        expect(CALL_PAGE_LEAD_TTL_SEC).toBe(7 * 24 * 60 * 60);
        expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);
    });

    it('просроченный ключ — expired, но только при верной подписи', () => {
        const token = buildCallPageLeadToken(SECRET, payloadOf());
        const later = NOW_SEC + CALL_PAGE_LEAD_TTL_SEC;

        expect(verifyCallPageLeadToken(SECRET, token, later).status).toBe(
            'expired',
        );
        const forged = buildCallPageLeadToken('other-secret', payloadOf());
        expect(verifyCallPageLeadToken(SECRET, forged, later).status).toBe(
            'invalid',
        );
    });

    it('подделка: чужой секрет, изменённая нагрузка, битая подпись, мусор', () => {
        const token = buildCallPageLeadToken(SECRET, payloadOf());
        const [, signature] = token.split('.');
        const tampered = `${Buffer.from(
            JSON.stringify(payloadOf({ u: '1', r: 'superuser' })),
        ).toString('base64url')}.${signature}`;
        const brokenSignature = `${token.slice(0, -1)}${
            token.endsWith('A') ? 'B' : 'A'
        }`;

        for (const candidate of [
            buildCallPageLeadToken('other-secret', payloadOf()),
            tampered,
            brokenSignature,
            'abc',
            '',
            `${token}.x`,
        ]) {
            expect(verifyCallPageLeadToken(SECRET, candidate, NOW_SEC)).toEqual(
                { status: 'invalid' },
            );
        }
    });

    it('подписанная нагрузка чужой формы не принимается', () => {
        const badRole = buildCallPageLeadToken(SECRET, {
            ...payloadOf(),
            r: 'manager' as unknown as CallPageLeadPayload['r'],
        });
        const badId = buildCallPageLeadToken(SECRET, payloadOf({ t: 'x1' }));

        expect(verifyCallPageLeadToken(SECRET, badRole, NOW_SEC).status).toBe(
            'invalid',
        );
        expect(verifyCallPageLeadToken(SECRET, badId, NOW_SEC).status).toBe(
            'invalid',
        );
    });
});

function harness(env: Record<string, string | undefined>) {
    const revocations: AiEntityDto[] = [];
    const ai = {
        findByTranscriptionIds: jest.fn(() => Promise.resolve(revocations)),
        findByDomainTypesInPeriod: jest.fn(() => Promise.resolve(revocations)),
        create: jest.fn(),
    };
    const config = { get: (key: string) => env[key] } as ConfigService;
    const links = new CallPageLinkService(config, ai as unknown as AiService);
    return {
        service: new CallPageLeadService(config, links),
        links,
        revocations,
    };
}

describe('CallPageLeadService', () => {
    const NOW_MS = NOW_SEC * 1000;

    it('личные адреса: /call/<ключ звонка>/lead/<личный ключ>, ключ проверяется', async () => {
        const { service } = harness({ AUTH_JWT_SECRET: SECRET });

        const urls = await service.urlsFor(
            DOMAIN,
            ['10245', '10301'],
            { userId: '447', role: 'leader' },
            NOW_MS,
        );

        expect([...urls.keys()]).toEqual(['10245', '10301']);
        const match = /\/call\/([^/]+)\/lead\/([^/]+)$/.exec(
            urls.get('10245') ?? '',
        );
        expect(match).not.toBeNull();
        const [, callToken, leadToken] = match as RegExpExecArray;
        expect(callToken).toBe(callTokenOf('10245'));
        expect(service.verify(callToken, leadToken, NOW_MS)).toEqual({
            status: 'ok',
            payload: payloadOf(),
        });
    });

    it('ключ к чужому звонку — недействителен', () => {
        const { service } = harness({ AUTH_JWT_SECRET: SECRET });
        const lead = buildCallPageLeadToken(SECRET, payloadOf());

        expect(service.verify(callTokenOf('10301'), lead, NOW_MS)).toEqual({
            status: 'invalid',
        });
        expect(service.verify('мусор', lead, NOW_MS)).toEqual({
            status: 'invalid',
        });
    });

    it('просроченный ключ — expired', () => {
        const { service } = harness({ AUTH_JWT_SECRET: SECRET });
        const lead = buildCallPageLeadToken(SECRET, payloadOf());
        const later = (NOW_SEC + CALL_PAGE_LEAD_TTL_SEC + 1) * 1000;

        expect(service.verify(callTokenOf('10245'), lead, later).status).toBe(
            'expired',
        );
    });

    it('ссылка звонка отозвана — личный адрес строится уже с новой меткой', async () => {
        const { service, revocations } = harness({ AUTH_JWT_SECRET: SECRET });
        revocations.push({
            id: '9',
            type: CALL_PAGE_LINK_TYPE,
            transcription_id: '10245',
            user_result: { mark: 'new-mark' },
        } as unknown as AiEntityDto);

        const urls = await service.urlsFor(
            DOMAIN,
            ['10245'],
            { userId: '447', role: 'superuser' },
            NOW_MS,
        );

        expect(urls.get('10245')).toContain(
            `/call/${callTokenOf('10245', 'new-mark')}/lead/`,
        );
        expect(urls.get('10245')).not.toContain(callTokenOf('10245'));
    });

    it('без секрета ни адресов, ни проверки', async () => {
        const { service } = harness({});
        const lead = buildCallPageLeadToken(SECRET, payloadOf());

        expect(
            await service.urlsFor(
                DOMAIN,
                ['10245'],
                { userId: '447', role: 'leader' },
                NOW_MS,
            ),
        ).toEqual(new Map());
        expect(service.verify(callTokenOf('10245'), lead, NOW_MS)).toEqual({
            status: 'invalid',
        });
    });
});
