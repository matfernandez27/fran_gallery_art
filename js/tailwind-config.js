// Tokens de diseño compartidos por todas las páginas (se carga justo después de Tailwind CDN).
tailwind.config = {
    theme: {
        extend: {
            colors: {
                paper: '#faf9f7',
                surface: '#ffffff',
                ink: '#14151a',
                muted: '#4f5766',
                line: '#e4e1da',
                accent: { DEFAULT: '#2563eb', dark: '#1d4ed8', soft: '#eff4ff' },
                ok: '#15803d',
                whatsapp: '#25D366',
            },
            fontFamily: {
                display: ['"Playfair Display"', 'Georgia', 'serif'],
                sans: ['Inter', 'system-ui', 'sans-serif'],
            },
        },
    },
};
