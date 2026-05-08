export const toggleDarkMode=(enabled)=>{
document.documentElement.setAttribute('data-theme',enabled?'dark':'light');
};
