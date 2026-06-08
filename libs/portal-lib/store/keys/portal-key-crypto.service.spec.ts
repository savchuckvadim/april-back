import { PortalKeyCryptoService } from './portal-key-crypto.service';

describe('PortalKeyCryptoService', () => {
    let service: PortalKeyCryptoService;
    const originalSecret = process.env.APP_SECRET_KEY;

    beforeEach(() => {
        process.env.APP_SECRET_KEY = 'test-secret-key';
        service = new PortalKeyCryptoService();
    });

    afterAll(() => {
        process.env.APP_SECRET_KEY = originalSecret;
    });

    it('расшифровывает то, что зашифровал (round-trip)', () => {
        const plain = 'sk_live_super_secret_value';
        const encrypted = service.encrypt(plain);

        expect(encrypted).not.toContain(plain);
        expect(service.decrypt(encrypted)).toBe(plain);
    });

    it('даёт разный шифртекст для одного значения (случайный IV)', () => {
        const plain = 'same-value';
        const a = service.encrypt(plain);
        const b = service.encrypt(plain);

        expect(a).not.toBe(b);
        expect(service.decrypt(a)).toBe(plain);
        expect(service.decrypt(b)).toBe(plain);
    });

    it('корректно обрабатывает пустую строку и unicode', () => {
        for (const plain of ['', 'ключ-钥匙-🔑']) {
            expect(service.decrypt(service.encrypt(plain))).toBe(plain);
        }
    });

    it('бросает ошибку на некорректном формате payload', () => {
        expect(() => service.decrypt('no-colon-here')).toThrow();
    });

    it('не расшифровывает значение, зашифрованное другим секретом', () => {
        const encrypted = service.encrypt('value');

        process.env.APP_SECRET_KEY = 'another-secret';
        const other = new PortalKeyCryptoService();

        expect(() => other.decrypt(encrypted)).toThrow();
    });
});
