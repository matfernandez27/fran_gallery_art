/** Configuración de Tailwind (se compila con `npm run build:css`). */
module.exports = {
    content: ['./*.html', './js/**/*.js'],
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
            },
            fontFamily: {
                display: ['"Playfair Display"', 'Georgia', 'serif'],
                sans: ['Inter', 'system-ui', 'sans-serif'],
            },
        },
    },
};
