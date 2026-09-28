/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./templates/**/*.html",
        "./static/**/*.js",
    ],
    theme: {
        extend: {
            colors: {
                brand: { 50: '#EEF2FF', 100: '#E0E7FF', 500: '#4F46E5', 600: '#4338CA', 700: '#3730A3' }
            },
            fontFamily: {
                sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif']
            }
        }
    },
    plugins: [
        require('@tailwindcss/forms'),
        require('@tailwindcss/container-queries'),
    ]
};