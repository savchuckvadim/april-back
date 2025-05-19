export function renderTemplateHtml(data: any, css: string): string {
    return `
      <html>
        <head>
          <style>${css}</style>
        </head>
        <body class="font-sans p-10 bg-background text-foreground">
          <h1 class="text-3xl font-bold mb-4 text-primary">${data.title}</h1>
          <p class="text-muted">${data.description}</p>
        </body>
      </html>
    `;
  }
  