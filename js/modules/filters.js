export const filterByGroup=(contacts,group)=>{
if(group==='all') return contacts;
return contacts.filter(c=>c.dependencia.toLowerCase().includes(group));
};
