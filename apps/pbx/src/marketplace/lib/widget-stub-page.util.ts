/**
 * Same-origin HTML-заглушка виджета «Приложение пока не готово».
 *
 * Отдаётся роутером placement'ов ВМЕСТО redirect на фронт виджета, пока
 * pbx-сущности продукта не установлены (readiness-гейт по статусам
 * marketplace_install_components), а также для blocked/удалённых порталов.
 * Паттерн same-origin HTML — как у install-finish-page (страница живёт
 * на зарегистрированном домене api.pbx, iframe Битрикса её принимает).
 */

export interface WidgetStubPageParams {
    /** Заголовок состояния */
    title: string;
    /** Пояснение пользователю */
    message: string;
    /** Показывать ли кнопку «Проверить снова» (reload iframe) */
    showRetry?: boolean;
}

function esc(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export function renderWidgetStubPage(params: WidgetStubPageParams): string {
    const retryButton = params.showRetry
        ? `<button class="retry" onclick="location.reload()">Проверить снова</button>`
        : '';
    return `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Менеджер Гарант</title>
    <style>
        body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif;
               display: flex; align-items: center; justify-content: center;
               min-height: 90vh; margin: 0; background: #f8f9fb; color: #333; }
        .card { text-align: center; max-width: 440px; padding: 32px; }
        .icon { font-size: 44px; margin-bottom: 12px; }
        .title { font-size: 18px; font-weight: 600; margin: 0 0 8px; }
        .hint { font-size: 14px; color: #6b7280; line-height: 1.5; margin: 0 0 20px; }
        .retry { border: 1px solid #d1d5db; background: #fff; color: #374151;
                 border-radius: 8px; padding: 8px 20px; font-size: 14px;
                 cursor: pointer; }
        .retry:hover { background: #f3f4f6; }
    </style>
</head>
<body>
    <div class="card">
        <div class="icon">🛠️</div>
        <p class="title">${esc(params.title)}</p>
        <p class="hint">${esc(params.message)}</p>
        ${retryButton}
    </div>
</body>
</html>`;
}
