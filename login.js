// ============================================================
// MIND RECALL — login.js
// Script dedicado à autenticação e roteamento por role (RBAC).
// Redireciona para o painel correto conforme o perfil do usuário.
// ============================================================

const SUPABASE_URL = 'https://gijgocyrumhalzqhkggj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_SBbgOvJCx21UjRJucquDTQ_kWhEL8Nx';

const db = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// ==================== INICIALIZAÇÃO ====================
document.addEventListener('DOMContentLoaded', async function () {
    // Configura eventos do formulário de login
    const btnLogin = document.getElementById('btn-login');
    if (btnLogin) btnLogin.addEventListener('click', verificarLogin);

    const inputSenha = document.getElementById('password');
    if (inputSenha) {
        inputSenha.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') verificarLogin();
        });
    }

    // Verifica sessão existente — auto-redirect se já logado
    const { data: { session } } = await db.auth.getSession();

    if (session) {
        await redirecionarPorRole(session.user);
    }

    // Ouve mudanças de sessão
    db.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session) {
            await redirecionarPorRole(session.user);
        }
    });
});

// ==================== AUTENTICAÇÃO ====================
async function verificarLogin() {
    const email = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();

    if (!email || !password) {
        mostrarAlertaLogin('Preencha o e-mail e a senha!');
        return;
    }

    // Estado de loading
    const btn = document.getElementById('btn-login');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Autenticando...';

    const { data, error } = await db.auth.signInWithPassword({ email, password });

    btn.disabled = false;
    btn.textContent = originalText;

    if (error) {
        mostrarAlertaLogin('Credenciais inválidas! Verifique seu e-mail e senha.');
        return;
    }

    // O onAuthStateChange cuida do redirecionamento
}

// ==================== ROTEAMENTO POR ROLE ====================
async function redirecionarPorRole(user) {
    // Busca o perfil do usuário para determinar o tipo
    const { data: perfil, error } = await db
        .from('perfis')
        .select('nome, tipo')
        .eq('id', user.id)
        .single();

    if (error || !perfil) {
        // Perfil pode não ter sido criado ainda pelo trigger — tenta de novo após 500ms
        await new Promise(r => setTimeout(r, 500));
        const { data: perfil2, error: err2 } = await db
            .from('perfis')
            .select('nome, tipo')
            .eq('id', user.id)
            .single();

        if (err2 || !perfil2) {
            mostrarAlertaLogin('Perfil não encontrado. Contate o administrador.');
            await db.auth.signOut();
            return;
        }

        realizarRedirecionamento(perfil2.tipo);
        return;
    }

    realizarRedirecionamento(perfil.tipo);
}

function realizarRedirecionamento(tipo) {
    if (tipo === 'secretaria') {
        window.location.href = 'painel-secretaria.html';
    } else if (tipo === 'professor') {
        window.location.href = 'painel-professor.html';
    } else {
        mostrarAlertaLogin('Tipo de perfil desconhecido. Contate o administrador.');
    }
}

// ==================== MODAL DE ALERTA ====================
function mostrarAlertaLogin(mensagem, titulo = 'Atenção') {
    document.getElementById('alerta-titulo').textContent = titulo;
    document.getElementById('alerta-mensagem').textContent = mensagem;
    document.getElementById('modal-alerta').classList.add('active');
}

function fecharModalAlerta() {
    document.getElementById('modal-alerta').classList.remove('active');
}
