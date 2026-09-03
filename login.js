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
    // ── Toast de sessão expirada (disparado ao ser redirecionado por JWT expired) ──
    if (sessionStorage.getItem('sessao_expirada') === '1') {
        sessionStorage.removeItem('sessao_expirada');
        _mostrarToastSessaoExpirada();
    }

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

        await realizarRedirecionamento(perfil2.tipo, user);
        return;
    }

    await realizarRedirecionamento(perfil.tipo, user);
}

async function realizarRedirecionamento(tipo, user) {
    if (tipo === 'secretaria') {
        window.location.href = 'painel-secretaria.html';
    } else if (tipo === 'professor') {
        window.location.href = 'painel-professor.html';
    } else if (tipo === 'aluno') {
        // ── GUARDA DE SEGURANÇA: Alunos legados NÃO podem ativar conta ──────
        // Busca o registro na tabela alunos pelo e-mail sintético vinculado ao
        // auth.user atual e verifica se is_legado = true.
        // Alunos legados são registros históricos sem direito ao portal.
        const emailDoUsuario = user?.email || '';
        const { data: alunoRecord } = await db
            .from('alunos')
            .select('id, is_legado')
            .eq('email_sintetico', emailDoUsuario)
            .maybeSingle();

        if (alunoRecord && alunoRecord.is_legado === true) {
            // Bloqueia acesso e desfaz a sessão
            await db.auth.signOut();
            mostrarAlertaLogin(
                'Este registro é um histórico de ex-aluno e não possui acesso ao portal. ' +
                'Para mais informações, entre em contato com a Secretaria.',
                '⛔ Acesso Não Permitido'
            );
            return;
        }
        // ─────────────────────────────────────────────────────────────────────

        // Alunos acessam pelo Portal do Aluno — redireciona
        window.location.href = 'painel-aluno.html';
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

// ==================== TOAST DE SESSÃO EXPIRADA ====================
/**
 * Exibe um toast discreto no topo da tela de login informando que
 * a sessão expirou por inatividade. Auto-remove após 6 segundos.
 */
function _mostrarToastSessaoExpirada() {
    // Evita duplicatas
    if (document.getElementById('toast-sessao-expirada')) return;

    const toast = document.createElement('div');
    toast.id = 'toast-sessao-expirada';
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 9999;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 14px 20px;
        max-width: 460px;
        width: calc(100% - 40px);
        background: linear-gradient(135deg, rgba(30,41,59,0.97) 0%, rgba(15,23,42,0.97) 100%);
        border: 1px solid rgba(245,158,11,0.45);
        border-left: 4px solid #f59e0b;
        border-radius: 10px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        backdrop-filter: blur(12px);
        font-family: 'Inter', sans-serif;
        animation: _toastSlideIn 0.35s cubic-bezier(0.34,1.56,0.64,1) both;
    `;
    toast.innerHTML = `
        <span style="font-size: 1.3rem; flex-shrink: 0;">&#x23F1;&#xFE0F;</span>
        <div style="flex: 1; min-width: 0;">
            <p style="margin: 0 0 2px 0; font-weight: 700; font-size: 0.88rem;
                       color: #f59e0b; letter-spacing: 0.02em;">Sessão encerrada por inatividade</p>
            <p style="margin: 0; font-size: 0.82rem; color: #94a3b8; line-height: 1.4;">
                Sua sessão expirou. Por favor, faça login novamente para continuar.
            </p>
        </div>
        <button onclick="this.parentElement.remove()" style="
            background: none; border: none; cursor: pointer;
            color: #64748b; font-size: 1.1rem; flex-shrink: 0;
            padding: 2px 4px; line-height: 1; border-radius: 4px;
            transition: color 0.2s;
        " onmouseover="this.style.color='#94a3b8'" onmouseout="this.style.color='#64748b'">&times;</button>
    `;

    // Injeta keyframe se ainda não existir
    if (!document.getElementById('_toast-kf')) {
        const style = document.createElement('style');
        style.id = '_toast-kf';
        style.textContent = `
            @keyframes _toastSlideIn {
                from { opacity: 0; transform: translateX(-50%) translateY(-16px); }
                to   { opacity: 1; transform: translateX(-50%) translateY(0); }
            }
            @keyframes _toastFadeOut {
                from { opacity: 1; transform: translateX(-50%) translateY(0); }
                to   { opacity: 0; transform: translateX(-50%) translateY(-12px); }
            }
        `;
        document.head.appendChild(style);
    }

    document.body.appendChild(toast);

    // Auto-remove após 6 segundos com animação de saída
    setTimeout(() => {
        if (toast.isConnected) {
            toast.style.animation = '_toastFadeOut 0.3s ease forwards';
            setTimeout(() => toast.remove(), 320);
        }
    }, 6000);
}
