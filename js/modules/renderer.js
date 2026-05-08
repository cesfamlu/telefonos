const groupIcons = {
  salud: 'local_hospital',
  muni:  'account_balance',
  daem:  'school'
};

export const renderContacts = ({ container, contacts }) => {
  container.innerHTML = '';

  contacts.forEach(contact => {
    const icon = groupIcons[contact.dependencia] || 'person';
    const card = document.createElement('article');
    card.className = 'contact-card';
    card.innerHTML = `
      <div class="card-header">
        <div class="card-avatar">
          <i class="material-icons-round">${icon}</i>
        </div>
        <div>
          <div class="card-title">${contact.nombre}</div>
          <div class="card-subtitle">${contact.categoria}</div>
        </div>
      </div>
      <div class="card-body">
        <div class="card-row">
          <i class="material-icons-round">call</i>
          <span><strong>Anexo ${contact.anexo}</strong> — ${contact.telefono}</span>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
};
