const vscode = require('vscode');
const https = require('https');

let currentPreviewPanel = null;

function activate(context) {
    console.log('Video Embedder активирован');

    // Команда для вставки видео по ссылке
    let insertVideoCommand = vscode.commands.registerCommand('video-embedder.insertVideo', async function () {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('Нет активного редактора');
            return;
        }

        const videoUrl = await vscode.window.showInputBox({
            prompt: 'Введите ссылку на видео (YouTube, Rutube, Vimeo и др.)',
            placeHolder: 'https://rutube.ru/video/... или https://youtube.com/watch?v=...'
        });

        if (!videoUrl) return;

        await insertVideo(editor, videoUrl);
    });

    // Команда для вставки видео из буфера обмена
    let insertFromClipboardCommand = vscode.commands.registerCommand('video-embedder.insertVideoFromClipboard', async function () {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('Нет активного редактора');
            return;
        }

        try {
            const clipboardText = await vscode.env.clipboard.readText();
            if (!clipboardText) {
                vscode.window.showErrorMessage('Буфер обмена пуст');
                return;
            }

            await insertVideo(editor, clipboardText);
        } catch (error) {
            vscode.window.showErrorMessage('Ошибка чтения буфера обмена');
        }
    });

    // Команда для предпросмотра всех видео в файле
    let previewVideoCommand = vscode.commands.registerCommand('video-embedder.previewVideo', function () {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('Нет активного редактора');
            return;
        }

        const text = editor.document.getText();
        const videos = extractVideoEmbeds(text);
        
        if (videos.length === 0) {
            vscode.window.showInformationMessage('В файле не найдено видео');
            return;
        }

        showVideoPreview(videos, `Видео в файле: ${videos.length} шт`);
    });

    context.subscriptions.push(
        insertVideoCommand, 
        insertFromClipboardCommand, 
        previewVideoCommand
    );
}

async function insertVideo(editor, videoUrl) {
    try {
        const videoInfo = extractVideoInfo(videoUrl);
        if (!videoInfo) {
            vscode.window.showErrorMessage('Не удалось распознать ссылку на видео');
            return;
        }

        const embedCode = generateEmbedCode(videoInfo);

        await editor.edit(editBuilder => {
            const position = editor.selection.active;
            editBuilder.insert(position, embedCode);
        });

        vscode.window.showInformationMessage(`Видео ${videoInfo.platform} вставлено!`);
    } catch (error) {
        vscode.window.showErrorMessage('Ошибка при вставке видео: ' + error.message);
    }
}

function extractVideoInfo(url) {
    // YouTube
    let match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?#]+)/);
    if (match && match[1]) {
        return { 
            platform: 'youtube', 
            id: match[1],
            embedUrl: `https://www.youtube.com/embed/${match[1]}`,
            originalUrl: url
        };
    }
    
    // Rutube
    match = url.match(/rutube\.ru\/video\/([a-f0-9]+)/);
    if (match && match[1]) {
        return { 
            platform: 'rutube', 
            id: match[1],
            embedUrl: `https://rutube.ru/play/embed/${match[1]}`,
            originalUrl: url
        };
    }

    return null;
}

function generateEmbedCode(videoInfo) {
    if (videoInfo.platform === 'rutube') {
        return `<!-- RUTUBE_VIDEO:${videoInfo.id} -->
<div class="rutube-video" data-video-id="${videoInfo.id}" data-url="${videoInfo.originalUrl}">
    <a href="${videoInfo.originalUrl}" target="_blank">Rutube видео: ${videoInfo.id}</a>
</div>
`;
    } else {
        return `<iframe width="560" height="315" src="${videoInfo.embedUrl}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>\n`;
    }
}

function extractVideoEmbeds(text) {
    const videos = [];

    // Поиск YouTube iframe
    const youtubeIframeRegex = /<iframe[^>]*src="https:\/\/www\.youtube\.com\/embed\/([^"]+)"[^>]*><\/iframe>/g;
    let match;
    while ((match = youtubeIframeRegex.exec(text)) !== null) {
        videos.push({
            platform: 'youtube',
            id: match[1],
            embedUrl: `https://www.youtube.com/embed/${match[1]}`,
            type: 'iframe'
        });
    }

    // Поиск Rutube видео
    const rutubeRegex = /<!-- RUTUBE_VIDEO:([a-f0-9]+) -->/g;
    while ((match = rutubeRegex.exec(text)) !== null) {
        videos.push({
            platform: 'rutube',
            id: match[1],
            embedUrl: `https://rutube.ru/play/embed/${match[1]}`,
            type: 'rutube',
            originalUrl: `https://rutube.ru/video/${match[1]}/`
        });
    }

    return videos;
}

function showVideoPreview(videos, title) {
    if (currentPreviewPanel) {
        currentPreviewPanel.dispose();
    }

    currentPreviewPanel = vscode.window.createWebviewPanel(
        'videoPreview',
        title,
        vscode.ViewColumn.Two,
        {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: []
        }
    );

    const videoHtml = videos.map((video, index) => {
        if (video.platform === 'rutube') {
            // Для Rutube используем превью + ссылку
            return `
                <div class="video-container rutube-container">
                    <h3>🎥 Видео ${index + 1} - Rutube</h3>
                    
                    <div class="video-preview">
                        <div class="preview-image">
                            <img src="https://rutube.ru/api/video/${video.id}/thumbnail/" 
                                 alt="Превью видео Rutube" 
                                 onerror="this.style.display='none'">
                        </div>
                        
                        <div class="video-info">
                            <strong>Платформа:</strong> Rutube<br>
                            <strong>ID видео:</strong> ${video.id}<br>
                            <strong>Статус:</strong> <span class="warning">Требуется открыть в браузере</span>
                        </div>
                        
                        <div class="video-actions">
                            <a href="https://rutube.ru/video/${video.id}/" 
                               target="_blank" 
                               class="action-button">
                                📺 Открыть на Rutube
                            </a>
                            <button onclick="copyUrl('https://rutube.ru/video/${video.id}/')" 
                                    class="action-button secondary">
                                📋 Скопировать ссылку
                            </button>
                        </div>
                        
                        <div class="technical-info">
                            <details>
                                <summary>Техническая информация</summary>
                                <small>
                                    Rutube блокирует встраивание в iframe из соображений безопасности.<br>
                                    Для просмотра необходимо открыть видео в браузере.
                                </small>
                            </details>
                        </div>
                    </div>
                </div>
                <hr>
            `;
        } else {
            // Для YouTube - обычный iframe
            return `
                <div class="video-container">
                    <h3>🎥 Видео ${index + 1} - YouTube</h3>
                    <iframe 
                        src="${video.embedUrl}" 
                        width="100%" 
                        height="400" 
                        frameborder="0" 
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                        allowfullscreen>
                    </iframe>
                    <div class="video-info">
                        <strong>Платформа:</strong> YouTube<br>
                        <strong>ID видео:</strong> ${video.id}
                    </div>
                </div>
                <hr>
            `;
        }
    }).join('');

    currentPreviewPanel.webview.html = `
        <!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${title}</title>
            <style>
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    margin: 20px;
                    background: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                    line-height: 1.6;
                }
                .video-container {
                    background: var(--vscode-panel-background);
                    padding: 20px;
                    margin: 20px 0;
                    border-radius: 8px;
                    border: 1px solid var(--vscode-panel-border);
                }
                .video-container h3 {
                    margin-top: 0;
                    color: var(--vscode-textLink-foreground);
                    border-bottom: 2px solid var(--vscode-textLink-foreground);
                    padding-bottom: 10px;
                }
                iframe {
                    border: none;
                    border-radius: 8px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                    background: #000;
                }
                .video-info {
                    margin-top: 15px;
                    padding: 15px;
                    background: var(--vscode-input-background);
                    border-radius: 6px;
                    font-size: 14px;
                }
                .video-info strong {
                    color: var(--vscode-textLink-foreground);
                }
                .warning {
                    color: var(--vscode-inputValidation-warningBorder);
                    font-weight: bold;
                }
                .video-actions {
                    margin: 15px 0;
                    display: flex;
                    gap: 10px;
                    flex-wrap: wrap;
                }
                .action-button {
                    padding: 10px 15px;
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    border-radius: 4px;
                    text-decoration: none;
                    cursor: pointer;
                    font-size: 14px;
                    display: inline-block;
                }
                .action-button:hover {
                    background: var(--vscode-button-hoverBackground);
                }
                .action-button.secondary {
                    background: var(--vscode-secondaryButton-background);
                }
                .preview-image {
                    text-align: center;
                    margin: 15px 0;
                }
                .preview-image img {
                    max-width: 100%;
                    max-height: 200px;
                    border-radius: 6px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                }
                .technical-info {
                    margin-top: 15px;
                    padding: 10px;
                    background: var(--vscode-inputValidation-infoBackground);
                    border-radius: 4px;
                    font-size: 12px;
                }
                details {
                    margin: 10px 0;
                }
                summary {
                    cursor: pointer;
                    font-weight: bold;
                }
                hr {
                    border: none;
                    border-top: 2px dashed var(--vscode-panel-border);
                    margin: 30px 0;
                }
                .header {
                    text-align: center;
                    margin-bottom: 30px;
                    padding: 20px;
                    background: var(--vscode-badge-background);
                    border-radius: 8px;
                    color: var(--vscode-badge-foreground);
                }
                .count-badge {
                    background: var(--vscode-textLink-foreground);
                    color: white;
                    padding: 4px 12px;
                    border-radius: 20px;
                    font-weight: bold;
                    margin-left: 10px;
                }
                .platform-badge {
                    display: inline-block;
                    padding: 2px 8px;
                    background: var(--vscode-badge-background);
                    color: var(--vscode-badge-foreground);
                    border-radius: 12px;
                    font-size: 12px;
                    margin-left: 10px;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>🎥 ${title} <span class="count-badge">${videos.length}</span></h1>
                <p>
                    ${videos.filter(v => v.platform === 'youtube').length} YouTube • 
                    ${videos.filter(v => v.platform === 'rutube').length} Rutube
                </p>
                <small>YouTube видео работают напрямую, Rutube требует открытия в браузере</small>
            </div>
            ${videoHtml}
            
            <script>
                function copyUrl(url) {
                    // Копирование в буфер обмена через VS Code API
                    const vscode = acquireVsCodeApi();
                    navigator.clipboard.writeText(url).then(() => {
                        // Можно показать уведомление через VS Code
                        console.log('Ссылка скопирована: ' + url);
                    });
                }
                
                // Показываем превью для Rutube
                document.querySelectorAll('.preview-image img').forEach(img => {
                    img.onerror = function() {
                        this.parentElement.innerHTML = 
                            '<div style="padding: 20px; text-align: center; color: var(--vscode-descriptionForeground);">' +
                            '🚫 Превью недоступно</div>';
                    };
                });
            </script>
            
            <div style="text-align: center; margin-top: 40px; color: var(--vscode-descriptionForeground);">
                <small>Video Embedder • YouTube: встроенный плеер • Rutube: ссылки для браузера</small>
            </div>
        </body>
        </html>
    `;

    currentPreviewPanel.onDidDispose(() => {
        currentPreviewPanel = null;
    }, null, context.subscriptions);
}

function deactivate() {
    if (currentPreviewPanel) {
        currentPreviewPanel.dispose();
    }
}

module.exports = {
    activate,
    deactivate
};