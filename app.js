/* =========================
   SUPABASE + ETAT GLOBAL
=========================== */
const SUPABASE_URL = 'https://upfelrrjmrabqiocoqls.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVwZmVscnJqbXJhYnFpb2NvcWxzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA0MTM4OTMsImV4cCI6MjA3NTk4OTg5M30.bPtAPTWaiD3kSFG-XKkVHCKf7HaApTrfMCX6OuMTwTg';

let supabase;
try {
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  console.log('Supabase initialisé avec succès');
} catch (error) {
  console.error('Erreur initialisation Supabase:', error);
  // Fallback: création d'un objet mock pour éviter les erreurs
  supabase = {
    from: () => ({
      select: () => Promise.resolve({data: [], error: null}),
      insert: () => Promise.resolve({error: null}),
      update: () => Promise.resolve({error: null}),
      delete: () => Promise.resolve({error: null})
    })
  };
}
let currentUser = null;
let clients = [];
let declarationTypes = [];
let clientDeclarations = [];
let echeances = [];
let honosClientId = null;
let honosExercice = new Date().getFullYear().toString();
let honosFactu = [];
let honosPay = [];
let situationGlobaleData = [];
let codesData = [];
let currentSelectedClientId = null;
let isEditMode = false;
let allUsers = [];
let activityLogs = [];
let lastHonosState = { clientId: null, exercice: null, factuHash: '', payHash: '' };

/* =========================
   UTILITAIRES DATES
   ========================= */

function toYMDLocal(date) {
  if (!(date instanceof Date)) {
    console.error('❌ Date invalide:', date);
    return '2024-01-01'; // Fallback
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
    
    // Si la date est déjà au format YYYY-MM-DD, la retourner telle quelle
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        return dateString;
    }
    
    // Sinon, essayer de parser la date
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    
    // Formater en YYYY-MM-DD pour l'input date
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
   UTILITAIRES FORMATAGE
   ========================= */

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

/* =========================
   UTILITAIRES COPIER
   ========================= */

function setupCopyToClipboard() {
  // COPIE DES CODES D'ACCÈS SEULEMENT
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
    // Sauvegarder le texte original
    const originalText = element.textContent;
    
    // Afficher "Copié !"
    element.textContent = 'Copié !';
    element.style.color = 'var(--success-color)';
    element.style.fontWeight = '600';
    
    // Revenir au texte original après 1 seconde
    setTimeout(() => {
      element.textContent = originalText;
      element.style.color = '';
      element.style.fontWeight = '';
    }, 1000);
    
  }).catch(err => {
    console.error('Erreur copie:', err);
    // Fallback
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    
    // Afficher "Copié !" même avec fallback
    const originalText = element.textContent;
    element.textContent = 'Copié !';
    element.style.color = 'var(--success-color)';
    element.style.fontWeight = '600';
    
    setTimeout(() => {
      element.textContent = originalText;
      element.style.color = '';
      element.style.fontWeight = '';
    }, 1000);
  });
}

/* =========================
   INITIALISATION APP
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

async function initializeApp(){
  console.log('Initialisation de l application...');
  updateDate();
  
  // CHARGER L'UTILISATEUR COURANT
  const savedUser = localStorage.getItem('currentUser');
  if (savedUser) {
    currentUser = JSON.parse(savedUser);
    console.log('👤 Utilisateur:', currentUser.nom_complet, '- Rôle:', currentUser.role);
  }
  
  try {
    // 1. CHARGEMENT DES DONNÉES
    await Promise.all([ 
      loadClients(),
      loadDeclarationTypes(), 
      loadClientDeclarations(), 
      loadEcheances(), 
      loadDashboardData(),
      loadHonorairesFromSupabase()
    ]);
    
    // 2. CONFIGURATION DE L'INTERFACE (selon le rôle)
    setupNav(); // ← Va masquer les pages selon le rôle
    setupDeclarationsTabs();
    setupGlobalMenus();
    setupHonoraires();
    initializeCustomSelects();
    initializeEcheancesDefaults();
    
    // INITIALISER SEULEMENT SI ADMIN
    if (currentUser && currentUser.role === 'admin') {
      initializeSituationGlobale();
      initializeUsersManagement();
    }
    
    initializeCodesPage();
    setupEditClientSelect(); 
    setupViewClientSelect();
    setupPrintButton();
    
    // 3. ÉVÉNEMENTS
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    
    console.log('Application initialisée avec succès');
  } catch (error) {
    console.error('Erreur lors de l initialisation:', error);
  }
}

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

/* =========================
   GESTION AUTHENTIFICATION
   ========================= */

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
    
    // 1. RECHERCHER L'UTILISATEUR DANS LA TABLE users
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .eq('is_active', true)
      .single();
    
    if (error) {
      console.error('❌ Erreur Supabase:', error);
      throw new Error('Identifiants incorrects ou compte inactif');
    }
    
    if (!user) {
      throw new Error('Aucun utilisateur trouvé avec cet email');
    }
    
    console.log('✅ Utilisateur trouvé:', user.nom_complet, '- Rôle:', user.role);
    
    // 2. VÉRIFICATION MOT DE PASSE (version simplifiée)
    // NOTE: En production, utilisez bcrypt pour comparer les hashs
    const inputPasswordHash = btoa(password); // Conversion base64 simple
    if (inputPasswordHash !== user.password_hash) {
      throw new Error('Mot de passe incorrect');
    }
    
    console.log('✅ Mot de passe correct');
    
    // 3. CRÉER LA SESSION UTILISATEUR
    currentUser = {
      id: user.id,
      email: user.email,
      nom_complet: user.nom_complet,
      role: user.role
    };

    // Sauvegarder dans localStorage
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    
    // 4. JOURNALISER LA CONNEXION
    await logUserActivity('connexion', 'login', {
      user_agent: navigator.userAgent
    });
    
    // 5. METTRE À JOUR LA DERNIÈRE CONNEXION
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

function handleLogout(e) {
  e.preventDefault();
  localStorage.removeItem('currentUser');
  currentUser = null;
  showLogin();
}

function checkPageAccess(page) {
  const pagesAdminOnly = ['gestion-utilisateurs', 'situation-globale'];
  
  if (pagesAdminOnly.includes(page) && currentUser && currentUser.role !== 'admin') {
    alert('⛔ Accès non autorisé. Cette page est réservée aux administrateurs.');
    
    // Rediriger vers le dashboard
    document.querySelectorAll('.nav-link').forEach(link => {
      if (link.getAttribute('data-page') === 'dashboard') {
        navigateToPage(link);
      }
    });
    
    return false;
  }
  
  return true;
}

function navigateToPage(link) {
  const page = link.getAttribute('data-page');
  
  // VÉRIFIER LES ACCÈS AVANT DE NAVIGUER
  if (!checkPageAccess(page)) {
    return;
  }
  
  document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  
  link.classList.add('active');
  const pg = document.getElementById(page);
  if(pg) pg.classList.add('active');
  
  // Charger les données si nécessaire
  if(page === 'declarations') loadDeclarationData();
  if(page === 'honoraires') refreshHonorairesUI();
  if(page === 'clients') displayClients();
  if(page === 'dashboard') loadDashboardData();
  
  // Pages admin seulement
  if(page === 'situation-globale' && currentUser && currentUser.role === 'admin') {
    loadSituationGlobale();
  }
  if(page === 'gestion-utilisateurs' && currentUser && currentUser.role === 'admin') {
    loadUsersData();
  }
}

/* =========================
   GESTION UTILISATEURS
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
  }
}

function setupUsersEventListeners() {
  // Onglets
  document.querySelectorAll('#gestion-utilisateurs .tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      const target = e.target.getAttribute('data-tab');
      switchUsersTab(target);
    });
  });
  
  // Formulaire ajout utilisateur
  document.getElementById('formAddUser').addEventListener('submit', handleAddUser);
  
  // Filtres historique
  document.getElementById('filterUserActivity').addEventListener('change', loadActivityLogs);
  document.getElementById('filterActionType').addEventListener('change', loadActivityLogs);
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
    
    // Peupler le filtre des utilisateurs pour l'historique
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

async function handleAddUser(e) {
  e.preventDefault();
  
  const nomComplet = document.getElementById('newUserNom').value;
  const email = document.getElementById('newUserEmail').value;
  const role = document.getElementById('newUserRole').value;
  const password = document.getElementById('newUserPassword').value;
  
  try {
    // Vérifier si l'email existe déjà
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();
    
    if (existingUser) {
      alert('❌ Un utilisateur avec cet email existe déjà');
      return;
    }
    
    // Hasher le mot de passe (en production, utiliser bcrypt)
    const passwordHash = btoa(password); // Temporaire - à remplacer par bcrypt
    
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
      
      // Journaliser l'action
      await logUserActivity('creation_utilisateur', 'gestion-utilisateurs', {
        user_created: data[0].id,
        email: email,
        role: role
      });
      
      // Recharger la liste
      document.getElementById('formAddUser').reset();
      await loadUsersData();
      
      // Retourner à la liste
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
  if (!confirm(`Êtes-vous sûr de vouloir ${action} l'utilisateur ${user.nom_complet} ?`)) {
    return;
  }
  
  try {
    const { error } = await supabase
      .from('users')
      .update({ is_active: newStatus })
      .eq('id', userId);
    
    if (error) throw error;
    
    // Journaliser
    await logUserActivity(newStatus ? 'activation_utilisateur' : 'desactivation_utilisateur', 'gestion-utilisateurs', {
      user_affected: userId
    });
    
    // Recharger
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
    const passwordHash = btoa(newPassword); // Temporaire - bcrypt en production
    
    const { error } = await supabase
      .from('users')
      .update({ password_hash: passwordHash })
      .eq('id', userId);
    
    if (error) throw error;
    
    // Journaliser
    await logUserActivity('reinitialisation_mdp', 'gestion-utilisateurs', {
      user_affected: userId
    });
    
    alert(`✅ Mot de passe réinitialisé pour ${user.nom_complet}\n\nNouveau mot de passe: ${newPassword}\n\nÀ communiquer à l'utilisateur.`);
    
  } catch (error) {
    console.error('❌ Erreur réinitialisation MDP:', error);
    alert('❌ Erreur lors de la réinitialisation du mot de passe');
  }
}

/* =========================
   JOURNALISATION ACTIVITÉS
   ========================= */

async function logUserActivity(action, page, details = null) {
  try {
    const { error } = await supabase
      .from('user_activity_logs')
      .insert([{
        user_id: currentUser.id,
        action: action,
        page: page,
        details: details,
        ip_address: 'localhost' // En production, récupérer l'IP réelle
      }]);
    
    if (error) {
      console.error('❌ Erreur journalisation:', error);
    }
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
    
    if (userId !== 'tous') {
      query = query.eq('user_id', userId);
    }
    
    if (actionType !== 'tous') {
      query = query.ilike('action', `%${actionType}%`);
    }
    
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
      <td>
        <span class="badge">${formatAction(log.action)}</span>
      </td>
      <td>${formatPage(log.page)}</td>
      <td>
        ${log.details ? 
          `<span style="font-size: 0.875rem; color: var(--text-secondary);">${formatDetails(log.details)}</span>` : 
          '-'
        }
      </td>
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
    return Object.entries(details).map(([key, value]) => {
      return `${key}: ${value}`;
    }).join(', ');
  } catch {
    return '-';
  }
}

/* =========================
   NAVIGATION PRINCIPALE
   ========================= */

function setupNav(){
  // MASQUER LES PAGES SENSIBLES POUR LES utilisateurS
  const pagesRestreintes = ['gestion-utilisateurs', 'situation-globale'];
  
  document.querySelectorAll('.nav-link').forEach(link => {
    const page = link.getAttribute('data-page');
    
    // Masquer les pages restreintes aux utilisateurs
    if (pagesRestreintes.includes(page) && currentUser && currentUser.role !== 'admin') {
      link.parentElement.style.display = 'none';
    }
    
    link.addEventListener('click', (e) => {
      // VÉRIFIER LES ACCÈS AVANT LA NAVIGATION
      if (pagesRestreintes.includes(page) && currentUser && currentUser.role !== 'admin') {
        e.preventDefault();
        alert('⛔ Accès réservé aux administrateurs');
        return;
      }
      navigateToPage(link);
    });
  });
}  

function setupClientsTabs() {
  document.querySelectorAll('#clients .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-tab');
      
      document.querySelectorAll('#clients .tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('#clients .tab-content').forEach(c => c.classList.remove('active'));
      
      tab.classList.add('active'); 
      document.getElementById(target).classList.add('active');
      
      if(target === 'consulter') {
        displayClients();
      }
      if(target === 'modifier') {
        populateEditClientSelect();
      }
      if(target === 'consulter-un-client') {
        populateCustomSelect('viewClientSelect', clients, null, false);
      }
      if(target === 'archives') {
        loadClientsArchives(); // ← AJOUTER CETTE LIGNE
      }
    });
  });
}

function setupDeclarationsTabs(){
  document.querySelectorAll('#declarations .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-tab');
      
      document.querySelectorAll('#declarations .tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('#declarations .tab-content').forEach(c => c.classList.remove('active'));
      
      tab.classList.add('active'); 
      document.getElementById(target).classList.add('active');
      
      // Charger les données selon l'onglet
      if(target === 'echeances') {
        // ✅ CORRECTION : Configurer les événements DIRECTEMENT ici
        setupEcheancesFilters();
        loadEcheancesTable();
      }
      if(target === 'affectation') loadAffectationChecklist();
      if(target === 'catalogue') loadCatalogue();
    });
  });
  
  // ✅ CORRECTION : Configurer les événements si l'onglet échéances est actif au chargement
  if (document.getElementById('echeances').classList.contains('active')) {
    setupEcheancesFilters();
  }
}
function setupEcheancesFilters() {
  console.log('🔧 Configuration des filtres échéances...');
  
  // ✅ SIMPLE : Ajouter les événements directement
  document.getElementById('anneeSelection')?.addEventListener('change', loadEcheancesTable);
  document.getElementById('filtreEtat')?.addEventListener('change', loadEcheancesTable);
  document.getElementById('filtreTypeDeclaration')?.addEventListener('change', loadEcheancesTable);
  // Le filtre client est déjà géré par handleClientSelectionAfterChoose
}

function setupUsersTabs(){}

function switchCodesTab(tabName) {
  document.querySelectorAll('#codes .tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('#codes .tab-content').forEach(c => c.classList.remove('active'));
  
  const tabElement = document.querySelector(`#codes .tab[data-tab="${tabName}"]`);
  const contentElement = document.getElementById(tabName);
  
  if (tabElement) tabElement.classList.add('active');
  if (contentElement) contentElement.classList.add('active');
  
  if (tabName === 'afficher-codes') {
    resetEditMode();
  }
  
  console.log('📁 Onglet changé:', tabName);
}

function switchUsersTab(tabName) {
  document.querySelectorAll('#gestion-utilisateurs .tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('#gestion-utilisateurs .tab-content').forEach(c => c.classList.remove('active'));
  
  document.querySelector(`#gestion-utilisateurs .tab[data-tab="${tabName}"]`).classList.add('active');
  document.getElementById(tabName).classList.add('active');
  
  if (tabName === 'liste-utilisateurs') {
    loadUsersList();
  } else if (tabName === 'historique-activites' && currentUser.role === 'admin') {
    loadActivityLogs();
  }
}

/* =========================
   SÉLECTEURS PERSONNALISÉS
   ========================= */

function initializeCustomSelects() {
  document.querySelectorAll('.custom-select').forEach(select => {
    setupCustomSelect(select);
  });
}

function setupCustomSelect(selectElement) {
  const selectedDiv = selectElement.querySelector('.select-selected');
  const itemsDiv = selectElement.querySelector('.select-items');
  const searchInput = selectElement.querySelector('.select-search-input');
  const optionsContainer = selectElement.querySelector('.select-options');
  
  // Fonction pour fermer ce dropdown
  function closeThisDropdown() {
    itemsDiv.style.display = 'none';
    selectedDiv.classList.remove('select-arrow-active');
    if (searchInput) {
      searchInput.value = ''; // Réinitialiser la recherche
      filterClientOptions(optionsContainer, ''); // Réafficher toutes les options
    }
  }
  
  // Ouvrir le dropdown
  selectedDiv.addEventListener('click', function(e) {
    e.stopPropagation();
    
    // Fermer tous les autres dropdowns d'abord
    closeAllSelects(this);
    
    // Ouvrir celui-ci
    itemsDiv.style.display = 'block';
    this.classList.add('select-arrow-active');
    
    // Focus sur la recherche si elle existe
    setTimeout(() => {
      if (searchInput) {
        searchInput.focus();
      }
    }, 100);
  });
  
  // Recherche en temps réel
  if (searchInput) {
    searchInput.addEventListener('input', function(e) {
      const query = e.target.value.toLowerCase();
      filterClientOptions(optionsContainer, query);
    });
    
    // Empêcher la fermeture quand on clique dans la recherche
    searchInput.addEventListener('click', function(e) {
      e.stopPropagation();
    });
  }
  
  // Fermer quand on clique ailleurs
  document.addEventListener('click', function(e) {
    if (!selectElement.contains(e.target)) {
      closeThisDropdown();
    }
  });
  
  // Empêcher la fermeture quand on clique dans le dropdown
  itemsDiv.addEventListener('click', function(e) {
    e.stopPropagation();
  });
  
  // Gérer la sélection d'une option
  optionsContainer.addEventListener('click', function(e) {
    const option = e.target.closest('div[data-client-id]');
    if (option) {
      const clientId = option.getAttribute('data-client-id');
      const clientText = option.textContent;
      
      // Mettre à jour l'affichage sélectionné
      selectedDiv.textContent = clientText;
      selectedDiv.setAttribute('data-client-id', clientId);
      
      // Fermer le dropdown
      closeThisDropdown();
      
      // Déclencher l'action correspondante
      handleClientSelectionAfterChoose(selectElement.id, clientId);
    }
  });
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
  
  // Vider les options existantes
  optionsContainer.innerHTML = '';
  
  // Option "Tous les clients" si demandé
  if (includeAllOption) {
    const allOption = document.createElement('div');
    allOption.textContent = 'Tous les clients';
    allOption.setAttribute('data-client-id', 'tous');
    optionsContainer.appendChild(allOption);
  }
  
  // Ajouter chaque client
  clients.forEach(client => {
    const option = document.createElement('div');
    option.textContent = `${client.nom_raison_sociale}${client.ice ? ' - ' + client.ice : ''}`;
    option.setAttribute('data-client-id', client.id);
    optionsContainer.appendChild(option);
  });
  
  // Mettre à jour la sélection affichée
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

function filterClientOptions(optionsContainer, query) {
  const allOptions = optionsContainer.querySelectorAll('div[data-client-id]');
  allOptions.forEach(option => {
    const text = option.textContent.toLowerCase();
    if (text.includes(query)) {
      option.style.display = 'block';
    } else {
      option.style.display = 'none';
    }
  });
}

function closeAllSelects(exceptElement) {
  document.querySelectorAll('.select-items').forEach(item => {
    item.style.display = 'none';
  });
  document.querySelectorAll('.select-selected').forEach(selected => {
    selected.classList.remove('select-arrow-active');
  });
}

function getSelectedClientId(selectId) {
  const selectElement = document.getElementById(selectId);
  if (!selectElement) return null;
  const selectedDiv = selectElement.querySelector('.select-selected');
  return selectedDiv.getAttribute('data-client-id');
}

function handleClientSelectionAfterChoose(selectId, clientId) {
  console.log(`✅ Sélection: ${selectId} -> Client: ${clientId}`);
  
  switch(selectId) {
    case 'clientSelection':
      loadAffectationChecklist();
      break;
    case 'filtreClient':
      loadEcheancesTable();
      break;
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

/* =========================
   MENUS ET INTERACTIONS
   ========================= */

function setupGlobalMenus(){
  document.addEventListener('click', (e) => {
    const t = e.target;

    // ✅ CORRECTION : Gestion dropdown CLIENTS
    if(t.closest('#clients')){
      const btn = t.closest('.action-btn');
      if(btn){
        const row = btn.closest('tr');
        const clientId = row?.dataset.clientId;
        
        if (clientId) {
          // OBTENIR LE MENU CORRESPONDANT
          const dropdown = btn.closest('.dropdown');
          const menu = dropdown.querySelector('.dropdown-content');
          
          if (menu) {
            // ✅ CORRECTION : Vérifier si le menu est déjà ouvert
            const isAlreadyOpen = menu.classList.contains('show');
            
            // Fermer tous les autres menus d'abord
            document.querySelectorAll('.dropdown-content.show').forEach(m => {
              m.classList.remove('show');
              m.classList.remove('dropdown-up'); // Reset position
            });
            
            // ✅ CORRECTION : Basculer l'état (ouvrir si fermé, fermer si ouvert)
            if (!isAlreadyOpen) {
              menu.classList.add('show');
              // ✅ NOUVEAU : Ajuster la position selon l'espace disponible
              adjustDropdownPosition(menu, btn);
            }
          }
        }
        return;
      }
      
      // Gestion des clics sur les options du menu clients
      const item = t.closest('.action-view, .action-edit, .action-affect, .action-archive');
      if(item){
        const row = item.closest('tr');
        const clientId = row?.dataset.clientId;
        const action = item.classList[0].replace('action-', ''); // 'view', 'edit', etc.
        
        if (clientId) {
          // Fermer le menu
          document.querySelectorAll('.dropdown-content.show').forEach(m => {
            m.classList.remove('show');
            m.classList.remove('dropdown-up');
          });
          // Exécuter l'action
          handleClientAction(action, item);
        }
        return;
      }
    }

    // ✅ CORRECTION : Gestion dropdown ÉCHÉANCES
    if(t.closest('#echeances')){
      const btn = t.closest('.action-toggle');
      if(btn){
        const id = btn.getAttribute('data-id');
        
        // OBTENIR LE MENU CORRESPONDANT
        const menu = document.getElementById(`menu-${id}`);
        
        if (menu) {
          // ✅ CORRECTION : Vérifier si le menu est déjà ouvert
          const isAlreadyOpen = menu.classList.contains('show');
          
          // Fermer tous les autres menus d'abord
          document.querySelectorAll('.action-menu.show').forEach(m => {
            m.classList.remove('show');
            m.classList.remove('menu-up');
          });
          
          // ✅ CORRECTION : Basculer l'état
          if (!isAlreadyOpen) {
            menu.classList.add('show');
            // ✅ NOUVEAU : Ajuster la position selon l'espace disponible
            adjustActionMenuPosition(menu, btn);
          }
        }
        return;
      }
      
      const item = t.closest('.menu-item');
      if(item){
        mettreAJourStatutEcheance(item.getAttribute('data-id'), item.getAttribute('data-action'));
        document.querySelectorAll('.action-menu.show').forEach(m => {
          m.classList.remove('show');
          m.classList.remove('menu-up');
        });
        return;
      }
    }

    // ✅ CORRECTION : Gestion dropdown HONORAIRES
    if(t.closest('#honoraires')){
      const btn = t.closest('.action-toggle');
      if(btn){
        const id = btn.getAttribute('data-id');
        const type = btn.getAttribute('data-type'); // 'factu' ou 'pay'
        
        // ✅ CORRECTION : Utiliser le bon ID selon le type
        const menu = document.getElementById(`honos-${type}-menu-${id}`);
        
        if (menu) {
          // ✅ CORRECTION : Vérifier si le menu est déjà ouvert
          const isAlreadyOpen = menu.classList.contains('show');
          
          // Fermer tous les autres menus d'abord
          document.querySelectorAll('.action-menu.show').forEach(m => {
            m.classList.remove('show');
            m.classList.remove('menu-up');
          });
          
          // ✅ CORRECTION : Basculer l'état
          if (!isAlreadyOpen) {
            menu.classList.add('show');
            // ✅ NOUVEAU : Ajuster la position selon l'espace disponible
            adjustActionMenuPosition(menu, btn);
          }
        }
        return;
      }
      
      const item = t.closest('.menu-item');
      if(item){
        const id = item.getAttribute('data-id');
        const action = item.getAttribute('data-action');
        const type = item.getAttribute('data-type');
        document.querySelectorAll('.action-menu.show').forEach(m => {
          m.classList.remove('show');
          m.classList.remove('menu-up');
        });
        
        handleHonosAction(type, action, id);
        return;
      }
    }

    // ✅ FERMER TOUS LES MENUS si click ailleurs
    if(!t.closest('.dropdown') && !t.closest('.action-dropdown')) {
      document.querySelectorAll('.dropdown-content.show, .action-menu.show').forEach(m => {
        m.classList.remove('show');
        m.classList.remove('dropdown-up');
        m.classList.remove('menu-up');
      });
    }
  });
}

// ✅ NOUVELLE FONCTION : Ajuster la position des dropdowns clients
function adjustDropdownPosition(menu, button) {
  const menuRect = menu.getBoundingClientRect();
  const buttonRect = button.getBoundingClientRect();
  const viewportHeight = window.innerHeight;
  
  // Calculer l'espace disponible en bas
  const spaceBelow = viewportHeight - buttonRect.bottom;
  const menuHeight = menuRect.height;
  
  // Si l'espace en bas est insuffisant, afficher vers le haut
  if (spaceBelow < menuHeight && buttonRect.top > menuHeight) {
    menu.classList.add('dropdown-up');
  } else {
    menu.classList.remove('dropdown-up');
  }
}

// ✅ NOUVELLE FONCTION : Ajuster la position des menus d'action
function adjustActionMenuPosition(menu, button) {
  const menuRect = menu.getBoundingClientRect();
  const buttonRect = button.getBoundingClientRect();
  const viewportHeight = window.innerHeight;
  
  // Calculer l'espace disponible en bas
  const spaceBelow = viewportHeight - buttonRect.bottom;
  const menuHeight = menuRect.height;
  
  // Si l'espace en bas est insuffisant, afficher vers le haut
  if (spaceBelow < menuHeight && buttonRect.top > menuHeight) {
    menu.classList.add('menu-up');
  } else {
    menu.classList.remove('menu-up');
  }
}

/* =========================
   CHARGEMENT DONNÉES CLIENTS
   ========================= */

async function loadClients(){
  try{
    console.log('Chargement des clients...');
    const {data, error} = await supabase.from('clients').select('*').order('nom_raison_sociale');
    if(error) {
      console.error('Erreur Supabase clients:', error);
      throw error;
    }
    
    clients = data || [];
    console.log(`${clients.length} clients chargés`);
    
    // Initialiser les onglets clients
    setupClientsTabs();
    setupAddClientForm();
    setupEditClientForm();

    
    // 🔍 INITIALISER LA RECHERCHE APRÈS LE CHARGEMENT
    setupClientsSearch();
    
    // Afficher les clients dans l'onglet consultation
    displayClients();
    
    // Mettre à jour les selecteurs
    updateClientSelection();
    updateFiltreClient();
    fillHonorairesClients();
    
  } catch(e) {
    console.error('Erreur chargement clients:', e);
    document.getElementById('clientsTableBody').innerHTML = '<tr><td colspan="5" class="no-data">Erreur de chargement</td></tr>';
  }
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

 setupCopyToClipboard();
}

function displayFilteredClients(filteredClients) {
  const tbody = document.getElementById('clientsTableBody');

  if (!filteredClients.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="no-data">Aucun client trouvé</td></tr>';
    return;
  }

  // CORRECTION : Ajouter le bouton Action dans le HTML
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
 
}

function setupClientsSearch() {
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    // Supprimer les anciens écouteurs pour éviter les doublons
    searchInput.removeEventListener('input', handleClientsSearch);
    // Ajouter le nouvel écouteur
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

/* =========================
   FORMULAIRES CLIENTS
   ========================= */

function setupAddClientForm() {
  const form = document.getElementById('addClientForm');
  if (!form) return;
  
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleAddClient();
  });
  
  // Reset du formulaire quand on change d'onglet
  form.addEventListener('reset', () => {
    form.reset();
  });
}

function setupEditClientForm() {
  const form = document.getElementById('editClientForm');
  if (!form) return;
  
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleEditClient();
  });
}

function setupViewClientSelect() {
  const selectElement = document.getElementById('viewClientSelect');
  if (!selectElement) return;
  
  setupCustomSelect(selectElement);
  
  // Gérer le changement de sélection
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

function setupEditClientSelect() {
  const selectElement = document.getElementById('editClientSelect');
  if (!selectElement) return;
  
  setupCustomSelect(selectElement);
  
  // Gérer le changement de sélection
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
    
    // Recharger les clients
    await loadClients();
    
    // Basculer vers l'onglet consultation
    document.querySelector('#clients .tab[data-tab="consulter"]').click();
    
  } catch (error) {
    console.error('Erreur ajout client:', error);
    alert('Erreur lors de l\'enregistrement du client');
  }
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
    
    // Recharger les clients
    await loadClients();
    
    // Basculer vers l'onglet consultation
    document.querySelector('#clients .tab[data-tab="consulter"]').click();
    
  } catch (error) {
    console.error('Erreur modification client:', error);
    alert('Erreur lors de la modification du client');
  }
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
  
  // Remplir le formulaire avec les données du client
  fillViewForm(client);
  
  viewFormContainer.style.display = 'block';
  viewPlaceholder.style.display = 'none';
  
  // Activer la copie par double-clic
  setupViewFormCopy();
  
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
  
  // Remplir le formulaire avec les données du client
  fillEditForm(client);
  
  editFormContainer.style.display = 'block';
  editPlaceholder.style.display = 'none';
}

function fillViewForm(client) {
    const setValue = (id, value) => {
        const element = document.getElementById(id);
        if (element) {
            // Gestion spéciale pour les champs date
            if (id.includes('Date') && element.type === 'date') {
                element.value = formatDateForInput(value);
            } else {
                element.value = value || '';
            }
        }
    };
    
    // Remplir tous les champs
    setValue('viewNom', client.nom_raison_sociale);
    setValue('viewIce', client.ice);
    setValue('viewDateCreation', client.date_creation); // ← CORRIGÉ
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
    setValue('viewDateNaissance', client.date_naissance); // ← CORRIGÉ
    setValue('viewContact', client.contact);
    setValue('viewCodeClient', client.code_client);
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
  
  // Stocker l'ID du client en cours de modification
  document.getElementById('editClientForm').setAttribute('data-client-id', client.id);
}

function cancelEdit() {
  const editFormContainer = document.getElementById('editFormContainer');
  const editPlaceholder = document.getElementById('editPlaceholder');
  
  editFormContainer.style.display = 'none';
  editPlaceholder.style.display = 'block';
  
  // Réinitialiser le select
  const selectElement = document.getElementById('editClientSelect');
  if (selectElement) {
    const selectedDiv = selectElement.querySelector('.select-selected');
    selectedDiv.textContent = 'Choisir un client...';
    selectedDiv.removeAttribute('data-client-id');
  }
}

/* =========================
   ACTIONS CLIENTS
   ========================= */
function handleClientAction(action, buttonElement) {
  const row = buttonElement.closest('tr.client-row');
  const clientId = row?.dataset.clientId;
  if (!clientId) return;

  const client = clients.find(c => c.id === clientId);
  if (!client) return;

  // Mapping des actions vers les pages
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
      page: 'declarations' // ← CORRECTION : Page DÉCLARATIONS
    }
  };

  const config = actionConfig[action];
  if (!config) return;

  // 1. Navigation vers la page cible (Clients ou Déclarations)
  navigateToTargetPage(config.page, config.tab);

  // 2. Sélectionner le client dans le dropdown
  setTimeout(() => {
    selectClientInDropdown(config.selectId, clientId, client);
    
    // 3. Appeler le handler spécifique après la sélection
    if (config.handler) {
      setTimeout(() => {
        config.handler(clientId);
      }, 200);
    }
  }, 150);

  // 4. Fermer le menu dropdown
  closeActionDropdown(buttonElement);
}

function selectClientInDropdown(selectId, clientId, client) {
  const selectElement = document.getElementById(selectId);
  if (!selectElement) {
    console.error(`Dropdown ${selectId} non trouvé`);
    return;
  }

  const selectedDiv = selectElement.querySelector('.select-selected');
  if (!selectedDiv) {
    console.error('Element .select-selected non trouvé');
    return;
  }

  // Mettre à jour l'affichage ET l'attribut data-client-id
  selectedDiv.textContent = `${client.nom_raison_sociale}${client.ice ? ' - ' + client.ice : ''}`;
  selectedDiv.setAttribute('data-client-id', clientId);

  console.log(`✅ Client sélectionné dans ${selectId}:`, client.nom_raison_sociale);
  
  // Mettre à jour les options du selecteur
  updateCustomSelectOptions(selectId, clientId);
  
  // FORCER le déclenchement de l'événement de sélection
  triggerSelectionEvent(selectId, clientId);
}

function triggerSelectionEvent(selectId, clientId) {
  // Pour le selecteur d'affectation des déclarations
  if (selectId === 'clientSelection') {
    console.log('🚀 Déclenchement loadAffectationChecklist pour:', clientId);
    // Le handler sera appelé automatiquement via l'observateur MutationObserver
  }
}

function updateCustomSelectOptions(selectId, selectedClientId) {
  const selectElement = document.getElementById(selectId);
  if (!selectElement) return;

  const optionsContainer = selectElement.querySelector('.select-options');
  if (!optionsContainer) return;

  // Mettre à jour la classe active sur l'option sélectionnée
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
  if (dropdown) {
    dropdown.style.display = 'none';
  }
}

/* =========================
   ARCHIVES CLIENTS
   ========================= */

async function loadClientsArchives() {
  try {
    console.log('📁 Chargement des clients archivés...');
    
    const { data, error } = await supabase
      .from('clients_archives')
      .select('*')
      .order('archived_at', { ascending: false });
    
    if (error) {
      console.error('❌ Erreur chargement archives:', error);
      throw error;
    }
    
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
  
  if (!tbody) {
    console.error('❌ Tableau des archives non trouvé');
    return;
  }
  
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
  
  console.log('✅ Affichage des archives mis à jour');
}

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

async function archiverClientPrompt(clientId) {
  const raison = prompt('Raison de l\'archivage ?');
  if (raison === null) return;
  
  if (await archiverClient(clientId, raison)) {
    alert('Client archivé avec succès !');
    loadClients(); // Recharger la liste
  }
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


/* =========================
   IMPRESSION FICHE CLIENT
   ========================= */

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

    // Créer le contenu HTML sophistiqué
    const printContent = creerContenuFicheClient(client);
    
    // Ouvrir une nouvelle fenêtre pour l'impression
    const printWindow = window.open('', '_blank');
    printWindow.document.write(printContent);
    printWindow.document.close();
    
    // Attendre que le contenu soit chargé puis imprimer
    printWindow.onload = function() {
        printWindow.focus();
        printWindow.print();
        // printWindow.close(); // Décommentez pour fermer automatiquement après impression
    };
}
function creerContenuFicheClient(client) {
    const dateGeneration = new Date().toLocaleDateString('fr-FR');
    
    // Déterminer le statut avec badge coloré
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
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 0;
            padding: 15mm;
            background: white;
            color: #1f2937;
            line-height: 1.4;
        }
        
        .fiche-client-simple {
            max-width: 210mm;
            margin: 0 auto;
        }
        
        .fiche-entete {
            text-align: center;
            margin-bottom: 2rem;
            padding-bottom: 1rem;
            border-bottom: 2px solid #2563eb;
        }
        
        .fiche-titre-principal {
            font-size: 1.8rem;
            font-weight: 700;
            color: #1f2937;
            margin-bottom: 0.25rem;
        }
        
        .fiche-sous-titre {
            color: #6b7280;
            font-size: 1rem;
            margin-bottom: 1rem;
        }
        
        .fiche-cabinet {
            font-size: 0.9rem;
            color: #2563eb;
            font-weight: 600;
        }
        
        .fiche-tableau {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 1.5rem;
        }
        
        .fiche-tableau td {
            padding: 0.75rem;
            border-bottom: 1px solid #e5e7eb;
            vertical-align: top;
        }
        
        .fiche-colonne-gauche {
            width: 35%;
            font-weight: 600;
            color: #374151;
            background-color: #f8fafc;
        }
        
        .fiche-colonne-droite {
            width: 65%;
            color: #6b7280;
        }
        
        .fiche-section-titre {
            background: #2563eb;
            color: white;
            padding: 0.75rem;
            font-weight: 600;
            margin: 1.5rem 0 0.5rem 0;
        }
        
        .fiche-signature {
            margin-top: 3rem;
            text-align: right;
        }
        
        .fiche-ligne-signature {
            border-top: 1px solid #374151;
            width: 200px;
            margin-left: auto;
            margin-top: 2rem;
            padding-top: 0.5rem;
            text-align: center;
            color: #6b7280;
            font-size: 0.875rem;
        }
        
        .fiche-pied {
            margin-top: 2rem;
            text-align: center;
            color: #9ca3af;
            font-size: 0.75rem;
            border-top: 1px solid #e5e7eb;
            padding-top: 1rem;
        }
        
        .statut-badge {
            display: inline-block;
            padding: 0.25rem 0.75rem;
            border-radius: 12px;
            font-size: 0.75rem;
            font-weight: 600;
            text-transform: uppercase;
        }
        
        .statut-actif {
            background: #d1fae5;
            color: #065f46;
        }
        
        .statut-inactif {
            background: #fef3c7;
            color: #92400e;
        }
        
        .statut-archive {
            background: #e5e7eb;
            color: #374151;
        }
        
        @page {
            margin: 10mm;
        }
        
        @media print {
            body {
                background: white !important;
                margin: 0;
                padding: 0;
            }
            
            .fiche-client-simple {
                margin: 0;
                padding: 0;
                box-shadow: none;
            }
        }
    </style>
</head>
<body>
    <div class="fiche-client-simple">
        <!-- En-tête simplifié -->
        <div class="fiche-entete">
            <div class="fiche-cabinet">NEW FID - Cabinet Comptable Agréé</div>
            <h1 class="fiche-titre-principal">FICHE CLIENT</h1>
            <div class="fiche-sous-titre">${client.nom_raison_sociale}</div>
        </div>
        
        <!-- Tableau à deux colonnes -->
        <table class="fiche-tableau">
            <!-- Informations générales -->
            <tr>
                <td colspan="2" class="fiche-section-titre">INFORMATIONS GÉNÉRALES</td>
            </tr>
            <tr>
                <td class="fiche-colonne-gauche">Raison Sociale</td>
                <td class="fiche-colonne-droite">${client.nom_raison_sociale || '-'}</td>
            </tr>
            <tr>
                <td class="fiche-colonne-gauche">ICE</td>
                <td class="fiche-colonne-droite">${client.ice || '-'}</td>
            </tr>
            <tr>
                <td class="fiche-colonne-gauche">Date de Création</td>
                <td class="fiche-colonne-droite">${formatDateForDisplay(client.date_creation) || '-'}</td>
            </tr>
            <tr>
                <td class="fiche-colonne-gauche">Siège Social</td>
                <td class="fiche-colonne-droite">${client.siege_social || '-'}</td>
            </tr>
            <tr>
                <td class="fiche-colonne-gauche">Ville</td>
                <td class="fiche-colonne-droite">${client.ville || '-'}</td>
            </tr>
            <tr>
                <td class="fiche-colonne-gauche">Activité</td>
                <td class="fiche-colonne-droite">${client.activite || '-'}</td>
            </tr>
            <tr>
                <td class="fiche-colonne-gauche">Statut</td>
                <td class="fiche-colonne-droite">
                    <span class="statut-badge ${statutClass}">${statutLabel}</span>
                </td>
            </tr>
            
            <!-- Informations fiscales -->
            <tr>
                <td colspan="2" class="fiche-section-titre">INFORMATIONS FISCALES</td>
            </tr>
            <tr>
                <td class="fiche-colonne-gauche">Identifiant Fiscal</td>
                <td class="fiche-colonne-droite">${client.identifiant_fiscal || '-'}</td>
            </tr>
            <tr>
                <td class="fiche-colonne-gauche">Taxe Professionnelle</td>
                <td class="fiche-colonne-droite">${client.taxe_professionnelle || '-'}</td>
            </tr>
            <tr>
                <td class="fiche-colonne-gauche">Registre de Commerce</td>
                <td class="fiche-colonne-droite">${client.registre_commerce || '-'}</td>
            </tr>
            <tr>
                <td class="fiche-colonne-gauche">CNSS</td>
                <td class="fiche-colonne-droite">${client.cnss || '-'}</td>
            </tr>
            <tr>
                <td class="fiche-colonne-gauche">RIB</td>
                <td class="fiche-colonne-droite">${client.rib || '-'}</td>
            </tr>
            <tr>
                <td class="fiche-colonne-gauche">Code Client</td>
                <td class="fiche-colonne-droite">${client.code_client || '-'}</td>
            </tr>
            
            <!-- Informations du gérant -->
            <tr>
                <td colspan="2" class="fiche-section-titre">INFORMATIONS DU GÉRANT</td>
            </tr>
            <tr>
                <td class="fiche-colonne-gauche">Nom du Gérant</td>
                <td class="fiche-colonne-droite">${client.nom_gerant || '-'}</td>
            </tr>
            <tr>
                <td class="fiche-colonne-gauche">CIN du Gérant</td>
                <td class="fiche-colonne-droite">${client.cin_gerant || '-'}</td>
            </tr>
            <tr>
                <td class="fiche-colonne-gauche">Adresse du Gérant</td>
                <td class="fiche-colonne-droite">${client.adresse_gerant || '-'}</td>
            </tr>
            <tr>
                <td class="fiche-colonne-gauche">Date de Naissance</td>
                <td class="fiche-colonne-droite">${formatDateForDisplay(client.date_naissance) || '-'}</td>
            </tr>
            
            <!-- Contact -->
            <tr>
                <td colspan="2" class="fiche-section-titre">CONTACT</td>
            </tr>
            <tr>
                <td class="fiche-colonne-gauche">Email</td>
                <td class="fiche-colonne-droite">${client.email || '-'}</td>
            </tr>
            <tr>
                <td class="fiche-colonne-gauche">Téléphone</td>
                <td class="fiche-colonne-droite">${client.contact || '-'}</td>
            </tr>
        </table>
        
        <!-- Signature -->
        <div class="fiche-signature">
            <div class="fiche-ligne-signature">
                Signature et cachet
            </div>
        </div>
        
        <!-- Pied de page minimal -->
        <div class="fiche-pied">
            Document généré le ${dateGeneration}
        </div>
    </div>
</body>
</html>
    `;
}

/* =========================
   CHARGEMENT DONNÉES DÉCLARATIONS
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

// =========================
// VERSION AVEC DEBUG - loadEcheancesTable()
// =========================

async function loadEcheancesTable(){
  const tbody = document.getElementById('echeancesTableBody');
  const annee = document.getElementById('anneeSelection').value;
  const etat = document.getElementById('filtreEtat').value;
  const typeDeclaration = document.getElementById('filtreTypeDeclaration').value;
  const fClient = getSelectedClientId('filtreClient') || 'tous';
  
  tbody.innerHTML = '<tr><td colspan="5" class="no-data">Chargement...</td></tr>';
  
  let q = supabase.from('echeances')
    .select('*, clients(nom_raison_sociale), declaration_types(nom_template,type_declaration)')
    .eq('annee_comptable', annee)
    .order('date_fin', {ascending:false});
  
  if(fClient !== 'tous') {
    q = q.eq('client_id', fClient);
  }
  
  const {data} = await q;
  
  // ✅ DEBUG : Afficher les données brutes
  console.log('=== DEBUG FILTRE TYPE ===');
  console.log('Type sélectionné:', typeDeclaration);
  console.log('Total échéances chargées:', data?.length);
  
  if (data && data.length > 0) {
    // Afficher les types de déclaration uniques disponibles
    const uniqueTypes = [...new Set(data.map(e => e.declaration_types?.type_declaration).filter(Boolean))];
    console.log('Types de déclaration disponibles:', uniqueTypes);
    
    // Afficher quelques échéances pour debug
    data.slice(0, 3).forEach((e, i) => {
      console.log(`Échéance ${i+1}:`, {
        nom: e.nom_echeance,
        type: e.declaration_types?.type_declaration,
        template: e.declaration_types?.nom_template
      });
    });
  }
  
  if(!data || !data.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="no-data">Aucune échéance pour ${annee}</td></tr>`;
    return;
  }
  
  let list = data;
  
  // ✅ CORRECTION : Meilleur filtrage par type
  if(typeDeclaration !== 'tous') {
    const filtered = list.filter(e => {
      const declType = e.declaration_types?.type_declaration;
      console.log(`Filtrage: ${declType} === ${typeDeclaration} ?`, declType === typeDeclaration);
      return declType === typeDeclaration;
    });
    
    console.log(`Échéances après filtrage type: ${filtered.length} sur ${list.length}`);
    list = filtered;
  }
  
  // Filtre par état
  if(etat !== 'tous') { 
    list = list.filter(e => calculerEtatEcheance(e) === etat); 
  }
  
  if(!list.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="no-data">Aucune échéance avec ces filtres</td></tr>';
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
function initializeEcheancesDefaults() {
  console.log('🎯 Initialisation des échéances par défaut...');
  
  // S'assurer que "Tous les clients" est sélectionné au chargement
  const selectElement = document.getElementById('filtreClient');
  if (selectElement) {
    const selectedDiv = selectElement.querySelector('.select-selected');
    selectedDiv.textContent = 'Tous les clients';
    selectedDiv.setAttribute('data-client-id', 'tous');
  }
  
  // S'assurer que "Tous les types" est sélectionné
  const typeSelect = document.getElementById('filtreTypeDeclaration');
  if (typeSelect) {
    typeSelect.value = 'tous';
  }
  
  // ✅ SIMPLE : Configurer les événements une seule fois
  setupEcheancesFilters();
  
  // Charger les échéances immédiatement
  loadEcheancesTable();
}
/* =========================
   GESTION AFFECTATION
   ========================= */
function loadAffectationChecklist(clientId = null){
  const container = document.getElementById('checklistContent');
  
  // ✅ CORRECTION : Accepter clientId en paramètre OU le récupérer du selecteur
  const targetClientId = clientId || getSelectedClientId('clientSelection');
  const annee = document.getElementById('anneeAffectation').value;
  const btn = document.getElementById('affecterDeclarationsBtn');

  if(!targetClientId || targetClientId === 'tous') {
    container.innerHTML = '<div class="no-data">Sélectionnez un client</div>'; 
    btn.style.display = 'none'; 
    return;
  }
  
  btn.style.display = 'block';

  // ✅ CORRECTION : Utiliser targetClientId au lieu de clientId
  const declAffect = clientDeclarations.filter(cd => cd.client_id === targetClientId && cd.annee_comptable == annee);
  
  const has = (s, ...qs) => (s ? qs.some(q => s.toLowerCase().includes(q.toLowerCase())) : false);
  const isP = (d, p) => (d.periodicite || '').toLowerCase() === p;

  // NOUVELLES CATEGORIES SELON TA LISTE

  
  const sections = [
    {
      title: 'CNSS',
      id: 'cnss',
      match: d => d.type_declaration === 'CNSS' || has(d.nom_template, 'cnss')
    },
    {
      title: 'TVA Mensuelle', 
      id: 'tva_mensuelle',
      match: d => isP(d, 'mensuelle') && (d.type_declaration === 'TVA' || has(d.nom_template, 'tva'))
    },
    {
      title: 'RAS IR/Salaires',
      id: 'ras_ir_salaires',
      match: d => (
    // Spécifiquement les déclarations RAS IR sur salaires
    (d.type_declaration === 'IR' && has(d.nom_template, 'salaire', 'traitements', 'salaires')) ||
    // Ou les anciens noms de templates
    has(d.nom_template, 'ir/salaire', 'ir salaire', 'ras/salaire', 'ras salaire')
    ) && 
    // S'assurer que c'est mensuel (pour exclure les annuelles)
    (d.periodicite === 'mensuelle' || d.periodicite === 'Mensuelle')
    },
    {
      title: 'RAS Sur Loyer',
      id: 'ras_loyer',
      match: d => has(d.type_declaration, 'ras', 'loyer') || has(d.nom_template, 'ras/loyer', 'ras loyer', 'loyer')
    },
    {
      title: 'IS - Acomptes',
      id: 'is_acomptes',
      match: d => d.type_declaration === 'IS' && has(d.nom_template, 'acompte', 'premier', 'deuxième', 'troisième', 'quatrième', 't1', 't2', 't3', 't4')
    },
    {
      title: 'TVA Trimestrielle',
      id: 'tva_trimestrielle',
      match: d => isP(d, 'trimestrielle') && (d.type_declaration === 'TVA' || has(d.nom_template, 'tva'))
    },
    {
      title: 'Délais de Paiement',
      id: 'delais_paiement',
      match: d => has(d.nom_template, 'délai', 'delai', 'paiement')
    },
    {
      title: 'IS - Déclarations Annuelles',
      id: 'is_annuelles',
      match: d => isP(d, 'annuelle') && d.type_declaration === 'IS'
    },
    {
      title: 'IR - Déclarations Annuelles',
      id: 'ir_annuelles',
      match: d => isP(d, 'annuelle') && d.type_declaration === 'IR'
    }
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
  
  // Initialiser les accordéons
  initializeAccordions();
  // Gérer les cases à cocher
  setupCheckboxHandlers(container);
  // Initialiser le bouton imprimer
  updatePrintButton();
}

function initializeAccordions() {
  const accordions = document.querySelectorAll('.category-accordion');
  
  accordions.forEach(accordion => {
    const header = accordion.querySelector('.category-header');
    const content = accordion.querySelector('.category-content');
    const arrow = accordion.querySelector('.accordion-arrow i');
    
    // Fermer tous les accordéons par défaut
    content.style.display = 'none';
    arrow.classList.remove('fa-chevron-up');
    arrow.classList.add('fa-chevron-down');
    
    header.addEventListener('click', function(e) {
      // Ne pas déclencher si on clique sur la checkbox
      if (e.target.type === 'checkbox') return;
      
      // Fermer tous les autres accordéons
      accordions.forEach(otherAccordion => {
        if (otherAccordion !== accordion) {
          const otherContent = otherAccordion.querySelector('.category-content');
          const otherArrow = otherAccordion.querySelector('.accordion-arrow i');
          otherContent.style.display = 'none';
          otherArrow.classList.remove('fa-chevron-up');
          otherArrow.classList.add('fa-chevron-down');
        }
      });
      
      // Basculer l'accordéon actuel
      const isOpen = content.style.display === 'block';
      content.style.display = isOpen ? 'none' : 'block';
      arrow.classList.toggle('fa-chevron-up', !isOpen);
      arrow.classList.toggle('fa-chevron-down', isOpen);
    });
  });
  
}

function setupCheckboxHandlers(container) {
  // Cases à cocher indéterminées
  container.querySelectorAll('.category-checkbox[data-indeterminate="1"]').forEach(cb => cb.indeterminate = true);

  container.addEventListener('change', (e) => {
    const t = e.target;
    
    if(t.classList.contains('category-checkbox')) {
      const categoryId = t.getAttribute('data-category');
      const categoryAccordion = container.querySelector(`.category-accordion[data-category="${categoryId}"]`);
      categoryAccordion.querySelectorAll('.item-checkbox').forEach(i => i.checked = t.checked);
      t.indeterminate = false;
      
      // Mettre à jour le compteur
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
      
      // Mettre à jour le compteur
      updateCategoryStats(categoryAccordion);
    }
  });
}

function updateCategoryStats(categoryAccordion) {
  const items = categoryAccordion.querySelectorAll('.item-checkbox');
  const checked = [...items].filter(i => i.checked).length;
  const total = items.length;
  const statsCount = categoryAccordion.querySelector('.stats-count');
  
  if (statsCount) {
    statsCount.textContent = `${checked}/${total}`;
  }
}

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

/* =========================
   CALCULS ET ÉTATS
   ========================= */

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


function calculerDateReellePourDecl(decl, dateTemplate, annee){
  if (!dateTemplate) return new Date();
  
  const [jS, mS] = (dateTemplate || '01/01').split('/');
  let y = parseInt(annee, 10);
  
  const bascule = doitBasculerNPlus1(decl);
  if (bascule) {
    y += 1;
  }
  
  // Log pour debug
  if (decl.type_declaration.includes('IS') && decl.nom_template.includes('acompte')) {
    console.log(`📅 ${decl.nom_template}: ${dateTemplate} → ${y}-${mS}-${jS} (bascule N+1: ${bascule})`);
  }
  
  return new Date(y, parseInt(mS, 10) - 1, parseInt(jS, 10));
}


function doitBasculerNPlus1(decl){
  const p = (decl.periodicite || '').toLowerCase();
  const type = (decl.type_declaration || '').toLowerCase();
  const nom = (decl.nom_template || '').toLowerCase();
  
  // RÈGLE SPÉCIALE : 4ème acompte IS reste en N
  const is4emeAcompteIS = (
    type.includes('is') && 
    (nom.includes('quatrième') || nom.includes('4ème') || nom.includes('quatrieme') || nom.includes('4eme')) &&
    (nom.includes('acompte') || p === 'trimestrielle')
  );
  
  if (is4emeAcompteIS) {
    return false;
  }
  
  // RÈGLES GÉNÉRALES
  if (p === 'annuelle') return true;
  if (p === 'trimestrielle' && decl.trimestre_reference === 4) return true;
  if (p === 'mensuelle' && decl.mois_reference === 12) return true;
  
  return false;
}


/* =========================
   ACTIONS ÉCHÉANCES
   ========================= */

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

/* =========================
   IMPRESSION DÉCLARATIONS
   ========================= */

function setupPrintButton() {
  const printBtn = document.getElementById('btnImprimerDeclarations');
  if (!printBtn) return;
  
  printBtn.addEventListener('click', imprimerListeDeclarations);
}

function updatePrintButton() {
  const printBtn = document.getElementById('btnImprimerDeclarations');
  console.log('🖨️ Bouton impression:', printBtn); // Debug
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
  
  // Récupérer les détails des déclarations
  const declarationsAvecDetails = declarationsAffectees.map(cd => {
    const declType = declarationTypes.find(dt => dt.id === cd.declaration_type_id);
    return {
      ...cd,
      declaration_type: declType
    };
  });
  
  // CORRECTION : Utiliser declarationsAvecDetails au lieu de declarationsAffectees
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
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 0;
            padding: 20px;
            background: white;
            color: #1f2937;
            line-height: 1.4;
        }
        
        .header {
            text-align: center;
            margin-bottom: 30px;
            border-bottom: 2px solid #2563eb;
            padding-bottom: 15px;
        }
        
        .title {
            font-size: 1.8rem;
            font-weight: 700;
            color: #1f2937;
            margin-bottom: 0.5rem;
        }
        
        .subtitle {
            color: #6b7280;
            font-size: 1.1rem;
        }
        
        .client-info {
            background: #f8fafc;
            padding: 1.5rem;
            border-radius: 8px;
            margin-bottom: 2rem;
            border-left: 4px solid #2563eb;
        }
        
        .table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 2rem;
        }
        
        .table th {
            background: #2563eb;
            color: white;
            padding: 1rem;
            text-align: left;
            font-weight: 600;
        }
        
        .table td {
            padding: 1rem;
            border-bottom: 1px solid #e5e7eb;
        }
        
        .table tr:nth-child(even) {
            background: #f8fafc;
        }
        
        .periodicite-badge {
            display: inline-block;
            padding: 0.25rem 0.75rem;
            border-radius: 12px;
            font-size: 0.75rem;
            font-weight: 600;
            text-transform: uppercase;
        }
        
        .mensuelle { background: #dbeafe; color: #1e40af; }
        .trimestrielle { background: #fef3c7; color: #92400e; }
        .annuelle { background: #d1fae5; color: #065f46; }
        
        .summary {
            background: #f0f9ff;
            padding: 1.5rem;
            border-radius: 8px;
            border-left: 4px solid #0ea5e9;
            margin-top: 2rem;
        }
        
        .footer {
            text-align: center;
            margin-top: 3rem;
            padding-top: 1rem;
            border-top: 1px solid #e5e7eb;
            color: #6b7280;
            font-size: 0.875rem;
        }
        
        @page {
            margin: 10mm;
        }
        
        @media print {
            body {
                background: white !important;
                margin: 0;
                padding: 0;
            }
        }
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
                    <td>
                        <span class="periodicite-badge ${decl.declaration_type.periodicite}">
                            ${decl.declaration_type.periodicite}
                        </span>
                    </td>
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
    
    <div class="footer">
        Document généré par GEST FID - NEW FID Cabinet Comptable
    </div>
</body>
</html>
  `;
  
  printWindow.document.write(printContent);
  printWindow.document.close();
  printWindow.print();
}

/* =========================
   INITIALISATION CODES
   ========================= */
function initializeCodesPage() {
  console.log('🔐 Initialisation de la page Codes - Version corrigée');
  
  setupCodesEventListeners();
  setupCodesClientSelects();
}

function setupCodesEventListeners() {
  // Onglets principaux
  document.querySelectorAll('#codes .tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      const target = e.target.getAttribute('data-tab');
      switchCodesTab(target);
    });
  });
  
  // Bouton modifier dans l'onglet affichage
  document.getElementById('btnModifierCodes').addEventListener('click', switchToEditMode);
  
  // Annulation formulaire
  document.getElementById('btnAnnulerCodes').addEventListener('click', cancelEdit);
  
  // Soumission formulaire
  document.getElementById('formCodesClient').addEventListener('submit', handleSaveCodes);
}

function setupCodesClientSelects() {
  // Initialiser les sélecteurs custom
  initializeCustomSelects();
  
  // Peupler les options après un court délai pour être sûr que les sélecteurs sont initialisés
  setTimeout(() => {
    populateCustomSelect('filtreClientCodes', clients, null, false);
    populateCustomSelect('ajoutClientSelect', clients, null, false);
    
    // Configurer les écouteurs d'événements pour les sélecteurs
    setupCodesSelectListeners();
  }, 100);
}

function setupCodesSelectListeners() {
  // Sélecteur de l'onglet affichage
  const filtreSelect = document.getElementById('filtreClientCodes');
  if (filtreSelect) {
    const selectedDiv = filtreSelect.querySelector('.select-selected');
    
    // Observer les changements de sélection
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
  
  // Sélecteur de l'onglet ajout
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


/* =========================
   GESTION AFFICHAGE CODES
   ========================= */
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
    
    // CORRECTION : Lire directement depuis la table clients
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

/* =========================
   ÉDITION CODES
   ========================= */

function switchToEditMode() {
  if (!currentSelectedClientId) return;
  
  // Pré-remplir le formulaire avec les données existantes
  if (codesData) {
    fillFormWithData(codesData);
  }
  
  // Sélectionner le client dans l'onglet ajout
  const selectElement = document.getElementById('ajoutClientSelect');
  const selectedDiv = selectElement.querySelector('.select-selected');
  const client = clients.find(c => c.id === currentSelectedClientId);
  
  if (client) {
    selectedDiv.textContent = `${client.nom_raison_sociale}${client.ice ? ' - ' + client.ice : ''}`;
    selectedDiv.setAttribute('data-client-id', currentSelectedClientId);
  }
  
  // Basculer vers l'onglet ajout/modification
  switchCodesTab('ajouter-codes');
  
  // Afficher le message si client existe déjà
  if (codesData) {
    showClientExistsMessage();
    isEditMode = true;
    document.getElementById('btnEnregistrerCodes').textContent = 'Mettre à jour les Codes';
  }
}

async function checkIfClientHasCodes(clientId) {
  // CORRECTION : Vérifier directement dans les clients
  const client = clients.find(c => c.id === clientId);
  codesData = client || null;
  
  if (codesData && hasCodesData(codesData)) {
    // Client existe déjà avec des codes
    showClientExistsMessage();
    fillFormWithData(codesData);
    isEditMode = true;
    document.getElementById('btnEnregistrerCodes').textContent = 'Mettre à jour les Codes';
    console.log('ℹ️ Client existant - mode édition activé');
  } else {
    // Nouveau client ou sans codes
    hideClientExistsMessage();
    clearForm();
    isEditMode = false;
    document.getElementById('btnEnregistrerCodes').textContent = 'Enregistrer les Codes';
    console.log('🆕 Nouveau client - formulaire vide');
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
    if (element && data[field]) {
      element.value = data[field];
    }
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

function resetEditMode() {
  isEditMode = false;
  document.getElementById('btnEnregistrerCodes').textContent = 'Enregistrer les Codes';
}

function cancelEditCodes() {
  clearForm();
  hideClientExistsMessage();
  switchCodesTab('afficher-codes');
}

/* =========================
   SAUVEGARDE CODES
   ========================= */

async function handleSaveCodes(e) {
  e.preventDefault();
  
  const clientId = getSelectedClientId('ajoutClientSelect');
  if (!clientId) {
    alert('❌ Veuillez sélectionner un client');
    return;
  }
  
  try {
    const formData = getFormData();
    
    // CORRECTION : Toujours faire un UPDATE sur la table clients
    const { data, error } = await supabase
      .from('clients')
      .update(formData)
      .eq('id', clientId)
      .select();
    
    if (error) throw error;
    
    if (data && data[0]) {
      alert(`✅ Codes ${isEditMode ? 'mis à jour' : 'enregistrés'} avec succès !`);
      
      // Recharger les données
      currentSelectedClientId = clientId;
      await loadClients(); // Recharger tous les clients
      await loadClientCodes(clientId); // Recharger les codes du client
      
      // Retourner à l'onglet affichage
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

function hasCodesData(client) {
  return client.simpl_login || client.damancom_login || client.barid_login || 
         client.email_login || client.marche_login || client.anapec_login;
}

/* =========================
   INITIALISATION HONORAIRES
   ========================= */

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
    if (result) {
      refreshHonorairesUI();
    }
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
    if (result) {
      refreshHonorairesUI();
    }
  });

  refreshHonorairesUI();
}

async function loadHonorairesFromSupabase() {
  try {
    console.log('Chargement des honoraires depuis Supabase...');
    
    // Charger les facturations
    const { data: facturations, error: errorFactu } = await supabase
      .from('honoraires_factures')
      .select('*')
      .order('date', { ascending: false });
    
    if (errorFactu) {
      console.error('Erreur chargement facturations:', errorFactu);
    } else {
      honosFactu = facturations || [];
      console.log(`${honosFactu.length} facturations chargées`);
    }
    
    // Charger les paiements
    const { data: paiements, error: errorPay } = await supabase
      .from('honoraires_paiements')
      .select('*')
      .order('date', { ascending: false });
    
    if (errorPay) {
      console.error('Erreur chargement paiements:', errorPay);
    } else {
      honosPay = paiements || [];
      console.log(`${honosPay.length} paiements chargés`);
    }
    
  } catch (e) {
    console.error('Erreur chargement honoraires Supabase:', e);
    honosFactu = [];
    honosPay = [];
  }
}

/* =========================
   GESTION UI HONORAIRES
   ========================= */

function refreshHonorairesUI(){
  console.log('🔄 DEBUT refreshHonorairesUI');
  
  const rows = honosFactu.filter(x => x.client_id === honosClientId && x.exercice == honosExercice);
  const pay = honosPay.filter(x => x.client_id === honosClientId);
  
  console.log('📊 Données pour rafraîchissement:', {
    clientId: honosClientId,
    exercice: honosExercice,
    facturations: rows.length,
    paiements: pay.length
  });

  // FACTURATIONS
  const factuTbody = document.getElementById('factuTbody');
  factuTbody.innerHTML = '';
  if (rows.length === 0) {
    factuTbody.innerHTML = '<tr><td colspan="5" class="no-data">Aucune facturation</td></tr>';
  } else {
    rows.forEach(factu => {
      factuTbody.appendChild(createFactuRow(factu));
    });
  }

  // PAIEMENTS
  const payTbody = document.getElementById('payTbody');
  payTbody.innerHTML = '';
  if (pay.length === 0) {
    payTbody.innerHTML = '<tr><td colspan="5" class="no-data">Aucun paiement</td></tr>';
  } else {
    pay.forEach(payment => {
      payTbody.appendChild(createPayRow(payment));
    });
  }

  // SITUATION
  updateSituationTotals(rows, pay);
  
  console.log('✅ FIN refreshHonorairesUI');
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
  
  // FACTURATIONS - update sélectif
  updateTableContent('factuTbody', rows, createFactuRow, 'Aucune facturation');
  
  // PAIEMENTS - update sélectif  
  updateTableContent('payTbody', pay, createPayRow, 'Aucun paiement');
  
  // SITUATION - recalculer seulement les totaux
  updateSituationTotals(rows, pay);
}

function updateTableContent(tbodyId, data, createRowFn, emptyMessage) {
  const tbody = document.getElementById(tbodyId);
  const existingRows = Array.from(tbody.querySelectorAll('tr[data-id]'));
  
  // ✅ CORRECTION : Forcer la recréation pour les paiements
  if (tbodyId === 'payTbody' || tbodyId === 'factuTbody') {
    tbody.innerHTML = '';
    
    if (data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="no-data">${emptyMessage}</td></tr>`;
      return;
    }
    
    data.forEach(item => {
      const newRow = createRowFn(item);
      tbody.appendChild(newRow);
    });
    
    console.log(`✅ ${tbodyId} FORCÉ: ${data.length} lignes recréées`);
    return;
  }
  
  // ✅ Pour les autres tableaux, garder l'optimisation existante
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
    if (!data.find(item => item.id === row.dataset.id)) {
      row.remove();
    }
  });
  
  const noDataRow = tbody.querySelector('.no-data');
  if (data.length === 0 && !noDataRow) {
    tbody.innerHTML = `<tr><td colspan="5" class="no-data">${emptyMessage}</td></tr>`;
  } else if (data.length > 0 && noDataRow) {
    noDataRow.remove();
  }
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

  // Mettre à jour seulement les totaux (pas tout le HTML)
  document.getElementById('sitTotalServices').textContent = totalF.toFixed(2);
  document.getElementById('sitTotalPaiements').textContent = totalP.toFixed(2);
  document.getElementById('sitReport').textContent = report.toFixed(2);
  document.getElementById('sitSolde').textContent = solde.toFixed(2);
  
  // Mettre à jour les tableaux de situation seulement si nécessaire
  updateSituationTables(factu, payClient);
}

function updateSituationTables(factu, payClient) {
  updateTableContent('sitFactuTbody', factu, createSituationFactuRow, 'Aucune donnée');
  updateTableContent('sitPayTbody', payClient, createSituationPayRow, 'Aucune donnée');
}

/* =========================
   CRUD HONORAIRES
   ========================= */

async function addFacturation(facturationData) {
  try {
    const { data, error } = await supabase
      .from('honoraires_factures')
      .insert([facturationData])
      .select();
    
    if (error) throw error;
    
    if (data && data[0]) {
      honosFactu.unshift(data[0]);
    }
    
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
    
    if (data && data[0]) {
      honosPay.unshift(data[0]);
    }
    
    return data ? data[0] : null;
  } catch (error) {
    console.error('Erreur ajout paiement:', error);
    alert('Erreur lors de l\'ajout du paiement: ' + error.message);
    return null;
  }
}

async function updateFacturation(id, updates) {
  try {
    const { data, error } = await supabase
      .from('honoraires_factures')
      .update(updates)
      .eq('id', id)
      .select(); // ← AJOUT: Récupérer les données mises à jour
    
    if (error) throw error;
    
    if (data && data[0]) {
      // Mettre à jour le tableau local avec les données fraîches
      const index = honosFactu.findIndex(item => item.id === id);
      if (index !== -1) {
        honosFactu[index] = { ...honosFactu[index], ...data[0] };
      }
      console.log('✅ Facturation mise à jour:', data[0]);
    }
    
    return true;
  } catch (error) {
    console.error('❌ Erreur modification facturation:', error);
    alert('Erreur lors de la modification: ' + error.message);
    return false;
  }
}

async function updatePaiement(id, updates) {
  try {
    const { data, error } = await supabase
      .from('honoraires_paiements')
      .update(updates)
      .eq('id', id)
      .select(); // ← AJOUT: Récupérer les données mises à jour
    
    if (error) throw error;
    
    if (data && data[0]) {
      // Mettre à jour le tableau local avec les données fraîches
      const index = honosPay.findIndex(item => item.id === id);
      if (index !== -1) {
        honosPay[index] = { ...honosPay[index], ...data[0] };
      }
      console.log('✅ Paiement mis à jour:', data[0]);
    }
    
    return true;
  } catch (error) {
    console.error('❌ Erreur modification paiement:', error);
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
// =========================
// GESTION ACTIONS HONORAIRES
// =========================

function handleHonosAction(type, action, id) {
  console.log(`🎯 Action honoraires: ${type} - ${action} - ${id}`);
  
  switch(action) {
    case 'edit':
      if (type === 'factu') {
        console.log('✏️ Modification facturation:', id);
        editHonosFactu(id);
      } else if (type === 'pay') {
        console.log('✏️ Modification paiement:', id);
        editHonosPay(id);
      }
      break;
      
    case 'delete':
      if (type === 'factu') {
        if(confirm('Supprimer cette facturation ?')) {
          delHonosFactu(id);
        }
      } else if (type === 'pay') {
        if(confirm('Supprimer ce paiement ?')) {
          delHonosPay(id);
        }
      }
      break;
  }
}

/* =========================
   FONCTIONS ÉDITION (globales)
   ========================= */

window.editHonosFactu = async (id) => {
  const it = honosFactu.find(x => x.id === id); 
  if(!it) return;
  
  const lib = prompt('Libellé ?', it.libelle) || it.libelle;
  const m = Number(prompt('Montant ?', it.montant)); 
  if(isNaN(m) || m <= 0) return;
  
  const d = prompt('Date (YYYY-MM-DD) ?', it.date) || it.date;
  
  const updates = {
    libelle: lib,
    montant: m,
    date: d
  };
  
  const success = await updateFacturation(id, updates);
  if (success) {
    // FORCER le rafraîchissement complet
    await loadHonorairesFromSupabase(); // Recharger depuis Supabase
    refreshHonorairesUI(); // Rafraîchir l'interface
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
  
  const updates = {
    mode: mode,
    ref: ref,
    montant: m,
    date: d
  };
  
  const success = await updatePaiement(id, updates);
  if (success) {
    // FORCER le rafraîchissement complet
    await loadHonorairesFromSupabase(); // Recharger depuis Supabase
    refreshHonorairesUI(); // Rafraîchir l'interface
  }
};

window.delHonosFactu = async (id) => {
  if(confirm('Supprimer cette facturation ?')) {
    const success = await deleteFacturation(id);
    if (success) {
      refreshHonorairesUI();
    }
  }
};

window.delHonosPay = async (id) => {
  if(confirm('Supprimer ce paiement ?')) {
    const success = await deletePaiement(id);
    if (success) {
      refreshHonorairesUI();
    }
  }
};


/* =========================
   CALCULS HONORAIRES
   ========================= */

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

function createFactuRow(r) {
  const row = document.createElement('tr');
  row.dataset.id = r.id;
  row.innerHTML = `
    <td>${r.date}</td>
    <td>${r.libelle}</td>
    <td>${r.exercice}</td>
    <td style="text-align:right">${r.montant.toFixed(2)}</td>
    <td class="actions">
      <div class="action-dropdown">
        <button class="btn-primary action-toggle" data-id="${r.id}" data-type="factu">
          <i class="fas fa-cog"></i> Actions ▾
        </button>
        <div class="action-menu" id="honos-factu-menu-${r.id}">  <!-- ✅ CORRECTION : honos-factu-menu- -->
          <button class="menu-item" data-action="edit" data-id="${r.id}" data-type="factu">
            <i class="fas fa-edit"></i> Modifier
          </button>
          <button class="menu-item" data-action="delete" data-id="${r.id}" data-type="factu">
            <i class="fas fa-trash"></i> Supprimer
          </button>
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
      <div class="action-dropdown">
        <button class="btn-primary action-toggle" data-id="${r.id}" data-type="pay">
          <i class="fas fa-cog"></i> Actions ▾
        </button>
        <div class="action-menu" id="honos-pay-menu-${r.id}">  <!-- ✅ CORRECTION : honos-pay-menu- -->
          <button class="menu-item" data-action="edit" data-id="${r.id}" data-type="pay">
            <i class="fas fa-edit"></i> Modifier
          </button>
          <button class="menu-item" data-action="delete" data-id="${r.id}" data-type="pay">
            <i class="fas fa-trash"></i> Supprimer
          </button>
        </div>
      </div>
    </td>
  `;
  return row;
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

function updateExistingRow(row, item, createRowFn) {
  const newRow = createRowFn(item);
  row.innerHTML = newRow.innerHTML;
  row.dataset.id = newRow.dataset.id;
}

/* =========================
   TABLEAU DE BORD
   ========================= */

 async function loadDashboardData() {
  try {
    console.log('📊 Début du chargement du tableau de bord...');

    /* 1) CLIENTS ACTIFS */
    console.log('🔍 Récupération des clients actifs...');
    const { data: clientsData, error: clientsError } = await supabase
      .from('clients')
      .select('id, nom_raison_sociale, statut');

    if (clientsError) {
      console.error('❌ Erreur clients:', clientsError);
      throw clientsError;
    }

    const clientsActifsList = (clientsData || []).filter(c => c.statut !== 'archive');
    const idsClientsActifs = new Set(clientsActifsList.map(c => c.id));
    const clientsActifsCount = idsClientsActifs.size;
    console.log(`✅ Clients actifs: ${clientsActifsCount}`);

    /* 2) CLIENTS À JOUR (aucune échéance tardive) */
    console.log('🔍 Calcul des clients à jour...');
    const aujourdhui = toYMDLocal(new Date());

    // Échéances dépassées ET statut NULL
    const { data: tardivesNull, error: e1 } = await supabase
      .from('echeances')
      .select('client_id')
      .lt('date_fin', aujourdhui)
      .is('statut_manuel', null);

    // Échéances dépassées ET statut NOT IN ('deposee','payee')
    const { data: tardivesNotOk, error: e2 } = await supabase
      .from('echeances')
      .select('client_id')
      .lt('date_fin', aujourdhui)
      .not('statut_manuel', 'in', '("deposee","payee")');

    if (e1) console.error('❌ tardivesNull:', e1);
    if (e2) console.error('❌ tardivesNotOk:', e2);

    const clientsAvecRetard = new Set(
      [...(tardivesNull || []), ...(tardivesNotOk || [])]
        .map(r => r.client_id)
        .filter(id => idsClientsActifs.has(id)) // on ne garde que les actifs
    );

    let clientsAJour = clientsActifsCount - clientsAvecRetard.size;
    if (clientsAJour < 0) clientsAJour = 0;
    console.log(`✅ Clients à jour: ${clientsAJour} sur ${clientsActifsCount}`);

    /* 3) PÉRIODE MENSUELLE */
    const maintenant = new Date();
    const debutMois = new Date(maintenant.getFullYear(), maintenant.getMonth(), 1);
    const finMois = new Date(maintenant.getFullYear(), maintenant.getMonth() + 1, 0);
    const debutMoisStr = toYMDLocal(debutMois);
    const finMoisStr = toYMDLocal(finMois);
    console.log('📅 Période du mois:', debutMoisStr, '→', finMoisStr);

    /* 4) DÉCLARATIONS DU MOIS */
    console.log('🔍 Récupération des déclarations du mois...');
    const { data: declarationsMois, error: declMoisError } = await supabase
      .from('echeances')
      .select('id, statut_manuel')
      .lte('date_debut', finMoisStr)
      .gte('date_fin', debutMoisStr);

    if (declMoisError) {
      console.error('❌ Erreur déclarations mois:', declMoisError);
      throw declMoisError;
    }

    const totalDeclarationsMois = declarationsMois?.length || 0;
    const declarationsDeposees =
      declarationsMois?.filter(d => d.statut_manuel === 'deposee' || d.statut_manuel === 'payee').length || 0;

    // Restantes = en_cours ou null (on ne mélange pas les "tardives", comptées à part)
    const declarationsRestantes =
      declarationsMois?.filter(d => d.statut_manuel === 'en_cours' || d.statut_manuel === null).length || 0;

    console.log(`✅ Déclarations du mois: ${totalDeclarationsMois} | Déposées: ${declarationsDeposees} | Restantes: ${declarationsRestantes}`);

    /* 5) TARDIVES DE L'ANNÉE */
    console.log('🔍 Calcul des tardives de l\'année...');
    const debutAnnee = new Date(maintenant.getFullYear(), 0, 1);
    const debutAnneeStr = toYMDLocal(debutAnnee);

    const { data: toutesDeclarationsAnnee, error: declAnneeError } = await supabase
      .from('echeances')
      .select('id, statut_manuel, date_fin, nom_echeance')
      .gte('date_fin', debutAnneeStr)
      .lt('date_fin', aujourdhui);

    if (declAnneeError) {
      console.error('❌ Erreur déclarations année:', declAnneeError);
      throw declAnneeError;
    }

    const declarationsTardives = (toutesDeclarationsAnnee || []).filter(d => {
      const estDeposee = d.statut_manuel === 'deposee' || d.statut_manuel === 'payee';
      return !estDeposee;
    });

    const totalTardivesAnnee = declarationsTardives.length;
    console.log(`✅ Tardives année: ${totalTardivesAnnee}`);

    /* 6) CLIENTS INCOMPLETS (pas de déclarations affectées sur l'année en cours) */
    let clientsIncomplets = 0;
    try {
      const anneeEnCours = maintenant.getFullYear();
      const { data: clientsAvecDeclarations, error: declError } = await supabase
        .from('client_declarations')
        .select('client_id')
        .eq('annee_comptable', anneeEnCours);

      if (declError) {
        console.warn('⚠️ Erreur clients incomplets:', declError);
      } else {
        // On compte seulement ceux qui sont actifs
        const setActifsAvecDecl = new Set(
          (clientsAvecDeclarations || []).map(d => d.client_id).filter(id => idsClientsActifs.has(id))
        );
        clientsIncomplets = clientsActifsCount - setActifsAvecDecl.size;
        if (clientsIncomplets < 0) clientsIncomplets = 0;
      }
    } catch (error) {
      console.warn('⚠️ Exception clients incomplets:', error);
      clientsIncomplets = 0;
    }
    console.log(`✅ Clients incomplets: ${clientsIncomplets}`);

    /* 7) MISE À JOUR UI */
    console.log('🎨 Mise à jour de l\'affichage...');
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
    // Mettre à jour toutes les métriques
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

    // Avertissement clients incomplets
    showClientsIncompletsAlert(metrics.clientsIncomplets);
    
    console.log('✅ Affichage mis à jour avec succès');
  } catch (error) {
    console.error('❌ Erreur mise à jour affichage:', error);
  }
}

function showClientsIncompletsAlert(nombreClients) {
  if (nombreClients === 0) {
    // Supprimer l'alerte existante si elle existe
    const existingAlert = document.querySelector('.clients-incomplets-alert');
    if (existingAlert) {
      existingAlert.remove();
    }
    return;
  }

  console.log(`⚠️ Affichage alerte pour ${nombreClients} clients incomplets`);

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

  // Insérer après la section progression
  const progressSection = document.querySelector('.progress-section');
  if (progressSection) {
    // Supprimer l'ancienne alerte si elle existe
    const existingAlert = document.querySelector('.clients-incomplets-alert');
    if (existingAlert) {
      existingAlert.remove();
    }
    
    // Ajouter la nouvelle alerte
    progressSection.insertAdjacentHTML('afterend', alertHTML);
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

function openDeclarationsPage() {
  console.log('🔗 Navigation vers la page déclarations...');
  
    // Naviguer vers la page déclarations
  const declarationsLink = document.querySelector('[data-page="declarations"]');
  if (declarationsLink) {
    declarationsLink.click();
    
    // Ouvrir l'onglet affectation après un délai
    setTimeout(() => {
      const affectationTab = document.querySelector('[data-tab="affectation"]');
      if (affectationTab) {
        affectationTab.click();
        console.log('✅ Onglet affectation ouvert');
      }
    }, 500);
  }
}

/* =========================
   SITUATION GLOBALE
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
    // FACTURATIONS : Filtrer par exercice
    const facturations = honosFactu.filter(f => 
      f.client_id === client.id && parseInt(f.exercice) === exercice
    );
    
    // PAIEMENTS : Maintenant aussi filtrer par exercice pour être cohérent
    const paiements = honosPay.filter(p => {
      if (p.client_id !== client.id) return false;
      
      // Vérifier si le paiement a un champ exercice, sinon utiliser l'année de la date
      if (p.exercice !== undefined && p.exercice !== null) {
        return parseInt(p.exercice) === exercice;
      } else {
        // Fallback : utiliser l'année de la date
        const payDate = parseYMDLocal(p.date);
        const payYear = payDate.getFullYear();
        return payYear === exercice;
      }
    });
    
    const totalFacture = facturations.reduce((sum, f) => sum + (parseFloat(f.montant) || 0), 0);
    const totalPaye = paiements.reduce((sum, p) => sum + (parseFloat(p.montant) || 0), 0);
    const resteAPayer = totalFacture - totalPaye;
    
    // Debug pour ce client
    if (facturations.length > 0 || paiements.length > 0) {
      console.log(`👤 Client ${client.nom_raison_sociale}:`, {
        facturations: facturations.length,
        paiements: paiements.length,
        totalFacture,
        totalPaye,
        resteAPayer
      });
    }
    
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
    if (filtreStatut !== 'tous' && item.statut !== filtreStatut) {
      return false;
    }
    
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
    )) {
      return false;
    }
    
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

/* =========================
   MISE À JOUR SÉLECTEURS
   ========================= */

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

function filterSituationGlobale() {
  updateSituationGlobaleUI();
  updateCharts();
}
/* =========================
   INTERACTIONS UI AVANCÉES
   ========================= */

function setupViewFormCopy() {
  const form = document.getElementById('viewClientForm');
  if (!form) return;
  
  // Sélectionner tous les inputs du formulaire de consultation
  const inputs = form.querySelectorAll('input');
  
  inputs.forEach(input => {
    // Retirer les anciens événements pour éviter les doublons
    input.removeEventListener('dblclick', handleViewFieldCopy);
    
    // Ajouter l'événement double-clic
    input.addEventListener('dblclick', handleViewFieldCopy);
    
    // Style pour indiquer que c'est copiable
    input.style.cursor = 'pointer';
    input.title = 'Double-cliquez pour copier';
  });
}

function handleViewFieldCopy(event) {
  const input = event.target;
  const text = input.value.trim();
  
  if (!text) return;
  
  // FORCER la sélection et la copie
  input.select();
  input.setSelectionRange(0, 99999); // Pour mobile
  
  navigator.clipboard.writeText(text).then(() => {
    console.log('Champ copié:', text);
    
    // Feedback visuel
    input.style.backgroundColor = 'var(--success-color)';
    input.style.color = 'white';
    
    setTimeout(() => {
      input.style.backgroundColor = '';
      input.style.color = '';
    }, 500);
  }).catch(err => {
    console.error('Erreur copie:', err);
    // Fallback
    document.execCommand('copy');
  });
}

function copyCellContent(cell) {
  const text = cell.textContent.trim();
  if (!text || text === '-') return;
  
  navigator.clipboard.writeText(text).then(() => {
    // Feedback visuel
    cell.classList.add('copied');
    setTimeout(() => {
      cell.classList.remove('copied');
    }, 2000);
  }).catch(err => {
    console.error('Erreur lors de la copie:', err);
    // Fallback pour les navigateurs qui ne supportent pas clipboard API
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    
    cell.classList.add('copied');
    setTimeout(() => {
      cell.classList.remove('copied');
    }, 2000);
  });
}

/* =========================
   GESTION DES ERREURS
   ========================= */

function handleClientSelection(selectId, clientId) {
  const selectElement = document.getElementById(selectId);
  if (selectElement) {
    selectElement.querySelector('.select-items').style.display = 'none';
    selectElement.querySelector('.select-selected').classList.remove('select-arrow-active');
  }
  
  switch(selectId) {
    case 'clientSelection':
      loadAffectationChecklist();
      break;
    case 'filtreClient':
      loadEcheancesTable();
      break;
    case 'honorairesClientSelect':
      honosClientId = clientId;
      refreshHonorairesUI();
      break;
  }
}

document.addEventListener('click', (e) => {
  // Gestion CONSULTER
  const btnView = e.target.closest('.action-view');
  if (btnView) {
    e.preventDefault();
    handleClientAction('view', btnView);
    return;
  }

  // Gestion MODIFIER
  const btnEdit = e.target.closest('.action-edit');
  if (btnEdit) {
    e.preventDefault();
    handleClientAction('edit', btnEdit);
    return;
  }

  // Gestion AFFECTER DÉCLARATIONS
  const btnAffect = e.target.closest('.action-affect');
  if (btnAffect) {
    e.preventDefault();
    handleClientAction('affect', btnAffect);
    return;
  }
});

// Navigation vers la page cible (Clients ou Déclarations)
function navigateToTargetPage(pageName, tabName) {
  // Navigation vers la page principale
  document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  
  document.querySelector(`[data-page="${pageName}"]`).classList.add('active');
  document.getElementById(pageName).classList.add('active');

  // Navigation vers l'onglet spécifique
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

// =====================================================
// 🎯 GESTION SPÉCIFIQUE POUR ARCHIVER (existant - à garder)
// =====================================================
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.action-archive');
  if (!btn) return;
  e.preventDefault();

  const row = btn.closest('tr');
  const clientId = row?.dataset.clientId;
  if (!clientId) return;

  const raison = prompt('Raison de l\'archivage ?');
  if (raison === null) return;

  if (await archiverClient(clientId, raison)) {
    alert('✅ Client archivé avec succès !');
    loadClients(); // Recharger la liste
  }
});

function populateEditClientSelect() {
  populateCustomSelect('editClientSelect', clients, null, false);
}

// Initialisation de l'événement
document.addEventListener('DOMContentLoaded', function() {
    const btnImprimer = document.getElementById('btnImprimerFicheClient');
    if (btnImprimer) {
        btnImprimer.addEventListener('click', genererFicheClientPDF);
    }
});


document.getElementById('affecterDeclarationsBtn').addEventListener('click', handleAffectation);

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

// Gestion du bouton d'impression
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
        
        <div class="date-print">
          Imprimé le: ${new Date().toLocaleDateString('fr-FR')}
        </div>
        
        <div class="client-info">
          <h3>Client: ${clientNom}</h3>
          ${clientICE ? `<p>ICE: ${clientICE}</p>` : ''}
          <p>Exercice: ${honosExercice}</p>
        </div>
        
        <div style="display: flex; gap: 20px;">
          <div style="flex: 1;">
            <h4>Services Facturés</h4>
            <table class="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Libellé</th>
                  <th>Montant (DH)</th>
                </tr>
              </thead>
              <tbody>
                ${document.getElementById('sitFactuTbody').innerHTML}
              </tbody>
            </table>
          </div>
          
          <div style="flex: 1;">
            <h4>Paiements</h4>
            <table class="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Référence</th>
                  <th>Montant (DH)</th>
                </tr>
              </thead>
              <tbody>
                ${document.getElementById('sitPayTbody').innerHTML}
              </tbody>
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
   FILTRES / SELECTEURS
   ========================= */
document.getElementById('clientSelection').addEventListener('change', loadAffectationChecklist);
document.getElementById('anneeAffectation').addEventListener('change', loadAffectationChecklist);
document.getElementById('anneeSelection').addEventListener('change', loadEcheancesTable);
document.getElementById('filtreEtat').addEventListener('change', loadEcheancesTable);
document.getElementById('filtreClient').addEventListener('change', loadEcheancesTable);
document.getElementById('filtreTypeDeclaration').addEventListener('change', loadEcheancesTable);


window.loadAffectationChecklist = loadAffectationChecklist;

// Ajouter à la fin de votre app.js

/* =========================
   GESTION MOBILE
   ========================= */

function initializeMobileFeatures() {
  setupMobileNavigation();
  setupTouchOptimizations();
  setupOrientationHandler();
}

function setupMobileNavigation() {
  // Créer le bouton menu mobile
  const menuToggle = document.createElement('button');
  menuToggle.className = 'mobile-menu-toggle';
  menuToggle.innerHTML = '<i class="fas fa-bars"></i>';
  menuToggle.addEventListener('click', toggleMobileMenu);
  document.body.appendChild(menuToggle);
  
  // Gestion du swipe pour le menu
  let startY;
  document.addEventListener('touchstart', (e) => {
    startY = e.touches[0].clientY;
  });
  
  document.addEventListener('touchmove', (e) => {
    if (!startY) return;
    
    const currentY = e.touches[0].clientY;
    const diff = startY - currentY;
    
    // Swipe vers le haut pour cacher le menu
    if (diff > 50) {
      hideMobileMenu();
    }
    // Swipe vers le bas pour montrer le menu
    else if (diff < -50) {
      showMobileMenu();
    }
  });
}

function toggleMobileMenu() {
  const sidebar = document.querySelector('.sidebar');
  sidebar.classList.toggle('mobile-hidden');
}

function showMobileMenu() {
  const sidebar = document.querySelector('.sidebar');
  sidebar.classList.remove('mobile-hidden');
}

function hideMobileMenu() {
  const sidebar = document.querySelector('.sidebar');
  sidebar.classList.add('mobile-hidden');
}

function setupTouchOptimizations() {
  // Prévenir le zoom sur les inputs
  document.addEventListener('touchstart', function() {}, {passive: true});
  
  // Optimiser les scrolls
  document.querySelectorAll('.clients-table-container, .select-options').forEach(el => {
    el.style.webkitOverflowScrolling = 'touch';
  });
}

function setupOrientationHandler() {
  window.addEventListener('orientationchange', function() {
    // Redimensionner après changement d'orientation
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 300);
  });
}

// Initialiser les fonctionnalités mobile au chargement
document.addEventListener('DOMContentLoaded', initializeMobileFeatures);

// Recalculer les dimensions au redimensionnement
window.addEventListener('resize', debounce(() => {
  // Recréer les événements si nécessaire
}, 250));

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}