// Configuración de Supabase
const SUPABASE_URL = 'https://mhmlwgsrzmqtsvfofcpw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1obWx3Z3Nyem1xdHN2Zm9mY3B3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5NTcwNDMsImV4cCI6MjA3ODUzMzA0M30.56vXzGRxUTU3uS6qwQGJmwTGW67S1mB-jl70SQ_zejE';

// Inicializar cliente de Supabase con Realtime habilitado
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    realtime: {
        params: {
            eventsPerSecond: 10
        }
    }
});

// Variables globales
let currentUser = null;
let jobs = [];
let developers = [];
let chats = {};
let currentChat = null;
let activeTab = 'myJobs';
let selectedLanguages = [];
let selectedAreas = [];
let totalUnreadMessages = 0; // Contador global de mensajes no leídos

// Suscripciones en tiempo real
let messagesSubscription = null;
let conversationsSubscription = null;

// Estado de autenticación
let isAuthenticated = false;

// IDs de tipos de usuario (debes verificar estos en tu BD)
const TIPO_EMPLEADOR = 1;
const TIPO_DESARROLLADOR = 2;

// Inicializar la aplicación
document.addEventListener('DOMContentLoaded', function() {
    const savedUser = localStorage.getItem('devconnect_user');
    
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        isAuthenticated = true;
        showAuthenticatedUI();
    } else {
        isAuthenticated = false;
        showUnauthenticatedUI();
    }
});

// Función para obtener la fecha/hora actual en formato ISO
function getCurrentTimestamp() {
    return new Date().toISOString();
}

// Función para hashear contraseñas
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

function formatDate(dateString) {
    if (!dateString) return '';
    
    const date = new Date(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const messageDate = new Date(date);
    messageDate.setHours(0, 0, 0, 0);
    
    const timePart = date.toLocaleTimeString('es-MX', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true
    });
    
    if (messageDate.getTime() === today.getTime()) {
        return `Hoy a las ${timePart}`;
    } else if (messageDate.getTime() === yesterday.getTime()) {
        return `Ayer a las ${timePart}`;
    } else {
        return date.toLocaleDateString('es-MX', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric'
        });
    }
}

// Configurar permisos según el tipo de usuario
function setupUserPermissions() {
    const isDeveloper = currentUser.tipo_id === TIPO_DESARROLLADOR;
    const isEmployer = currentUser.tipo_id === TIPO_EMPLEADOR;
    
    if (isDeveloper) {
        const addJobBtn = document.querySelector('[onclick="showAddJob()"]');
        if (addJobBtn) addJobBtn.style.display = 'none';
        
        const tabs = document.querySelectorAll('.tab');
        tabs.forEach(tab => {
            if (tab.textContent.includes('Desarrolladores')) {
                tab.style.display = 'none';
            }
            if (tab.textContent.includes('Mis Publicaciones')) {
                tab.textContent = 'Publicaciones Disponibles';
            }
            if (tab.textContent.includes('Otras Publicaciones')) {
                tab.style.display = 'none';
            }
        });
    }

    if (isEmployer) {
        const addJobBtn = document.querySelector('[onclick="showAddJob()"]');
        if (addJobBtn) addJobBtn.style.display = '';
        
        const tabs = document.querySelectorAll('.tab');
        tabs.forEach(tab => tab.style.display = '');
     }
}

// Función para actualizar la navegación activa
function updateActiveNav(section) {
    // Remover clase active de todos los nav-items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // Agregar clase active al nav-item correspondiente
    if (section === 'dashboard') {
        document.getElementById('navDashboard')?.classList.add('active');
    } else if (section === 'chats') {
        document.getElementById('navChats')?.classList.add('active');
    }
}

// Mostrar la interfaz para usuarios autenticados
async function showAuthenticatedUI() {
    document.getElementById('homeScreen').classList.add('hidden');
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('registerOptionsScreen').classList.add('hidden');
    document.getElementById('registerScreen').classList.add('hidden');
    
    document.getElementById('sidebar').classList.remove('hidden');
    document.getElementById('mobileMenuBtn').classList.remove('hidden');
    
    updateUserInfo();
    setupUserPermissions();
    
    // Actualizar navegación activa al inicio
    updateActiveNav('dashboard');
    
    // IMPORTANTE: Cargar contadores de mensajes no leídos al iniciar
    await loadUnreadCounts();
    
    // Configurar suscripciones en tiempo real
    setupRealtimeSubscriptions();
    
    // Mostrar dashboard con contenido
    showDashboard();
}

// Mostrar la interfaz para usuarios no autenticados
function showUnauthenticatedUI() {
    document.getElementById('sidebar').classList.add('hidden');
    document.getElementById('mobileMenuBtn').classList.add('hidden');
    document.getElementById('dashboardScreen').classList.add('hidden');
    document.getElementById('addJobScreen').classList.add('hidden');
    document.getElementById('chatScreen').classList.add('hidden');
    
    document.getElementById('homeScreen').classList.remove('hidden');
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('registerOptionsScreen').classList.add('hidden');
    document.getElementById('registerScreen').classList.add('hidden');
    
    document.getElementById('pageTitle').textContent = 'DevConnect';
}

// Actualizar la información del usuario en la interfaz
function updateUserInfo() {
    if (currentUser) {
        document.getElementById('userName').textContent = currentUser.nombres + ' ' + currentUser.apellidos;
        document.getElementById('userRole').textContent = currentUser.tipo_id === TIPO_EMPLEADOR ? 'Empleador' : 'Desarrollador';
        document.getElementById('userAvatar').textContent = currentUser.nombres.charAt(0).toUpperCase();
        
        document.getElementById('dashboardUserName').textContent = currentUser.nombres;
        document.getElementById('dashboardUserRole').textContent = currentUser.tipo_id === TIPO_EMPLEADOR ? 'Empleador' : 'Desarrollador';
    }
}

// Función para mostrar/ocultar loading
function setLoading(button, isLoading) {
    if (isLoading) {
        button.disabled = true;
        button.innerHTML = '<div class="loading"></div> Procesando...';
    } else {
        button.disabled = false;
        button.innerHTML = button.getAttribute('data-original-text') || button.textContent;
    }
}

// Función de utilidad para escape HTML
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Funciones de navegación para usuarios no autenticados
function showHome(){
    if (isAuthenticated) {
        showDashboard();
        return;
    }
    hideAllScreens();
    document.getElementById('homeScreen').classList.remove('hidden');
    updatePageTitle('DevConnect');
}

function showLogin(){
    if (isAuthenticated) {
        showDashboard();
        return;
    }
    hideAllScreens();
    document.getElementById('loginScreen').classList.remove('hidden');
    updatePageTitle('Iniciar Sesión');
}

function showRegisterOptions(){
    if (isAuthenticated) {
        showDashboard();
        return;
    }
    hideAllScreens();
    document.getElementById('registerOptionsScreen').classList.remove('hidden');
    updatePageTitle('Tipo de Registro');
}

function showRegister(type){
    if (isAuthenticated) {
        showDashboard();
        return;
    }
    document.getElementById('registerTitle').innerText = type==='empleador'?'Registro Empleador':'Registro Desarrollador';
    document.getElementById('employerFields').classList.toggle('hidden', type!=='empleador');
    document.getElementById('developerFields').classList.toggle('hidden', type!=='desarrollador');
    document.getElementById('registerForm').dataset.type = type;
    
    resetPasswordValidation();
    
    hideAllScreens();
    document.getElementById('registerScreen').classList.remove('hidden');
    updatePageTitle('Registro');
}

// Funciones de navegación para usuarios autenticados
function showDashboard(){
    if (!isAuthenticated) {
        showHome();
        return;
    }
    
    // Cancelar suscripción de mensajes del chat cuando sales
    if (messagesSubscription) {
        supabase.removeChannel(messagesSubscription);
        messagesSubscription = null;
        console.log('Suscripción de chat cancelada al salir');
    }
    
    hideAllScreens();
    document.getElementById('dashboardScreen').classList.remove('hidden');
    updatePageTitle('Dashboard');
    
    // Actualizar navegación activa
    updateActiveNav('dashboard');
    
    loadContent();
}

function showAddJob(){
    if (!isAuthenticated) {
        showHome();
        return;
    }
    
    if (!document.getElementById('addJobForm').dataset.isEdit) {
        document.getElementById('addJobForm').reset();
        document.querySelectorAll('.job-req').forEach(checkbox => {
            checkbox.checked = false;
        });
    }
    
    hideAllScreens();
    document.getElementById('addJobScreen').classList.remove('hidden');
    updatePageTitle('Agregar Oferta');
}

// ✅ FUNCIÓN CORREGIDA #5
function showChats(){
    if (!isAuthenticated) {
        showHome();
        return;
    }
    
    // Cancelar suscripción de mensajes del chat cuando sales
    if (messagesSubscription) {
        supabase.removeChannel(messagesSubscription);
        messagesSubscription = null;
        console.log('Suscripción de chat cancelada al salir');
    }
    
    hideAllScreens();
    document.getElementById('chatScreen').classList.remove('hidden');
    updatePageTitle('Mensajes');
    
    // Actualizar navegación activa
    updateActiveNav('chats');
    
    // Cargar la lista de chats
    loadChatList();
    
    // Solo marcar como leído si HAY un chat actualmente seleccionado
    if (currentChat) {
        setTimeout(() => {
            markMessagesAsRead(currentChat.id);
        }, 1000);
    }
}

function hideAllScreens() {
    const screens = [
        'homeScreen', 'loginScreen', 'registerOptionsScreen', 
        'registerScreen', 'dashboardScreen', 'addJobScreen', 'chatScreen'
    ];
    
    screens.forEach(screen => {
        document.getElementById(screen).classList.add('hidden');
    });
}

function updatePageTitle(title) {
    document.getElementById('pageTitle').textContent = title;
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('collapsed');
}

// Función de login
async function login(e){
    e.preventDefault();
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    const loginButton = document.getElementById('loginButton');
    
    loginButton.setAttribute('data-original-text', loginButton.textContent);
    setLoading(loginButton, true);
    
    try {
        const hashedPassword = await hashPassword(password);
        
        const { data: userData, error: userError } = await supabase
            .from('usuarios')
            .select('*')
            .eq('username', username)
            .eq('password_hash', hashedPassword)
            .eq('activo', 1)
            .single();
        
        if (userError || !userData) {
            throw new Error('Usuario o contraseña incorrectos');
        }
        
        currentUser = userData;
        isAuthenticated = true;
        
        localStorage.setItem('devconnect_user', JSON.stringify(currentUser));
        
        showAuthenticatedUI();
    } catch (error) {
        alert(error.message);
    } finally {
        setLoading(loginButton, false);
    }
}

// Función de registro
async function register(e){
    e.preventDefault();
    
    if (!isPasswordValid()) {
        alert('La contraseña no cumple con los requisitos mínimos de seguridad.');
        return;
    }
    
    if (!doPasswordsMatch()) {
        alert('Las contraseñas no coinciden.');
        return;
    }
    
    const type = e.target.dataset.type;
    const registerButton = document.getElementById('registerButton');
    registerButton.setAttribute('data-original-text', registerButton.textContent);
    setLoading(registerButton, true);
    
    const username = document.getElementById('regUsername').value;
    const password = document.getElementById('regPassword').value;
    const firstName = document.getElementById('regFirstName').value;
    const lastName = document.getElementById('regLastName').value;
    const birthDate = document.getElementById('regBirthDate').value;
    
    try {
        // Verificar si el username ya existe
        const { data: existingUser } = await supabase
            .from('usuarios')
            .select('username')
            .eq('username', username)
            .single();
        
        if (existingUser) {
            throw new Error('El nombre de usuario ya está en uso');
        }
        
        const hashedPassword = await hashPassword(password);
        
        const userData = {
            username: username,
            password_hash: hashedPassword,
            tipo_id: type === 'empleador' ? TIPO_EMPLEADOR : TIPO_DESARROLLADOR,
            nombres: firstName,
            apellidos: lastName,
            fecha_nacimiento: birthDate,
            fecha_registro: getCurrentTimestamp(),
            activo: 1
        };
        
        if (type === 'empleador') {
            userData.empresa = document.getElementById('regCompany').value;
        }
        
        // Insertar usuario
        const { data: newUser, error: insertError } = await supabase
            .from('usuarios')
            .insert([userData])
            .select()
            .single();
        
        if (insertError) throw insertError;
        
        // Si es desarrollador, insertar lenguajes y áreas
        if (type === 'desarrollador') {
            const selectedLangs = Array.from(document.querySelectorAll('.lang-checkbox:checked')).map(i => i.value);
            const selectedAreas = Array.from(document.querySelectorAll('.area-checkbox:checked')).map(i => i.value);
            
            // Insertar lenguajes
            for (const langName of selectedLangs) {
                // Obtener o crear lenguaje
                let { data: lang } = await supabase
                    .from('lenguajes')
                    .select('id')
                    .eq('nombre', langName)
                    .single();
                
                if (!lang) {
                    const { data: newLang } = await supabase
                        .from('lenguajes')
                        .insert([{ nombre: langName }])
                        .select()
                        .single();
                    lang = newLang;
                }
                
                // Relacionar con desarrollador
                await supabase
                    .from('desarrollador_lenguajes')
                    .insert([{
                        desarrollador_id: newUser.id,
                        lenguaje_id: lang.id
                    }]);
            }
            
            // Insertar áreas
            for (const areaName of selectedAreas) {
                let { data: area } = await supabase
                    .from('areas_especializacion')
                    .select('id')
                    .eq('nombre', areaName)
                    .single();
                
                if (!area) {
                    const { data: newArea } = await supabase
                        .from('areas_especializacion')
                        .insert([{ nombre: areaName }])
                        .select()
                        .single();
                    area = newArea;
                }
                
                await supabase
                    .from('desarrollador_areas')
                    .insert([{
                        desarrollador_id: newUser.id,
                        area_id: area.id
                    }]);
            }
        }
        
        currentUser = newUser;
        isAuthenticated = true;
        
        localStorage.setItem('devconnect_user', JSON.stringify(currentUser));
        
        alert('Registro exitoso');
        showAuthenticatedUI();
        
        document.getElementById('registerForm').reset();
        resetPasswordValidation();
    } catch (error) {
        alert(error.message);
    } finally {
        setLoading(registerButton, false);
    }
}

async function logout(){
    // Cancelar suscripciones antes de cerrar sesión
    if (messagesSubscription) {
        supabase.removeChannel(messagesSubscription);
        messagesSubscription = null;
    }
    if (conversationsSubscription) {
        supabase.removeChannel(conversationsSubscription);
        conversationsSubscription = null;
    }
    
    currentUser = null;
    isAuthenticated = false;
    localStorage.removeItem('devconnect_user');
    showUnauthenticatedUI();
}

// Función para editar trabajo
function editJob(jobId) {
    const job = jobs.find(j => j.id == jobId);
    if (!job) {
        alert('Oferta no encontrada');
        return;
    }
    
    document.getElementById('jobTitle').value = job.titulo;
    document.getElementById('jobCompany').value = job.empresa;
    document.getElementById('jobDescription').value = job.descripcion;
    
    document.querySelectorAll('.job-req').forEach(checkbox => {
        checkbox.checked = job.requisitos.some(r => r.nombre === checkbox.value);
    });
    
    document.getElementById('addJobForm').dataset.jobId = jobId;
    document.getElementById('addJobForm').dataset.isEdit = 'true';
    
    document.querySelector('#addJobScreen h2').textContent = 'Editar Oferta';
    document.getElementById('addJobButtonForm').innerHTML = '<span>Guardar Cambios</span>';
    
    showAddJob();
}

// Función para eliminar trabajo
async function deleteJob(jobId, jobTitle) {
    if (!confirm(`¿Está seguro de que desea eliminar la oferta "${jobTitle}"?`)) {
        return;
    }
    
    try {
        // Primero eliminar requisitos
        await supabase
            .from('oferta_requisitos')
            .delete()
            .eq('oferta_id', jobId);
        
        // Luego eliminar oferta
        const { error } = await supabase
            .from('ofertas_trabajo')
            .delete()
            .eq('id', jobId);
        
        if (error) throw error;
        
        alert('Oferta eliminada exitosamente');
        loadContent();
    } catch (error) {
        alert('Error al eliminar: ' + error.message);
    }
}

// Función para agregar/editar trabajo
async function addJob(e){
    e.preventDefault();
    const isEdit = document.getElementById('addJobForm').dataset.isEdit === 'true';
    const jobId = document.getElementById('addJobForm').dataset.jobId;
    const addJobButton = document.getElementById('addJobButtonForm');
    addJobButton.setAttribute('data-original-text', addJobButton.textContent);
    setLoading(addJobButton, true);
    
    const jobData = {
        titulo: document.getElementById('jobTitle').value,
        empresa: document.getElementById('jobCompany').value,
        descripcion: document.getElementById('jobDescription').value,
        empleador_id: currentUser.id,
        fecha_publicacion: getCurrentTimestamp(),
        activa: 1
    };
    
    try {
        let finalJobId;
        
        if (isEdit) {
            const { error } = await supabase
                .from('ofertas_trabajo')
                .update(jobData)
                .eq('id', jobId);
            
            if (error) throw error;
            
            // Eliminar requisitos antiguos
            await supabase
                .from('oferta_requisitos')
                .delete()
                .eq('oferta_id', jobId);
            
            finalJobId = jobId;
            alert('Oferta actualizada exitosamente');
        } else {
            const { data: newJob, error } = await supabase
                .from('ofertas_trabajo')
                .insert([jobData])
                .select()
                .single();
            
            if (error) throw error;
            
            finalJobId = newJob.id;
            alert('Oferta agregada exitosamente');
        }
        
        // Agregar requisitos
        const selectedReqs = Array.from(document.querySelectorAll('.job-req:checked')).map(i => i.value);
        
        for (const reqName of selectedReqs) {
            let { data: lang } = await supabase
                .from('lenguajes')
                .select('id')
                .eq('nombre', reqName)
                .single();
            
            if (!lang) {
                const { data: newLang } = await supabase
                    .from('lenguajes')
                    .insert([{ nombre: reqName }])
                    .select()
                    .single();
                lang = newLang;
            }
            
            await supabase
                .from('oferta_requisitos')
                .insert([{
                    oferta_id: finalJobId,
                    lenguaje_id: lang.id
                }]);
        }
        
        document.getElementById('addJobForm').reset();
        document.getElementById('addJobForm').removeAttribute('data-jobId');
        document.getElementById('addJobForm').removeAttribute('data-isEdit');
        document.querySelector('#addJobScreen h2').textContent = 'Agregar Oferta';
        document.getElementById('addJobButtonForm').textContent = 'Agregar';
        
        document.querySelectorAll('.job-req').forEach(checkbox => {
            checkbox.checked = false;
        });
        
        showDashboard();
    } catch (error) {
        alert(error.message);
    } finally {
        setLoading(addJobButton, false);
    }
}

function resetAndShowDashboard() {
    document.getElementById('addJobForm').reset();
    document.getElementById('addJobForm').removeAttribute('data-jobId');
    document.getElementById('addJobForm').removeAttribute('data-isEdit');
    document.querySelector('#addJobScreen h2').textContent = 'Agregar Oferta';
    document.getElementById('addJobButtonForm').textContent = 'Agregar';
    
    document.querySelectorAll('.job-req').forEach(checkbox => {
        checkbox.checked = false;
    });
    
    showDashboard();
}

function switchTab(tabName) {
    if (currentUser.tipo_id === TIPO_DESARROLLADOR && tabName === 'developers') {
        alert('No tienes permisos para ver esta sección.');
        return;
    }
    
    activeTab = tabName;
    
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.toggle('active', tab.textContent.includes(
            tabName === 'myJobs' ? 'Mis Publicaciones' : 
            tabName === 'otherJobs' ? 'Otras Publicaciones' : 'Desarrolladores'
        ) || (currentUser.tipo_id === TIPO_DESARROLLADOR && tab.textContent.includes('Publicaciones Disponibles') && tabName === 'myJobs'));
    });
    
    if (tabName === 'developers') {
        document.getElementById('developerFilters').classList.remove('hidden');
    } else {
        document.getElementById('developerFilters').classList.add('hidden');
    }
    
    document.getElementById('myJobsTabContent').classList.toggle('hidden', tabName !== 'myJobs');
    document.getElementById('otherJobsTabContent').classList.toggle('hidden', tabName !== 'otherJobs');
    document.getElementById('developersTabContent').classList.toggle('hidden', tabName !== 'developers');
    
    loadContent();
}

function loadContent(){
    console.log('loadContent llamado, activeTab:', activeTab);
    console.log('currentUser:', currentUser);
    
    if (activeTab === 'developers') {
        loadDevelopers();
    } else {
        loadJobsToDisplay();
    }
}

// Función para cargar trabajos
async function loadJobsToDisplay(){
    const myJobsList = document.getElementById('myJobsList');
    const otherJobsList = document.getElementById('otherJobsList');
    
    myJobsList.innerHTML = '<p>Cargando ofertas...</p>';
    otherJobsList.innerHTML = '<p>Cargando ofertas...</p>';
    
    try {
        // Cargar ofertas con sus requisitos
        const { data: ofertas, error } = await supabase
            .from('ofertas_trabajo')
            .select(`
                *,
                oferta_requisitos(
                    lenguajes(nombre)
                )
            `)
            .eq('activa', 1)
            .order('fecha_publicacion', { ascending: false });
        
        if (error) throw error;
        
        // Formatear datos
        jobs = ofertas.map(job => ({
            ...job,
            requisitos: job.oferta_requisitos.map(r => r.lenguajes)
        }));
        
        let jobsToShowMy = [];
        let jobsToShowOther = [];
        
        if (currentUser.tipo_id === TIPO_DESARROLLADOR) {
            jobsToShowMy = jobs;
        } else if (activeTab === 'myJobs' && currentUser.tipo_id === TIPO_EMPLEADOR) {
            jobsToShowMy = jobs.filter(job => job.empleador_id == currentUser.id);
        } else if (activeTab === 'otherJobs') {
            jobsToShowOther = jobs.filter(job => job.empleador_id != currentUser.id);
        }
        
        displayJobs(myJobsList, jobsToShowMy);
        displayJobs(otherJobsList, jobsToShowOther);
    } catch (error) {
        myJobsList.innerHTML = `<p>Error al cargar ofertas: ${error.message}</p>`;
        otherJobsList.innerHTML = `<p>Error al cargar ofertas: ${error.message}</p>`;
    }
}

// Función para mostrar trabajos en la lista
function displayJobs(list, jobsToShow) {
    list.innerHTML = '';
    
    if (jobsToShow.length === 0) {
        list.innerHTML = '<div class="card text-center" style="grid-column: 1 / -1; padding: 2rem;"><p>No se encontraron ofertas de trabajo.</p></div>';
        return;
    }
    
    jobsToShow.forEach(job => {
        const card = document.createElement('div');
        card.className = 'job-card card';
        
        const titleHtml = `<div class="job-title">${escapeHtml(job.titulo)}</div>`;
        const companyHtml = `<div class="job-company">${escapeHtml(job.empresa)}</div>`;
        const dateHtml = `<div class="job-date" style="font-size: 0.85rem; color: var(--gray-500); margin-bottom: 0.5rem;">${formatDate(job.fecha_publicacion)}</div>`;
        const descHtml = `<div class="job-description">${escapeHtml(job.descripcion)}</div>`;
        const reqHtml = `<div class="job-tags">${job.requisitos.map(r => `<span class="tag primary">${escapeHtml(r.nombre)}</span>`).join('')}</div>`;

        let actionBtnsHtml = '';
        
        if (currentUser.tipo_id === TIPO_EMPLEADOR && currentUser.id === job.empleador_id) {
            actionBtnsHtml = `
                <div class="job-actions">
                    <button class="btn btn-primary btn-sm" onclick="editJob(${job.id})">
                        <i class="fas fa-edit"></i>
                        <span>Editar</span>
                    </button>
                    <button class="btn btn-error btn-sm" onclick="deleteJob(${job.id}, '${escapeHtml(job.titulo)}')">
                        <i class="fas fa-trash"></i>
                        <span>Eliminar</span>
                    </button>
                </div>
            `;
        } else if (currentUser.tipo_id === TIPO_DESARROLLADOR) {
            actionBtnsHtml = `
                <div class="job-actions">
                    <button class="btn btn-secondary btn-sm" onclick="openChat(${job.id}, ${job.empleador_id}, '${escapeHtml(job.titulo)}')">
                        <i class="fas fa-comments"></i>
                        <span>Contactar</span>
                    </button>
                </div>
            `;
        }

        card.innerHTML = `
            <div class="job-header">
                <div>
                    ${titleHtml}
                    ${companyHtml}
                </div>
            </div>
            ${dateHtml}
            ${descHtml}
            ${reqHtml}
            ${actionBtnsHtml}
        `;
        list.appendChild(card);
    });
}

// Función para cargar desarrolladores
async function loadDevelopers() {
    const list = document.getElementById('developersList');
    list.innerHTML = '<p>Cargando desarrolladores...</p>';
    
    try {
        let query = supabase
            .from('usuarios')
            .select(`
                *,
                desarrollador_lenguajes(
                    lenguajes(nombre)
                ),
                desarrollador_areas(
                    areas_especializacion(nombre)
                )
            `)
            .eq('tipo_id', TIPO_DESARROLLADOR)
            .eq('activo', 1);
        
        const { data, error } = await query;
        
        if (error) throw error;
        
        developers = data.map(dev => ({
            ...dev,
            lenguajes: dev.desarrollador_lenguajes.map(dl => dl.lenguajes.nombre),
            areas: dev.desarrollador_areas.map(da => da.areas_especializacion.nombre)
        }));
        
        // Aplicar filtros
        let filtered = developers;
        
        if (selectedLanguages.length > 0) {
            filtered = filtered.filter(dev => 
                selectedLanguages.some(lang => dev.lenguajes.includes(lang))
            );
        }
        
        if (selectedAreas.length > 0) {
            filtered = filtered.filter(dev => 
                selectedAreas.some(area => dev.areas.includes(area))
            );
        }
        
        displayDevelopers(list, filtered);
    } catch (error) {
        list.innerHTML = `<p>Error al cargar desarrolladores: ${error.message}</p>`;
    }
}

// Función para mostrar desarrolladores en la lista
function displayDevelopers(list, developersToShow) {
    list.innerHTML = '';
    
    if (developersToShow.length === 0) {
        list.innerHTML = '<div class="card text-center" style="grid-column: 1 / -1; padding: 2rem;"><p>No se encontraron desarrolladores que coincidan con los filtros.</p></div>';
        return;
    }
    
    developersToShow.forEach(dev => {
        const card = document.createElement('div');
        card.className = 'developer-card card';
        
        const nameHtml = `<div class="developer-name">${escapeHtml(dev.nombres)} ${escapeHtml(dev.apellidos)}</div>`;
        const languagesHtml = `<div class="developer-skills">${(dev.lenguajes || []).map(lang => `<span class="tag primary">${escapeHtml(lang)}</span>`).join('')}</div>`;
        const areasHtml = `<div class="developer-skills">${(dev.areas || []).map(area => `<span class="tag">${escapeHtml(area)}</span>`).join('')}</div>`;
        
        const contactBtn = `<button class="btn btn-secondary btn-sm" onclick="contactDeveloper(${dev.id})">
            <i class="fas fa-comments"></i>
            <span>Contactar</span>
        </button>`;
        
        card.innerHTML = `
            <div class="developer-header">
                <div>
                    ${nameHtml}
                </div>
            </div>
            ${languagesHtml}
            ${areasHtml}
            <div class="developer-actions">
                ${contactBtn}
            </div>
        `;
        list.appendChild(card);
    });
}

function contactDeveloper(devId) {
    const chatJob = {
        id: 'contact_' + Date.now(),
        titulo: 'Contacto directo',
        empresa: currentUser.empresa || 'Sin empresa especificada',
        empleador_id: currentUser.id
    };
    
    openChat(chatJob.id, devId, 'Contacto directo');
}

// ✅ FUNCIÓN CORREGIDA #1 - setupRealtimeSubscriptions
function setupRealtimeSubscriptions() {
    // Cancelar suscripciones anteriores si existen
    if (conversationsSubscription) {
        supabase.removeChannel(conversationsSubscription);
    }
    
    console.log('Configurando suscripciones en tiempo real para usuario:', currentUser.id);
    
    // Suscribirse a TODOS los mensajes nuevos en tiempo real
    conversationsSubscription = supabase
        .channel('all_messages_global')
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'mensajes'
            },
            async (payload) => {
                console.log('📩 Nuevo mensaje detectado:', payload);
                
                // Verificar si este mensaje es para una conversación del usuario actual
                const { data: conv, error } = await supabase
                    .from('conversaciones')
                    .select('*')
                    .eq('id', payload.new.conversacion_id)
                    .or(`usuario1_id.eq.${currentUser.id},usuario2_id.eq.${currentUser.id}`)
                    .single();
                
                if (error || !conv) {
                    console.log('Mensaje no es para este usuario');
                    return;
                }
                
                // Si el mensaje NO es del usuario actual
                if (payload.new.remitente_id != currentUser.id) {
                    console.log('✅ Mensaje recibido de otro usuario');
                    
                    // Reproducir sonido
                    playNotificationSound();
                    
                    // Incrementar contador global
                    totalUnreadMessages++;
                    updateUnreadBadge();
                    
                    // Si estamos en la pantalla de chats, recargar la lista SIN MARCAR COMO LEÍDO
                    if (!document.getElementById('chatScreen').classList.contains('hidden')) {
                        loadChatListSilently();
                    }
                    
                    // Si el chat actual está abierto Y es este chat, agregar el mensaje
                    if (currentChat && currentChat.id === payload.new.conversacion_id) {
                        const chatScreen = document.getElementById('chatScreen');
                        if (chatScreen && !chatScreen.classList.contains('hidden')) {
                            setTimeout(() => {
                                markMessagesAsRead(currentChat.id);
                            }, 500);
                        }
                    }
                }
            }
        )
        .subscribe((status) => {
            console.log('Estado de suscripción global:', status);
            if (status === 'SUBSCRIBED') {
                console.log('✅ Suscrito a todos los mensajes en tiempo real');
            }
        });
    
    loadUnreadCounts();
}

// ✅ FUNCIÓN NUEVA #2 - loadChatListSilently
async function loadChatListSilently() {
    const chatList = document.getElementById('chatList');
    
    try {
        const { data: conversations, error } = await supabase
            .from('conversaciones')
            .select(`
                *,
                ofertas_trabajo(titulo),
                usuario1:usuarios!conversaciones_usuario1_id_fkey(nombres, apellidos),
                usuario2:usuarios!conversaciones_usuario2_id_fkey(nombres, apellidos)
            `)
            .or(`usuario1_id.eq.${currentUser.id},usuario2_id.eq.${currentUser.id}`)
            .order('ultimo_mensaje', { ascending: false, nullsFirst: false });
        
        if (error) {
            console.error('Error al cargar conversaciones:', error);
            throw error;
        }
        
        if (conversations && conversations.length > 0) {
            const formattedConvs = await Promise.all(conversations.map(async conv => {
                const otherUser = conv.usuario1_id === currentUser.id ? conv.usuario2 : conv.usuario1;
                
                const { count, error: countError } = await supabase
                    .from('mensajes')
                    .select('*', { count: 'exact', head: true })
                    .eq('conversacion_id', conv.id)
                    .eq('leido', 0)
                    .neq('remitente_id', currentUser.id);
                
                return {
                    id: conv.id,
                    jobTitle: conv.ofertas_trabajo?.titulo || 'Chat directo',
                    otherUserName: `${otherUser.nombres} ${otherUser.apellidos}`,
                    otherUserId: conv.usuario1_id === currentUser.id ? conv.usuario2_id : conv.usuario1_id,
                    lastMessage: '',
                    lastMessageDate: conv.ultimo_mensaje,
                    unreadCount: count || 0
                };
            }));
            
            // Ordenar por fecha descendente (más recientes primero)
            formattedConvs.sort((a, b) => {
                const dateA = a.lastMessageDate ? new Date(a.lastMessageDate) : new Date(0);
                const dateB = b.lastMessageDate ? new Date(b.lastMessageDate) : new Date(0);
                return dateB - dateA;
            });
            
            totalUnreadMessages = formattedConvs.reduce((sum, conv) => sum + conv.unreadCount, 0);
            updateUnreadBadge();
            
            const currentScrollPosition = chatList.scrollTop;
            displayChatList(chatList, formattedConvs);
            chatList.scrollTop = currentScrollPosition;
        } else {
            chatList.innerHTML = '<p>No tienes conversaciones activas.</p>';
            totalUnreadMessages = 0;
            updateUnreadBadge();
        }
    } catch (error) {
        console.error('Error completo:', error);
    }
}

// Cargar contadores de mensajes no leídos sin abrir la pantalla de chat
async function loadUnreadCounts() {
    try {
        const { data: conversations, error: convError } = await supabase
            .from('conversaciones')
            .select('id')
            .or(`usuario1_id.eq.${currentUser.id},usuario2_id.eq.${currentUser.id}`);
        
        if (convError) throw convError;
        
        if (conversations && conversations.length > 0) {
            const convIds = conversations.map(c => c.id);
            
            const { count, error: countError } = await supabase
                .from('mensajes')
                .select('*', { count: 'exact', head: true })
                .in('conversacion_id', convIds)
                .eq('leido', 0)
                .neq('remitente_id', currentUser.id);
            
            if (countError) throw countError;
            
            totalUnreadMessages = count || 0;
            updateUnreadBadge();
            
            console.log(`Total de mensajes no leídos: ${totalUnreadMessages}`);
        }
    } catch (error) {
        console.error('Error al cargar contadores:', error);
    }
}

// Suscribirse a mensajes de una conversación específica
function subscribeToMessages(conversationId) {
    if (messagesSubscription) {
        supabase.removeChannel(messagesSubscription);
        messagesSubscription = null;
    }
    
    console.log('Suscribiéndose a mensajes de conversación:', conversationId);
    
    const channelName = `mensajes_chat_${conversationId}_${Date.now()}`;
    
    messagesSubscription = supabase
        .channel(channelName)
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'mensajes',
                filter: `conversacion_id=eq.${conversationId}`
            },
            (payload) => {
                console.log('✅ Mensaje en chat actual:', payload);
                
                if (payload.new && payload.new.remitente_id != currentUser.id) {
                    addNewMessageToUI(payload.new);
                    
                    const chatScreen = document.getElementById('chatScreen');
                    if (chatScreen && !chatScreen.classList.contains('hidden')) {
                        setTimeout(() => {
                            markMessagesAsRead(conversationId);
                        }, 500);
                    }
                }
            }
        )
        .subscribe((status) => {
            console.log('Estado de suscripción del chat:', status);
            if (status === 'SUBSCRIBED') {
                console.log('✅ Suscrito a mensajes del chat actual');
            }
        });
}

// Agregar un nuevo mensaje a la interfaz sin recargar todo
function addNewMessageToUI(message) {
    const div = document.getElementById('chatMessages');
    
    const msgContainer = document.createElement('div');
    msgContainer.className = `message ${message.remitente_id == currentUser.id ? 'user' : 'other'} fade-in`;
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.textContent = message.mensaje;
    
    const timeDiv = document.createElement('div');
    timeDiv.className = 'message-time';
    timeDiv.textContent = formatMessageTime(message.fecha_envio);
    
    msgContainer.appendChild(contentDiv);
    msgContainer.appendChild(timeDiv);
    div.appendChild(msgContainer);
    
    div.scrollTop = div.scrollHeight;
}

// Función para reproducir sonido de notificación
function playNotificationSound() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.1);
    } catch (error) {
        console.log('No se pudo reproducir el sonido:', error);
    }
}

// Funciones para la verificación de contraseña
function togglePasswordVisibility(inputId) {
    const input = document.getElementById(inputId);
    const button = input.parentNode.querySelector('.toggle-password');
    
    if (input.type === 'password') {
        input.type = 'text';
        button.innerHTML = '<i class="fas fa-eye-slash"></i>';
    } else {
        input.type = 'password';
        button.innerHTML = '<i class="fas fa-eye"></i>';
    }
}

function checkPasswordStrength() {
    const password = document.getElementById('regPassword').value;
    const strengthBar = document.querySelector('.password-strength');
    const requirements = {
        length: password.length >= 8,
        uppercase: /[A-Z]/.test(password),
        lowercase: /[a-z]/.test(password),
        number: /\d/.test(password),
        symbol: /[!@#$%^&*]/.test(password)
    };
    
    for (const req in requirements) {
        const element = document.getElementById(`req-${req}`);
        if (requirements[req]) {
            element.classList.remove('invalid');
            element.classList.add('valid');
        } else {
            element.classList.remove('valid');
            element.classList.add('invalid');
        }
    }
    
    let strength = 0;
    for (const req in requirements) {
        if (requirements[req]) strength++;
    }
    
    strengthBar.classList.remove('weak', 'medium', 'strong');
    if (strength <= 2) {
        strengthBar.classList.add('weak');
    } else if (strength <= 4) {
        strengthBar.classList.add('medium');
    } else {
        strengthBar.classList.add('strong');
    }
    
    checkPasswordMatch();
}

function checkPasswordMatch() {
    const password = document.getElementById('regPassword').value;
    const confirmPassword = document.getElementById('regConfirmPassword').value;
    const matchElement = document.getElementById('password-match');
    
    if (confirmPassword.length === 0) {
        matchElement.textContent = 'Confirma tu contraseña';
        matchElement.classList.remove('valid', 'invalid');
        return false;
    }
    
    if (password === confirmPassword && password.length > 0) {
        matchElement.textContent = 'Las contraseñas coinciden';
        matchElement.classList.remove('invalid');
        matchElement.classList.add('valid');
        return true;
    } else {
        matchElement.textContent = 'Las contraseñas no coinciden';
        matchElement.classList.remove('valid');
        matchElement.classList.add('invalid');
        return false;
    }
}

function isPasswordValid() {
    const password = document.getElementById('regPassword').value;
    const requirements = {
        length: password.length >= 8,
        uppercase: /[A-Z]/.test(password),
        lowercase: /[a-z]/.test(password),
        number: /\d/.test(password),
        symbol: /[!@#$%^&*]/.test(password)
    };
    
    for (const req in requirements) {
        if (!requirements[req]) return false;
    }
    
    return true;
}

function doPasswordsMatch() {
    const password = document.getElementById('regPassword').value;
    const confirmPassword = document.getElementById('regConfirmPassword').value;
    
    return password === confirmPassword && password.length > 0;
}  

function resetPasswordValidation() {
    document.querySelectorAll('.requirement').forEach(el => {
        el.classList.remove('valid');
        el.classList.add('invalid');
    });
    
    document.querySelector('.password-strength').classList.remove('weak', 'medium', 'strong');
    document.getElementById('password-match').classList.remove('valid');
    document.getElementById('password-match').classList.add('invalid');
    document.getElementById('password-match').textContent = 'Las contraseñas deben coincidir';
}

// Funciones para filtros
function toggleFilter(filterType) {
    const filter = document.getElementById(filterType + 'Filter');
    const allFilters = document.querySelectorAll('.filter-options');
    
    allFilters.forEach(f => {
        if (f !== filter) f.classList.remove('show');
    });
    
    filter.classList.toggle('show');
}

function toggleLanguage(language) {
    const index = selectedLanguages.indexOf(language);
    if (index === -1) {
        selectedLanguages.push(language);
    } else {
        selectedLanguages.splice(index, 1);
    }
    
    updateFilterDisplay();
    loadDevelopers();
}

function toggleArea(area) {
    const index = selectedAreas.indexOf(area);
    if (index === -1) {
        selectedAreas.push(area);
    } else {
        selectedAreas.splice(index, 1);
    }
    
    updateFilterDisplay();
    loadDevelopers();
}

function updateFilterDisplay() {
    const languageOptions = document.querySelectorAll('#languagesFilter .filter-option');
    const areaOptions = document.querySelectorAll('#areasFilter .filter-option');
    
    languageOptions.forEach(option => {
        if (selectedLanguages.includes(option.textContent)) {
            option.classList.add('selected');
        } else {
            option.classList.remove('selected');
        }
    });
    
    areaOptions.forEach(option => {
        if (selectedAreas.includes(option.textContent)) {
            option.classList.add('selected');
        } else {
            option.classList.remove('selected');
        }
    });
}

function clearFilters() {
    selectedLanguages = [];
    selectedAreas = [];
    updateFilterDisplay();
    loadDevelopers();
}

// ✅ FUNCIÓN CORREGIDA #3 - loadChatList
async function loadChatList(){
    const chatList = document.getElementById('chatList');
    chatList.innerHTML = '<p>Cargando conversaciones...</p>';
    
    try {
        const { data: conversations, error } = await supabase
            .from('conversaciones')
            .select(`
                *,
                ofertas_trabajo(titulo),
                usuario1:usuarios!conversaciones_usuario1_id_fkey(nombres, apellidos),
                usuario2:usuarios!conversaciones_usuario2_id_fkey(nombres, apellidos)
            `)
            .or(`usuario1_id.eq.${currentUser.id},usuario2_id.eq.${currentUser.id}`)
            .order('ultimo_mensaje', { ascending: false, nullsFirst: false });
        
        if (error) {
            console.error('Error al cargar conversaciones:', error);
            throw error;
        }
        
        if (conversations && conversations.length > 0) {
            const formattedConvs = await Promise.all(conversations.map(async conv => {
                const otherUser = conv.usuario1_id === currentUser.id ? conv.usuario2 : conv.usuario1;
                
                const { count, error: countError } = await supabase
                    .from('mensajes')
                    .select('*', { count: 'exact', head: true })
                    .eq('conversacion_id', conv.id)
                    .eq('leido', 0)
                    .neq('remitente_id', currentUser.id);
                
                return {
                    id: conv.id,
                    jobTitle: conv.ofertas_trabajo?.titulo || 'Chat directo',
                    otherUserName: `${otherUser.nombres} ${otherUser.apellidos}`,
                    otherUserId: conv.usuario1_id === currentUser.id ? conv.usuario2_id : conv.usuario1_id,
                    lastMessage: '',
                    lastMessageDate: conv.ultimo_mensaje,
                    unreadCount: count || 0
                };
            }));
            
            // Ordenar por fecha descendente (más recientes primero)
            formattedConvs.sort((a, b) => {
                const dateA = a.lastMessageDate ? new Date(a.lastMessageDate) : new Date(0);
                const dateB = b.lastMessageDate ? new Date(b.lastMessageDate) : new Date(0);
                return dateB - dateA;
            });
            
            totalUnreadMessages = formattedConvs.reduce((sum, conv) => sum + conv.unreadCount, 0);
            updateUnreadBadge();
            
            displayChatList(chatList, formattedConvs);
        } else {
            chatList.innerHTML = '<p>No tienes conversaciones activas.</p>';
            totalUnreadMessages = 0;
            updateUnreadBadge();
        }
    } catch (error) {
        chatList.innerHTML = `<p>Error al cargar conversaciones: ${error.message}</p>`;
        console.error('Error completo:', error);
    }
}

// Actualizar el badge de mensajes no leídos
function updateUnreadBadge() {
    const badge = document.getElementById('unreadBadge');
    if (badge) {
        if (totalUnreadMessages > 0) {
            badge.textContent = totalUnreadMessages > 99 ? '99+' : totalUnreadMessages;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }
}

function displayChatList(chatList, conversations) {
    chatList.innerHTML = '';
    
    conversations.forEach(chat => {
        const chatItem = document.createElement('div');
        chatItem.className = 'chat-item';
        if (currentChat && currentChat.id === chat.id) {
            chatItem.classList.add('active');
        }
        
        const lastMsg = chat.lastMessage ? 
            (chat.lastMessage.length > 30 ? 
                chat.lastMessage.substring(0, 30) + '...' : 
                chat.lastMessage) : 
            'No hay mensajes aún';
        
        const time = chat.lastMessageDate ? formatTime(chat.lastMessageDate) : '';
        
        const badgeHtml = chat.unreadCount > 0 ? 
            `<span class="chat-badge">${chat.unreadCount > 99 ? '99+' : chat.unreadCount}</span>` : '';
        
        chatItem.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div style="flex: 1;">
                    <div class="chat-title">${escapeHtml(chat.jobTitle)} - ${escapeHtml(chat.otherUserName)}</div>
                    <div class="chat-preview">${escapeHtml(lastMsg)}</div>
                    <div class="chat-time">${time}</div>
                </div>
                ${badgeHtml}
            </div>
        `;
        
        chatItem.onclick = () => {
            currentChat = chat;
            loadChatMessages();
            
            setTimeout(() => {
                markMessagesAsRead(chat.id);
            }, 1000);
            
            document.getElementById('currentChatTitle').innerText = 
                `Chat: ${chat.jobTitle} - ${chat.otherUserName}`;
        };
        
        chatList.appendChild(chatItem);
    });
}

// ✅ FUNCIÓN CORREGIDA #4 - markMessagesAsRead
async function markMessagesAsRead(conversationId) {
    try {
        const { error } = await supabase
            .from('mensajes')
            .update({ leido: 1 })
            .eq('conversacion_id', conversationId)
            .eq('leido', 0)
            .neq('remitente_id', currentUser.id);
        
        if (error) {
            console.error('Error al marcar mensajes como leídos:', error);
        } else {
            console.log('✅ Mensajes marcados como leídos');
            loadUnreadCounts();
            
            if (!document.getElementById('chatScreen').classList.contains('hidden')) {
                setTimeout(() => loadChatListSilently(), 300);
            }
        }
    } catch (error) {
        console.error('Error al marcar como leído:', error);
    }
}

async function loadChatMessages(){
    const div = document.getElementById('chatMessages');
    div.innerHTML = '<p>Cargando mensajes...</p>';
    
    if (!currentChat) {
        div.innerHTML = '<p>Selecciona una conversación para ver los mensajes.</p>';
        return;
    }
    
    subscribeToMessages(currentChat.id);
    
    try {
        const { data: messages, error } = await supabase
            .from('mensajes')
            .select('*')
            .eq('conversacion_id', currentChat.id)
            .order('fecha_envio', { ascending: true });
        
        if (error) throw error;
        
        const groupedMessages = [];
        let lastDate = null;
        
        messages.forEach(msg => {
            const msgDate = new Date(msg.fecha_envio);
            const mexicoDate = new Date(msgDate.toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
            
            const localDateStr = mexicoDate.toLocaleDateString('es-MX', { 
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            });
            
            if (localDateStr !== lastDate) {
                groupedMessages.push({
                    type: 'date_separator',
                    dateFormatted: formatDate(msg.fecha_envio)
                });
                lastDate = localDateStr;
            }
            
            groupedMessages.push(msg);
        });
        
        displayMessages(div, groupedMessages);
    } catch (error) {
        div.innerHTML = `<p>Error al cargar mensajes: ${error.message}</p>`;
    }
}

function displayMessages(div, messages) {
    div.innerHTML = '';
    
    if (!messages || messages.length === 0) {
        div.innerHTML = '<p>No hay mensajes en esta conversación.</p>';
        return;
    }
    
    messages.forEach(msg => {
        if (msg.type === 'date_separator') {
            const dateSeparator = document.createElement('div');
            dateSeparator.className = 'message-date-separator';
            dateSeparator.innerHTML = `<span class="message-date-text">${msg.dateFormatted}</span>`;
            div.appendChild(dateSeparator);
            return;
        }
        
        const msgContainer = document.createElement('div');
        msgContainer.className = `message ${msg.remitente_id == currentUser.id ? 'user' : 'other'}`;
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.textContent = msg.mensaje;
        
        const timeDiv = document.createElement('div');
        timeDiv.className = 'message-time';
        timeDiv.textContent = formatMessageTime(msg.fecha_envio);
        
        msgContainer.appendChild(contentDiv);
        msgContainer.appendChild(timeDiv);
        div.appendChild(msgContainer);
    });
    
    div.scrollTop = div.scrollHeight;
}

function formatMessageTime(timestamp) {
    if (!timestamp) return '';
    
    const date = new Date(timestamp);
    
    return date.toLocaleTimeString('es-MX', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true,
        timeZone: 'America/Mexico_City'
    });
}

async function sendMessage(){
    if (!currentChat) {
        alert('Selecciona una conversación primero.');
        return;
    }
    
    const input = document.getElementById('chatInput');
    const messageText = input.value.trim();
    
    if(!messageText) return;
    
    input.value = '';
    
    const newMessage = {
        conversacion_id: currentChat.id,
        remitente_id: currentUser.id,
        mensaje: messageText,
        fecha_envio: new Date().toISOString(),
        leido: 0
    };
    
    addNewMessageToUI(newMessage);
    
    try {
        const { error: msgError } = await supabase
            .from('mensajes')
            .insert([newMessage]);
        
        if (msgError) {
            console.error('Error al insertar mensaje:', msgError);
            throw msgError;
        }
        
        console.log('✅ Mensaje enviado exitosamente');
        
        await supabase
            .from('conversaciones')
            .update({
                ultimo_mensaje: new Date().toISOString()
            })
            .eq('id', currentChat.id);
        
    } catch (error) {
        console.error('Error completo:', error);
        alert('Error al enviar mensaje: ' + error.message);
        loadChatMessages();
    }
}

async function openChat(jobId, otherUserId, jobTitle){
    try {
        const isDirectContact = typeof jobId === 'string' && jobId.startsWith('contact_');
        const actualJobId = isDirectContact ? null : jobId;
        
        let query = supabase
            .from('conversaciones')
            .select('*');
        
        if (actualJobId) {
            query = query
                .eq('oferta_id', actualJobId)
                .or(`and(usuario1_id.eq.${currentUser.id},usuario2_id.eq.${otherUserId}),and(usuario1_id.eq.${otherUserId},usuario2_id.eq.${currentUser.id})`);
        } else {
            query = query
                .is('oferta_id', null)
                .or(`and(usuario1_id.eq.${currentUser.id},usuario2_id.eq.${otherUserId}),and(usuario1_id.eq.${otherUserId},usuario2_id.eq.${currentUser.id})`);
        }
        
        const { data: existingConv, error: searchError } = await query.maybeSingle();
        
        let conversationId;
        
        if (existingConv) {
            conversationId = existingConv.id;
        } else {
            const { data: newConv, error: createError } = await supabase
                .from('conversaciones')
                .insert([{
                    oferta_id: actualJobId,
                    usuario1_id: currentUser.id,
                    usuario2_id: otherUserId,
                    fecha_creacion: getCurrentTimestamp()
                }])
                .select()
                .single();
            
            if (createError) throw createError;
            conversationId = newConv.id;
        }
        
        const { data: otherUser, error: userError } = await supabase
            .from('usuarios')
            .select('nombres, apellidos')
            .eq('id', otherUserId)
            .single();
        
        if (userError) throw userError;
        
        currentChat = {
            id: conversationId,
            jobTitle: jobTitle,
            otherUserId: otherUserId,
            otherUserName: `${otherUser.nombres} ${otherUser.apellidos}`
        };
        
        showChats();
        
        document.getElementById('currentChatTitle').innerText = `Chat: ${jobTitle} - ${currentChat.otherUserName}`;
        loadChatMessages();
    } catch (error) {
        console.error('Error completo al abrir chat:', error);
        alert('Error al abrir chat: ' + error.message);
    }
}

function formatTime(timestamp) {
    if (!timestamp) return '';
    
    const date = new Date(timestamp);
    
    return date.toLocaleTimeString('es-MX', { 
        hour: '2-digit', 
        minute: '2-digit',
        timeZone: 'America/Mexico_City'
    });
}

document.addEventListener('click', function(e) {
    if (!e.target.closest('.filter-group')) {
        document.querySelectorAll('.filter-options').forEach(filter => {
            filter.classList.remove('show');
        });
    }
});

// ============================================
// AGREGAR AL FINAL DE app.js
// ============================================

// ============================================
// SISTEMA DE LÍMITES Y ANTI FUERZA BRUTA
// AGREGAR AL FINAL DE app.js
// ============================================

// Límites de caracteres
const CHARACTER_LIMITS = {
    username: 15,
    password: 15,
    firstName: 35,
    lastName: 35,
    company: 50,
    jobTitle: 100,
    jobCompany: 50,
    jobDescription: 500
};

// Control de intentos de login fallidos
let loginAttempts = 0;
let loginBlockedUntil = null;

// Recuperar intentos guardados
(function initLoginAttempts() {
    const savedAttempts = localStorage.getItem('devconnect_login_attempts');
    const savedBlockedUntil = localStorage.getItem('devconnect_blocked_until');
    
    if (savedAttempts) {
        loginAttempts = parseInt(savedAttempts);
    }
    
    if (savedBlockedUntil) {
        const blockedTime = new Date(savedBlockedUntil);
        if (blockedTime > new Date()) {
            loginBlockedUntil = blockedTime;
        } else {
            localStorage.removeItem('devconnect_blocked_until');
            localStorage.removeItem('devconnect_login_attempts');
            loginAttempts = 0;
        }
    }
})();

// Función para validar longitud de campo
function validateFieldLength(input, maxLength, counterElement) {
    const currentLength = input.value.length;
    const remaining = maxLength - currentLength;
    
    if (counterElement) {
        counterElement.textContent = `${currentLength}/${maxLength}`;
        
        if (remaining < 0) {
            counterElement.classList.add('limit-exceeded');
            counterElement.classList.remove('limit-warning');
            input.classList.add('input-error');
        } else if (remaining <= 5) {
            counterElement.classList.add('limit-warning');
            counterElement.classList.remove('limit-exceeded');
            input.classList.remove('input-error');
        } else {
            counterElement.classList.remove('limit-warning', 'limit-exceeded');
            input.classList.remove('input-error');
        }
    }
    
    return currentLength <= maxLength;
}

// Inicializar validadores de campos
function initializeFieldValidators() {
    // Username
    const usernameInputs = ['loginUsername', 'regUsername'];
    usernameInputs.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.setAttribute('maxlength', CHARACTER_LIMITS.username);
            input.addEventListener('input', function() {
                const counter = this.parentElement.querySelector('.char-counter');
                if (counter) {
                    validateFieldLength(this, CHARACTER_LIMITS.username, counter);
                }
            });
        }
    });
    
    // Password - solo registro
    const regPassword = document.getElementById('regPassword');
    if (regPassword) {
        regPassword.setAttribute('maxlength', CHARACTER_LIMITS.password);
        const passwordGroup = regPassword.closest('.form-group');
        const counter = passwordGroup ? passwordGroup.querySelector('.password-char-counter') : null;
        if (counter) {
            regPassword.addEventListener('input', function() {
                validateFieldLength(this, CHARACTER_LIMITS.password, counter);
            });
        }
    }
    
    const regConfirmPassword = document.getElementById('regConfirmPassword');
    if (regConfirmPassword) {
        regConfirmPassword.setAttribute('maxlength', CHARACTER_LIMITS.password);
    }
    
    // Nombres
    const firstName = document.getElementById('regFirstName');
    if (firstName) {
        firstName.setAttribute('maxlength', CHARACTER_LIMITS.firstName);
        firstName.addEventListener('input', function() {
            const label = this.previousElementSibling;
            const counter = label ? label.querySelector('.char-counter') : null;
            if (counter) {
                validateFieldLength(this, CHARACTER_LIMITS.firstName, counter);
            }
        });
    }
    
    // Apellidos
    const lastName = document.getElementById('regLastName');
    if (lastName) {
        lastName.setAttribute('maxlength', CHARACTER_LIMITS.lastName);
        lastName.addEventListener('input', function() {
            const label = this.previousElementSibling;
            const counter = label ? label.querySelector('.char-counter') : null;
            if (counter) {
                validateFieldLength(this, CHARACTER_LIMITS.lastName, counter);
            }
        });
    }
    
    // Empresa
    const company = document.getElementById('regCompany');
    if (company) {
        company.setAttribute('maxlength', CHARACTER_LIMITS.company);
        company.addEventListener('input', function() {
            const label = this.previousElementSibling;
            const counter = label ? label.querySelector('.char-counter') : null;
            if (counter) {
                validateFieldLength(this, CHARACTER_LIMITS.company, counter);
            }
        });
    }
    
    // Título de trabajo
    const jobTitle = document.getElementById('jobTitle');
    if (jobTitle) {
        jobTitle.setAttribute('maxlength', CHARACTER_LIMITS.jobTitle);
        jobTitle.addEventListener('input', function() {
            const label = this.previousElementSibling;
            const counter = label ? label.querySelector('.char-counter') : null;
            if (counter) {
                validateFieldLength(this, CHARACTER_LIMITS.jobTitle, counter);
            }
        });
    }
    
    // Empresa de trabajo
    const jobCompany = document.getElementById('jobCompany');
    if (jobCompany) {
        jobCompany.setAttribute('maxlength', CHARACTER_LIMITS.jobCompany);
        jobCompany.addEventListener('input', function() {
            const label = this.previousElementSibling;
            const counter = label ? label.querySelector('.char-counter') : null;
            if (counter) {
                validateFieldLength(this, CHARACTER_LIMITS.jobCompany, counter);
            }
        });
    }
    
    // Descripción de trabajo
    const jobDesc = document.getElementById('jobDescription');
    if (jobDesc) {
        jobDesc.setAttribute('maxlength', CHARACTER_LIMITS.jobDescription);
        jobDesc.addEventListener('input', function() {
            const label = this.previousElementSibling;
            const counter = label ? label.querySelector('.char-counter') : null;
            if (counter) {
                validateFieldLength(this, CHARACTER_LIMITS.jobDescription, counter);
            }
        });
    }
}

// Validar formularios antes de enviar
function validateFormFields() {
    const errorInputs = document.querySelectorAll('input.input-error, textarea.input-error');
    if (errorInputs.length > 0) {
        alert('Por favor corrige los campos que exceden el límite de caracteres (marcados en rojo).');
        return false;
    }
    return true;
}

// Sistema anti fuerza bruta
function checkLoginBlocked() {
    if (loginBlockedUntil && new Date() < loginBlockedUntil) {
        const remainingSeconds = Math.ceil((loginBlockedUntil - new Date()) / 1000);
        const minutes = Math.floor(remainingSeconds / 60);
        const seconds = remainingSeconds % 60;
        return `Demasiados intentos fallidos. Intenta de nuevo en ${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
    
    if (loginBlockedUntil && new Date() >= loginBlockedUntil) {
        loginAttempts = 0;
        loginBlockedUntil = null;
        localStorage.removeItem('devconnect_blocked_until');
        localStorage.removeItem('devconnect_login_attempts');
    }
    
    return null;
}

function registerFailedLogin() {
    loginAttempts++;
    localStorage.setItem('devconnect_login_attempts', loginAttempts.toString());
    
    if (loginAttempts >= 5) {
        loginBlockedUntil = new Date(Date.now() + 2 * 60 * 1000);
        localStorage.setItem('devconnect_blocked_until', loginBlockedUntil.toISOString());
        return checkLoginBlocked();
    }
    
    const remaining = 5 - loginAttempts;
    return `Usuario o contraseña incorrectos. Te quedan ${remaining} ${remaining === 1 ? 'intento' : 'intentos'}.`;
}

function resetLoginAttempts() {
    loginAttempts = 0;
    loginBlockedUntil = null;
    localStorage.removeItem('devconnect_blocked_until');
    localStorage.removeItem('devconnect_login_attempts');
}

// Sobrescribir login original
const _originalLogin = login;
login = async function(e) {
    e.preventDefault();
    
    const blockedMessage = checkLoginBlocked();
    if (blockedMessage) {
        alert(blockedMessage);
        return;
    }
    
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    const loginButton = document.getElementById('loginButton');
    
    loginButton.setAttribute('data-original-text', loginButton.textContent);
    setLoading(loginButton, true);
    
    try {
        const hashedPassword = await hashPassword(password);
        
        const { data: userData, error: userError } = await supabase
            .from('usuarios')
            .select('*')
            .eq('username', username)
            .eq('password_hash', hashedPassword)
            .eq('activo', 1)
            .single();
        
        if (userError || !userData) {
            const errorMessage = registerFailedLogin();
            throw new Error(errorMessage);
        }
        
        resetLoginAttempts();
        
        currentUser = userData;
        isAuthenticated = true;
        
        localStorage.setItem('devconnect_user', JSON.stringify(currentUser));
        
        showAuthenticatedUI();
    } catch (error) {
        alert(error.message);
    } finally {
        setLoading(loginButton, false);
    }
};

// Sobrescribir register original
const _originalRegister = register;
register = async function(e) {
    e.preventDefault();
    
    if (!validateFormFields()) {
        return;
    }
    
    return _originalRegister.call(this, e);
};

// Sobrescribir addJob original
const _originalAddJob = addJob;
addJob = async function(e) {
    e.preventDefault();
    
    if (!validateFormFields()) {
        return;
    }
    
    return _originalAddJob.call(this, e);
};

// Sobrescribir showRegister
const _originalShowRegister = showRegister;
showRegister = function(type) {
    _originalShowRegister.call(this, type);
    setTimeout(() => initializeFieldValidators(), 100);
};

// Sobrescribir showAddJob
const _originalShowAddJob = showAddJob;
showAddJob = function() {
    _originalShowAddJob.call(this);
    setTimeout(() => initializeFieldValidators(), 100);
};

// Inicializar al cargar
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(() => initializeFieldValidators(), 500);
});