/* =========================
   CONFIGURATION ET INITIALISATION
   ========================= */

// Configuration Supabase
const SUPABASE_URL = 'https://upfelrrjmrabqiocoqls.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVwZmVscnJqbXJhYnFpb2NvcWxzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA0MTM4OTMsImV4cCI6MjA3NTk4OTg5M30.bPtAPTWaiD3kSFG-XKkVHCKf7HaApTrfMCX6OuMTwTg';

// Initialisation Supabase
let supabase;
try {
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  console.log('Supabase initialisé avec succès');
} catch (error) {
  console.error('Erreur initialisation Supabase:', error);
  supabase = {
    from: () => ({
      select: () => Promise.resolve({data: [], error: null}),
      insert: () => Promise.resolve({error: null}),
      update: () => Promise.resolve({error: null}),
      delete: () => Promise.resolve({error: null})
    })
  };
}

/* =========================
   VARIABLES GLOBALES ET CONSTANTES
   ========================= */

// État global
let currentUser = null;
let clients = [];
let declarationTypes = [];
let clientDeclarations = [];
let echeances = [];
let allUsers = [];
let activityLogs = [];
let codesData = [];
let situationGlobaleData = [];

// Honoraire
let honosClientId = null;
let honosExercice = new Date().getFullYear().toString();
let honosFactu = [];
let honosPay = [];

// Codes
let currentSelectedClientId = null;
let isEditMode = false;

/* =========================
   FONCTIONS D'AUTHENTIFICATION
   ========================= */

document.addEventListener('DOMContentLoaded', () => {
  const savedUser = localStorage.getItem('currentUser');
  if (savedUser) {
    currentUser = JSON.parse(savedUser);
    showApp();
  } else {
    showLogin();
  }

  const form = document.getElementById('loginForm');
  if (form) {
    form.addEventListener('submit', handleLogin);
  }
});

function showLogin() {
  const login = document.getElementById('loginPage');
  const app = document.getElementById('app');
  if (login) login.style.display = 'flex';
  if (app) app.style.display = 'none';
}

function showApp() {
  const login = document.getElementById('loginPage');
  const app = document.getElementById('app');
  if (login) login.style.display = 'none';
  if (app) app.style.display = 'flex';
  
  initializeApp();
}

async function handleLogin(e) {
  e.preventDefault();

  const btn = document.querySelector('.login-btn');
  const original = btn ? btn.innerHTML : null;
  if (btn) { 
    btn.disabled = true; 
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Connexion…'; 
  }

  try {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    console.log('🔐 Tentative de connexion:', email);
    
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .eq('is_active', true)
      .single();
    
    if (error) throw new Error('Identifiants incorrects ou compte inactif');
    if (!user) throw new Error('Aucun utilisateur trouvé avec cet email');
    
    const inputPasswordHash = btoa(password);
    if (inputPasswordHash !== user.password_hash) {
      throw new Error('Mot de passe incorrect');
    }
    
    currentUser = {
      id: user.id,
      email: user.email,
      nom_complet: user.nom_complet,
      role: user.role
    };

    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    
    await logUserActivity('connexion', 'login', {
      user_agent: navigator.userAgent
    });
    
    await updateLastLogin(user.id);
    
    console.log('✅ Connexion réussie, redirection...');
    showApp();

  } catch (err) {
    console.error('❌ Erreur connexion:', err);
    alert('Erreur de connexion: ' + err.message);
  } finally {
    if (btn && original) { 
      btn.disabled = false; 
      btn.innerHTML = original; 
    }
  }
}

function checkPageAccess(page) {
  const pagesAdminOnly = ['gestion-utilisateurs', 'situation-globale'];
  
  if (pagesAdminOnly.includes(page) && currentUser && currentUser.role !== 'admin') {
    alert('⛔ Accès non autorisé. Cette page est réservée aux administrateurs.');
    
    document.querySelectorAll('.nav-link').forEach(link => {
      if (link.getAttribute('data-page') === 'dashboard') {
        navigateToPage(link);
      }
    });
    
    return false;
  }
  
  return true;
}

/* =========================
   FONCTIONS DU TABLEAU DE BORD
   ========================= */

async function loadDashboardData() {
  try {
    console.log('📊 Début du chargement du tableau de bord...');

    const { data: clientsData, error: clientsError } = await supabase
      .from('clients')
      .select('id, nom_raison_sociale, statut');

    if (clientsError) throw clientsError;

    const clientsActifsList = (clientsData || []).filter(c => c.statut !== 'archive');
    const idsClientsActifs = new Set(clientsActifsList.map(c => c.id));
    const clientsActifsCount = idsClientsActifs.size;

    const aujourdhui = toYMDLocal(new Date());
    const { data: tardivesNull, error: e1 } = await supabase
      .from('echeances')
      .select('client_id')
      .lt('date_fin', aujourdhui)
      .is('statut_manuel', null);

    const { data: tardivesNotOk, error: e2 } = await supabase
      .from('echeances')
      .select('client_id')
      .lt('date_fin', aujourdhui)
      .not('statut_manuel', 'in', '("deposee","payee")');

    const clientsAvecRetard = new Set(
      [...(tardivesNull || []), ...(tardivesNotOk || [])]
        .map(r => r.client_id)
        .filter(id => idsClientsActifs.has(id))
    );

    let clientsAJour = clientsActifsCount - clientsAvecRetard.size;
    if (clientsAJour < 0) clientsAJour = 0;

    const maintenant = new Date();
    const debutMois = new Date(maintenant.getFullYear(), maintenant.getMonth(), 1);
    const finMois = new Date(maintenant.getFullYear(), maintenant.getMonth() + 1, 0);
    const debutMoisStr = toYMDLocal(debutMois);
    const finMoisStr = toYMDLocal(finMois);

    const { data: declarationsMois, error: declMoisError } = await supabase
      .from('echeances')
      .select('id, statut_manuel')
      .lte('date_debut', finMoisStr)
      .gte('date_fin', debutMoisStr);

    if (declMoisError) throw declMoisError;

    const totalDeclarationsMois = declarationsMois?.length || 0;
    const declarationsDeposees = declarationsMois?.filter(d => d.statut_manuel === 'deposee' || d.statut_manuel === 'payee').length || 0;
    const declarationsRestantes = declarationsMois?.filter(d => d.statut_manuel === 'en_cours' || d.statut_manuel === null).length || 0;

    const debutAnnee = new Date(maintenant.getFullYear(), 0, 1);
    const debutAnneeStr = toYMDLocal(debutAnnee);

    const { data: toutesDeclarationsAnnee, error: declAnneeError } = await supabase
      .from('echeances')
      .select('id, statut_manuel, date_fin, nom_echeance')
      .gte('date_fin', debutAnneeStr)
      .lt('date_fin', aujourdhui);

    if (declAnneeError) throw declAnneeError;

    const declarationsTardives = (toutesDeclarationsAnnee || []).filter(d => {
      const estDeposee = d.statut_manuel === 'deposee' || d.statut_manuel === 'payee';
      return !estDeposee;
    });

    const totalTardivesAnnee = declarationsTardives.length;

    let clientsIncomplets = 0;
    try {
      const anneeEnCours = maintenant.getFullYear();
      const { data: clientsAvecDeclarations, error: declError } = await supabase
        .from('client_declarations')
        .select('client_id')
        .eq('annee_comptable', anneeEnCours);

      if (!declError) {
        const setActifsAvecDecl = new Set(
          (clientsAvecDeclarations || []).map(d => d.client_id).filter(id => idsClientsActifs.has(id))
        );
        clientsIncomplets = clientsActifsCount - setActifsAvecDecl.size;
        if (clientsIncomplets < 0) clientsIncomplets = 0;
      }
    } catch (error) {
      clientsIncomplets = 0;
    }

    updateDashboardDisplay({
      clientsActifs: clientsActifsCount,
      clientsAJour,
      totalDeclarationsMois,
      declarationsDeposees,
      declarationsRestantes,
      totalTardivesAnnee,
      clientsIncomplets
    });

    console.log('✅ Tableau de bord chargé avec succès!');
  } catch (error) {
    console.error('❌ ERREUR CRITIQUE dashboard:', error);
    showDashboardError();
  }
}

function updateDashboardDisplay(metrics) {
  console.log('📊 Mise à jour de l\'affichage avec:', metrics);
  
  try {
    if (document.getElementById('totalClients')) {
      document.getElementById('totalClients').textContent = metrics.clientsActifs;
    }
    
    if (document.getElementById('clientsAJour')) {
      document.getElementById('clientsAJour').textContent = metrics.clientsAJour;
    }
    
    if (document.getElementById('totalDeclarationsMois')) {
      document.getElementById('totalDeclarationsMois').textContent = metrics.totalDeclarationsMois;
    }
    
    if (document.getElementById('declarationsDeposees')) {
      document.getElementById('declarationsDeposees').textContent = metrics.declarationsDeposees;
    }
    
    if (document.getElementById('declarationsRestantes')) {
      document.getElementById('declarationsRestantes').textContent = metrics.declarationsRestantes;
    }
    
    if (document.getElementById('tardivesAnnee')) {
      document.getElementById('tardivesAnnee').textContent = metrics.totalTardivesAnnee;
    }

    showClientsIncompletsAlert(metrics.clientsIncomplets);
    
    console.log('✅ Affichage mis à jour avec succès');
  } catch (error) {
    console.error('❌ Erreur mise à jour affichage:', error);
  }
}

function showClientsIncompletsAlert(nombreClients) {
  if (nombreClients === 0) {
    const existingAlert = document.querySelector('.clients-incomplets-alert');
    if (existingAlert) existingAlert.remove();
    return;
  }

  const alertHTML = `
    <div class="clients-incomplets-alert" style="
      background: #fff3cd;
      border: 1px solid #ffeaa7;
      border-left: 4px solid var(--warning-color);
      border-radius: 8px;
      padding: 1rem 1.5rem;
      margin-bottom: 1.5rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    ">
      <div>
        <h4 style="color: var(--warning-color); margin: 0 0 0.25rem 0;">
          <i class="fas fa-exclamation-triangle"></i>
          Configuration requise
        </h4>
        <p style="margin: 0; color: var(--text-secondary);">
          ${nombreClients} client(s) sans déclarations affectées pour ${new Date().getFullYear()}
        </p>
      </div>
      <button class="btn-warning" onclick="openDeclarationsPage()" style="white-space: nowrap;">
        <i class="fas fa-cog"></i> Configurer
      </button>
    </div>
  `;

  const progressSection = document.querySelector('.progress-section');
  if (progressSection) {
    const existingAlert = document.querySelector('.clients-incomplets-alert');
    if (existingAlert) existingAlert.remove();
    progressSection.insertAdjacentHTML('afterend', alertHTML);
  }
}

function openDeclarationsPage() {
  console.log('🔗 Navigation vers la page déclarations...');
  
  const declarationsLink = document.querySelector('[data-page="declarations"]');
  if (declarationsLink) {
    declarationsLink.click();
    
    setTimeout(() => {
      const affectationTab = document.querySelector('[data-tab="affectation"]');
      if (affectationTab) {
        affectationTab.click();
        console.log('✅ Onglet affectation ouvert');
      }
    }, 500);
  }
}

function showDashboardError() {
  const statsGrid = document.querySelector('.stats-grid');
  if (statsGrid) {
    statsGrid.innerHTML = `
      <div class="error-state" style="grid-column: 1 / -1; text-align: center; padding: 2rem;">
        <i class="fas fa-exclamation-triangle" style="font-size: 2rem; color: var(--error-color); margin-bottom: 1rem;"></i>
        <h3>Erreur de chargement</h3>
        <p>Impossible de charger les données du tableau de bord</p>
        <button class="btn-primary" onclick="loadDashboardData()" style="margin-top: 1rem;">
          <i class="fas fa-redo"></i> Réessayer
        </button>
      </div>
    `;
  }
}

/* =========================
   FONCTIONS GESTION CLIENTS
   ========================= */

async function loadClients(){
  try{
    console.log('Chargement des clients...');
    const {data, error} = await supabase.from('clients').select('*').order('nom_raison_sociale');
    if(error) throw error;
    
    clients = data || [];
    console.log(`${clients.length} clients chargés`);
    
    setupClientsTabs();
    setupAddClientForm();
    setupEditClientForm();
    setupClientsSearch();
    displayClients();
    updateClientSelection();
    updateFiltreClient();
    fillHonorairesClients();
    
  } catch(e) {
    console.error('Erreur chargement clients:', e);
    document.getElementById('clientsTableBody').innerHTML = '<tr><td colspan="5" class="no-data">Erreur de chargement</td></tr>';
  }
}

function setupClientsTabs() {
  document.querySelectorAll('#clients .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-tab');
      
      document.querySelectorAll('#clients .tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('#clients .tab-content').forEach(c => c.classList.remove('active'));
      
      tab.classList.add('active'); 
      document.getElementById(target).classList.add('active');
      
      if(target === 'consulter') displayClients();
      if(target === 'modifier') populateEditClientSelect();
      if(target === 'consulter-un-client') populateCustomSelect('viewClientSelect', clients, null, false);
      if(target === 'archives') loadClientsArchives();
    });
  });
}

function setupClientsSearch() {
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.removeEventListener('input', handleClientsSearch);
    searchInput.addEventListener('input', handleClientsSearch);
    console.log('🔍 Barre de recherche clients initialisée');
  }
}

function handleClientsSearch(e) {
  const searchTerm = e.target.value.toLowerCase().trim();
  console.log('Recherche:', searchTerm);
  
  const filteredClients = clients.filter(client => {
    return (
      (client.nom_raison_sociale && client.nom_raison_sociale.toLowerCase().includes(searchTerm)) ||
      (client.ice && client.ice.toLowerCase().includes(searchTerm)) ||
      (client.ville && client.ville.toLowerCase().includes(searchTerm)) ||
      (client.contact && client.contact.toLowerCase().includes(searchTerm))
    );
  });
  
  displayFilteredClients(filteredClients);
}

function displayFilteredClients(filteredClients) {
  const tbody = document.getElementById('clientsTableBody');

  if (!filteredClients.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="no-data">Aucun client trouvé</td></tr>';
    return;
  }

  tbody.innerHTML = filteredClients.map(c => `
    <tr class="client-row" data-client-id="${c.id}">
      <td data-field="nom_raison_sociale">${c.nom_raison_sociale || 'Non renseigné'}</td>
      <td data-field="ice">${c.ice || '-'}</td>
      <td data-field="Code client">${c.code_client || '-'}</td>
      <td data-field="contact">${c.contact || '-'}</td>
      
      <td class="actions">
        <div class="dropdown">
          <button class="action-btn">Action ▾</button>
          <div class="dropdown-content">
            <a href="#" class="action-view">Consulter</a>
            <a href="#" class="action-edit">Modifier</a>
            <a href="#" class="action-affect">Affecter déclarations</a>
            <a href="#" class="action-archive">Archiver</a>
          </div>
        </div>
      </td>
    </tr>
  `).join('');

  setupClientRowNavigation();
}

function setupClientRowNavigation() {
  if (document.__clientsMenuBound) return;
  document.__clientsMenuBound = true;

  document.addEventListener('click', (e) => {
    const dropdown = e.target.closest('.dropdown');

    if (!dropdown) {
      document.querySelectorAll('.dropdown-content').forEach(menu => {
        menu.style.display = 'none';
        menu.classList.remove('open-up');
        menu.style.top = '';
        menu.style.bottom = '';
        menu.style.visibility = '';
      });
      return;
    }

    const menu = dropdown.querySelector('.dropdown-content');
    if (!menu) return;

    const isOpen = menu.style.display === 'block';

    document.querySelectorAll('.dropdown-content').forEach(m => {
      if (m !== menu) {
        m.style.display = 'none';
        m.classList.remove('open-up');
        m.style.top = '';
        m.style.bottom = '';
        m.style.visibility = '';
      }
    });

    if (isOpen) {
      menu.style.display = 'none';
      menu.classList.remove('open-up');
      menu.style.top = '';
      menu.style.bottom = '';
      menu.style.visibility = '';
      return;
    }

    menu.style.visibility = 'hidden';
    menu.style.display = 'block';
    menu.style.top = '100%';
    menu.style.bottom = 'auto';

    const dropRect = dropdown.getBoundingClientRect();
    const menuRect  = menu.getBoundingClientRect();
    const spaceBelow = window.innerHeight - dropRect.bottom;
    const spaceAbove = dropRect.top;

    if (spaceBelow < menuRect.height && spaceAbove > spaceBelow) {
      menu.style.top = 'auto';
      menu.style.bottom = '100%';
      menu.classList.add('open-up');
    } else {
      menu.style.top = '100%';
      menu.style.bottom = 'auto';
      menu.classList.remove('open-up');
    }

    menu.style.visibility = '';
  }, { passive: true });
}

function displayClients(){
  const tbody = document.getElementById('clientsTableBody');
  if(!clients.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="no-data">Aucun client trouvé</td></tr>';
    return;
  }
  tbody.innerHTML = clients.map(c => `
  <tr class="client-row" data-client-id="${c.id}">
    <td data-field="nom_raison_sociale">${c.nom_raison_sociale || 'Non renseigné'}</td>
    <td data-field="ice">${c.ice || '-'}</td>
    <td data-field="Code client">${c.code_client || '-'}</td>
    <td data-field="contact">${c.contact || '-'}</td>
    
    <td class="actions">
      <div class="dropdown">
        <button class="action-btn">Action ▾</button>
        <div class="dropdown-content">
          <a href="#" class="action-view">Consulter</a>
          <a href="#" class="action-edit">Modifier</a>
          <a href="#" class="action-affect">Affecter déclarations</a>
          <a href="#" class="action-archive">Archiver</a>
        </div>
      </div>
    </td>
  </tr>
`).join('');

  setupClientRowNavigation();
}

// Gestion des actions clients
document.addEventListener('click', (e) => {
  const btnView = e.target.closest('.action-view');
  if (btnView) {
    e.preventDefault();
    handleClientAction('view', btnView);
    return;
  }

  const btnEdit = e.target.closest('.action-edit');
  if (btnEdit) {
    e.preventDefault();
    handleClientAction('edit', btnEdit);
    return;
  }

  const btnAffect = e.target.closest('.action-affect');
  if (btnAffect) {
    e.preventDefault();
    handleClientAction('affect', btnAffect);
    return;
  }

  const btnArchive = e.target.closest('.action-archive');
  if (btnArchive) {
    e.preventDefault();
    handleClientAction('archive', btnArchive);
    return;
  }
});

function handleClientAction(action, buttonElement) {
  const row = buttonElement.closest('tr.client-row');
  const clientId = row?.dataset.clientId;
  if (!clientId) return;

  const client = clients.find(c => c.id === clientId);
  if (!client) return;

  if (action === 'archive') {
    archiverClientPrompt(clientId);
    return;
  }

  const actionConfig = {
    'view': {
      tab: 'consulter-un-client',
      selectId: 'viewClientSelect',
      handler: handleViewClientSelection,
      page: 'clients'
    },
    'edit': {
      tab: 'modifier', 
      selectId: 'editClientSelect',
      handler: handleEditClientSelection,
      page: 'clients'
    },
    'affect': {
      tab: 'affectation',
      selectId: 'clientSelection',
      handler: loadAffectationChecklist,
      page: 'declarations'
    }
  };

  const config = actionConfig[action];
  if (!config) return;

  navigateToTargetPage(config.page, config.tab);

  setTimeout(() => {
    selectClientInDropdown(config.selectId, clientId, client);
    
    if (config.handler) {
      setTimeout(() => {
        config.handler(clientId);
      }, 200);
    }
  }, 150);

  closeActionDropdown(buttonElement);
}

function navigateToTargetPage(pageName, tabName) {
  document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  
  document.querySelector(`[data-page="${pageName}"]`).classList.add('active');
  document.getElementById(pageName).classList.add('active');

  if (pageName === 'clients') {
    document.querySelectorAll('#clients .tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('#clients .tab-content').forEach(c => c.classList.remove('active'));
    
    document.querySelector(`#clients .tab[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(tabName).classList.add('active');
  } else if (pageName === 'declarations') {
    document.querySelectorAll('#declarations .tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('#declarations .tab-content').forEach(c => c.classList.remove('active'));
    
    document.querySelector(`#declarations .tab[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(tabName).classList.add('active');
  }
}

function selectClientInDropdown(selectId, clientId, client) {
  const selectElement = document.getElementById(selectId);
  if (!selectElement) return;

  const selectedDiv = selectElement.querySelector('.select-selected');
  if (!selectedDiv) return;

  selectedDiv.textContent = `${client.nom_raison_sociale}${client.ice ? ' - ' + client.ice : ''}`;
  selectedDiv.setAttribute('data-client-id', clientId);

  updateCustomSelectOptions(selectId, clientId);
  triggerSelectionEvent(selectId, clientId);
}

function triggerSelectionEvent(selectId, clientId) {
  if (selectId === 'clientSelection') {
    console.log('🚀 Déclenchement loadAffectationChecklist pour:', clientId);
  }
}

function updateCustomSelectOptions(selectId, selectedClientId) {
  const selectElement = document.getElementById(selectId);
  if (!selectElement) return;

  const optionsContainer = selectElement.querySelector('.select-options');
  if (!optionsContainer) return;

  const allOptions = optionsContainer.querySelectorAll('div[data-client-id]');
  allOptions.forEach(option => {
    if (option.getAttribute('data-client-id') === selectedClientId) {
      option.classList.add('same-as-selected');
    } else {
      option.classList.remove('same-as-selected');
    }
  });
}

function closeActionDropdown(buttonElement) {
  const dropdown = buttonElement.closest('.dropdown-content');
  if (dropdown) dropdown.style.display = 'none';
}

// Gestion formulaire ajouter client
function setupAddClientForm() {
  const form = document.getElementById('addClientForm');
  if (!form) return;
  
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleAddClient();
  });
  
  form.addEventListener('reset', () => form.reset());
}

async function handleAddClient() {
  const form = document.getElementById('addClientForm');
  const val = (id) => {
    const v = document.getElementById(id).value; 
    return v && v.trim() !== '' ? v.trim() : null;
  };
  
  const clientData = {
    nom_raison_sociale: val('addNom'), 
    ice: val('addIce'),
    date_creation: val('addDateCreation'), 
    siege_social: val('addSiegeSocial'),
    ville: val('addVille'), 
    activite: val('addActivite'),
    identifiant_fiscal: val('addIdentifiantFiscal'), 
    taxe_professionnelle: val('addTaxeProfessionnelle'),
    registre_commerce: val('addRegistreCommerce'), 
    cnss: val('addCnss'),
    rib: val('addRib'), 
    email: val('addEmail'),
    nom_gerant: val('addNomGerant'), 
    cin_gerant: val('addCinGerant'),
    adresse_gerant: val('addAdresseGerant'), 
    date_naissance: val('addDateNaissance'),
    contact: val('addContact'), 
    code_client: val('addCodeClient'),
    statut: 'actif'
  };
  
  if(!clientData.nom_raison_sociale || !clientData.ice) {
    alert('Nom et ICE obligatoires'); 
    return; 
  }
  
  try {
    const {data, error} = await supabase.from('clients').insert([clientData]).select();
    
    if(error) {
      alert('Erreur enregistrement: ' + error.message); 
      return;
    }
    
    alert('Client enregistré avec succès !'); 
    form.reset();
    await loadClients();
    document.querySelector('#clients .tab[data-tab="consulter"]').click();
    
  } catch (error) {
    console.error('Erreur ajout client:', error);
    alert('Erreur lors de l\'enregistrement du client');
  }
}

// Gestion formulaire modifier client
function setupEditClientForm() {
  const form = document.getElementById('editClientForm');
  if (!form) return;
  
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleEditClient();
  });
}

function populateEditClientSelect() {
  populateCustomSelect('editClientSelect', clients, null, false);
}

function handleEditClientSelection(clientId) {
  const editFormContainer = document.getElementById('editFormContainer');
  const editPlaceholder = document.getElementById('editPlaceholder');
  
  if (!clientId) {
    editFormContainer.style.display = 'none';
    editPlaceholder.style.display = 'block';
    return;
  }
  
  const client = clients.find(c => c.id === clientId);
  if (!client) return;
  
  fillEditForm(client);
  editFormContainer.style.display = 'block';
  editPlaceholder.style.display = 'none';
}

function fillEditForm(client) {
  const setValue = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.value = value || '';
  };
  
  setValue('editNom', client.nom_raison_sociale);
  setValue('editIce', client.ice);
  setValue('editDateCreation', client.date_creation);
  setValue('editSiegeSocial', client.siege_social);
  setValue('editVille', client.ville);
  setValue('editActivite', client.activite);
  setValue('editIdentifiantFiscal', client.identifiant_fiscal);
  setValue('editTaxeProfessionnelle', client.taxe_professionnelle);
  setValue('editRegistreCommerce', client.registre_commerce);
  setValue('editCnss', client.cnss);
  setValue('editRib', client.rib);
  setValue('editEmail', client.email);
  setValue('editNomGerant', client.nom_gerant);
  setValue('editCinGerant', client.cin_gerant);
  setValue('editAdresseGerant', client.adresse_gerant);
  setValue('editDateNaissance', client.date_naissance);
  setValue('editContact', client.contact);
  setValue('editCodeClient', client.code_client);
  
  document.getElementById('editClientForm').setAttribute('data-client-id', client.id);
}

async function handleEditClient() {
  const form = document.getElementById('editClientForm');
  const clientId = form.getAttribute('data-client-id');
  
  if (!clientId) {
    alert('Aucun client sélectionné');
    return;
  }
  
  const val = (id) => {
    const v = document.getElementById(id).value; 
    return v && v.trim() !== '' ? v.trim() : null;
  };
  
  const clientData = {
    nom_raison_sociale: val('editNom'), 
    ice: val('editIce'),
    date_creation: val('editDateCreation'), 
    siege_social: val('editSiegeSocial'),
    ville: val('editVille'), 
    activite: val('editActivite'),
    identifiant_fiscal: val('editIdentifiantFiscal'), 
    taxe_professionnelle: val('editTaxeProfessionnelle'),
    registre_commerce: val('editRegistreCommerce'), 
    cnss: val('editCnss'),
    rib: val('editRib'), 
    email: val('editEmail'),
    nom_gerant: val('editNomGerant'), 
    cin_gerant: val('editCinGerant'),
    adresse_gerant: val('editAdresseGerant'), 
    date_naissance: val('editDateNaissance'),
    contact: val('editContact'), 
    code_client: val('editCodeClient')
  };
  
  if(!clientData.nom_raison_sociale || !clientData.ice) {
    alert('Nom et ICE obligatoires'); 
    return; 
  }
  
  try {
    const {error} = await supabase.from('clients').update(clientData).eq('id', clientId);
    
    if(error) {
      alert('Erreur modification: ' + error.message); 
      return;
    }
    
    alert('Client modifié avec succès !'); 
    await loadClients();
    document.querySelector('#clients .tab[data-tab="consulter"]').click();
    
  } catch (error) {
    console.error('Erreur modification client:', error);
    alert('Erreur lors de la modification du client');
  }
}

function cancelEdit() {
  const editFormContainer = document.getElementById('editFormContainer');
  const editPlaceholder = document.getElementById('editPlaceholder');
  
  editFormContainer.style.display = 'none';
  editPlaceholder.style.display = 'block';
  
  const selectElement = document.getElementById('editClientSelect');
  if (selectElement) {
    const selectedDiv = selectElement.querySelector('.select-selected');
    selectedDiv.textContent = 'Choisir un client...';
    selectedDiv.removeAttribute('data-client-id');
  }
}

function setupEditClientSelect() {
  const selectElement = document.getElementById('editClientSelect');
  if (!selectElement) return;
  
  setupCustomSelect(selectElement);
  
  const selectedDiv = selectElement.querySelector('.select-selected');
  const observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      if (mutation.type === 'attributes' && mutation.attributeName === 'data-client-id') {
        const clientId = selectedDiv.getAttribute('data-client-id');
        handleEditClientSelection(clientId);
      }
    });
  });
  
  observer.observe(selectedDiv, { attributes: true });
}

// Onglet consulter un client
function setupViewClientSelect() {
  const selectElement = document.getElementById('viewClientSelect');
  if (!selectElement) return;
  
  setupCustomSelect(selectElement);
  
  const selectedDiv = selectElement.querySelector('.select-selected');
  const observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      if (mutation.type === 'attributes' && mutation.attributeName === 'data-client-id') {
        const clientId = selectedDiv.getAttribute('data-client-id');
        handleViewClientSelection(clientId);
      }
    });
  });
  
  observer.observe(selectedDiv, { attributes: true });
}

function handleViewClientSelection(clientId) {
  const viewFormContainer = document.getElementById('viewFormContainer');
  const viewPlaceholder = document.getElementById('viewPlaceholder');
  
  if (!clientId) {
    viewFormContainer.style.display = 'none';
    viewPlaceholder.style.display = 'block';
    return;
  }
  
  const client = clients.find(c => c.id === clientId);
  if (!client) return;
  
  fillViewForm(client);
  viewFormContainer.style.display = 'block';
  viewPlaceholder.style.display = 'none';
  setupViewFormCopy();
}

function fillViewForm(client) {
  const setValue = (id, value) => {
    const element = document.getElementById(id);
    if (element) {
      if (id.includes('Date') && element.type === 'date') {
        element.value = formatDateForInput(value);
      } else {
        element.value = value || '';
      }
    }
  };
  
  setValue('viewNom', client.nom_raison_sociale);
  setValue('viewIce', client.ice);
  setValue('viewDateCreation', client.date_creation);
  setValue('viewSiegeSocial', client.siege_social);
  setValue('viewVille', client.ville);
  setValue('viewActivite', client.activite);
  setValue('viewIdentifiantFiscal', client.identifiant_fiscal);
  setValue('viewTaxeProfessionnelle', client.taxe_professionnelle);
  setValue('viewRegistreCommerce', client.registre_commerce);
  setValue('viewCnss', client.cnss);
  setValue('viewRib', client.rib);
  setValue('viewEmail', client.email);
  setValue('viewNomGerant', client.nom_gerant);
  setValue('viewCinGerant', client.cin_gerant);
  setValue('viewAdresseGerant', client.adresse_gerant);
  setValue('viewDateNaissance', client.date_naissance);
  setValue('viewContact', client.contact);
  setValue('viewCodeClient', client.code_client);
}

function setupViewFormCopy() {
  const form = document.getElementById('viewClientForm');
  if (!form) return;
  
  const inputs = form.querySelectorAll('input');
  
  inputs.forEach(input => {
    input.removeEventListener('dblclick', handleViewFieldCopy);
    input.addEventListener('dblclick', handleViewFieldCopy);
    input.style.cursor = 'pointer';
    input.title = 'Double-cliquez pour copier';
  });
}

function handleViewFieldCopy(event) {
  const input = event.target;
  const text = input.value.trim();
  
  if (!text) return;
  
  input.select();
  input.setSelectionRange(0, 99999);
  
  navigator.clipboard.writeText(text).then(() => {
    console.log('Champ copié:', text);
    
    input.style.backgroundColor = 'var(--success-color)';
    input.style.color = 'white';
    
    setTimeout(() => {
      input.style.backgroundColor = '';
      input.style.color = '';
    }, 500);
  }).catch(err => {
    console.error('Erreur copie:', err);
    document.execCommand('copy');
  });
}

// Gestion archives clients
async function archiverClient(clientId, raison) {
  try {
    const { error } = await supabase.rpc('archiver_client', {
      client_id: clientId,
      utilisateur_id: currentUser.id,
      raison: raison
    });
    
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Erreur archivage:', error);
    alert('Erreur lors de l\'archivage: ' + error.message);
    return false;
  }
}

async function archiverClientPrompt(clientId) {
  const raison = prompt('Raison de l\'archivage ?');
  if (raison === null) return;
  
  if (await archiverClient(clientId, raison)) {
    alert('Client archivé avec succès !');
    loadClients();
  }
}

async function restaurerClient(archiveId) {
  try {
    const { error } = await supabase.rpc('restaurer_client', {
      archive_id: archiveId,
      utilisateur_id: currentUser.id
    });
    
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Erreur restauration:', error);
    alert('Erreur lors de la restauration: ' + error.message);
    return false;
  }
}

async function supprimerClientDefinitif(archiveId) {
  if (!confirm('Êtes-vous sûr de vouloir supprimer définitivement ce client ? Cette action est irréversible.')) {
    return false;
  }
  
  try {
    const { error } = await supabase.rpc('supprimer_client_definitif', {
      archive_id: archiveId,
      utilisateur_id: currentUser.id
    });
    
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Erreur suppression:', error);
    alert('Erreur lors de la suppression: ' + error.message);
    return false;
  }
}

async function loadClientsArchives() {
  try {
    console.log('📁 Chargement des clients archivés...');
    
    const { data, error } = await supabase
      .from('clients_archives')
      .select('*')
      .order('archived_at', { ascending: false });
    
    if (error) throw error;
    
    console.log(`✅ ${data?.length || 0} clients archivés chargés`);
    displayClientsArchives(data || []);
    
  } catch (error) {
    console.error('❌ Erreur chargement archives:', error);
    const tbody = document.getElementById('archivesTableBody');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="5" class="no-data">Erreur de chargement des archives</td></tr>';
    }
  }
}

function displayClientsArchives(archives) {
  const tbody = document.getElementById('archivesTableBody');
  
  if (!tbody) return;
  
  if (!archives.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="no-data">Aucun client archivé</td></tr>';
    return;
  }
  
  tbody.innerHTML = archives.map(archive => `
    <tr>
      <td>${archive.nom_raison_sociale || 'Non renseigné'}</td>
      <td>${archive.ice || '-'}</td>
      <td>${archive.archived_at ? new Date(archive.archived_at).toLocaleDateString('fr-FR') : '-'}</td>
      <td>${archive.raison_archivage || 'Non spécifiée'}</td>
      <td class="actions">
        <button class="btn-success" onclick="restaurerClientPrompt('${archive.id}')">
          <i class="fas fa-undo"></i> Restaurer
        </button>
        <button class="btn-secondary" onclick="supprimerClientDefinitifPrompt('${archive.id}')">
          <i class="fas fa-trash"></i> Supprimer
        </button>
      </td>
    </tr>
  `).join('');
}

async function restaurerClientPrompt(archiveId) {
  if (confirm('Êtes-vous sûr de vouloir restaurer ce client ?')) {
    const success = await restaurerClient(archiveId);
    if (success) {
      alert('Client restauré avec succès !');
      loadClientsArchives();
    }
  }
}

async function supprimerClientDefinitifPrompt(archiveId) {
  if (confirm('Êtes-vous sûr de vouloir supprimer définitivement ce client ? Cette action est irréversible.')) {
    const success = await supprimerClientDefinitif(archiveId);
    if (success) {
      alert('Client supprimé définitivement !');
      loadClientsArchives();
    }
  }
}

// Impression fiche client
document.addEventListener('DOMContentLoaded', function() {
  const btnImprimer = document.getElementById('btnImprimerFicheClient');
  if (btnImprimer) {
    btnImprimer.addEventListener('click', genererFicheClientPDF);
  }
});

function genererFicheClientPDF() {
  const clientId = getSelectedClientId('viewClientSelect');
  if (!clientId) {
    alert('Veuillez sélectionner un client');
    return;
  }

  const client = clients.find(c => c.id === clientId);
  if (!client) {
    alert('Client non trouvé');
    return;
  }

  const printContent = creerContenuFicheClient(client);
  const printWindow = window.open('', '_blank');
  printWindow.document.write(printContent);
  printWindow.document.close();
  
  printWindow.onload = function() {
    printWindow.focus();
    printWindow.print();
  };
}

function creerContenuFicheClient(client) {
  const dateGeneration = new Date().toLocaleDateString('fr-FR');
  const statutClass = `statut-${client.statut || 'actif'}`;
  const statutLabel = client.statut ? client.statut.charAt(0).toUpperCase() + client.statut.slice(1) : 'Actif';

  return `
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Fiche Client - ${client.nom_raison_sociale}</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 15mm; background: white; color: #1f2937; line-height: 1.4; }
        .fiche-client-simple { max-width: 210mm; margin: 0 auto; }
        .fiche-entete { text-align: center; margin-bottom: 2rem; padding-bottom: 1rem; border-bottom: 2px solid #2563eb; }
        .fiche-titre-principal { font-size: 1.8rem; font-weight: 700; color: #1f2937; margin-bottom: 0.25rem; }
        .fiche-sous-titre { color: #6b7280; font-size: 1rem; margin-bottom: 1rem; }
        .fiche-cabinet { font-size: 0.9rem; color: #2563eb; font-weight: 600; }
        .fiche-tableau { width: 100%; border-collapse: collapse; margin-bottom: 1.5rem; }
        .fiche-tableau td { padding: 0.75rem; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
        .fiche-colonne-gauche { width: 35%; font-weight: 600; color: #374151; background-color: #f8fafc; }
        .fiche-colonne-droite { width: 65%; color: #6b7280; }
        .fiche-section-titre { background: #2563eb; color: white; padding: 0.75rem; font-weight: 600; margin: 1.5rem 0 0.5rem 0; }
        .statut-badge { display: inline-block; padding: 0.25rem 0.75rem; border-radius: 12px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; }
        .statut-actif { background: #d1fae5; color: #065f46; }
        .statut-inactif { background: #fef3c7; color: #92400e; }
        .statut-archive { background: #e5e7eb; color: #374151; }
        @page { margin: 10mm; }
        @media print { body { background: white !important; margin: 0; padding: 0; } .fiche-client-simple { margin: 0; padding: 0; box-shadow: none; } }
    </style>
</head>
<body>
    <div class="fiche-client-simple">
        <div class="fiche-entete">
            <div class="fiche-cabinet">NEW FID - Cabinet Comptable Agréé</div>
            <h1 class="fiche-titre-principal">FICHE CLIENT</h1>
            <div class="fiche-sous-titre">${client.nom_raison_sociale}</div>
        </div>
        
        <table class="fiche-tableau">
            <tr><td colspan="2" class="fiche-section-titre">INFORMATIONS GÉNÉRALES</td></tr>
            <tr><td class="fiche-colonne-gauche">Raison Sociale</td><td class="fiche-colonne-droite">${client.nom_raison_sociale || '-'}</td></tr>
            <tr><td class="fiche-colonne-gauche">ICE</td><td class="fiche-colonne-droite">${client.ice || '-'}</td></tr>
            <tr><td class="fiche-colonne-gauche">Date de Création</td><td class="fiche-colonne-droite">${formatDateForDisplay(client.date_creation) || '-'}</td></tr>
            <tr><td class="fiche-colonne-gauche">Siège Social</td><td class="fiche-colonne-droite">${client.siege_social || '-'}</td></tr>
            <tr><td class="fiche-colonne-gauche">Ville</td><td class="fiche-colonne-droite">${client.ville || '-'}</td></tr>
            <tr><td class="fiche-colonne-gauche">Activité</td><td class="fiche-colonne-droite">${client.activite || '-'}</td></tr>
            <tr><td class="fiche-colonne-gauche">Statut</td><td class="fiche-colonne-droite"><span class="statut-badge ${statutClass}">${statutLabel}</span></td></tr>
            
            <tr><td colspan="2" class="fiche-section-titre">INFORMATIONS FISCALES</td></tr>
            <tr><td class="fiche-colonne-gauche">Identifiant Fiscal</td><td class="fiche-colonne-droite">${client.identifiant_fiscal || '-'}</td></tr>
            <tr><td class="fiche-colonne-gauche">Taxe Professionnelle</td><td class="fiche-colonne-droite">${client.taxe_professionnelle || '-'}</td></tr>
            <tr><td class="fiche-colonne-gauche">Registre de Commerce</td><td class="fiche-colonne-droite">${client.registre_commerce || '-'}</td></tr>
            <tr><td class="fiche-colonne-gauche">CNSS</td><td class="fiche-colonne-droite">${client.cnss || '-'}</td></tr>
            <tr><td class="fiche-colonne-gauche">RIB</td><td class="fiche-colonne-droite">${client.rib || '-'}</td></tr>
            <tr><td class="fiche-colonne-gauche">Code Client</td><td class="fiche-colonne-droite">${client.code_client || '-'}</td></tr>
            
            <tr><td colspan="2" class="fiche-section-titre">INFORMATIONS DU GÉRANT</td></tr>
            <tr><td class="fiche-colonne-gauche">Nom du Gérant</td><td class="fiche-colonne-droite">${client.nom_gerant || '-'}</td></tr>
            <tr><td class="fiche-colonne-gauche">CIN du Gérant</td><td class="fiche-colonne-droite">${client.cin_gerant || '-'}</td></tr>
            <tr><td class="fiche-colonne-gauche">Adresse du Gérant</td><td class="fiche-colonne-droite">${client.adresse_gerant || '-'}</td></tr>
            <tr><td class="fiche-colonne-gauche">Date de Naissance</td><td class="fiche-colonne-droite">${formatDateForDisplay(client.date_naissance) || '-'}</td></tr>
            
            <tr><td colspan="2" class="fiche-section-titre">CONTACT</td></tr>
            <tr><td class="fiche-colonne-gauche">Email</td><td class="fiche-colonne-droite">${client.email || '-'}</td></tr>
            <tr><td class="fiche-colonne-gauche">Téléphone</td><td class="fiche-colonne-droite">${client.contact || '-'}</td></tr>
        </table>
        
        <div class="fiche-signature">
            <div class="fiche-ligne-signature">Signature et cachet</div>
        </div>
        
        <div class="fiche-pied">Document généré le ${dateGeneration}</div>
    </div>
</body>
</html>
    `;
}

/* =========================
   FONCTIONS GESTION DÉCLARATIONS
   ========================= */

async function loadDeclarationTypes(){
  try{
    const {data, error} = await supabase.from('declaration_types').select('*').order('type_declaration, mois_reference, trimestre_reference');
    if(error) throw error; 
    declarationTypes = data || [];
  } catch(e) {
    console.error('Erreur loadDeclarationTypes:', e);
  }
}

async function loadClientDeclarations(){
  try{
    const {data, error} = await supabase.from('client_declarations').select('*');
    if(error) throw error; 
    clientDeclarations = data || [];
  } catch(e) {
    console.error('Erreur loadClientDeclarations:', e);
  }
}

async function loadEcheances(){
  try{
    const {data, error} = await supabase.from('echeances').select(`*, clients(nom_raison_sociale), declaration_types(nom_template,type_declaration)`).order('date_fin', {ascending:false});
    if(error) throw error; 
    echeances = data || [];
  } catch(e) {
    console.error('Erreur loadEcheances:', e);
  }
}

async function loadDeclarationData(){
  await loadDeclarationTypes();
  await loadClientDeclarations();
  await loadEcheances();
  loadCatalogue();
}

function loadCatalogue(){
  const tbody = document.getElementById('catalogueTableBody');
  if(!declarationTypes.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="no-data">Aucune déclaration</td></tr>';
    return;
  }
  
  tbody.innerHTML = declarationTypes.map(d => `
    <tr>
      <td><strong>${d.type_declaration}</strong></td>
      <td>${d.nom_template}</td>
      <td><span class="badge">${d.periodicite}</span></td>
      <td>${d.date_debut_template}</td>
      <td>${d.date_fin_template}</td>
    </tr>
  `).join('');
}

function setupDeclarationsTabs(){
  document.querySelectorAll('#declarations .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-tab');
      
      document.querySelectorAll('#declarations .tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('#declarations .tab-content').forEach(c => c.classList.remove('active'));
      
      tab.classList.add('active'); 
      document.getElementById(target).classList.add('active');
      
      if(target === 'echeances') loadEcheancesTable();
      if(target === 'affectation') loadAffectationChecklist();
      if(target === 'catalogue') loadCatalogue();
    });
  });
}

function loadAffectationChecklist(clientId = null){
  const container = document.getElementById('checklistContent');
  const targetClientId = clientId || getSelectedClientId('clientSelection');
  const annee = document.getElementById('anneeAffectation').value;
  const btn = document.getElementById('affecterDeclarationsBtn');

  if(!targetClientId || targetClientId === 'tous') {
    container.innerHTML = '<div class="no-data">Sélectionnez un client</div>'; 
    btn.style.display = 'none'; 
    return;
  }
  
  btn.style.display = 'block';
  const declAffect = clientDeclarations.filter(cd => cd.client_id === targetClientId && cd.annee_comptable == annee);
  
  const has = (s, ...qs) => (s ? qs.some(q => s.toLowerCase().includes(q.toLowerCase())) : false);
  const isP = (d, p) => (d.periodicite || '').toLowerCase() === p;

  const sections = [
    { title: 'CNSS', id: 'cnss', match: d => d.type_declaration === 'CNSS' || has(d.nom_template, 'cnss') },
    { title: 'TVA Mensuelle', id: 'tva_mensuelle', match: d => isP(d, 'mensuelle') && (d.type_declaration === 'TVA' || has(d.nom_template, 'tva')) },
    { title: 'RAS IR/Salaires', id: 'ras_ir_salaires', match: d => has(d.type_declaration, 'ir') || has(d.nom_template, 'ir/salaire', 'ir salaire', 'traitements', 'salaires') },
    { title: 'RAS Sur Loyer', id: 'ras_loyer', match: d => has(d.type_declaration, 'ras', 'loyer') || has(d.nom_template, 'ras/loyer', 'ras loyer', 'loyer') },
    { title: 'IS - Acomptes', id: 'is_acomptes', match: d => d.type_declaration === 'IS' && has(d.nom_template, 'acompte', 'premier', 'deuxième', 'troisième', 'quatrième', 't1', 't2', 't3', 't4') },
    { title: 'TVA Trimestrielle', id: 'tva_trimestrielle', match: d => isP(d, 'trimestrielle') && (d.type_declaration === 'TVA' || has(d.nom_template, 'tva')) },
    { title: 'Délais de Paiement', id: 'delais_paiement', match: d => has(d.nom_template, 'délai', 'delai', 'paiement') },
    { title: 'IS - Déclarations Annuelles', id: 'is_annuelles', match: d => isP(d, 'annuelle') && d.type_declaration === 'IS' },
    { title: 'IR - Déclarations Annuelles', id: 'ir_annuelles', match: d => isP(d, 'annuelle') && d.type_declaration === 'IR' }
  ];

  const html = sections.map(sec => {
    const items = declarationTypes.filter(sec.match);
    if(!items.length) return '';
    
    const total = items.length;
    const nbCochees = items.filter(decl => declAffect.some(cd => cd.declaration_type_id === decl.id)).length;
    const all = nbCochees === total, some = nbCochees > 0 && nbCochees < total;
    
    const itemsHtml = items.map(decl => {
      const checked = declAffect.some(cd => cd.declaration_type_id === decl.id);
      const d1 = calculerDateReellePourDecl(decl, decl.date_debut_template, annee);
      const d2 = calculerDateReellePourDecl(decl, decl.date_fin_template, annee);
      
      return `
        <div class="declaration-item" data-declaration-id="${decl.id}">
          <label>
            <input type="checkbox" class="item-checkbox" ${checked ? 'checked' : ''} data-declaration-id="${decl.id}">
            <div class="declaration-info">
              <div class="declaration-name">${decl.nom_template}</div>
              <div class="declaration-dates">${d1.toLocaleDateString('fr-FR')} - ${d2.toLocaleDateString('fr-FR')}</div>
            </div>
          </label>
        </div>`;
    }).join('');
    
    return `
      <div class="category-accordion" data-category="${sec.id}">
        <div class="category-header">
          <div class="category-title-section">
            <input type="checkbox" class="category-checkbox" ${all ? 'checked' : ''} ${some ? 'data-indeterminate="1"' : ''} data-category="${sec.id}">
            <h3 class="category-title">${sec.title}</h3>
          </div>
          <div class="category-stats">
            <span class="stats-count">${nbCochees}/${total}</span>
            <div class="accordion-arrow">
              <i class="fas fa-chevron-down"></i>
            </div>
          </div>
        </div>
        <div class="category-content">
          ${itemsHtml}
        </div>
      </div>`;
  }).filter(html => html !== '').join('');

  container.innerHTML = html || '<div class="no-data">Aucune déclaration disponible</div>';
  initializeAccordions();
  setupCheckboxHandlers(container);
  updatePrintButton();
}

function initializeAccordions() {
  const accordions = document.querySelectorAll('.category-accordion');
  
  accordions.forEach(accordion => {
    const header = accordion.querySelector('.category-header');
    const content = accordion.querySelector('.category-content');
    const arrow = accordion.querySelector('.accordion-arrow i');
    
    content.style.display = 'none';
    arrow.classList.remove('fa-chevron-up');
    arrow.classList.add('fa-chevron-down');
    
    header.addEventListener('click', function(e) {
      if (e.target.type === 'checkbox') return;
      
      accordions.forEach(otherAccordion => {
        if (otherAccordion !== accordion) {
          const otherContent = otherAccordion.querySelector('.category-content');
          const otherArrow = otherAccordion.querySelector('.accordion-arrow i');
          otherContent.style.display = 'none';
          otherArrow.classList.remove('fa-chevron-up');
          otherArrow.classList.add('fa-chevron-down');
        }
      });
      
      const isOpen = content.style.display === 'block';
      content.style.display = isOpen ? 'none' : 'block';
      arrow.classList.toggle('fa-chevron-up', !isOpen);
      arrow.classList.toggle('fa-chevron-down', isOpen);
    });
  });
}

function setupCheckboxHandlers(container) {
  container.querySelectorAll('.category-checkbox[data-indeterminate="1"]').forEach(cb => cb.indeterminate = true);

  container.addEventListener('change', (e) => {
    const t = e.target;
    
    if(t.classList.contains('category-checkbox')) {
      const categoryId = t.getAttribute('data-category');
      const categoryAccordion = container.querySelector(`.category-accordion[data-category="${categoryId}"]`);
      categoryAccordion.querySelectorAll('.item-checkbox').forEach(i => i.checked = t.checked);
      t.indeterminate = false;
      updateCategoryStats(categoryAccordion);
    }
    
    if(t.classList.contains('item-checkbox')) {
      const categoryAccordion = t.closest('.category-accordion');
      const items = [...categoryAccordion.querySelectorAll('.item-checkbox')];
      const checked = items.filter(i => i.checked).length;
      const total = items.length;
      const categoryCb = categoryAccordion.querySelector('.category-checkbox');
      
      if(checked === 0) {
        categoryCb.checked = false;
        categoryCb.indeterminate = false;
      } else if(checked === total) {
        categoryCb.checked = true;
        categoryCb.indeterminate = false;
      } else {
        categoryCb.checked = false;
        categoryCb.indeterminate = true;
      }
      
      updateCategoryStats(categoryAccordion);
    }
  });
}

function updateCategoryStats(categoryAccordion) {
  const items = categoryAccordion.querySelectorAll('.item-checkbox');
  const checked = [...items].filter(i => i.checked).length;
  const total = items.length;
  const statsCount = categoryAccordion.querySelector('.stats-count');
  
  if (statsCount) statsCount.textContent = `${checked}/${total}`;
}

function doitBasculerNPlus1(decl){
  const p = (decl.periodicite || '').toLowerCase();
  const type = (decl.type_declaration || '').toLowerCase();
  const nom = (decl.nom_template || '').toLowerCase();
  
  const is4emeAcompteIS = (
    type.includes('is') && 
    (nom.includes('quatrième') || nom.includes('4ème') || nom.includes('quatrieme') || nom.includes('4eme')) &&
    (nom.includes('acompte') || p === 'trimestrielle')
  );
  
  if (is4emeAcompteIS) return false;
  if (p === 'annuelle') return true;
  if (p === 'trimestrielle' && decl.trimestre_reference === 4) return true;
  if (p === 'mensuelle' && decl.mois_reference === 12) return true;
  
  return false;
}

function calculerDateReellePourDecl(decl, dateTemplate, annee){
  if (!dateTemplate) return new Date();
  
  const [jS, mS] = (dateTemplate || '01/01').split('/');
  let y = parseInt(annee, 10);
  
  const bascule = doitBasculerNPlus1(decl);
  if (bascule) y += 1;
  
  return new Date(y, parseInt(mS, 10) - 1, parseInt(jS, 10));
}

document.getElementById('affecterDeclarationsBtn').addEventListener('click', handleAffectation);

async function handleAffectation(){
  const clientId = getSelectedClientId('clientSelection');
  const annee = document.getElementById('anneeAffectation').value;
  
  if(!clientId || clientId === 'tous') {
    alert('Veuillez sélectionner un client');
    return;
  }
  
  try {
    const boxes = document.querySelectorAll('.item-checkbox');
    const ids = []; 
    boxes.forEach(b => {
      if(b.checked) ids.push(b.getAttribute('data-declaration-id'));
    });

    await supabase.from('client_declarations').delete().eq('client_id', clientId).eq('annee_comptable', annee);
    
    for(const declId of ids) {
      const d = declarationTypes.find(x => x.id === declId); 
      if(!d) continue;
      
      const d1 = calculerDateReellePourDecl(d, d.date_debut_template, annee);
      const d2 = calculerDateReellePourDecl(d, d.date_fin_template, annee);
      
      await supabase.from('client_declarations').insert({
        client_id: clientId, 
        declaration_type_id: declId, 
        annee_comptable: parseInt(annee),
        date_debut: toYMDLocal(d1), 
        date_fin: toYMDLocal(d2), 
        est_obligatoire: true
      });
    }
    
    await genererEcheancesAutomatiques(clientId, annee);
    alert('Déclarations affectées avec succès !');
    
    await loadClientDeclarations(); 
    await loadEcheances();
    updatePrintButton();
  } catch(e) {
    console.error(e);
    alert('Erreur lors de l\'affectation');
  }
}

async function genererEcheancesAutomatiques(clientId, annee){
  await supabase.from('echeances').delete().eq('client_id', clientId).eq('annee_comptable', annee);
  
  const {data: aff} = await supabase.from('client_declarations').select('*, declaration_types(*)').eq('client_id', clientId).eq('annee_comptable', annee);
  
  for(const a of (aff || [])) {
    const t = a.declaration_types;
    let periode = annee.toString();
    
    if(t.periodicite === 'mensuelle' && t.mois_reference) {
      periode = `${annee}-${String(t.mois_reference).padStart(2, '0')}`;
    } else if(t.periodicite === 'trimestrielle' && t.trimestre_reference) {
      periode = `${annee}-T${t.trimestre_reference}`;
    }
    
    await supabase.from('echeances').insert({
      client_id: clientId, 
      declaration_type_id: a.declaration_type_id, 
      annee_comptable: parseInt(annee),
      periode, 
      nom_echeance: t.nom_template, 
      date_debut: a.date_debut, 
      date_fin: a.date_fin, 
      statut_manuel: null, 
      date_depot: null
    });
  }
}

async function loadEcheancesTable(){
  const tbody = document.getElementById('echeancesTableBody');
  const annee = document.getElementById('anneeSelection').value;
  const etat = document.getElementById('filtreEtat').value;
  const fClient = getSelectedClientId('filtreClient');
  
  tbody.innerHTML = '<tr><td colspan="5" class="no-data">Chargement...</td></tr>';
  
  let q = supabase.from('echeances').select('*, clients(nom_raison_sociale), declaration_types(nom_template,type_declaration)').eq('annee_comptable', annee).order('date_fin', {ascending:false});
  
  if(fClient !== 'tous') q = q.eq('client_id', fClient);
  
  const {data} = await q;
  
  if(!data || !data.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="no-data">Aucune échéance pour ${annee}</td></tr>`;
    return;
  }
  
  let list = data;
  if(etat !== 'tous') { 
    list = data.filter(e => calculerEtatEcheance(e) === etat); 
  }
  
  if(!list.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="no-data">Aucune échéance avec ce filtre</td></tr>';
    return;
  }
  
  list.sort((a, b) => parseYMDLocal(b.date_fin) - parseYMDLocal(a.date_fin));
  
  tbody.innerHTML = list.map(e => {
    const st = calculerEtatEcheance(e);
    const nom = e.nom_echeance || e.declaration_types?.nom_template || 'N/A';
    const d = parseYMDLocal(e.date_fin).toLocaleDateString('fr-FR');
    const isFinal = (st === 'deposee' || st === 'payee');
    
    const action = isFinal
      ? `<button class="btn-secondary reset-btn" data-id="${e.id}"><i class="fas fa-undo"></i> Réinitialiser</button>`
      : `<div class="action-dropdown">
           <button class="btn-primary action-toggle" data-id="${e.id}">Action ▾</button>
           <div class="action-menu" id="menu-${e.id}">
             <button class="menu-item" data-action="deposee" data-id="${e.id}"><i class="fas fa-check"></i> Déposée</button>
             <button class="menu-item" data-action="payee" data-id="${e.id}"><i class="fas fa-money-bill"></i> Payée</button>
           </div>
         </div>`;
    
    return `<tr>
      <td>${e.clients?.nom_raison_sociale || 'N/A'}</td>
      <td>${nom}</td>
      <td>${d}</td>
      <td><span class="etat-badge etat-${st}">${getLibelleEtat(st)}</span></td>
      <td class="actions">${action}</td>
    </tr>`;
  }).join('');
}

function calculerEtatEcheance(e){
  if (!e.date_debut || !e.date_fin) return 'non_exigible';
  
  const now = new Date(), 
        d1 = new Date(e.date_debut), 
        d2 = new Date(e.date_fin);
        
  if(e.statut_manuel) return e.statut_manuel;
  if(now < d1) return 'non_exigible';
  if(now <= d2) return 'en_cours';
  return 'tardive';
}

function getLibelleEtat(s){
  const etats = {
    non_exigible: 'Non exigible',
    en_cours: 'En cours', 
    tardive: 'Tardive',
    deposee: 'Déposée',
    payee: 'Payée'
  };
  return etats[s] || s;
}

async function mettreAJourStatutEcheance(id, statut){
  await supabase.from('echeances').update({
    statut_manuel: statut, 
    date_depot: statut ? toYMDLocal(new Date()) : null
  }).eq('id', id);
  
  await loadEcheances(); 
  loadEcheancesTable();
}

async function reinitialiserStatut(id){ 
  await mettreAJourStatutEcheance(id, null); 
}

// Impression liste déclarations
function setupPrintButton() {
  const printBtn = document.getElementById('btnImprimerDeclarations');
  if (!printBtn) return;
  printBtn.addEventListener('click', imprimerListeDeclarations);
}

function updatePrintButton() {
  const printBtn = document.getElementById('btnImprimerDeclarations');
  const clientId = getSelectedClientId('clientSelection');
  const annee = document.getElementById('anneeAffectation').value;
  
  if (!printBtn || !clientId || clientId === 'tous') {
    if (printBtn) {
      printBtn.style.display = 'block';
      printBtn.disabled = true;
      printBtn.classList.remove('btn-attention');
    }
    return;
  }
  
  const declarationsAffectees = clientDeclarations.filter(cd => 
    cd.client_id === clientId && cd.annee_comptable == annee
  );
  
  if (declarationsAffectees.length > 0) {
    printBtn.disabled = false;
    printBtn.classList.add('btn-attention');
  } else {
    printBtn.disabled = true;
    printBtn.classList.remove('btn-attention');
  }
}

function imprimerListeDeclarations() {
  const clientId = getSelectedClientId('clientSelection');
  const annee = document.getElementById('anneeAffectation').value;
  
  if (!clientId || clientId === 'tous') {
    alert('Veuillez sélectionner un client');
    return;
  }
  
  const declarationsAffectees = clientDeclarations.filter(cd => 
    cd.client_id === clientId && cd.annee_comptable == annee
  );
  
  if (declarationsAffectees.length === 0) {
    alert('Aucune déclaration affectée à ce client');
    return;
  }
  
  const client = clients.find(c => c.id === clientId);
  const declarationsAvecDetails = declarationsAffectees.map(cd => {
    const declType = declarationTypes.find(dt => dt.id === cd.declaration_type_id);
    return { ...cd, declaration_type: declType };
  });
  
  genererPDFListeDeclarations(client, declarationsAvecDetails, annee);
}

function genererPDFListeDeclarations(client, declarations, annee) {
  const printWindow = window.open('', '_blank');
  const dateGeneration = new Date().toLocaleDateString('fr-FR');
  
  const printContent = `
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Liste des Déclarations - ${client.nom_raison_sociale}</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 20px; background: white; color: #1f2937; line-height: 1.4; }
        .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #2563eb; padding-bottom: 15px; }
        .title { font-size: 1.8rem; font-weight: 700; color: #1f2937; margin-bottom: 0.5rem; }
        .subtitle { color: #6b7280; font-size: 1.1rem; }
        .client-info { background: #f8fafc; padding: 1.5rem; border-radius: 8px; margin-bottom: 2rem; border-left: 4px solid #2563eb; }
        .table { width: 100%; border-collapse: collapse; margin-bottom: 2rem; }
        .table th { background: #2563eb; color: white; padding: 1rem; text-align: left; font-weight: 600; }
        .table td { padding: 1rem; border-bottom: 1px solid #e5e7eb; }
        .table tr:nth-child(even) { background: #f8fafc; }
        .periodicite-badge { display: inline-block; padding: 0.25rem 0.75rem; border-radius: 12px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; }
        .mensuelle { background: #dbeafe; color: #1e40af; }
        .trimestrielle { background: #fef3c7; color: #92400e; }
        .annuelle { background: #d1fae5; color: #065f46; }
        .summary { background: #f0f9ff; padding: 1.5rem; border-radius: 8px; border-left: 4px solid #0ea5e9; margin-top: 2rem; }
        .footer { text-align: center; margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 0.875rem; }
        @page { margin: 10mm; }
        @media print { body { background: white !important; margin: 0; padding: 0; } }
    </style>
</head>
<body>
    <div class="header">
        <h1 class="title">NEW FID - Cabinet Comptable</h1>
        <h2 class="subtitle">Liste des Déclarations Affectées</h2>
    </div>
    
    <div class="client-info">
        <h3 style="margin: 0 0 0.5rem 0; color: #1f2937;">Client: ${client.nom_raison_sociale}</h3>
        ${client.ice ? `<p style="margin: 0; color: #6b7280;">ICE: ${client.ice}</p>` : ''}
        <p style="margin: 0.25rem 0 0 0; color: #6b7280;">Exercice: ${annee}</p>
    </div>
    
    <table class="table">
        <thead>
            <tr>
                <th>Déclaration</th>
                <th>Type</th>
                <th>Périodicité</th>
                <th>Date Début</th>
                <th>Date Fin</th>
            </tr>
        </thead>
        <tbody>
            ${declarations.map(decl => `
                <tr>
                    <td><strong>${decl.declaration_type.nom_template}</strong></td>
                    <td>${decl.declaration_type.type_declaration}</td>
                    <td><span class="periodicite-badge ${decl.declaration_type.periodicite}">${decl.declaration_type.periodicite}</span></td>
                    <td>${new Date(decl.date_debut).toLocaleDateString('fr-FR')}</td>
                    <td>${new Date(decl.date_fin).toLocaleDateString('fr-FR')}</td>
                </tr>
            `).join('')}
        </tbody>
    </table>
    
    <div class="summary">
        <h4 style="margin: 0 0 1rem 0; color: #0ea5e9;">Récapitulatif</h4>
        <p style="margin: 0;"><strong>Total des déclarations:</strong> ${declarations.length}</p>
        <p style="margin: 0.5rem 0 0 0;"><strong>Date de génération:</strong> ${dateGeneration}</p>
    </div>
    
    <div class="footer">Document généré par GEST FID - NEW FID Cabinet Comptable</div>
</body>
</html>
  `;
  
  printWindow.document.write(printContent);
  printWindow.document.close();
  printWindow.print();
}

/* =========================
   FONCTIONS GESTION HONORAIRES
   ========================= */

async function loadHonorairesFromSupabase() {
  try {
    console.log('Chargement des honoraires depuis Supabase...');
    
    const { data: facturations, error: errorFactu } = await supabase
      .from('honoraires_factures')
      .select('*')
      .order('date', { ascending: false });
    
    if (errorFactu) console.error('Erreur chargement facturations:', errorFactu);
    else {
      honosFactu = facturations || [];
      console.log(`${honosFactu.length} facturations chargées`);
    }
    
    const { data: paiements, error: errorPay } = await supabase
      .from('honoraires_paiements')
      .select('*')
      .order('date', { ascending: false });
    
    if (errorPay) console.error('Erreur chargement paiements:', errorPay);
    else {
      honosPay = paiements || [];
      console.log(`${honosPay.length} paiements chargés`);
    }
    
  } catch (e) {
    console.error('Erreur chargement honoraires Supabase:', e);
    honosFactu = [];
    honosPay = [];
  }
}

async function addFacturation(facturationData) {
  try {
    const { data, error } = await supabase
      .from('honoraires_factures')
      .insert([facturationData])
      .select();
    
    if (error) throw error;
    if (data && data[0]) honosFactu.unshift(data[0]);
    return data ? data[0] : null;
  } catch (error) {
    console.error('Erreur ajout facturation:', error);
    alert('Erreur lors de l\'ajout de la facturation: ' + error.message);
    return null;
  }
}

async function addPaiement(paiementData) {
  try {
    const { data, error } = await supabase
      .from('honoraires_paiements')
      .insert([paiementData])
      .select();
    
    if (error) throw error;
    if (data && data[0]) honosPay.unshift(data[0]);
    return data ? data[0] : null;
  } catch (error) {
    console.error('Erreur ajout paiement:', error);
    alert('Erreur lors de l\'ajout du paiement: ' + error.message);
    return null;
  }
}

async function updateFacturation(id, updates) {
  try {
    const { error } = await supabase
      .from('honoraires_factures')
      .update(updates)
      .eq('id', id);
    
    if (error) throw error;
    
    const index = honosFactu.findIndex(item => item.id === id);
    if (index !== -1) honosFactu[index] = { ...honosFactu[index], ...updates };
    
    return true;
  } catch (error) {
    console.error('Erreur modification facturation:', error);
    alert('Erreur lors de la modification: ' + error.message);
    return false;
  }
}

async function updatePaiement(id, updates) {
  try {
    const { error } = await supabase
      .from('honoraires_paiements')
      .update(updates)
      .eq('id', id);
    
    if (error) throw error;
    
    const index = honosPay.findIndex(item => item.id === id);
    if (index !== -1) honosPay[index] = { ...honosPay[index], ...updates };
    
    return true;
  } catch (error) {
    console.error('Erreur modification paiement:', error);
    alert('Erreur lors de la modification: ' + error.message);
    return false;
  }
}

async function deleteFacturation(id) {
  try {
    const { error } = await supabase
      .from('honoraires_factures')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
    honosFactu = honosFactu.filter(item => item.id !== id);
    return true;
  } catch (error) {
    console.error('Erreur suppression facturation:', error);
    alert('Erreur lors de la suppression: ' + error.message);
    return false;
  }
}

async function deletePaiement(id) {
  try {
    const { error } = await supabase
      .from('honoraires_paiements')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
    honosPay = honosPay.filter(item => item.id !== id);
    return true;
  } catch (error) {
    console.error('Erreur suppression paiement:', error);
    alert('Erreur lors de la suppression: ' + error.message);
    return false;
  }
}

async function setupHonoraires(){
  fillHonorairesClients();
  
  const exo = document.getElementById('honorairesExerciceSelect');

  if(clients.length) { 
    honosClientId = clients[0].id; 
    const selectElement = document.getElementById('honorairesClientSelect');
    if (selectElement) {
      const selectedDiv = selectElement.querySelector('.select-selected');
      const selectedClient = clients[0];
      selectedDiv.textContent = `${selectedClient.nom_raison_sociale}${selectedClient.ice ? ' - ' + selectedClient.ice : ''}`;
      selectedDiv.setAttribute('data-client-id', honosClientId);
    }
  }
  
  honosExercice = exo ? exo.value : new Date().getFullYear().toString();

  if (exo) {
    exo.addEventListener('change', () => { 
      honosExercice = exo.value; 
      refreshHonorairesUI(); 
    });
  }

  document.querySelectorAll('#honoraires .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const t = tab.getAttribute('data-tab');
      
      document.querySelectorAll('#honoraires .tab').forEach(x => x.classList.remove('active'));
      document.querySelectorAll('#honoraires .tab-content').forEach(x => x.classList.remove('active'));
      
      tab.classList.add('active'); 
      document.getElementById(t).classList.add('active');
    });
  });

  document.getElementById('btnFacturerService').addEventListener('click', async () => {
    if(!honosClientId) {
      alert('Sélectionnez un client');
      return;
    }
    
    const lib = prompt('Libellé du service ?'); 
    if(!lib) return;
    
    const m = Number(prompt('Montant (DH) ?')); 
    if(!m || isNaN(m)) return;
    
    const d = prompt('Date (YYYY-MM-DD) ?', toYMDLocal(new Date()));
    
    const facturationData = {
      client_id: honosClientId, 
      date: d, 
      libelle: lib, 
      exercice: parseInt(honosExercice), 
      montant: m
    };
    
    const result = await addFacturation(facturationData);
    if (result) refreshHonorairesUI();
  });
  
  document.getElementById('btnAjouterPaiement').addEventListener('click', async () => {
    if(!honosClientId) {
      alert('Sélectionnez un client');
      return;
    }
    
    const mode = prompt('Mode (Espèce/Chèque/Virement) ?') || 'Espèce';
    const ref = prompt('Référence ?') || '-';
    const m = Number(prompt('Montant (DH) ?')); 
    if(!m || isNaN(m)) return;
    
    const d = prompt('Date (YYYY-MM-DD) ?', toYMDLocal(new Date()));
    
    const paiementData = {
      client_id: honosClientId, 
      date: d, 
      mode: mode, 
      ref: ref, 
      montant: m
    };
    
    const result = await addPaiement(paiementData);
    if (result) refreshHonorairesUI();
  });

  refreshHonorairesUI();
}

let lastHonosState = { clientId: null, exercice: null, factuHash: '', payHash: '' };

function refreshHonorairesUI(){
  const currentState = getHonosCurrentState();
  if (!hasHonosDataChanged(currentState)) return;
  
  updateHonorairesDisplay();
  lastHonosState = currentState;
}

function getHonosCurrentState() {
  const rows = honosFactu.filter(x => x.client_id === honosClientId && x.exercice == honosExercice);
  const pay = honosPay.filter(x => x.client_id === honosClientId);
  
  return {
    clientId: honosClientId,
    exercice: honosExercice,
    factuHash: JSON.stringify(rows.map(r => r.id).sort()),
    payHash: JSON.stringify(pay.map(p => p.id).sort())
  };
}

function hasHonosDataChanged(currentState) {
  return currentState.clientId !== lastHonosState.clientId ||
         currentState.exercice !== lastHonosState.exercice ||
         currentState.factuHash !== lastHonosState.factuHash ||
         currentState.payHash !== lastHonosState.payHash;
}

function updateHonorairesDisplay() {
  const rows = honosFactu.filter(x => x.client_id === honosClientId && x.exercice == honosExercice);
  const pay = honosPay.filter(x => x.client_id === honosClientId);
  
  updateTableContent('factuTbody', rows, createFactuRow, 'Aucune facturation');
  updateTableContent('payTbody', pay, createPayRow, 'Aucun paiement');
  updateSituationTotals(rows, pay);
}

function updateTableContent(tbodyId, data, createRowFn, emptyMessage) {
  const tbody = document.getElementById(tbodyId);
  const existingRows = Array.from(tbody.querySelectorAll('tr[data-id]'));
  
  data.forEach((item, index) => {
    const existingRow = existingRows.find(row => row.dataset.id === item.id);
    if (existingRow) {
      updateExistingRow(existingRow, item, createRowFn);
    } else {
      const newRow = createRowFn(item);
      if (index < existingRows.length) {
        existingRows[index].before(newRow);
      } else {
        tbody.appendChild(newRow);
      }
    }
  });
  
  existingRows.forEach(row => {
    if (!data.find(item => item.id === row.dataset.id)) row.remove();
  });
  
  const noDataRow = tbody.querySelector('.no-data');
  if (data.length === 0 && !noDataRow) {
    tbody.innerHTML = `<tr><td colspan="5" class="no-data">${emptyMessage}</td></tr>`;
  } else if (data.length > 0 && noDataRow) {
    noDataRow.remove();
  }
}

function createFactuRow(r) {
  const row = document.createElement('tr');
  row.dataset.id = r.id;
  row.innerHTML = `
    <td>${r.date}</td>
    <td>${r.libelle}</td>
    <td>${r.exercice}</td>
    <td style="text-align:right">${r.montant.toFixed(2)}</td>
    <td class="actions">
      <div class="dropdown">
        <button class="action-btn">Action ▾</button>
        <div class="dropdown-content">
          <a href="#" class="action-edit-factu" data-id="${r.id}">
            <i class="fas fa-edit"></i> Modifier
          </a>
          <a href="#" class="action-delete-factu" data-id="${r.id}">
            <i class="fas fa-trash"></i> Supprimer
          </a>
        </div>
      </div>
    </td>
  `;
  return row;
}

function createPayRow(r) {
  const row = document.createElement('tr');
  row.dataset.id = r.id;
  row.innerHTML = `
    <td>${r.date}</td>
    <td>${r.mode}</td>
    <td>${r.ref}</td>
    <td style="text-align:right">${r.montant.toFixed(2)}</td>
    <td class="actions">
      <div class="dropdown">
        <button class="action-btn">Action ▾</button>
        <div class="dropdown-content">
          <a href="#" class="action-edit-pay" data-id="${r.id}">
            <i class="fas fa-edit"></i> Modifier
          </a>
          <a href="#" class="action-delete-pay" data-id="${r.id}">
            <i class="fas fa-trash"></i> Supprimer
          </a>
        </div>
      </div>
    </td>
  `;
  return row;
}
document.addEventListener('click', function(e) {
  // Facturations
  const editFactu = e.target.closest('.action-edit-factu');
  if (editFactu) {
    e.preventDefault();
    const id = editFactu.getAttribute('data-id');
    editHonosFactu(id);
    return;
  }
  
  const deleteFactu = e.target.closest('.action-delete-factu');
  if (deleteFactu) {
    e.preventDefault();
    const id = deleteFactu.getAttribute('data-id');
    delHonosFactu(id);
    return;
  }
  
  // Paiements
  const editPay = e.target.closest('.action-edit-pay');
  if (editPay) {
    e.preventDefault();
    const id = editPay.getAttribute('data-id');
    editHonosPay(id);
    return;
  }
  
  const deletePay = e.target.closest('.action-delete-pay');
  if (deletePay) {
    e.preventDefault();
    const id = deletePay.getAttribute('data-id');
    delHonosPay(id);
    return;
  }
});
function updateExistingRow(row, item, createRowFn) {
  const newRow = createRowFn(item);
  row.innerHTML = newRow.innerHTML;
  row.dataset.id = newRow.dataset.id;
}

function updateSituationTotals(rows, pay) {
  const factu = rows;
  const totalF = factu.reduce((a, b) => a + (b.montant || 0), 0);
  const payClient = pay.filter(p => {
    const payDate = parseYMDLocal(p.date);
    const payYear = payDate.getFullYear();
    return payYear.toString() === honosExercice;
  });
  const totalP = payClient.reduce((a, b) => a + (b.montant || 0), 0);
  const report = calcReportFor(honosClientId, Number(honosExercice) - 1);
  const solde = (report + totalF) - totalP;

  document.getElementById('sitTotalServices').textContent = totalF.toFixed(2);
  document.getElementById('sitTotalPaiements').textContent = totalP.toFixed(2);
  document.getElementById('sitReport').textContent = report.toFixed(2);
  document.getElementById('sitSolde').textContent = solde.toFixed(2);
  
  updateSituationTables(factu, payClient);
}

function updateSituationTables(factu, payClient) {
  updateTableContent('sitFactuTbody', factu, createSituationFactuRow, 'Aucune donnée');
  updateTableContent('sitPayTbody', payClient, createSituationPayRow, 'Aucune donnée');
}

function createSituationFactuRow(r) {
  const row = document.createElement('tr');
  row.dataset.id = r.id;
  row.innerHTML = `
    <td>${r.date}</td>
    <td>${r.libelle}</td>
    <td style="text-align:right">${r.montant.toFixed(2)}</td>
  `;
  return row;
}

function createSituationPayRow(r) {
  const row = document.createElement('tr');
  row.dataset.id = r.id;
  row.innerHTML = `
    <td>${r.date}</td>
    <td>${r.ref}</td>
    <td style="text-align:right">${r.montant.toFixed(2)}</td>
  `;
  return row;
}

function calcReportFor(clientId, annee){
  if(!clientId || !annee) return 0;
  
  const f = honosFactu.filter(x => x.client_id === clientId && x.exercice == annee);
  const p = honosPay.filter(x => {
    if (x.client_id !== clientId) return false;
    const payDate = parseYMDLocal(x.date);
    const payYear = payDate.getFullYear();
    return payYear.toString() === annee.toString();
  });
  
  const totalF = f.reduce((a, b) => a + (b.montant || 0), 0);
  const totalP = p.reduce((a, b) => a + (b.montant || 0), 0);
  const solde = totalF - totalP;
  
  return solde > 0 ? solde : 0;
}

window.editHonosFactu = async (id) => {
  const it = honosFactu.find(x => x.id === id); 
  if(!it) return;
  
  const lib = prompt('Libellé ?', it.libelle) || it.libelle;
  const m = Number(prompt('Montant ?', it.montant)); 
  if(isNaN(m) || m <= 0) return;
  
  const d = prompt('Date (YYYY-MM-DD) ?', it.date) || it.date;
  
  const updates = { libelle: lib, montant: m, date: d };
  const success = await updateFacturation(id, updates);
  if (success) refreshHonorairesUI();
};

window.delHonosFactu = async (id) => {
  if(confirm('Supprimer cette facturation ?')) {
    const success = await deleteFacturation(id);
    if (success) refreshHonorairesUI();
  }
};

window.editHonosPay = async (id) => {
  const it = honosPay.find(x => x.id === id); 
  if(!it) return;
  
  const mode = prompt('Mode ?', it.mode) || it.mode;
  const ref = prompt('Référence ?', it.ref) || it.ref;
  const m = Number(prompt('Montant ?', it.montant)); 
  if(isNaN(m) || m <= 0) return;
  
  const d = prompt('Date (YYYY-MM-DD) ?', it.date) || it.date;
  
  const updates = { mode: mode, ref: ref, montant: m, date: d };
  const success = await updatePaiement(id, updates);
  if (success) refreshHonorairesUI();
};

window.delHonosPay = async (id) => {
  if(confirm('Supprimer ce paiement ?')) {
    const success = await deletePaiement(id);
    if (success) refreshHonorairesUI();
  }
};

// Impression situation honoraires
document.getElementById('btnImprimerSituation').addEventListener('click', () => {
  if(!honosClientId) {
    alert('Veuillez sélectionner un client');
    return;
  }
  
  const client = clients.find(c => c.id === honosClientId);
  const clientNom = client ? client.nom_raison_sociale : 'Client inconnu';
  const clientICE = client ? client.ice : '';
  
  const printWindow = window.open('', '_blank');
  const printContent = `
    <html>
      <head>
        <title>Situation Honoraires - ${clientNom}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 10px; }
          .client-info { margin-bottom: 20px; }
          .table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          .table th, .table td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          .table th { background-color: #f5f5f5; }
          .totaux { margin-top: 30px; padding: 15px; background-color: #f9f9f9; border-radius: 5px; }
          .totaux div { margin-bottom: 5px; }
          .date-print { text-align: right; font-size: 12px; color: #666; margin-bottom: 20px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>NEW FID - Cabinet Comptable</h1>
          <h2>Situation des Honoraires</h2>
        </div>
        
        <div class="date-print">Imprimé le: ${new Date().toLocaleDateString('fr-FR')}</div>
        
        <div class="client-info">
          <h3>Client: ${clientNom}</h3>
          ${clientICE ? `<p>ICE: ${clientICE}</p>` : ''}
          <p>Exercice: ${honosExercice}</p>
        </div>
        
        <div style="display: flex; gap: 20px;">
          <div style="flex: 1;">
            <h4>Services Facturés</h4>
            <table class="table">
              <thead><tr><th>Date</th><th>Libellé</th><th>Montant (DH)</th></tr></thead>
              <tbody>${document.getElementById('sitFactuTbody').innerHTML}</tbody>
            </table>
          </div>
          
          <div style="flex: 1;">
            <h4>Paiements</h4>
            <table class="table">
              <thead><tr><th>Date</th><th>Référence</th><th>Montant (DH)</th></tr></thead>
              <tbody>${document.getElementById('sitPayTbody').innerHTML}</tbody>
            </table>
          </div>
        </div>
        
        <div class="totaux">
          <div><strong>Total services:</strong> <span id="sitTotalServices">${document.getElementById('sitTotalServices').textContent}</span> DH</div>
          <div><strong>Total paiements:</strong> <span id="sitTotalPaiements">${document.getElementById('sitTotalPaiements').textContent}</span> DH</div>
          <div><strong>Report (N-1):</strong> <span id="sitReport">${document.getElementById('sitReport').textContent}</span> DH</div>
          <div><strong>Solde exercice:</strong> <span id="sitSolde">${document.getElementById('sitSolde').textContent}</span> DH</div>
        </div>
      </body>
    </html>
  `;
  
  printWindow.document.write(printContent);
  printWindow.document.close();
  printWindow.print();
});

/* =========================
   FONCTIONS SITUATION GLOBALE
   ========================= */

function initializeSituationGlobale() {
  loadSituationGlobale();
  
  document.getElementById('globalExerciceSelect').addEventListener('change', loadSituationGlobale);
  document.getElementById('filtreStatut').addEventListener('change', filterSituationGlobale);
  document.getElementById('filtreMontant').addEventListener('change', filterSituationGlobale);
  document.getElementById('rechercheGlobale').addEventListener('input', filterSituationGlobale);
  document.getElementById('exportSituationBtn').addEventListener('click', exportSituationExcel);
}

function loadSituationGlobale() {
  const exercice = parseInt(document.getElementById('globalExerciceSelect').value);
  
  console.log('🔄 Chargement situation globale pour exercice:', exercice);
  console.log('📊 Données disponibles - Factures:', honosFactu.length, 'Paiements:', honosPay.length);
  
  situationGlobaleData = clients.map(client => {
    const facturations = honosFactu.filter(f => 
      f.client_id === client.id && parseInt(f.exercice) === exercice
    );
    
    const paiements = honosPay.filter(p => {
      if (p.client_id !== client.id) return false;
      if (p.exercice !== undefined && p.exercice !== null) {
        return parseInt(p.exercice) === exercice;
      } else {
        const payDate = parseYMDLocal(p.date);
        const payYear = payDate.getFullYear();
        return payYear === exercice;
      }
    });
    
    const totalFacture = facturations.reduce((sum, f) => sum + (parseFloat(f.montant) || 0), 0);
    const totalPaye = paiements.reduce((sum, p) => sum + (parseFloat(p.montant) || 0), 0);
    const resteAPayer = totalFacture - totalPaye;
    
    let statut = 'a_jour';
    if (resteAPayer > 0) {
      const dernierPaiement = paiements.sort((a, b) => 
        new Date(b.date) - new Date(a.date)
      )[0];
      
      if (!dernierPaiement) {
        statut = 'impaye';
      } else {
        const moisDepuisPaiement = (new Date().getFullYear() - new Date(dernierPaiement.date).getFullYear()) * 12 + 
                                  (new Date().getMonth() - new Date(dernierPaiement.date).getMonth());
        statut = moisDepuisPaiement > 3 ? 'en_retard' : 'a_jour';
      }
    }
    
    const dernierPaiement = paiements.sort((a, b) => 
      new Date(b.date) - new Date(a.date)
    )[0];
    
    return {
      client,
      totalFacture,
      totalPaye,
      resteAPayer,
      statut,
      dernierPaiement: dernierPaiement ? {
        date: dernierPaiement.date,
        montant: dernierPaiement.montant
      } : null,
      facturations,
      paiements
    };
  });
  
  console.log('✅ Situation globale calculée:', situationGlobaleData);
  updateSituationGlobaleUI();
  updateCharts();
}

function updateSituationGlobaleUI() {
  const tbody = document.getElementById('situationGlobaleTableBody');
  const dataFiltree = filterSituationData(situationGlobaleData);
  
  updateTotauxGlobaux(dataFiltree);
  
  if (!dataFiltree.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="no-data">Aucune donnée trouvée</td></tr>';
    return;
  }
  
  tbody.innerHTML = dataFiltree.map(item => `
    <tr>
      <td>
        <strong>${item.client.nom_raison_sociale}</strong>
        ${item.client.contact ? `<br><small>${item.client.contact}</small>` : ''}
      </td>
      <td>${item.client.ice || '-'}</td>
      <td style="text-align: right; font-weight: 600;">${formatMoney(item.totalFacture)}</td>
      <td style="text-align: right; color: var(--success-color); font-weight: 600;">${formatMoney(item.totalPaye)}</td>
      <td style="text-align: right; color: ${item.resteAPayer > 0 ? 'var(--warning-color)' : 'var(--success-color)'}; font-weight: 600;">
        ${formatMoney(item.resteAPayer)}
      </td>
      <td>
        <span class="statut-badge ${getStatutClass(item.statut)}">
          ${getStatutLabel(item.statut)}
        </span>
      </td>
      <td>
        ${item.dernierPaiement ? `
          ${new Date(item.dernierPaiement.date).toLocaleDateString('fr-FR')}
          <br><small>${formatMoney(item.dernierPaiement.montant)} DH</small>
        ` : 'Aucun'}
      </td>
      <td class="actions">
        <button class="btn-primary" onclick="voirDetailClient('${item.client.id}')">
          <i class="fas fa-eye"></i> Détail
        </button>
      </td>
    </tr>
  `).join('');
}

function filterSituationData(data) {
  const filtreStatut = document.getElementById('filtreStatut').value;
  const filtreMontant = document.getElementById('filtreMontant').value;
  const recherche = document.getElementById('rechercheGlobale').value.toLowerCase();
  
  return data.filter(item => {
    if (filtreStatut !== 'tous' && item.statut !== filtreStatut) return false;
    
    if (filtreMontant !== 'tous') {
      const montant = item.resteAPayer;
      switch (filtreMontant) {
        case '0-5000': if (montant > 5000) return false; break;
        case '5000-20000': if (montant <= 5000 || montant > 20000) return false; break;
        case '20000+': if (montant <= 20000) return false; break;
      }
    }
    
    if (recherche && !(
      item.client.nom_raison_sociale.toLowerCase().includes(recherche) ||
      (item.client.ice && item.client.ice.toLowerCase().includes(recherche)) ||
      (item.client.contact && item.client.contact.toLowerCase().includes(recherche))
    )) return false;
    
    return true;
  });
}

function updateTotauxGlobaux(data) {
  const totalClients = data.length;
  const totalFacture = data.reduce((sum, item) => sum + item.totalFacture, 0);
  const totalPaye = data.reduce((sum, item) => sum + item.totalPaye, 0);
  const totalRestant = data.reduce((sum, item) => sum + item.resteAPayer, 0);
  
  document.getElementById('totalClientsGlobale').textContent = totalClients;
  document.getElementById('totalFactureGlobale').textContent = formatMoney(totalFacture);
  document.getElementById('totalPayeGlobale').textContent = formatMoney(totalPaye);
  document.getElementById('totalRestantGlobale').textContent = formatMoney(totalRestant);
}

function filterSituationGlobale() {
  updateSituationGlobaleUI();
  updateCharts();
}

function formatMoney(amount) {
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

function getStatutClass(statut) {
  const classes = {
    'a_jour': 'actif',
    'en_retard': 'inactif',
    'impaye': 'archive'
  };
  return classes[statut] || 'archive';
}

function getStatutLabel(statut) {
  const labels = {
    'a_jour': 'À jour',
    'en_retard': 'En retard',
    'impaye': 'Impayé'
  };
  return labels[statut] || 'Inconnu';
}

window.voirDetailClient = function(clientId) {
  document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  
  document.querySelector('[data-page="honoraires"]').classList.add('active');
  document.getElementById('honoraires').classList.add('active');
  
  honosClientId = clientId;
  const selectElement = document.getElementById('honorairesClientSelect');
  if (selectElement) {
    const selectedDiv = selectElement.querySelector('.select-selected');
    const client = clients.find(c => c.id === clientId);
    if (client) {
      selectedDiv.textContent = `${client.nom_raison_sociale}${client.ice ? ' - ' + client.ice : ''}`;
      selectedDiv.setAttribute('data-client-id', clientId);
    }
  }
  
  refreshHonorairesUI();
};

function exportSituationExcel() {
  const data = filterSituationData(situationGlobaleData);
  const exercice = document.getElementById('globalExerciceSelect').value;
  
  let csvContent = "Données exportées le: " + new Date().toLocaleDateString('fr-FR') + "\n";
  csvContent += "Exercice: " + exercice + "\n\n";
  csvContent += "Client;ICE;Total Facturé (DH);Total Payé (DH);Reste à Payer (DH);Statut;Dernier Paiement\n";
  
  data.forEach(item => {
    csvContent += `"${item.client.nom_raison_sociale}";"${item.client.ice || ''}";"${formatMoney(item.totalFacture)}";"${formatMoney(item.totalPaye)}";"${formatMoney(item.resteAPayer)}";"${getStatutLabel(item.statut)}";"${item.dernierPaiement ? new Date(item.dernierPaiement.date).toLocaleDateString('fr-FR') + ' - ' + formatMoney(item.dernierPaiement.montant) + ' DH' : 'Aucun'}"\n`;
  });
  
  const totalFacture = data.reduce((sum, item) => sum + item.totalFacture, 0);
  const totalPaye = data.reduce((sum, item) => sum + item.totalPaye, 0);
  const totalRestant = data.reduce((sum, item) => sum + item.resteAPayer, 0);
  
  csvContent += `\n"TOTAUX";"";"${formatMoney(totalFacture)}";"${formatMoney(totalPaye)}";"${formatMoney(totalRestant)}";"";""\n`;
  
  const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `situation_globale_${exercice}_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function updateCharts() {
  const data = filterSituationData(situationGlobaleData);
  
  const statuts = {
    'a_jour': data.filter(item => item.statut === 'a_jour').length,
    'en_retard': data.filter(item => item.statut === 'en_retard').length,
    'impaye': data.filter(item => item.statut === 'impaye').length
  };
  
  const topClients = data
    .filter(item => item.resteAPayer > 0)
    .sort((a, b) => b.resteAPayer - a.resteAPayer)
    .slice(0, 10);
  
  const chartStatut = document.getElementById('chartStatut');
  const chartTopClients = document.getElementById('chartTopClients');
  
  chartStatut.innerHTML = `
    <div style="text-align: center;">
      <div style="display: flex; justify-content: center; gap: 2rem; margin-bottom: 1rem;">
        <div style="text-align: center;">
          <div style="width: 20px; height: 20px; background: var(--success-color); border-radius: 50%; margin: 0 auto 0.5rem;"></div>
          <div>À jour: ${statuts.a_jour}</div>
        </div>
        <div style="text-align: center;">
          <div style="width: 20px; height: 20px; background: var(--warning-color); border-radius: 50%; margin: 0 auto 0.5rem;"></div>
          <div>En retard: ${statuts.en_retard}</div>
        </div>
        <div style="text-align: center;">
          <div style="width: 20px; height: 20px; background: var(--error-color); border-radius: 50%; margin: 0 auto 0.5rem;"></div>
          <div>Impayé: ${statuts.impaye}</div>
        </div>
      </div>
    </div>
  `;
  
  chartTopClients.innerHTML = `
    <div style="text-align: center;">
      ${topClients.length > 0 ? topClients.map((item, index) => `
        <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; padding: 0.5rem; background: #f8fafc; border-radius: 4px;">
          <span>${index + 1}. ${item.client.nom_raison_sociale}</span>
          <strong style="color: var(--warning-color);">${formatMoney(item.resteAPayer)} DH</strong>
        </div>
      `).join('') : '<div class="no-data">Aucun impayé</div>'}
    </div>
  `;
}

/* =========================
   FONCTIONS GESTION CODES
   ========================= */

function initializeCodesPage() {
  console.log('🔐 Initialisation de la page Codes - Version corrigée');
  setupCodesEventListeners();
  setupCodesClientSelects();
  setupCodesTabs();
}

function setupCodesEventListeners() {
  document.querySelectorAll('#codes .tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      const target = e.target.getAttribute('data-tab');
      switchCodesTab(target);
    });
  });
  
  document.getElementById('btnModifierCodes').addEventListener('click', switchToEditMode);
  document.getElementById('btnAnnulerCodes').addEventListener('click', cancelEdit);
  document.getElementById('formCodesClient').addEventListener('submit', handleSaveCodes);
}

function setupCodesClientSelects() {
  initializeCustomSelects();
  
  setTimeout(() => {
    populateCustomSelect('filtreClientCodes', clients, null, false);
    populateCustomSelect('ajoutClientSelect', clients, null, false);
    setupCodesSelectListeners();
  }, 100);
}

function setupCodesSelectListeners() {
  const filtreSelect = document.getElementById('filtreClientCodes');
  if (filtreSelect) {
    const selectedDiv = filtreSelect.querySelector('.select-selected');
    const observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(mutation) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'data-client-id') {
          const clientId = selectedDiv.getAttribute('data-client-id');
          console.log('👤 Client sélectionné (affichage):', clientId);
          handleClientSelectionForDisplay(clientId);
        }
      });
    });
    observer.observe(selectedDiv, { attributes: true });
  }
  
  const ajoutSelect = document.getElementById('ajoutClientSelect');
  if (ajoutSelect) {
    const selectedDiv = ajoutSelect.querySelector('.select-selected');
    const observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(mutation) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'data-client-id') {
          const clientId = selectedDiv.getAttribute('data-client-id');
          console.log('👤 Client sélectionné (ajout):', clientId);
          handleClientSelectionForAdd(clientId);
        }
      });
    });
    observer.observe(selectedDiv, { attributes: true });
  }
}

function setupCodesTabs() {
  // Rien de plus ici, tout est géré dans setupCodesClientSelects()
}

function switchCodesTab(tabName) {
  document.querySelectorAll('#codes .tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('#codes .tab-content').forEach(c => c.classList.remove('active'));
  
  const tabElement = document.querySelector(`#codes .tab[data-tab="${tabName}"]`);
  const contentElement = document.getElementById(tabName);
  
  if (tabElement) tabElement.classList.add('active');
  if (contentElement) contentElement.classList.add('active');
  
  if (tabName === 'afficher-codes') resetEditMode();
  console.log('📁 Onglet changé:', tabName);
}

async function handleClientSelectionForDisplay(clientId) {
  console.log('🔄 Traitement sélection affichage:', clientId);
  
  if (!clientId || clientId === 'null') {
    showNoClientSelected();
    document.getElementById('btnModifierCodes').disabled = true;
    return;
  }
  
  currentSelectedClientId = clientId;
  document.getElementById('btnModifierCodes').disabled = false;
  await loadClientCodes(clientId);
  displayClientCodesForView();
}

async function handleClientSelectionForAdd(clientId) {
  console.log('🔄 Traitement sélection ajout:', clientId);
  
  if (!clientId || clientId === 'null') {
    hideClientExistsMessage();
    clearForm();
    document.getElementById('btnEnregistrerCodes').disabled = true;
    return;
  }
  
  document.getElementById('btnEnregistrerCodes').disabled = false;
  await checkIfClientHasCodes(clientId);
}

async function loadClientCodes(clientId) {
  try {
    console.log(`📥 Chargement des codes pour: ${clientId}`);
    const client = clients.find(c => c.id === clientId);
    
    if (client) {
      codesData = client;
      console.log('✅ Codes chargés depuis clients:', codesData);
    } else {
      codesData = null;
      console.log('❌ Client non trouvé');
    }
    
  } catch (error) {
    console.error('❌ Erreur chargement codes:', error);
    codesData = null;
  }
}

async function checkIfClientHasCodes(clientId) {
  const client = clients.find(c => c.id === clientId);
  codesData = client || null;
  
  if (codesData && hasCodesData(codesData)) {
    showClientExistsMessage();
    fillFormWithData(codesData);
    isEditMode = true;
    document.getElementById('btnEnregistrerCodes').textContent = 'Mettre à jour les Codes';
    console.log('ℹ️ Client existant - mode édition activé');
  } else {
    hideClientExistsMessage();
    clearForm();
    isEditMode = false;
    document.getElementById('btnEnregistrerCodes').textContent = 'Enregistrer les Codes';
    console.log('🆕 Nouveau client - formulaire vide');
  }
}

function hasCodesData(client) {
  return client.simpl_login || client.damancom_login || client.barid_login || 
         client.email_login || client.marche_login || client.anapec_login;
}

function displayClientCodesForView() {
  const container = document.getElementById('affichageCodesContainer');
  
  if (!currentSelectedClientId) {
    showNoClientSelected();
    return;
  }
  
  if (!codesData) {
    container.innerHTML = `
      <div class="no-data-card">
        <i class="fas fa-key" style="font-size: 3rem; color: var(--text-secondary); margin-bottom: 1rem;"></i>
        <h3>Aucun code enregistré</h3>
        <p>Ce client n'a pas encore de codes d'accès enregistrés</p>
        <button class="btn-primary" onclick="switchCodesTab('ajouter-codes')" style="margin-top: 1rem;">
          <i class="fas fa-plus"></i> Ajouter des codes
        </button>
      </div>
    `;
    return;
  }
  
  const selectedClient = clients.find(c => c.id === currentSelectedClientId);
  
  container.innerHTML = `
    <div class="card">
      <div style="display: flex; justify-content: between; align-items: center; margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border-color);">
        <h3 style="margin: 0; color: var(--text-primary);">Codes d'accès - ${selectedClient.nom_raison_sociale}</h3>
        <div style="font-size: 0.875rem; color: var(--text-secondary);">
          Dernière modification: ${codesData.updated_at ? new Date(codesData.updated_at).toLocaleDateString('fr-FR') : 'Non disponible'}
        </div>
      </div>
      
      ${generateServiceCards()}
      
      <div style="margin-top: 1rem; padding: 1rem; background: var(--bg-secondary); border-radius: 8px;">
        <i class="fas fa-info-circle" style="color: var(--info-color); margin-right: 0.5rem;"></i>
        <span style="color: var(--text-secondary); font-size: 0.875rem;">
          Double-cliquez sur n'importe quel champ pour copier son contenu
        </span>
      </div>
    </div>
  `;
  
  setupCopyToClipboard();
}

function generateServiceCards() {
  const services = [
    {
      name: 'SIMPL',
      icon: 'fas fa-building',
      fields: [
        { label: 'Mot de passe Adhésion', value: codesData.simpl_mdp_adhesion, id: 'simpl_mdp_adhesion' },
        { label: 'Login', value: codesData.simpl_login, id: 'simpl_login' },
        { label: 'Mot de passe', value: codesData.simpl_mot_de_passe, id: 'simpl_mot_de_passe' },
        { label: 'Email', value: codesData.simpl_email, id: 'simpl_email' }
      ]
    },
    {
      name: 'DAMANCOM',
      icon: 'fas fa-cloud',
      fields: [
        { label: 'Login', value: codesData.damancom_login, id: 'damancom_login' },
        { label: 'Mot de passe', value: codesData.damancom_mot_de_passe, id: 'damancom_mot_de_passe' },
        { label: 'Email', value: codesData.damancom_email, id: 'damancom_email' }
      ]
    },
    {
      name: 'BARID E-SIGN',
      icon: 'fas fa-signature',
      fields: [
        { label: 'Login', value: codesData.barid_login, id: 'barid_login' },
        { label: 'Mot de passe', value: codesData.barid_mot_de_passe, id: 'barid_mot_de_passe' },
        { label: 'Email', value: codesData.barid_email, id: 'barid_email' }
      ]
    },
    {
      name: 'EMAIL',
      icon: 'fas fa-envelope',
      fields: [
        { label: 'Login (email)', value: codesData.email_login, id: 'email_login' },
        { label: 'Mot de passe', value: codesData.email_mot_de_passe, id: 'email_mot_de_passe' }
      ]
    },
    {
      name: 'MARCHÉ PUBLIQUE',
      icon: 'fas fa-gavel',
      fields: [
        { label: 'Login', value: codesData.marche_login, id: 'marche_login' },
        { label: 'Mot de passe', value: codesData.marche_mot_de_passe, id: 'marche_mot_de_passe' }
      ]
    },
    {
      name: 'ANAPEC',
      icon: 'fas fa-briefcase',
      fields: [
        { label: 'Login', value: codesData.anapec_login, id: 'anapec_login' },
        { label: 'Mot de passe', value: codesData.anapec_mot_de_passe, id: 'anapec_mot_de_passe' }
      ]
    }
  ];
  
  return services.map((service, index) => `
    <div class="code-service-card">
      <div class="code-service-header">
        <div class="code-service-icon">
          <i class="${service.icon}"></i>
        </div>
        <h4 class="code-service-title">${service.name}</h4>
      </div>
      
      <div class="code-fields-container">
        ${service.fields.map(field => `
          <div class="code-field-group">
            <span class="code-field-label">${field.label}</span>
            <span class="code-field-value" data-field-id="${field.id}">
              ${field.value || '<span style="color: var(--text-secondary); font-style: italic;">Non renseigné</span>'}
            </span>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

function setupCopyToClipboard() {
  document.querySelectorAll('.code-field-value').forEach(field => {
    field.addEventListener('dblclick', function(e) {
      const text = this.textContent.trim();
      if (!text || text.includes('Non renseigné')) return;
      copyFieldContent(this, text);
    });
  });
}

function copyFieldContent(element, text) {
  navigator.clipboard.writeText(text).then(() => {
    element.classList.add('copie-effect');
    setTimeout(() => element.classList.remove('copie-effect'), 1000);
  }).catch(err => {
    console.error('Erreur copie:', err);
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    element.classList.add('copie-effect');
    setTimeout(() => element.classList.remove('copie-effect'), 1000);
  });
}

function switchToEditMode() {
  if (!currentSelectedClientId) return;
  
  if (codesData) fillFormWithData(codesData);
  
  const selectElement = document.getElementById('ajoutClientSelect');
  const selectedDiv = selectElement.querySelector('.select-selected');
  const client = clients.find(c => c.id === currentSelectedClientId);
  
  if (client) {
    selectedDiv.textContent = `${client.nom_raison_sociale}${client.ice ? ' - ' + client.ice : ''}`;
    selectedDiv.setAttribute('data-client-id', currentSelectedClientId);
  }
  
  switchCodesTab('ajouter-codes');
  
  if (codesData) {
    showClientExistsMessage();
    isEditMode = true;
    document.getElementById('btnEnregistrerCodes').textContent = 'Mettre à jour les Codes';
  }
}

function fillFormWithData(data) {
  const fields = [
    'simpl_mdp_adhesion', 'simpl_login', 'simpl_mot_de_passe', 'simpl_email',
    'damancom_login', 'damancom_mot_de_passe', 'damancom_email',
    'barid_login', 'barid_mot_de_passe', 'barid_email',
    'email_login', 'email_mot_de_passe',
    'marche_login', 'marche_mot_de_passe',
    'anapec_login', 'anapec_mot_de_passe'
  ];
  
  fields.forEach(field => {
    const element = document.getElementById(field);
    if (element && data[field]) element.value = data[field];
  });
}

function clearForm() {
  document.getElementById('formCodesClient').reset();
}

function showClientExistsMessage() {
  document.getElementById('messageClientExistant').style.display = 'flex';
}

function hideClientExistsMessage() {
  document.getElementById('messageClientExistant').style.display = 'none';
}

function showNoClientSelected() {
  const container = document.getElementById('affichageCodesContainer');
  container.innerHTML = `
    <div class="no-data-card">
      <i class="fas fa-hand-pointer" style="font-size: 3rem; color: var(--text-secondary); margin-bottom: 1rem;"></i>
      <h3>Sélectionnez un client</h3>
      <p>Veuillez choisir un client dans la liste déroulante pour afficher ses codes d'accès</p>
    </div>
  `;
}

function cancelEdit() {
  clearForm();
  hideClientExistsMessage();
  switchCodesTab('afficher-codes');
}

function resetEditMode() {
  isEditMode = false;
  document.getElementById('btnEnregistrerCodes').textContent = 'Enregistrer les Codes';
}

async function handleSaveCodes(e) {
  e.preventDefault();
  
  const clientId = getSelectedClientId('ajoutClientSelect');
  if (!clientId) {
    alert('❌ Veuillez sélectionner un client');
    return;
  }
  
  try {
    const formData = getFormData();
    
    const { data, error } = await supabase
      .from('clients')
      .update(formData)
      .eq('id', clientId)
      .select();
    
    if (error) throw error;
    
    if (data && data[0]) {
      alert(`✅ Codes ${isEditMode ? 'mis à jour' : 'enregistrés'} avec succès !`);
      currentSelectedClientId = clientId;
      await loadClients();
      await loadClientCodes(clientId);
      switchCodesTab('afficher-codes');
      displayClientCodesForView();
    }
    
  } catch (error) {
    console.error('❌ Erreur sauvegarde codes:', error);
    alert(`❌ Erreur lors de la sauvegarde: ${error.message}`);
  }
}

function getFormData() {
  const fields = [
    'simpl_mdp_adhesion', 'simpl_login', 'simpl_mot_de_passe', 'simpl_email',
    'damancom_login', 'damancom_mot_de_passe', 'damancom_email',
    'barid_login', 'barid_mot_de_passe', 'barid_email',
    'email_login', 'email_mot_de_passe',
    'marche_login', 'marche_mot_de_passe',
    'anapec_login', 'anapec_mot_de_passe'
  ];
  
  const formData = {};
  fields.forEach(field => {
    const element = document.getElementById(field);
    formData[field] = element.value.trim() || null;
  });
  
  return formData;
}

/* =========================
   FONCTIONS GESTION UTILISATEURS
   ========================= */

function initializeUsersManagement() {
  console.log('👥 Initialisation gestion utilisateurs');
  loadCurrentUser();
  setupUsersEventListeners();
  loadUsersData();
}

function loadCurrentUser() {
  const savedUser = localStorage.getItem('currentUser');
  if (savedUser) {
    currentUser = JSON.parse(savedUser);
    updateUserUI();
  }
}

function updateUserUI() {
  document.getElementById('currentUserName').textContent = currentUser.nom_complet;
  document.getElementById('currentUserRole').textContent = currentUser.role === 'admin' ? 'Administrateur' : 'utilisateur';
  
  if (currentUser.role !== 'admin') {
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
  } else {
    document.body.classList.add('user-admin');
  }
}

function setupUsersEventListeners() {
  document.querySelectorAll('#gestion-utilisateurs .tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      const target = e.target.getAttribute('data-tab');
      switchUsersTab(target);
    });
  });
  
  document.getElementById('formAddUser').addEventListener('submit', handleAddUser);
  document.getElementById('filterUserActivity').addEventListener('change', loadActivityLogs);
  document.getElementById('filterActionType').addEventListener('change', loadActivityLogs);
}

function switchUsersTab(tabName) {
  document.querySelectorAll('#gestion-utilisateurs .tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('#gestion-utilisateurs .tab-content').forEach(c => c.classList.remove('active'));
  
  document.querySelector(`#gestion-utilisateurs .tab[data-tab="${tabName}"]`).classList.add('active');
  document.getElementById(tabName).classList.add('active');
  
  if (tabName === 'liste-utilisateurs') loadUsersList();
  else if (tabName === 'historique-activites' && currentUser.role === 'admin') loadActivityLogs();
}

async function loadUsersData() {
  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    allUsers = users || [];
    loadUsersList();
    populateUserFilter();
    
  } catch (error) {
    console.error('❌ Erreur chargement utilisateurs:', error);
  }
}

function loadUsersList() {
  const tbody = document.getElementById('usersTableBody');
  
  if (!allUsers.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="no-data">Aucun utilisateur trouvé</td></tr>';
    return;
  }
  
  const activeUsers = allUsers.filter(u => u.is_active).length;
  document.getElementById('countActiveUsers').textContent = activeUsers;
  
  tbody.innerHTML = allUsers.map(user => `
    <tr>
      <td>
        <strong>${user.nom_complet}</strong>
        ${user.id === currentUser.id ? '<span style="color: var(--primary-color); margin-left: 0.5rem;">(Vous)</span>' : ''}
      </td>
      <td>${user.email}</td>
      <td>
        <span class="role-badge role-${user.role}">
          ${user.role === 'admin' ? 'Administrateur' : 'utilisateur'}
        </span>
      </td>
      <td>
        ${user.last_login ? new Date(user.last_login).toLocaleDateString('fr-FR') + ' ' + new Date(user.last_login).toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'}) : 'Jamais'}
      </td>
      <td>
        <span class="status-badge status-${user.is_active ? 'active' : 'inactive'}">
          ${user.is_active ? 'Actif' : 'Inactif'}
        </span>
      </td>
      <td class="actions">
        ${user.id !== currentUser.id ? `
          <button class="btn-warning" onclick="toggleUserStatus('${user.id}', ${!user.is_active})" title="${user.is_active ? 'Désactiver' : 'Activer'}">
            <i class="fas ${user.is_active ? 'fa-user-slash' : 'fa-user-check'}"></i>
          </button>
          <button class="btn-primary" onclick="resetUserPassword('${user.id}')" title="Réinitialiser le mot de passe">
            <i class="fas fa-key"></i>
          </button>
        ` : '<span style="color: var(--text-secondary); font-size: 0.875rem;">Compte actuel</span>'}
      </td>
    </tr>
  `).join('');
}

function populateUserFilter() {
  const select = document.getElementById('filterUserActivity');
  select.innerHTML = '<option value="tous">Tous les utilisateurs</option>';
  
  allUsers.forEach(user => {
    const option = document.createElement('option');
    option.value = user.id;
    option.textContent = user.nom_complet;
    select.appendChild(option);
  });
}

function generatePassword() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
  let password = '';
  for (let i = 0; i < 10; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  document.getElementById('newUserPassword').value = password;
}

async function handleAddUser(e) {
  e.preventDefault();
  
  const nomComplet = document.getElementById('newUserNom').value;
  const email = document.getElementById('newUserEmail').value;
  const role = document.getElementById('newUserRole').value;
  const password = document.getElementById('newUserPassword').value;
  
  try {
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();
    
    if (existingUser) {
      alert('❌ Un utilisateur avec cet email existe déjà');
      return;
    }
    
    const passwordHash = btoa(password);
    
    const { data, error } = await supabase
      .from('users')
      .insert([{
        nom_complet: nomComplet,
        email: email,
        password_hash: passwordHash,
        role: role,
        created_by: currentUser.id
      }])
      .select();
    
    if (error) throw error;
    
    if (data && data[0]) {
      alert('✅ Utilisateur créé avec succès !\n\nIdentifiants à communiquer :\nEmail: ' + email + '\nMot de passe: ' + password);
      
      await logUserActivity('creation_utilisateur', 'gestion-utilisateurs', {
        user_created: data[0].id,
        email: email,
        role: role
      });
      
      document.getElementById('formAddUser').reset();
      await loadUsersData();
      switchUsersTab('liste-utilisateurs');
    }
    
  } catch (error) {
    console.error('❌ Erreur création utilisateur:', error);
    alert('❌ Erreur lors de la création de l\'utilisateur: ' + error.message);
  }
}

async function toggleUserStatus(userId, newStatus) {
  const user = allUsers.find(u => u.id === userId);
  if (!user) return;
  
  const action = newStatus ? 'activer' : 'désactiver';
  if (!confirm(`Êtes-vous sûr de vouloir ${action} l'utilisateur ${user.nom_complet} ?`)) return;
  
  try {
    const { error } = await supabase
      .from('users')
      .update({ is_active: newStatus })
      .eq('id', userId);
    
    if (error) throw error;
    
    await logUserActivity(newStatus ? 'activation_utilisateur' : 'desactivation_utilisateur', 'gestion-utilisateurs', {
      user_affected: userId
    });
    
    await loadUsersData();
    
  } catch (error) {
    console.error('❌ Erreur modification statut:', error);
    alert('❌ Erreur lors de la modification du statut');
  }
}

async function resetUserPassword(userId) {
  const user = allUsers.find(u => u.id === userId);
  if (!user) return;
  
  const newPassword = prompt(`Réinitialiser le mot de passe de ${user.nom_complet}\n\nNouveau mot de passe temporaire:`, 'Temp123!');
  if (!newPassword) return;
  
  try {
    const passwordHash = btoa(newPassword);
    
    const { error } = await supabase
      .from('users')
      .update({ password_hash: passwordHash })
      .eq('id', userId);
    
    if (error) throw error;
    
    await logUserActivity('reinitialisation_mdp', 'gestion-utilisateurs', {
      user_affected: userId
    });
    
    alert(`✅ Mot de passe réinitialisé pour ${user.nom_complet}\n\nNouveau mot de passe: ${newPassword}\n\nÀ communiquer à l'utilisateur.`);
    
  } catch (error) {
    console.error('❌ Erreur réinitialisation MDP:', error);
    alert('❌ Erreur lors de la réinitialisation du mot de passe');
  }
}

async function loadActivityLogs() {
  if (currentUser.role !== 'admin') return;
  
  const userId = document.getElementById('filterUserActivity').value;
  const actionType = document.getElementById('filterActionType').value;
  
  try {
    let query = supabase
      .from('user_activity_logs')
      .select(`
        *,
        users(nom_complet, email)
      `)
      .order('created_at', { ascending: false })
      .limit(100);
    
    if (userId !== 'tous') query = query.eq('user_id', userId);
    if (actionType !== 'tous') query = query.ilike('action', `%${actionType}%`);
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    activityLogs = data || [];
    displayActivityLogs();
    
  } catch (error) {
    console.error('❌ Erreur chargement historique:', error);
  }
}

function displayActivityLogs() {
  const tbody = document.getElementById('activityTableBody');
  
  if (!activityLogs.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="no-data">Aucune activité trouvée</td></tr>';
    return;
  }
  
  tbody.innerHTML = activityLogs.map(log => `
    <tr>
      <td>
        <div>${new Date(log.created_at).toLocaleDateString('fr-FR')}</div>
        <div style="font-size: 0.75rem; color: var(--text-secondary);">
          ${new Date(log.created_at).toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'})}
        </div>
      </td>
      <td>
        <strong>${log.users.nom_complet}</strong>
        <div style="font-size: 0.75rem; color: var(--text-secondary);">${log.users.email}</div>
      </td>
      <td><span class="badge">${formatAction(log.action)}</span></td>
      <td>${formatPage(log.page)}</td>
      <td>${log.details ? `<span style="font-size: 0.875rem; color: var(--text-secondary);">${formatDetails(log.details)}</span>` : '-'}</td>
    </tr>
  `).join('');
}

function formatAction(action) {
  const actions = {
    'connexion': 'Connexion',
    'deconnexion': 'Déconnexion',
    'creation_utilisateur': 'Création utilisateur',
    'activation_utilisateur': 'Activation utilisateur',
    'desactivation_utilisateur': 'Désactivation utilisateur',
    'reinitialisation_mdp': 'Réinitialisation MDP',
    'creation_client': 'Création client',
    'modification_client': 'Modification client',
    'affectation_declarations': 'Affectation déclarations'
  };
  
  return actions[action] || action;
}

function formatPage(page) {
  const pages = {
    'gestion-utilisateurs': 'Gestion Utilisateurs',
    'clients': 'Clients',
    'declarations': 'Déclarations',
    'codes': 'Codes d\'accès',
    'honoraires': 'Honoraires'
  };
  
  return pages[page] || page;
}

function formatDetails(details) {
  try {
    return Object.entries(details).map(([key, value]) => `${key}: ${value}`).join(', ');
  } catch {
    return '-';
  }
}

async function logUserActivity(action, page, details = null) {
  try {
    const { error } = await supabase
      .from('user_activity_logs')
      .insert([{
        user_id: currentUser.id,
        action: action,
        page: page,
        details: details,
        ip_address: 'localhost'
      }]);
    
    if (error) console.error('❌ Erreur journalisation:', error);
  } catch (error) {
    console.error('❌ Erreur journalisation:', error);
  }
}

async function updateLastLogin(userId) {
  try {
    await supabase
      .from('users')
      .update({ last_login: new Date().toISOString() })
      .eq('id', userId);
  } catch (error) {
    console.error('❌ Erreur mise à jour dernière connexion:', error);
  }
}

/* =========================
   FONCTIONS UTILITAIRES ET HELPERS
   ========================= */

// Gestion navigation
function setupNav(){
  const pagesRestreintes = ['gestion-utilisateurs', 'situation-globale'];
  
  document.querySelectorAll('.nav-link').forEach(link => {
    const page = link.getAttribute('data-page');
    
    if (pagesRestreintes.includes(page) && currentUser && currentUser.role !== 'admin') {
      link.parentElement.style.display = 'none';
    }
    
    link.addEventListener('click', (e) => {
      if (pagesRestreintes.includes(page) && currentUser && currentUser.role !== 'admin') {
        e.preventDefault();
        alert('⛔ Accès réservé aux administrateurs');
        return;
      }
      
      navigateToPage(link);
    });
  });
}

function navigateToPage(link) {
  const page = link.getAttribute('data-page');
  
  if (!checkPageAccess(page)) return;
  
  document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  
  link.classList.add('active');
  const pg = document.getElementById(page);
  if(pg) pg.classList.add('active');
  
  if(page === 'declarations') loadDeclarationData();
  if(page === 'honoraires') refreshHonorairesUI();
  if(page === 'clients') displayClients();
  if(page === 'dashboard') loadDashboardData();
  
  if(page === 'situation-globale' && currentUser && currentUser.role === 'admin') loadSituationGlobale();
  if(page === 'gestion-utilisateurs' && currentUser && currentUser.role === 'admin') loadUsersData();
}

// Custom Select System
function initializeCustomSelects() {
  document.querySelectorAll('.custom-select').forEach(select => setupCustomSelect(select));
}

function setupCustomSelect(selectElement) {
  const selectedDiv = selectElement.querySelector('.select-selected');
  const itemsDiv = selectElement.querySelector('.select-items');
  const searchInput = selectElement.querySelector('.select-search-input');
  const optionsContainer = selectElement.querySelector('.select-options');
  
  function closeThisDropdown() {
    itemsDiv.style.display = 'none';
    selectedDiv.classList.remove('select-arrow-active');
    if (searchInput) {
      searchInput.value = '';
      filterClientOptions(optionsContainer, '');
    }
  }
  
  selectedDiv.addEventListener('click', function(e) {
    e.stopPropagation();
    closeAllSelects(this);
    itemsDiv.style.display = 'block';
    this.classList.add('select-arrow-active');
    
    setTimeout(() => {
      if (searchInput) searchInput.focus();
    }, 100);
  });
  
  if (searchInput) {
    searchInput.addEventListener('input', function(e) {
      const query = e.target.value.toLowerCase();
      filterClientOptions(optionsContainer, query);
    });
    
    searchInput.addEventListener('click', function(e) {
      e.stopPropagation();
    });
  }
  
  document.addEventListener('click', function(e) {
    if (!selectElement.contains(e.target)) closeThisDropdown();
  });
  
  itemsDiv.addEventListener('click', function(e) {
    e.stopPropagation();
  });
  
  optionsContainer.addEventListener('click', function(e) {
    const option = e.target.closest('div[data-client-id]');
    if (option) {
      const clientId = option.getAttribute('data-client-id');
      const clientText = option.textContent;
      
      selectedDiv.textContent = clientText;
      selectedDiv.setAttribute('data-client-id', clientId);
      closeThisDropdown();
      handleClientSelectionAfterChoose(selectElement.id, clientId);
    }
  });
}

function handleClientSelectionAfterChoose(selectId, clientId) {
  console.log(`✅ Sélection: ${selectId} -> Client: ${clientId}`);
  
  switch(selectId) {
    case 'clientSelection': loadAffectationChecklist(); break;
    case 'filtreClient': loadEcheancesTable(); break;
    case 'honorairesClientSelect': 
      honosClientId = clientId;
      refreshHonorairesUI(); 
      break;
    case 'codeClientSelect': 
      selectedCodeClientId = clientId;
      if (clientId) {
        const selectedClient = clients.find(c => c.id === clientId);
        updateSelectedClientInfo(selectedClient);
        loadClientCodes(clientId);
      } else {
        clearSelectedClientInfo();
        clearCodesGrid();
      }
      updateCodesUI();
      break;
  }
}

function filterClientOptions(optionsContainer, query) {
  const allOptions = optionsContainer.querySelectorAll('div[data-client-id]');
  allOptions.forEach(option => {
    const text = option.textContent.toLowerCase();
    if (text.includes(query)) option.style.display = 'block';
    else option.style.display = 'none';
  });
}

function closeAllSelects(exceptElement) {
  document.querySelectorAll('.select-items').forEach(item => item.style.display = 'none');
  document.querySelectorAll('.select-selected').forEach(selected => selected.classList.remove('select-arrow-active'));
}

function populateCustomSelect(selectId, clients, selectedId = null, includeAllOption = false) {
  const selectElement = document.getElementById(selectId);
  if (!selectElement) {
    console.error(`❌ Selecteur ${selectId} non trouvé`);
    return;
  }
  
  const optionsContainer = selectElement.querySelector('.select-options');
  const selectedDiv = selectElement.querySelector('.select-selected');
  
  if (!optionsContainer) {
    console.error('❌ Conteneur d\'options non trouvé');
    return;
  }
  
  optionsContainer.innerHTML = '';
  
  if (includeAllOption) {
    const allOption = document.createElement('div');
    allOption.textContent = 'Tous les clients';
    allOption.setAttribute('data-client-id', 'tous');
    optionsContainer.appendChild(allOption);
  }
  
  clients.forEach(client => {
    const option = document.createElement('div');
    option.textContent = `${client.nom_raison_sociale}${client.ice ? ' - ' + client.ice : ''}`;
    option.setAttribute('data-client-id', client.id);
    optionsContainer.appendChild(option);
  });
  
  if (selectedId) {
    const selectedClient = clients.find(c => c.id === selectedId);
    if (selectedClient) {
      selectedDiv.textContent = `${selectedClient.nom_raison_sociale}${selectedClient.ice ? ' - ' + selectedClient.ice : ''}`;
      selectedDiv.setAttribute('data-client-id', selectedId);
    }
  } else if (includeAllOption) {
    selectedDiv.textContent = 'Tous les clients';
    selectedDiv.setAttribute('data-client-id', 'tous');
  }
  
  console.log(`✅ Selecteur ${selectId} peuplé avec ${clients.length} clients`);
}

function getSelectedClientId(selectId) {
  const selectElement = document.getElementById(selectId);
  if (!selectElement) return null;
  const selectedDiv = selectElement.querySelector('.select-selected');
  return selectedDiv.getAttribute('data-client-id');
}

// Gestion des menus globaux
function setupGlobalMenus(){
  document.addEventListener('click', (e) => {
    const t = e.target;

    if(t.closest('#clients')){
      const btn = t.closest('.action-toggle');
      if(btn){
        const id = btn.getAttribute('data-id');
        document.querySelectorAll('.action-menu.show').forEach(m => m.classList.remove('show'));
        const menu = document.getElementById(`client-menu-${id}`);
        if(menu) menu.classList.add('show');
        return;
      }
      
      const item = t.closest('.menu-item');
      if(item){
        const id = item.getAttribute('data-id');
        const action = item.getAttribute('data-action');
        document.querySelectorAll('.action-menu.show').forEach(m => m.classList.remove('show'));
        return;
      }
    }

    if(t.closest('#echeances')){
      const btn = t.closest('.action-toggle');
      if(btn){
        const id = btn.getAttribute('data-id');
        document.querySelectorAll('.action-menu.show').forEach(m => m.classList.remove('show'));
        const menu = document.getElementById(`menu-${id}`); 
        if(menu) menu.classList.add('show');
        return;
      }
      
      const item = t.closest('.menu-item');
      if(item){
        mettreAJourStatutEcheance(item.getAttribute('data-id'), item.getAttribute('data-action'));
        document.querySelectorAll('.action-menu.show').forEach(m => m.classList.remove('show'));
        return;
      }
      
      const reset = t.closest('.reset-btn');
      if(reset){ 
        reinitialiserStatut(reset.getAttribute('data-id')); 
        return; 
      }
    }

    if(!t.closest('.action-dropdown')) {
      document.querySelectorAll('.action-menu.show').forEach(m => m.classList.remove('show'));
    }
  });
}

// Utilitaires dates
function toYMDLocal(date){
  if (!(date instanceof Date)) {
    console.error('❌ Date invalide:', date);
    return '2024-01-01';
  }
  
  try {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  } catch (error) {
    console.error('❌ Erreur formatage date:', error);
    return '2024-01-01';
  }
}

function parseYMDLocal(s){
  if (!s) return new Date();
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDateForInput(dateString) {
  if (!dateString) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return dateString;
  
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';
  
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

function formatDateForDisplay(dateString) {
  if (!dateString) return '';
  
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    
    return date.toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  } catch (error) {
    return dateString;
  }
}

// Utilitaires clients
function updateClientSelection(){
  populateCustomSelect('clientSelection', clients, null, false);
}

function updateFiltreClient(){
  populateCustomSelect('filtreClient', clients, 'tous', true);
}

function fillHonorairesClients(list){
  const data = list || clients;
  populateCustomSelect('honorairesClientSelect', data, honosClientId, false);
}

// Mise à jour date
function updateDate(){
  const now = new Date();
  document.getElementById('currentDate').textContent = now.toLocaleDateString('fr-FR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long', 
    day: 'numeric'
  });
}

/* =========================
   GESTIONNAIRES D'ÉVÉNEMENTS
   ========================= */

// Déclarations
document.getElementById('clientSelection').addEventListener('change', loadAffectationChecklist);
document.getElementById('anneeAffectation').addEventListener('change', loadAffectationChecklist);
document.getElementById('anneeSelection').addEventListener('change', loadEcheancesTable);
document.getElementById('filtreEtat').addEventListener('change', loadEcheancesTable);
document.getElementById('filtreClient').addEventListener('change', loadEcheancesTable);

// Logout
document.getElementById('logoutBtn').addEventListener('click', (e) => {
  e.preventDefault();
  localStorage.removeItem('currentUser');
  currentUser = null;
  showLogin();
});

/* =========================
   INITIALISATION DE L'APPLICATION
   ========================= */

async function initializeApp(){
  console.log('Initialisation de l application...');
  updateDate();
  
  const savedUser = localStorage.getItem('currentUser');
  if (savedUser) {
    currentUser = JSON.parse(savedUser);
    console.log('👤 Utilisateur:', currentUser.nom_complet, '- Rôle:', currentUser.role);
  }
  
  try {
    await Promise.all([ 
      loadClients(),
      loadDeclarationTypes(), 
      loadClientDeclarations(), 
      loadEcheances(), 
      loadDashboardData(),
      loadHonorairesFromSupabase()
    ]);
    
    setupNav();
    setupDeclarationsTabs();
    setupGlobalMenus();
    setupHonoraires();
    initializeCustomSelects();
    
    if (currentUser && currentUser.role === 'admin') {
      initializeSituationGlobale();
      initializeUsersManagement();
    }
    
    initializeCodesPage();
    setupEditClientSelect(); 
    setupViewClientSelect();
    setupPrintButton();
    
    console.log('Application initialisée avec succès');
  } catch (error) {
    console.error('Erreur lors de l initialisation:', error);
  }
}

// Exporter certaines fonctions globales
window.loadAffectationChecklist = loadAffectationChecklist;