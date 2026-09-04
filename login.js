// ============================================================
// MIND RECALL — login.js
// Autenticação com RBAC: consulta a tabela `perfis` após login
// e redireciona para o painel correto conforme o cargo.
// ============================================================

const SUPABASE_URL = 'https://gijgocyrumhalzqhkggj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_SBbgOvJCx21UjRJucquDTQ_kWhEL8Nx';

// persistSession: true garante que o token JWT é salvo no localStorage
// mesmo em ambientes de hospedagem estática como a Hostinger
const db = window.supabase
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
          auth: { persistSession: true }
      })
    : null;

// ==================== INICIALIZAÇÃO ====================
document.addEventListener('DOMContentLoaded', async function () {
    // ── Toast de sessão expirada ──
    if (sessionStorage.getItem('sessao_expirada') === '1') {
        sessionStorage.removeItem('sessao_expirada');
        _mostrarToastSessaoExpirada();
    }

    // Configura eventos do formulário
    const btnLogin = document.getElementById('btn-login');
    if (btnLogin) btnLogin.addEventListener('click', verificarLogin);

    const inputSenha = document.getElementById('password');
    if (inputSenha) {
        inputSenha.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') verificarLogin();
        });
    }

    // Se já houver sessão ativa, valida o cargo e redireciona
    // Usa maybeSingle() para não lançar erro caso o perfil não exista ainda
    if (db) {
        const { data: { session } } = await db.auth.getSession();
        if (session) {
            const { data: perfil } = await db
                .from('perfis')
                .select('tipo')
                .eq('id', session.user.id)
                .maybeSingle();

            if (perfil?.tipo === 'secretaria') {
                window.location.replace('painel-secretaria.html');
                return;
            } else if (perfil?.tipo === 'professor') {
                window.location.replace('painel-professor.html');
                return;
            }
            // Se não há perfil mapeado, mantém na tela de login (sem loop)
        }
    }
});


// ==================== AUTENTICAÇÃO ====================
async function verificarLogin() {
    const email = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();

    if (!email || !password) {
        mostrarAlertaLogin('Preencha o e-mail e a senha!');
        return;
    }

    const btn = document.getElementById('btn-login');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Autenticando...';

    const { data, error } = await db.auth.signInWithPassword({ email, password });

    if (error) {
        btn.disabled = false;
        btn.textContent = originalText;
        mostrarAlertaLogin('Credenciais inválidas! Verifique seu e-mail e senha.');
        return;
    }

    // Login OK — consulta o cargo antes de redirecionar
    btn.textContent = 'Verificando perfil...';
    await redirecionarPorCargo(data.session.user.id);

    // Se chegou aqui, algo deu errado na consulta do cargo
    btn.disabled = false;
    btn.textContent = originalText;
}

// ==================== RBAC: CONSULTA CARGO E REDIRECIONA ====================
async function redirecionarPorCargo(userId) {
    const { data: perfil, error } = await db
        .from('perfis')
        .select('tipo')
        .eq('id', userId)
        .maybeSingle();

    if (error) {
        mostrarAlertaLogin('Erro ao verificar perfil. Tente novamente.');
        return;
    }

    if (!perfil) {
        mostrarAlertaLogin('Perfil não configurado. Contate o administrador.');
        await db.auth.signOut();
        return;
    }

    if (perfil.tipo === 'secretaria') {
        window.location.replace('painel-secretaria.html');
    } else if (perfil.tipo === 'professor') {
        window.location.replace('painel-professor.html');
    } else {
        mostrarAlertaLogin('Tipo de acesso desconhecido ("' + perfil.tipo + '"). Contate o administrador.');
        await db.auth.signOut();
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
function _mostrarToastSessaoExpirada() {
    if (document.getElementById('toast-sessao-expirada')) return;

    const toast = document.createElement('div');
    toast.id = 'toast-sessao-expirada';
    toast.style.cssText = `
        position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
        z-index: 9999; display: flex; align-items: center; gap: 12px;
        padding: 14px 20px; max-width: 460px; width: calc(100% - 40px);
        background: linear-gradient(135deg, rgba(30,41,59,0.97) 0%, rgba(15,23,42,0.97) 100%);
        border: 1px solid rgba(245,158,11,0.45); border-left: 4px solid #f59e0b;
        border-radius: 10px; box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        backdrop-filter: blur(12px); font-family: 'Inter', sans-serif;
        animation: _toastSlideIn 0.35s cubic-bezier(0.34,1.56,0.64,1) both;
    `;
    toast.innerHTML = `
        <span style="font-size:1.3rem;flex-shrink:0;">&#x23F1;&#xFE0F;</span>
        <div style="flex:1;min-width:0;">
            <p style="margin:0 0 2px;font-weight:700;font-size:.88rem;color:#f59e0b;letter-spacing:.02em;">
                Sessão encerrada por inatividade</p>
            <p style="margin:0;font-size:.82rem;color:#94a3b8;line-height:1.4;">
                Sua sessão expirou. Por favor, faça login novamente.</p>
        </div>
        <button onclick="this.parentElement.remove()" style="
            background:none;border:none;cursor:pointer;color:#64748b;font-size:1.1rem;
            flex-shrink:0;padding:2px 4px;line-height:1;border-radius:4px;transition:color .2s;
        " onmouseover="this.style.color='#94a3b8'" onmouseout="this.style.color='#64748b'">&times;</button>
    `;

    if (!document.getElementById('_toast-kf')) {
        const s = document.createElement('style');
        s.id = '_toast-kf';
        s.textContent = `
            @keyframes _toastSlideIn {
                from { opacity:0; transform:translateX(-50%) translateY(-16px); }
                to   { opacity:1; transform:translateX(-50%) translateY(0); }
            }
            @keyframes _toastFadeOut {
                from { opacity:1; transform:translateX(-50%) translateY(0); }
                to   { opacity:0; transform:translateX(-50%) translateY(-12px); }
            }`;
        document.head.appendChild(s);
    }

    document.body.appendChild(toast);
    setTimeout(() => {
        if (toast.isConnected) {
            toast.style.animation = '_toastFadeOut 0.3s ease forwards';
            setTimeout(() => toast.remove(), 320);
        }
    }, 6000);
}

