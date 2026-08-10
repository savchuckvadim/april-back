import { lookup } from 'dns/promises';
import { LibreOfficeEndpointResolver } from '../services/libre-office-endpoint-resolver.service';
import { libreOfficeConfig } from './libre-office.fixtures';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));

const lookupMock = lookup as unknown as jest.Mock;

function addresses(...ips: string[]): { address: string; family: number }[] {
    return ips.map(address => ({ address, family: 4 }));
}

describe('LibreOfficeEndpointResolver', () => {
    beforeEach(() => {
        lookupMock.mockReset();
    });

    it('в режиме static отдаёт список из env и не трогает DNS', async () => {
        const resolver = new LibreOfficeEndpointResolver(
            libreOfficeConfig({ discovery: 'static' }),
        );

        await expect(resolver.resolve()).resolves.toEqual([
            'http://a:3000',
            'http://b:3000',
        ]);
        expect(lookupMock).not.toHaveBeenCalled();
    });

    it('в режиме dns разворачивает имя сервиса во все реплики', async () => {
        lookupMock.mockResolvedValue(
            addresses('172.20.0.4', '172.20.0.5', '172.20.0.6'),
        );
        const resolver = new LibreOfficeEndpointResolver(
            libreOfficeConfig({
                discovery: 'dns',
                endpoints: ['http://gotenberg:3000'],
            }),
        );

        await expect(resolver.resolve()).resolves.toEqual([
            'http://172.20.0.4:3000',
            'http://172.20.0.5:3000',
            'http://172.20.0.6:3000',
        ]);
        expect(lookupMock).toHaveBeenCalledWith('gotenberg', {
            all: true,
            family: 4,
        });
    });

    it('сохраняет схему и нестандартный порт', async () => {
        lookupMock.mockResolvedValue(addresses('10.0.0.1'));
        const resolver = new LibreOfficeEndpointResolver(
            libreOfficeConfig({
                discovery: 'dns',
                endpoints: ['https://converter:8443'],
            }),
        );

        await expect(resolver.resolve()).resolves.toEqual([
            'https://10.0.0.1:8443',
        ]);
    });

    it('склеивает адреса нескольких хостов без дублей', async () => {
        lookupMock
            .mockResolvedValueOnce(addresses('10.0.0.1', '10.0.0.2'))
            .mockResolvedValueOnce(addresses('10.0.0.2', '10.0.0.3'));
        const resolver = new LibreOfficeEndpointResolver(
            libreOfficeConfig({
                discovery: 'dns',
                endpoints: ['http://one:3000', 'http://two:3000'],
            }),
        );

        await expect(resolver.resolve()).resolves.toEqual([
            'http://10.0.0.1:3000',
            'http://10.0.0.2:3000',
            'http://10.0.0.3:3000',
        ]);
    });

    it('при недоступном DNS оставляет исходный URL, а не падает', async () => {
        lookupMock.mockRejectedValue(new Error('EAI_AGAIN'));
        const resolver = new LibreOfficeEndpointResolver(
            libreOfficeConfig({
                discovery: 'dns',
                endpoints: ['http://gotenberg:3000'],
            }),
        );

        await expect(resolver.resolve()).resolves.toEqual([
            'http://gotenberg:3000',
        ]);
    });

    it('пустой ответ DNS не выкидывает инстанс из пула', async () => {
        lookupMock.mockResolvedValue([]);
        const resolver = new LibreOfficeEndpointResolver(
            libreOfficeConfig({
                discovery: 'dns',
                endpoints: ['http://gotenberg:3000'],
            }),
        );

        await expect(resolver.resolve()).resolves.toEqual([
            'http://gotenberg:3000',
        ]);
    });

    it('падает, если разрешать вообще нечего', async () => {
        const resolver = new LibreOfficeEndpointResolver(
            libreOfficeConfig({
                discovery: 'dns',
                endpoints: ['не-url'],
            }),
        );

        await expect(resolver.resolve()).rejects.toThrow(
            /Ни один хост не разрешился/,
        );
    });
});
