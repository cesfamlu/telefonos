export const searchContacts=(contacts,query)=>{
if(!query)return contacts;
return contacts.filter(contact=>
JSON.stringify(contact).toLowerCase().includes(query.toLowerCase())
);
};
