export const saveTheme=theme=>localStorage.setItem('theme',theme);
export const getTheme=()=>localStorage.getItem('theme')||'light';
