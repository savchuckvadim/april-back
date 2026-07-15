import { renderInstallFinishPage } from '../lib/install-finish-page.util';

describe('renderInstallFinishPage (HTML-финал установки с origin карточки)', () => {
    it('success: подключает классический BX24.js и вызывает installFinish', () => {
        const html = renderInstallFinishPage({
            status: 'success',
            domain: 'april-dev.bitrix24.ru',
        });
        expect(html).toContain('api.bitrix24.tech/api/v1/');
        expect(html).toContain('BX24.installFinish()');
        expect(html).toContain('april-dev.bitrix24.ru');
    });

    it('fail: installFinish НЕ вызывается (провал нельзя финализировать)', () => {
        const html = renderInstallFinishPage({
            status: 'fail',
            domain: 'april-dev.bitrix24.ru',
            message: 'db down',
        });
        expect(html).not.toContain('installFinish');
        expect(html).toContain('Установка не удалась');
        expect(html).toContain('db down');
    });

    it('экранирует html в подставляемых значениях', () => {
        const html = renderInstallFinishPage({
            status: 'fail',
            domain: '<script>alert(1)</script>',
        });
        expect(html).not.toContain('<script>alert(1)</script>');
        expect(html).toContain('&lt;script&gt;');
    });
});
