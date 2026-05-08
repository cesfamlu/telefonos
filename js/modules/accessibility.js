export const initializeAccessibility=()=>{
document.addEventListener('keydown',event=>{
if(event.key==='/'){
event.preventDefault();
document.getElementById('searchInput').focus();
}
});
};
