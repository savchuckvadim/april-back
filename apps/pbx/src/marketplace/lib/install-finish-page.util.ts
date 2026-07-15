/**
 * HTML-страница завершения установки, отдаётся ПРЯМО с этого API
 * (классический паттерн install.php).
 *
 * Почему не redirect на фронт: родительское окно Битрикса отвечает на
 * postMessage-рукопожатие только iframe'у с origin ЗАРЕГИСТРИРОВАННОГО
 * URL приложения (домен карточки = api.pbx...). После кросс-доменного
 * 302 на фронт ответы родителя не доставляются браузером → «Битрикс24
 * не ответил за 10с» (проверено живым тестом 2026-07-14; b24jssdk
 * v0.1.7/v2.0.0 читают window.name, т.е. потеря query-параметров
 * причиной НЕ была). Классический BX24.js читает window.name и работает
 * с того же origin — installFinish() проходит.
 */

export interface InstallFinishPageParams {
    status: 'success' | 'fail';
    domain?: string;
    memberId?: string;
    message?: string;
}

function esc(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export function renderInstallFinishPage(
    params: InstallFinishPageParams,
): string {
    const domain = params.domain ? esc(params.domain) : '';
    const isSuccess = params.status === 'success';

    const body = isSuccess
        ? `
    <div id="state">
        <p class="title">⏳ Завершение установки…</p>
        <p class="hint">${domain ? `Портал: ${domain}` : ''}</p>
    </div>
    <script src="https://api.bitrix24.tech/api/v1/"></script>
    <script>
        (function () {
            var done = false;
            function show(title, hint, ok) {
                var el = document.getElementById('state');
                el.innerHTML = '<p class="title ' + (ok ? 'ok' : 'err') + '">'
                    + title + '</p><p class="hint">' + hint + '</p>';
            }
            function finish() {
                if (done) return;
                done = true;
                try {
                    BX24.installFinish();
                    show('✅ Установка завершена', 'Приложение «Менеджер Гарант» готово к работе. Это окно можно закрыть.', true);
                } catch (e) {
                    show('❌ Ошибка завершения установки', String(e), false);
                }
            }
            if (typeof BX24 !== 'undefined') {
                BX24.init(finish);
                // страховка: если init-callback не пришёл, финализируем сами
                setTimeout(finish, 3000);
            } else {
                show('❌ Не удалось загрузить BX24.js',
                    'Откройте страницу внутри портала Битрикс24 и повторите установку.', false);
            }
        })();
    </script>`
        : `
    <div id="state">
        <p class="title err">❌ Установка не удалась</p>
        <p class="hint">Не удалось сохранить установку приложения${domain ? ` для портала ${domain}` : ''}.
        ${params.message ? esc(params.message) : ''}
        Попробуйте установить приложение ещё раз или свяжитесь с поддержкой.</p>
    </div>`;

    return `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Менеджер Гарант — установка</title>
    <style>
        body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif;
               display: flex; align-items: center; justify-content: center;
               min-height: 90vh; margin: 0; background: #f8fafc; color: #0f172a; }
        .title { font-size: 20px; font-weight: 600; margin: 0 0 8px; }
        .title.ok { color: #16a34a; }
        .title.err { color: #dc2626; }
        .hint { color: #64748b; font-size: 14px; max-width: 480px; margin: 0; }
        #state { text-align: center; padding: 24px; }
    </style>
</head>
<body>${body}
</body>
</html>`;
}
