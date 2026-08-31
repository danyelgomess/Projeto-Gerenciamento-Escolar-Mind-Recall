// ============================================================
// MIND RECALL — script.js migrado para Supabase
// ============================================================
// INSTRUÇÕES:
// 1. Preencha SUPABASE_URL e SUPABASE_KEY abaixo com seus dados.
//    Você encontra esses valores em:
//    Supabase Dashboard → seu projeto → Settings → API
// 2. SUPABASE_URL  → campo "Project URL"
// 3. SUPABASE_KEY  → campo "anon public" (não use a service_role key aqui!)
// ============================================================

const SUPABASE_URL = 'https://gijgocyrumhalzqhkggj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_SBbgOvJCx21UjRJucquDTQ_kWhEL8Nx';

// Inicializa o cliente Supabase (usando o CDN do index.html)
const db = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// ==================== VARIÁVEIS GLOBAIS ====================
let usuarioLogado = null;  // { id, email, tipo, nome }
let alunoEditando = null;  // objeto aluno atual no modal
let cursoEditandoId = null; // UUID do curso no modal de edição
let alunoNotasId = null;  // UUID do aluno no modal de notas
let confirmCallback = null;
let pagamentosCache = [];   // cache local para filtros do módulo financeiro
let alunoEncontradoPorCpf = null; // objeto do aluno encontrado via busca por CPF (preenchimento automático)

// ==================== MÁSCARA DE MOEDA ====================
/**
 * Aplica máscara de moeda brasileira (R$ 0,00) em tempo real num campo.
 * @param {HTMLInputElement} input - O campo de texto a ser mascarado.
 */
function aplicarMascaraMoeda(input) {
    // Remove tudo que não for dígito
    let raw = input.value.replace(/\D/g, '');

    // Garante pelo menos 3 dígitos para montar R$ 0,00
    if (raw.length === 0) { input.value = ''; return; }
    raw = raw.padStart(3, '0');

    // Separa centavos (2 últimos dígitos) do restante
    const centavos = raw.slice(-2);
    let reais = raw.slice(0, -2).replace(/^0+/, '') || '0';

    // Formata milhar
    reais = reais.replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1.');

    input.value = `R$ ${reais},${centavos}`;
}

/**
 * Converte o valor mascarado (ex: "R$ 1.250,90") para float.
 * @param {string} valorMascarado
 * @returns {number}
 */
function parseMoeda(valorMascarado) {
    // Remove 'R$', pontos de milhar e substitui vírgula decimal por ponto
    const limpo = (valorMascarado || '')
        .replace('R$', '')
        .replace(/\./g, '')
        .replace(',', '.')
        .trim();
    return parseFloat(limpo) || 0;
}

// ==================== INICIALIZAÇÃO ====================
document.addEventListener('DOMContentLoaded', async function () {
    configurarEventos();

    // Verifica sessão existente no Supabase
    const { data: { session } } = await db.auth.getSession();

    if (session) {
        await carregarPerfilUsuario(session.user);
        iniciarAplicacao();
    } else {
        mostrarLogin();
    }

    // Ouve mudanças de sessão.
    // IMPORTANTE: evitamos reinicializar o app em eventos como TOKEN_REFRESHED
    // (que dispara ao voltar para a aba), pois isso causaria reload indesejado.
    // Só agimos em SIGNED_IN quando ainda não há usuário logado (primeiro login)
    // e em SIGNED_OUT (logout explícito).
    db.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session && !usuarioLogado) {
            await carregarPerfilUsuario(session.user);
            iniciarAplicacao();
        } else if (event === 'SIGNED_OUT') {
            usuarioLogado = null;
            mostrarLogin();
        }
        // TOKEN_REFRESHED, USER_UPDATED e outros eventos são ignorados
        // para não interromper a navegação do usuário.
    });
});

// ==================== AUTENTICAÇÃO ====================
function mostrarLogin() {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
}

async function carregarPerfilUsuario(user) {
    const { data: perfil, error } = await db
        .from('perfis')
        .select('nome, tipo')
        .eq('id', user.id)
        .single();

    if (error || !perfil) {
        // Perfil pode não ter sido criado ainda pelo trigger — tenta de novo após 500ms
        await new Promise(r => setTimeout(r, 500));
        const { data: perfil2 } = await db
            .from('perfis')
            .select('nome, tipo')
            .eq('id', user.id)
            .single();
        usuarioLogado = { id: user.id, email: user.email, ...perfil2 };
    } else {
        usuarioLogado = { id: user.id, email: user.email, ...perfil };
    }
}

async function verificarLogin() {
    const email = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();

    if (!email || !password) {
        mostrarAlerta('Preencha o e-mail e a senha!');
        return;
    }

    const { error } = await db.auth.signInWithPassword({ email, password });

    if (error) {
        mostrarAlerta('Credenciais inválidas! Verifique seu e-mail e senha.');
    }
    // O onAuthStateChange cuida do resto
}

async function sairSistema() {
    try {
        if (db && db.auth) {
            await db.auth.signOut();
        }
    } catch (e) {
        console.error("Erro ao sair:", e);
    }
    // painel-secretaria.html é uma página separada (não SPA com index.html).
    // O correto é redirecionar para o login após o signOut.
    window.location.href = 'index.html';
}

function iniciarAplicacao() {
    const loginScreen = document.getElementById('login-screen');
    if (loginScreen) loginScreen.style.display = 'none';

    const appEl = document.getElementById('app');
    if (appEl) appEl.style.display = 'block';

    aplicarPermissoes();

    const primeiroLink = document.querySelector('.tablinks');
    if (primeiroLink) {
        openTab({ currentTarget: primeiroLink }, 'sobre');
    } else {
        const sobreEl = document.getElementById('sobre');
        if (sobreEl) sobreEl.style.display = 'block';
    }

    if (typeof atualizarDashboard === 'function') atualizarDashboard();
    if (typeof carregarCursos === 'function') carregarCursos();
    if (typeof carregarTurmas === 'function') carregarTurmas();
    if (typeof carregarAlunos === 'function') carregarAlunos();
    if (typeof carregarOpcoesVinculo === 'function') carregarOpcoesVinculo();
    if (typeof carregarVinculos === 'function') carregarVinculos();
    if (typeof carregarTurmasDisponiveis === 'function') carregarTurmasDisponiveis();
}

function aplicarPermissoes() {
    const isSecretaria = usuarioLogado && usuarioLogado.tipo === 'secretaria';

    document.querySelectorAll('.admin-only').forEach(el => {
        el.style.display = isSecretaria ? 'block' : 'none';
    });

    const formCursoContainer = document.getElementById('form-cadastro-curso-container');
    if (formCursoContainer) formCursoContainer.style.display = 'block';
}

// ==================== MODAIS CUSTOMIZADOS ====================
function mostrarAlerta(mensagem, titulo = 'Atenção') {
    document.getElementById('alerta-titulo').textContent = titulo;
    document.getElementById('alerta-mensagem').textContent = mensagem;
    document.getElementById('modal-alerta').classList.add('active');
}

function fecharModalAlerta() {
    document.getElementById('modal-alerta').classList.remove('active');
}

function mostrarConfirmacao(mensagem, callback, titulo = 'Confirmar Ação', textoBotao = 'Sim, Excluir') {
    document.getElementById('confirmacao-titulo').textContent = titulo;
    document.getElementById('confirmacao-mensagem').textContent = mensagem;
    // Atualiza o label do botão de confirmação conforme o contexto
    const btnConfirmar = document.getElementById('btn-confirmar-action');
    if (btnConfirmar) btnConfirmar.textContent = textoBotao;
    confirmCallback = callback;
    document.getElementById('modal-confirmacao').classList.add('active');
}

function fecharModalConfirmacao() {
    document.getElementById('modal-confirmacao').classList.remove('active');
    confirmCallback = null;
}

function confirmarAcao() {
    if (confirmCallback) confirmCallback();
    fecharModalConfirmacao();
}

// ==================== NAVEGAÇÃO ====================
function openTab(evt, tabName) {
    document.querySelectorAll('.tabcontent').forEach(el => {
        el.style.display = 'none';
        el.classList.remove('active');
    });

    document.querySelectorAll('.tablinks').forEach(el => {
        el.classList.remove('active');
    });

    const tabToShow = document.getElementById(tabName);
    if (tabToShow) {
        tabToShow.style.display = 'block';
        tabToShow.classList.add('active');
    }

    if (evt && evt.currentTarget) evt.currentTarget.classList.add('active');

    if (tabName === 'dashboard') atualizarDashboard();
    else if (tabName === 'crm' || tabName === 'secretaria') carregarAlunos();
    else if (tabName === 'cursos') carregarCursos();
    else if (tabName === 'diario') carregarAlunosDiario();
    else if (tabName === 'financeiro') carregarFinanceiro();
    else if (tabName === 'contratos') carregarContratos();
    else if (tabName === 'certificados') carregarCertificados();
    else if (tabName === 'professores') carregarTurmas();
}

// ==================== TURMAS ====================

/** Cache global de turmas — evita refetch desnecessário */
let turmasCache = [];

/**
 * Carrega todas as turmas do banco e popula:
 *  1. A tabela #lista-turmas (aba Professores)
 *  2. O select #visao-turma-select (visão geral)
 *  3. Todos os .turma-select no formulário de matrícula (via refreshTurmaSelects)
 */
async function carregarTurmas() {
    try {
        const { data, error } = await db
            .from('turmas')
            .select('*, cursos(nome, codigo_curso)')
            .order('criado_em', { ascending: false });

        if (error) throw error;

        turmasCache = data || [];

        // 1. Renderiza tabela de turmas
        const tbody = document.getElementById('lista-turmas');
        if (tbody) {
            tbody.innerHTML = '';
            for (const t of turmasCache) {
                // Conta quantos alunos estão matriculados nesta turma
                const { count } = await db
                    .from('matriculas')
                    .select('id', { count: 'exact', head: true })
                    .eq('turma_id', t.id);

                const codigoCursoExibido = t.codigo_curso
                    ? `<span style="font-family:monospace;font-size:0.85em;background:var(--panel-off);padding:2px 6px;border-radius:4px;">CCC: ${t.codigo_curso}</span>`
                    : `<em style="color:var(--txt-light);font-size:0.85em;">N/A</em>`;

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${t.nome}</td>
                    <td>${t.cursos ? t.cursos.nome : '—'}</td>
                    <td style="font-family:monospace;font-weight:700;letter-spacing:0.1em;">${t.codigo_turma}</td>
                    <td>${codigoCursoExibido}</td>
                    <td>${count ?? 0}</td>
                    <td>
                        <button type="button" class="btn-excluir" onclick="excluirTurma('${t.id}')">Excluir</button>
                    </td>`;
                tbody.appendChild(tr);
            }
        }

        // 2. Popula #visao-turma-select
        const visaoSelect = document.getElementById('visao-turma-select');
        if (visaoSelect) {
            visaoSelect.innerHTML = '<option value="">Selecione uma turma...</option>' +
                turmasCache.map(t =>
                    `<option value="${t.id}">${t.nome} — ${t.cursos ? t.cursos.nome : ''} (${t.codigo_turma})</option>`
                ).join('');
        }

        // 3. Popula o select de curso no form de turmas (#turma-curso-select)
        const turmaCursoSelect = document.getElementById('turma-curso-select');
        if (turmaCursoSelect) {
            const { data: cursos, error: errCurso } = await db
                .from('cursos').select('id, nome, codigo_curso').order('nome');
            if (!errCurso && cursos) {
                turmaCursoSelect.innerHTML = '<option value="">Selecione um curso</option>' +
                    cursos.map(c =>
                        `<option value="${c.id}" data-codigo="${c.codigo_curso || ''}">${c.nome}${c.codigo_curso ? ` (CCC: ${c.codigo_curso})` : ''}</option>`
                    ).join('');
            }
        }

        // 4. Atualiza todos os turma-select do formulário de matrícula
        document.querySelectorAll('.turma-select').forEach(sel => {
            const entry = sel.closest('.curso-entry');
            const cursoSel = entry ? entry.querySelector('.curso-select') : null;
            const cursoId = cursoSel ? cursoSel.value : null;
            popularTurmaSelect(sel, cursoId);
        });

    } catch (e) {
        console.error('Erro ao carregar turmas:', e);
    }
}

/**
 * Popula um <select class="turma-select"> filtrando pelo cursoId.
 * Se cursoId for null/vazio, mostra mensagem "Selecione o curso primeiro".
 */
function popularTurmaSelect(selectEl, cursoId) {
    if (!selectEl) return;

    if (!cursoId) {
        selectEl.innerHTML = '<option value="" data-codigo-turma="" data-codigo-curso="">Selecione o curso primeiro</option>';
        return;
    }

    const turmaDoCurso = turmasCache.filter(t => t.curso_id === cursoId);

    if (turmaDoCurso.length === 0) {
        selectEl.innerHTML = '<option value="" data-codigo-turma="" data-codigo-curso="">Nenhuma turma cadastrada para este curso</option>';
        return;
    }

    selectEl.innerHTML = '<option value="" data-codigo-turma="" data-codigo-curso="">Selecione a turma</option>' +
        turmaDoCurso.map(t => {
            const cc = t.codigo_curso || '';
            const ct = t.codigo_turma || '';
            return `<option value="${t.id}" data-codigo-turma="${ct}" data-codigo-curso="${cc}">${t.nome} (${ct})</option>`;
        }).join('');
}

/** Salva nova turma no banco */
async function salvarTurma() {
    const nome = document.getElementById('turma-nome').value.trim();
    const cursoId = document.getElementById('turma-curso-select').value;
    const codigoTurma = document.getElementById('turma-codigo').value.trim();

    if (!nome || !cursoId || !codigoTurma) {
        mostrarAlerta('Preencha todos os campos para cadastrar a turma.');
        return;
    }

    if (!/^[0-9]{4}$/.test(codigoTurma)) {
        mostrarAlerta('O código da turma deve conter exatamente 4 dígitos numéricos.');
        return;
    }

    // Lê o código do curso do option selecionado
    const cursoOption = document.getElementById('turma-curso-select').selectedOptions[0];
    const codigoCurso = cursoOption ? (cursoOption.dataset.codigo || null) : null;

    try {
        const { error } = await db.from('turmas').insert({
            nome,
            curso_id: cursoId,
            codigo_turma: codigoTurma,
            codigo_curso: codigoCurso,
            criado_por: usuarioLogado ? usuarioLogado.id : null
        });

        if (error) {
            if (error.code === '23505') {
                throw new Error(`Já existe uma turma com o código "${codigoTurma}" para este curso.`);
            }
            throw error;
        }

        document.getElementById('form-cadastro-turma').reset();
        await carregarTurmas();
        await carregarTurmasDisponiveis();
        mostrarAlerta('Turma cadastrada com sucesso!', 'Sucesso');
    } catch (e) {
        mostrarAlerta(`Erro ao salvar turma: ${e.message}`);
    }
}

/** Exclui uma turma */
function excluirTurma(turmaId) {
    mostrarConfirmacao(
        'Tem certeza que deseja excluir esta turma? As matrículas vinculadas perderão o vínculo (turma_id = null).',
        async () => {
            try {
                const { error } = await db.from('turmas').delete().eq('id', turmaId);
                if (error) throw error;
                await carregarTurmas();
                await carregarTurmasDisponiveis();
                mostrarAlerta('Turma excluída com sucesso!', 'Sucesso');
            } catch (e) {
                mostrarAlerta(`Erro ao excluir turma: ${e.message}`);
            }
        }
    );
}

// ==================== CURSOS ====================
async function carregarCursos() {
    try {
        const { data: cursos, error } = await db
            .from('cursos')
            .select('*, disciplinas(*)')
            .order('nome');

        if (error) throw error;

        const listaCursos = cursos || [];

        // Atualiza contador do dashboard
        const totalCursosEl = document.getElementById('total-cursos');
        if (totalCursosEl) totalCursosEl.textContent = listaCursos.length;

        // Renderiza tabela de cursos
        const tbody = document.getElementById('lista-cursos');
        if (tbody) {
            tbody.innerHTML = '';
            listaCursos.forEach(curso => {
                const disciplinasTexto = curso.disciplinas && curso.disciplinas.length > 0
                    ? curso.disciplinas.map(d => `${d.nome} (${d.carga_horaria}h)`).join(', ')
                    : '<em>Nenhuma</em>';

                const codigoCurso = curso.codigo_curso
                    ? `<span style="font-family:monospace; font-size:0.85em; background:var(--panel-off); padding:2px 6px; border-radius:4px; color:var(--txt-mid);">CCC: ${String(curso.codigo_curso).padStart(3,'0')}</span>`
                    : '<em style="color:var(--txt-light);font-size:0.85em;">Sem código</em>';

                const tr = document.createElement('tr');
                tr.innerHTML = `
                <td>${curso.nome}<br>${codigoCurso}</td>
                <td>${curso.duracao}</td>
                <td>${disciplinasTexto}</td>
                <td>
                    <button type="button" class="btn-action" onclick="abrirModalEditarCurso('${curso.id}')">Editar</button>
                    <button type="button" class="btn-excluir" onclick="excluirCurso('${curso.id}')">Excluir</button>
                </td>
            `;
                tbody.appendChild(tr);
            });
        }

        // Atualiza todos os <select> de curso na página (exceto o filtro financeiro)
        const selectsIds = [
            'curso-crm',
            'curso-disciplina',
            'curso-diario',
            'curso-aluno-editar'
        ].map(id => document.getElementById(id)).filter(Boolean);

        const selectsClass = Array.from(document.querySelectorAll('.curso-select'));
        const selects = [...selectsIds, ...selectsClass];

        selects.forEach(select => {
            if (!select) return;
            while (select.options.length > 1) select.remove(1);
            listaCursos.forEach(curso => {
                const option = document.createElement('option');
                option.value = curso.id;
                option.text = curso.nome;
                select.add(option);
            });
        });

        // Popula o filtro financeiro usando o NOME do curso como value
        // para facilitar a comparação com p.cursos?.nome no filtro
        const selectFinFiltro = document.getElementById('fin-filtro-curso');
        if (selectFinFiltro) {
            while (selectFinFiltro.options.length > 1) selectFinFiltro.remove(1);
            listaCursos.forEach(curso => {
                const option = document.createElement('option');
                option.value = curso.nome;   // usa NOME como value
                option.text = curso.nome;
                selectFinFiltro.add(option);
            });
        }
    } catch (e) {
        console.error('Erro ao carregar cursos:', e);
    }
}

async function salvarCurso() {
    const nome = document.getElementById('nome-curso').value.trim();
    const duracao = document.getElementById('duracao-curso').value.trim();
    const codigoCurso = (document.getElementById('codigo-curso')?.value || '').trim();

    if (!nome || !duracao) {
        mostrarAlerta('Preencha todos os campos do curso!');
        return;
    }

    if (codigoCurso && !/^[0-9]{1,3}$/.test(codigoCurso)) {
        mostrarAlerta('O código do curso deve conter apenas números (1 a 3 dígitos).');
        return;
    }

    try {
        const { error } = await db.from('cursos').insert({
            nome,
            duracao,
            codigo_curso: codigoCurso ? String(codigoCurso).padStart(3, '0') : null,
            criado_por: usuarioLogado.id
        });

        if (error) throw error;

        document.getElementById('nome-curso').value = '';
        document.getElementById('duracao-curso').value = '';
        if (document.getElementById('codigo-curso')) document.getElementById('codigo-curso').value = '';
        await carregarCursos();
        mostrarAlerta('Curso salvo com sucesso!', 'Sucesso');
    } catch (e) {
        mostrarAlerta(`Erro ao salvar curso: ${e.message}`);
    }
}

async function salvarDisciplina() {
    const cursoId = document.getElementById('curso-disciplina').value;
    const nomeDisciplina = document.getElementById('nome-disciplina').value.trim();
    const cargaHoraria = document.getElementById('carga-horaria').value;

    if (!cursoId || !nomeDisciplina || !cargaHoraria) {
        mostrarAlerta('Preencha todos os campos para vincular a disciplina!');
        return;
    }

    const { error } = await db.from('disciplinas').insert({
        curso_id: cursoId,
        nome: nomeDisciplina,
        carga_horaria: parseInt(cargaHoraria)
    });

    if (error) {
        mostrarAlerta(`Erro ao vincular disciplina: ${error.message}`);
        return;
    }

    document.getElementById('nome-disciplina').value = '';
    document.getElementById('carga-horaria').value = '';
    await carregarCursos();
    mostrarAlerta('Disciplina vinculada com sucesso!', 'Sucesso');
}

async function abrirModalEditarCurso(cursoId) {
    try {
        const { data: curso, error } = await db
            .from('cursos')
            .select('*')
            .eq('id', cursoId)
            .single();

        if (error) throw error;
        if (!curso) return;

        cursoEditandoId = cursoId;
        document.getElementById('curso-index-editar').value = cursoId;
        document.getElementById('curso-nome-editar').value = curso.nome;
        document.getElementById('curso-duracao-editar').value = curso.duracao;

        const inputCodigo = document.getElementById('curso-codigo-editar');
        if (inputCodigo) inputCodigo.value = curso.codigo_curso || '';

        document.getElementById('modal-curso').classList.add('active');
    } catch (e) {
        console.error('Erro ao abrir modal de edição de curso:', e);
        mostrarAlerta(`Erro ao carregar dados do curso: ${e.message}`);
    }
}

function fecharModalCurso() {
    document.getElementById('modal-curso').classList.remove('active');
    cursoEditandoId = null;
}

async function salvarCursoModal() {
    if (!cursoEditandoId) return;

    const novoNome = document.getElementById('curso-nome-editar').value.trim();
    const novaDuracao = document.getElementById('curso-duracao-editar').value.trim();
    const novoCodigo = (document.getElementById('curso-codigo-editar')?.value || '').trim();

    if (!novoNome || !novaDuracao) {
        mostrarAlerta('Preencha todos os campos!');
        return;
    }

    if (novoCodigo && !/^[0-9]{1,3}$/.test(novoCodigo)) {
        mostrarAlerta('O código do curso deve conter apenas números (1 a 3 dígitos).');
        return;
    }

    try {
        const updateData = {
            nome: novoNome,
            duracao: novaDuracao,
            codigo_curso: novoCodigo ? String(novoCodigo).padStart(3, '0') : null
        };

        const { error } = await db
            .from('cursos')
            .update(updateData)
            .eq('id', cursoEditandoId);

        if (error) throw error;

        await carregarCursos();
        fecharModalCurso();
        mostrarAlerta('Curso atualizado com sucesso!', 'Sucesso');
    } catch (e) {
        mostrarAlerta(`Erro ao atualizar curso: ${e.message}`);
    }
}

function excluirCurso(cursoId) {
    mostrarConfirmacao('Tem certeza que deseja apagar este curso? Todas as disciplinas vinculadas serão removidas.', async () => {
        const { error } = await db.from('cursos').delete().eq('id', cursoId);
        if (error) {
            mostrarAlerta(`Erro ao excluir curso: ${error.message}`);
        } else {
            await carregarCursos();
            mostrarAlerta('Curso removido com sucesso!', 'Sucesso');
        }
    });
}

// ==================== GERAÇÃO DE RA COMPOSTO ====================
/**
 * Gera o RA composto no formato CCCTTTTAAAAA (12 dígitos, sem pontuação).
 * Sempre salvo no banco SEM pontos.
 */
function gerarRA(codigoCurso, codigoTurma, sequencial) {
    try {
        if (!codigoCurso || !codigoTurma || !sequencial) {
            throw new Error(`Dados insuficientes para gerar RA: codigoCurso=${codigoCurso}, codigoTurma=${codigoTurma}, sequencial=${sequencial}`);
        }

        const ccc   = String(codigoCurso).replace(/\D/g, '').padStart(3, '0').slice(-3);
        const tttt  = String(codigoTurma).replace(/\D/g, '').padStart(4, '0').slice(-4);
        const aaaaa = String(Math.floor(sequencial)).padStart(5, '0').slice(-5);

        const ra = `${ccc}${tttt}${aaaaa}`;

        if (ra.length !== 12) {
            throw new Error(`RA gerado tem comprimento inválido: ${ra} (esperado 12 dígitos)`);
        }

        return ra; // sempre retorna SEM pontos (valor puro para o banco)
    } catch (e) {
        console.error('Erro ao gerar RA:', e);
        return null;
    }
}

/**
 * Formata o RA puro de 12 dígitos para exibição visual: CCC.TTTT.AAAAA
 * Ex.: "250250000001" → "250.2500.00001"
 * Mantém o valor puro no banco, apenas formata para o frontend.
 * @param {string|null} ra - String de 12 dígitos ou null/vazio
 * @returns {string} RA formatado ou '-' se inválido
 */
function formatarRA(ra) {
    if (!ra) return '-';
    const s = String(ra).replace(/\D/g, ''); // remove qualquer pontuação residual
    if (s.length !== 12) return ra; // retorna como está se não tiver 12 dígitos
    return `${s.slice(0, 3)}.${s.slice(3, 7)}.${s.slice(7)}`;
}

// ==================== ALUNOS ====================

/**
 * Busca um aluno pelo CPF digitado e preenche automaticamente os campos do formulário.
 * Disparado EXCLUSIVAMENTE no evento `blur` do campo #cpf-aluno — sem trava de caracteres.
 * A busca compara: (1) a string exata digitada e, como fallback, (2) apenas os dígitos.
 * Isso garante compatibilidade com CPFs salvos com ou sem máscara no banco.
 * Salva o resultado em `alunoEncontradoPorCpf` para uso posterior em matricularAluno().
 */
async function buscarAlunoPorCpf() {
    if (!db) return;

    const cpfInput = document.getElementById('cpf-aluno');
    const nomeInput = document.getElementById('nome-aluno');
    const badge    = document.getElementById('badge-cpf-autofill');

    if (!cpfInput) return;

    const cpfDigitado = cpfInput.value.trim();

    // Aborta silenciosamente se o campo estiver completamente vazio
    if (!cpfDigitado) {
        // Se havia um aluno carregado antes, limpa o estado
        if (alunoEncontradoPorCpf) {
            alunoEncontradoPorCpf = null;
            if (nomeInput && nomeInput.dataset.autoFilled === 'true') {
                nomeInput.value = '';
                nomeInput.readOnly = false;
                nomeInput.removeAttribute('data-auto-filled');
                nomeInput.style.background = '';
                nomeInput.style.borderColor = '';
            }
            if (badge) badge.style.display = 'none';
        }
        return;
    }

    // Indicador visual de busca
    if (badge) {
        badge.style.display = 'flex';
        badge.className = 'badge-cpf-autofill badge-cpf-loading';
        badge.innerHTML = '<span class="spinner-cpf"></span> Verificando CPF no sistema...';
    }

    try {
        // ── Estratégia de busca dupla ────────────────────────────────────────
        // NOTA: O banco salva o CPF exatamente como foi digitado no input (sem
        // normalização). Por isso buscamos primeiro pela string exata e, se não
        // achar, pelos dígitos puros — cobrindo ambos os formatos possíveis.
        const cpfSoNumeros = cpfDigitado.replace(/\D/g, '');

        // DEBUG — inspecione o Console do navegador para ver o que vai ao Supabase
        console.log('[Auto-Fill CPF] Tentativa 1 — string exata:', JSON.stringify(cpfDigitado));

        let { data: aluno, error } = await db
            .from('alunos')
            .select('id, nome, cpf, telefone')
            .eq('cpf', cpfDigitado)
            .maybeSingle();

        if (error) throw error;

        console.log('[Auto-Fill CPF] Resultado tentativa 1:', aluno ? `encontrado (id: ${aluno.id}, cpf salvo: "${aluno.cpf}")` : 'não encontrado');

        // Fallback: tenta pelos dígitos puros (evita re-consulta se já são iguais)
        if (!aluno && cpfSoNumeros && cpfSoNumeros !== cpfDigitado) {
            console.log('[Auto-Fill CPF] Tentativa 2 — só dígitos:', JSON.stringify(cpfSoNumeros));

            const { data: alunoFallback, error: errFallback } = await db
                .from('alunos')
                .select('id, nome, cpf, telefone')
                .eq('cpf', cpfSoNumeros)
                .maybeSingle();
            if (errFallback) throw errFallback;

            console.log('[Auto-Fill CPF] Resultado tentativa 2:', alunoFallback ? `encontrado (id: ${alunoFallback.id}, cpf salvo: "${alunoFallback.cpf}")` : 'não encontrado');
            aluno = alunoFallback;
        }

        if (aluno) {
            // ─── Aluno encontrado: preenche campos e exibe badge de sucesso ───
            alunoEncontradoPorCpf = aluno;

            if (nomeInput) {
                nomeInput.value = aluno.nome || '';
                nomeInput.readOnly = true;
                nomeInput.dataset.autoFilled = 'true';
                // Destaque sutil para indicar preenchimento automático
                nomeInput.style.background = 'rgba(16, 185, 129, 0.08)';
                nomeInput.style.borderColor = 'rgba(16, 185, 129, 0.5)';
                nomeInput.style.color = 'var(--txt-dark)';
            }

            if (badge) {
                badge.className = 'badge-cpf-autofill badge-cpf-success';
                badge.innerHTML = `
                    <span style="font-size:1.1em;">✅</span>
                    <span>
                        <strong>Aluno já cadastrado.</strong>
                        Dados preenchidos automaticamente.
                        Prossiga apenas com os dados da nova matrícula.
                    </span>
                    <button type="button" onclick="limparAutoFillCpf()" title="Editar manualmente" style="
                        background: transparent; border: 1px solid rgba(16,185,129,0.4); border-radius: 4px;
                        color: #10b981; cursor: pointer; font-size: 0.75rem; padding: 2px 8px;
                        font-weight: 600; white-space: nowrap;
                    ">✎ Editar</button>`;
                badge.style.display = 'flex';
            }
        } else {
            // ─── Aluno NÃO encontrado: limpa estado anterior e libera campos ───
            alunoEncontradoPorCpf = null;

            if (nomeInput && nomeInput.dataset.autoFilled === 'true') {
                nomeInput.value = '';
                nomeInput.readOnly = false;
                nomeInput.removeAttribute('data-auto-filled');
                nomeInput.style.background = '';
                nomeInput.style.borderColor = '';
            }

            if (badge) {
                badge.className = 'badge-cpf-autofill badge-cpf-new';
                badge.innerHTML = `
                    <span style="font-size:1.1em;">🆕</span>
                    <span>CPF não encontrado. <strong>Novo aluno</strong> será cadastrado ao efetivar.</span>`;
                badge.style.display = 'flex';
            }
        }
    } catch (e) {
        console.error('Erro ao buscar aluno por CPF:', e);
        alunoEncontradoPorCpf = null;
        if (badge) {
            badge.className = 'badge-cpf-autofill badge-cpf-error';
            badge.innerHTML = `<span>⚠️ Erro ao verificar CPF: ${e.message}</span>`;
            badge.style.display = 'flex';
        }
    }
}

/**
 * Permite ao usuário descartar o auto-fill e editar o nome manualmente.
 */
function limparAutoFillCpf() {
    alunoEncontradoPorCpf = null;

    const nomeInput = document.getElementById('nome-aluno');
    if (nomeInput) {
        nomeInput.value = '';
        nomeInput.readOnly = false;
        nomeInput.removeAttribute('data-auto-filled');
        nomeInput.style.background = '';
        nomeInput.style.borderColor = '';
        nomeInput.focus();
    }

    const badge = document.getElementById('badge-cpf-autofill');
    if (badge) {
        badge.className = 'badge-cpf-autofill badge-cpf-new';
        badge.innerHTML = `<span style="font-size:1.1em;">✏️</span> <span>Preenchimento automático removido. Preencha os dados manualmente.</span>`;
    }
}

async function matricularAluno() {
    const btn = document.getElementById('btn-matricular');
    const originalText = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '⏳ Aguarde...';
    }

    try {
        const nome = document.getElementById('nome-aluno').value.trim();
        const cpf = document.getElementById('cpf-aluno').value.trim();

        if (!nome || !cpf) {
            throw new Error('Preencha o Nome e o CPF do aluno.');
        }

        // Ler todos os cursos adicionados
        const cursosEntries = document.querySelectorAll('.curso-entry');
        const cursosSelecionados = [];
        let valorTotal = 0;

        for (const entry of cursosEntries) {
            const cursoId = entry.querySelector('.curso-select').value;

            // Captura a turma via SELECT (já traz id, codigo_turma e codigo_curso via dataset)
            const turmaSelect = entry.querySelector('.turma-select');
            const turmaId = turmaSelect ? turmaSelect.value : null;
            const codigoTurmaOpt = turmaSelect ? (turmaSelect.selectedOptions[0]?.dataset.codigoTurma || '') : '';
            const codigoCursoOpt = turmaSelect ? (turmaSelect.selectedOptions[0]?.dataset.codigoCurso || '') : '';

            const valorInputVal = entry.querySelector('.valor-input').value;
            const valor = parseMoeda(valorInputVal);

            // Captura os campos de pagamento individuais deste entry
            const formaPag = entry.querySelector('.forma-pagamento-select')?.value || 'a-vista';
            const metodoAvista = entry.querySelector('.metodo-pagamento-select')?.value || 'Pix';
            const metodoParcelado = entry.querySelector('.metodo-parcelamento-select')?.value || 'Boleto';
            const numParcelasStr = entry.querySelector('.numero-parcelas-select')?.value || '1';
            const numParcelas = formaPag === 'parcelado' ? parseInt(numParcelasStr) : 1;
            const metodoPagamento = formaPag === 'parcelado' ? metodoParcelado : metodoAvista;

            const contratoInput = entry.querySelector('.contrato-input');
            const arquivoContrato = contratoInput && contratoInput.files[0] ? contratoInput.files[0] : null;

            if (!cursoId || !turmaId || isNaN(valor) || !valorInputVal) {
                throw new Error('Preencha corretamente o Curso, a Turma e o Valor para todos os cursos adicionados.');
            }

            if (!arquivoContrato) {
                throw new Error('É obrigatório anexar o Contrato (PDF) para todos os cursos.');
            }

            let contratoBase64 = null;
            try {
                contratoBase64 = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = err => reject(err);
                    reader.readAsDataURL(arquivoContrato);
                });
            } catch (e) {
                throw new Error('Falha ao ler o arquivo PDF anexado. Tente enviar novamente.');
            }

            cursosSelecionados.push({
                cursoId, turmaId,
                codigoTurma: codigoTurmaOpt,
                codigoCurso: codigoCursoOpt,
                valor,
                contratoBase64,
                formaPagamento: formaPag,
                metodoPagamento,
                numeroParcelas: numParcelas
            });
            valorTotal += valor;
        }

        if (cursosSelecionados.length === 0) {
            throw new Error('Adicione pelo menos um curso para realizar a matrícula.');
        }

        // valorTotal ainda usado para compatibilidade
        const dataMatricula = new Date().toISOString().split('T')[0];

        // ── LÓGICA DE CPF COM CACHE DO AUTO-FILL ──────────────────
        // 1. Se o auto-fill já encontrou o aluno (buscarAlunoPorCpf foi disparado),
        //    reutiliza o cache — sem fazer nova requisição ao Supabase.
        //    Caso contrário (ex: usuário colou o CPF sem sair do campo), faz a consulta.
        let alunoExistente;

        if (alunoEncontradoPorCpf && alunoEncontradoPorCpf.cpf === cpf) {
            // ── Cache de auto-fill disponível e consistente ────────────
            console.info(`[Auto-Fill] Reaproveitando cache: aluno ID ${alunoEncontradoPorCpf.id} (${alunoEncontradoPorCpf.nome})`);
            // Busca campos extras que a busca rápida pode não ter retornado (curso_id, curso_nome)
            const { data: alunoCompleto, error: errCache } = await db
                .from('alunos')
                .select('id, nome, cpf, curso_id, curso_nome')
                .eq('id', alunoEncontradoPorCpf.id)
                .single();
            if (errCache) throw new Error(`Erro ao confirmar dados do aluno: ${errCache.message}`);
            alunoExistente = alunoCompleto;
        } else {
            // ── Sem cache: consulta padrão ao Supabase ─────────────────
            const { data, error: errCpf } = await db
                .from('alunos')
                .select('id, nome, cpf, curso_id, curso_nome')
                .eq('cpf', cpf)
                .maybeSingle();
            if (errCpf) throw new Error(`Erro de conexão ao verificar CPF: ${errCpf.message}`);
            alunoExistente = data;
        }

        let alunoId;
        let primeiroCursoLegado;

        if (alunoExistente) {
            // ── CPF JÁ EXISTE: reaproveitamento do aluno ──────────────
            console.info(`CPF encontrado: reaproveitando aluno ID ${alunoExistente.id} (${alunoExistente.nome})`);
            alunoId = alunoExistente.id;
            primeiroCursoLegado = { cursoId: alunoExistente.curso_id, cursoNome: alunoExistente.curso_nome };

            // Verifica se já está matriculado em algum dos cursos selecionados
            for (const item of cursosSelecionados) {
                const { data: matriculaExistente, error: errMat } = await db
                    .from('matriculas')
                    .select('id')
                    .eq('aluno_id', alunoId)
                    .eq('curso_id', item.cursoId)
                    .maybeSingle();

                if (errMat) throw new Error(`Erro ao verificar matrícula: ${errMat.message}`);

                if (matriculaExistente) {
                    // Busca nome do curso para mostrar na mensagem
                    const { data: cursoInfo } = await db.from('cursos').select('nome').eq('id', item.cursoId).single();
                    throw new Error(`Este aluno já está matriculado no curso "${cursoInfo?.nome || item.cursoId}".`);
                }
            }
        } else {
            // ── CPF NOVO: inserir apenas na tabela alunos ─────────────────
            //
            // IMPORTANTE: NÃO chamamos auth.signUp() aqui.
            // Razão: o Client SDK do Supabase não suporta criar um usuário Auth
            // enquanto outro já está com sessão ativa (retorna "Database error
            // saving new user"). Isso é uma limitação do browser client.
            //
            // Solução adotada (100% frontend):
            //   1. A secretaria grava apenas em public.alunos (sem Auth).
            //   2. O email sintético é calculado e salvo como referência.
            //   3. No portal do aluno, o primeiro login chama signUp() com as
            //      credenciais sintéticas, criando a conta Auth naquele momento,
            //      e depois faz signIn normalmente nas visitas seguintes.

            const cpfNumeros     = cpf.replace(/\D/g, '');
            const emailSintetico = `${cpfNumeros}@aluno.mindrecall.com.br`;

            const primeiroCurso = cursosSelecionados[0];
            const { data: cursoData, error: errCursoData } = await db
                .from('cursos')
                .select('nome')
                .eq('id', primeiroCurso.cursoId)
                .single();

            if (errCursoData) throw new Error(`Erro ao buscar dados do curso: ${errCursoData.message}`);

            const { data: novoAluno, error: erroAluno } = await db
                .from('alunos')
                .insert({
                    nome,
                    cpf,
                    email_sintetico: emailSintetico,
                    curso_id:        primeiroCurso.cursoId,
                    curso_nome:      cursoData ? cursoData.nome : '',
                    turma:           primeiroCurso.codigoTurma,
                    valor:           valorTotal,
                    data_matricula:  dataMatricula,
                    criado_por:      usuarioLogado ? usuarioLogado.id : null
                })
                .select()
                .single();

            if (erroAluno) throw new Error(`Erro de conexão ao cadastrar aluno: ${erroAluno.message}`);

            alunoId = novoAluno.id;
            primeiroCursoLegado = { cursoId: primeiroCurso.cursoId, cursoNome: cursoData?.nome || '' };
        }


        // ── GERAR RA E INSERIR NA TABELA MATRICULAS ────────────────
        let primeiroRaGerado = null;

        for (const item of cursosSelecionados) {
            // Os dados do curso (codigo_curso) e da turma (codigo_turma, turma_id)
            // já foram capturados no loop anterior via dataset do <select>
            const codigoCurso = item.codigoCurso;
            const codigoTurma = item.codigoTurma;
            const turmaId     = item.turmaId;

            // Conta matrículas existentes nesta turma para gerar o sequencial
            const { count: totalNaTurma, error: errCount } = await db
                .from('matriculas')
                .select('id', { count: 'exact', head: true })
                .eq('turma_id', turmaId);

            if (errCount) throw new Error(`Erro ao contar alunos na turma: ${errCount.message}`);

            const sequencial = (totalNaTurma || 0) + 1;

            // Gera o RA composto a partir dos dados capturados do SELECT
            const raGerado = gerarRA(codigoCurso, codigoTurma, sequencial);

            if (!raGerado) {
                console.warn(`RA não gerado: curso sem código configurado (CCC ausente).`);
            }

            if (!primeiroRaGerado && raGerado) primeiroRaGerado = raGerado;

            // INSERT na tabela matriculas e captura o ID gerado para vincular pagamentos
            const { data: novaMatricula, error: erroMatricula } = await db
                .from('matriculas')
                .insert({
                    aluno_id:     alunoId,
                    curso_id:     item.cursoId,
                    turma_id:     turmaId,
                    turma:        codigoTurma,
                    codigo_turma: codigoTurma,
                    ra:           raGerado || null,
                    contrato_url: item.contratoBase64,
                    data_matricula: dataMatricula,
                    criado_por:   usuarioLogado ? usuarioLogado.id : null
                })
                .select('id')
                .single();

            if (erroMatricula) throw new Error(`Erro ao criar vínculo de matrícula: ${erroMatricula.message}`);

            // Guarda o matricula_id gerado dentro do próprio item para uso no loop financeiro
            item._matriculaId = novaMatricula?.id || null;
        }

        // Atualiza o RA legado na tabela alunos (último RA gerado)
        if (primeiroRaGerado) {
            const { error: errRaUpdate } = await db
                .from('alunos')
                .update({ ra: primeiroRaGerado })
                .eq('id', alunoId);

            if (errRaUpdate) {
                console.error('Aviso: Não foi possível atualizar o RA legado no aluno:', errRaUpdate);
                // Não lança erro pois a matrícula já foi criada com sucesso
            }
        }

        // ── FINANCEIRO POR CURSO ────────────────────────────────────
        // Cada item carrega seu próprio cursoId, valor, formaPagamento e
        // o _matriculaId capturado no loop anterior — sem reutilizar variáveis globais.
        for (const item of cursosSelecionados) {
            const matriculaId = item._matriculaId || null;
            const cursoId     = item.cursoId;

            // Gera parcelas vinculadas ao curso e matrícula específicos
            const parcelas = gerarParcelas(
                item.valor, item.numeroParcelas, dataMatricula,
                alunoId, cursoId, matriculaId
            );

            if (parcelas.length > 0) {
                const { error: erroFin } = await db.from('financeiro').insert(parcelas);
                if (erroFin) throw new Error(`Erro ao gerar parcelas no financeiro (curso ${cursoId}): ${erroFin.message}`);
            }

            // Pagamento à vista: vincula matricula_id e curso_id corretos
            if (item.formaPagamento === 'a-vista') {
                const { error: erroPag } = await db.from('pagamentos').insert({
                    aluno_id:        alunoId,
                    curso_id:        cursoId,
                    matricula_id:    matriculaId,
                    valor_pago:      item.valor,
                    forma_pagamento: item.metodoPagamento,
                    status:          'Pago',
                    data_pagamento:  dataMatricula,
                    criado_por:      usuarioLogado ? usuarioLogado.id : null
                });
                if (erroPag) throw new Error(`Erro ao lançar pagamento à vista (curso ${cursoId}): ${erroPag.message}`);
            }
        }

        // ── LIMPEZA DA UI ──────────────────────────────────────────
        // Limpa o estado do auto-fill por CPF
        alunoEncontradoPorCpf = null;
        const nomeInputReset = document.getElementById('nome-aluno');
        if (nomeInputReset) {
            nomeInputReset.readOnly = false;
            nomeInputReset.removeAttribute('data-auto-filled');
            nomeInputReset.style.background = '';
            nomeInputReset.style.borderColor = '';
        }
        const badgeReset = document.getElementById('badge-cpf-autofill');
        if (badgeReset) badgeReset.style.display = 'none';

        document.getElementById('form-secretaria').reset();

        const container = document.getElementById('cursos-container');
        const extraEntries = container.querySelectorAll('.curso-entry:not(:first-child)');
        extraEntries.forEach(el => el.remove());

        // Reseta o turma-select do primeiro entry
        const primeiroTurmaSelect = container.querySelector('.turma-select');
        popularTurmaSelect(primeiroTurmaSelect, null);

        // Reseta os campos de pagamento do primeiro entry para padrão
        const primeiroEntry = container.querySelector('.curso-entry');
        if (primeiroEntry) {
            const fpSel = primeiroEntry.querySelector('.forma-pagamento-select');
            if (fpSel) fpSel.value = 'a-vista';
            primeiroEntry.querySelector('.metodo-avista-container')?.style.setProperty('display', '');
            primeiroEntry.querySelector('.metodo-parcelado-container')?.style.setProperty('display', 'none');
            primeiroEntry.querySelector('.numero-parcelas-container')?.style.setProperty('display', 'none');
        }

        await carregarAlunos();

        const mensagemSucesso = alunoExistente
            ? `Nova matrícula adicionada ao aluno "${alunoExistente.nome}" com sucesso!${primeiroRaGerado ? ` RA: ${formatarRA(primeiroRaGerado)}` : ''}`
            : `Aluno cadastrado e matriculado com sucesso!${primeiroRaGerado ? ` RA: ${formatarRA(primeiroRaGerado)}` : ''}`;

        mostrarAlerta(mensagemSucesso, 'Sucesso');

    } catch (e) {
        console.error('Erro no fluxo de matrícula:', e);
        mostrarAlerta(e.message || 'Ocorreu um erro ao efetivar a matrícula.', 'Erro de Validação/Conexão');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
    }
}

/**
 * Gera o array de parcelas para inserção na tabela `financeiro`.
 * Agora recebe cursoId e matriculaId para vincular cada parcela ao curso certo.
 */
function gerarParcelas(valorTotal, numeroParcelas, dataMatricula, alunoId, cursoId = null, matriculaId = null) {
    const parcelas = [];
    const valorParcela = valorTotal / numeroParcelas;

    for (let i = 0; i < numeroParcelas; i++) {
        const vencimento = new Date(dataMatricula + 'T12:00:00');
        vencimento.setDate(vencimento.getDate() + (i * 30));

        const parcela = {
            aluno_id:       alunoId,
            numero_parcela: i + 1,
            total_parcelas: numeroParcelas,
            valor:          parseFloat(valorParcela.toFixed(2)),
            vencimento:     vencimento.toISOString().split('T')[0],
            paga:           false
        };

        // Vincula ao curso e matrícula específicos quando disponíveis
        if (cursoId)     parcela.curso_id     = cursoId;
        if (matriculaId) parcela.matricula_id = matriculaId;

        parcelas.push(parcela);
    }
    return parcelas;
}

async function carregarAlunos() {
    try {
        // Busca alunos com parcelas, notas e todas as matrículas (múltiplos cursos)
        const { data: alunos, error } = await db
            .from('alunos')
            .select('*, financeiro(*), notas(*), matriculas(*, cursos(nome))')
            .order('criado_em', { ascending: false });

        if (error) throw error;

        const listaAlunos = alunos || [];

        // Atualiza contador do dashboard
        const totalAlunosEl = document.getElementById('total-alunos');
        if (totalAlunosEl) totalAlunosEl.textContent = listaAlunos.length;

        // ── Tabela CRM ──────────────────────────────────────────
        const tbodyCrm = document.getElementById('lista-alunos');
        const filtroCursoEl = document.getElementById('curso-crm');

        if (tbodyCrm) {
            tbodyCrm.innerHTML = '';
            const filtroCurso = filtroCursoEl ? filtroCursoEl.value : '';
            const filtroTurmaEl = document.getElementById('turma-crm');
            const filtroTurma = filtroTurmaEl ? filtroTurmaEl.value.toLowerCase() : '';

            const filtrados = listaAlunos.filter(a => {
                // Suporte a múltiplos cursos: verifica tanto o campo legado (curso_id)
                // quanto o array de matrículas (novo schema)
                const matchCurso = !filtroCurso ||
                    a.curso_id === filtroCurso ||
                    (a.matriculas || []).some(m =>
                        m.curso_id === filtroCurso ||
                        (m.cursos && m.cursos.nome && m.cursos.nome.toLowerCase() === filtroCurso.toLowerCase())
                    );

                const matchTurma = !filtroTurma ||
                    (a.turma && a.turma.toLowerCase().includes(filtroTurma)) ||
                    (a.nome && a.nome.toLowerCase().includes(filtroTurma)) ||
                    (a.ra && String(a.ra).includes(filtroTurma));

                return matchCurso && matchTurma;
            });

            filtrados.forEach(aluno => {
                const parcelas = aluno.financeiro || [];
                let statusParcelas = 'Sem Boletos';
                let badgeClass = '';

                if (parcelas.length > 0) {
                    const hoje = new Date().toISOString().split('T')[0];
                    // Inadimplente = existe qualquer parcela não paga com vencimento passado
                    const temAtrasada = parcelas.some(p => !p.paga && p.vencimento < hoje);
                    // Inadimplente também se há parcelas não pagas (independente de data)
                    const temPendente = parcelas.some(p => !p.paga);

                    if (temAtrasada || temPendente) {
                        statusParcelas = 'Inadimplente';
                        badgeClass = temAtrasada ? 'badge-atrasado' : 'badge-pendente';
                    } else {
                        statusParcelas = 'Adimplente';
                        badgeClass = 'badge-pago';
                    }
                }

                // Monta chips de cursos com RA individual por matrícula (Ponto 3)
                const matriculas = aluno.matriculas || [];
                let cursosHtml;
                if (matriculas.length > 0) {
                    cursosHtml = `<div class="cursos-chips">${matriculas.map(m => {
                        const nomeCurso = m.cursos ? m.cursos.nome : '-';
                        const raFormatado = m.ra ? ` <span style="font-family:monospace;font-size:0.78em;color:var(--txt-light);white-space:nowrap;">RA: ${formatarRA(m.ra)}</span>` : '';
                        return `<span class="curso-chip" style="display:inline-flex;align-items:center;gap:4px;">${nomeCurso}${raFormatado}</span>`;
                    }).join('')}</div>`;
                } else {
                    cursosHtml = aluno.curso_nome || '-';
                }

                // Coluna Turma: exibe badges de todas as turmas das matrículas
                let turmasHtml;
                if (matriculas.length > 0) {
                    const turmasUnicas = [...new Map(
                        matriculas
                            .filter(m => m.codigo_turma || m.turma)
                            .map(m => [m.codigo_turma || m.turma, m])
                    ).values()];
                    turmasHtml = turmasUnicas.length > 0
                        ? `<div class="cursos-chips">${turmasUnicas.map(m =>
                            `<span class="curso-chip" style="font-family:monospace;font-size:0.85em;">${m.codigo_turma || m.turma}</span>`
                          ).join('')}</div>`
                        : '-';
                } else {
                    turmasHtml = aluno.turma || '-';
                }

                const tr = document.createElement('tr');
                tr.innerHTML = `
                <td><strong>${aluno.nome}</strong></td>
                <td>${aluno.cpf || '-'}</td>
                <td>${cursosHtml}</td>
                <td>${turmasHtml}</td>
                <td>${parcelas.length > 0
                    ? `<span class="badge ${badgeClass}">${statusParcelas}</span>`
                    : `<span style="color:var(--txt-light); font-size:0.85em;">Sem boletos</span>`
                }</td>
                <td>
                    <button type="button" class="btn-action" onclick="abrirModalAluno('${aluno.id}')">Abrir Ficha</button>
                </td>
            `;
                tbodyCrm.appendChild(tr);
            });

        }

        // ── Tabela Secretaria ────────────────────────────────────
        const tbodySecretaria = document.getElementById('lista-secretaria-alunos');

        if (tbodySecretaria) {
            tbodySecretaria.innerHTML = '';
            alunos.forEach(aluno => {
                let dataFormatada = '-';
                if (aluno.data_matricula) {
                    const partes = aluno.data_matricula.split('-');
                    if (partes.length === 3) dataFormatada = `${partes[2]}/${partes[1]}/${partes[0]}`;
                }

                // Monta lista de cursos com RA por matrícula (Ponto 3)
                const matriculas = aluno.matriculas || [];
                let cursosTexto;
                if (matriculas.length > 0) {
                    cursosTexto = `<div class="cursos-chips">${matriculas.map(m => {
                        const nomeCurso = m.cursos ? m.cursos.nome : '-';
                        const raFormatado = m.ra ? ` <span style="font-family:monospace;font-size:0.78em;color:var(--txt-light);white-space:nowrap;">RA: ${formatarRA(m.ra)}</span>` : '';
                        return `<span class="curso-chip" style="display:inline-flex;align-items:center;gap:4px;">${nomeCurso}${raFormatado}</span>`;
                    }).join('')}</div>`;
                } else {
                    cursosTexto = aluno.curso_nome || '-';
                }

                const tr = document.createElement('tr');
                tr.innerHTML = `
                <td><strong>${aluno.nome}</strong></td>
                <td>${aluno.cpf || '-'}</td>
                <td>${cursosTexto}</td>
                <td>${dataFormatada}</td>
                <td>
                    <button type="button" class="btn-excluir" onclick="excluirAluno('${aluno.id}')">Remover Aluno</button>
                </td>
            `;
                tbodySecretaria.appendChild(tr);
            });
        }
    } catch (e) {
        console.error('Erro geral ao carregar alunos:', e);
    }
}

function excluirAluno(alunoId) {
    mostrarConfirmacao(
        'Tem certeza absoluta que deseja REMOVER este aluno? Todo o histórico de notas e financeiro será apagado.',
        async () => {
            // As tabelas financeiro e notas têm ON DELETE CASCADE, então só precisa excluir o aluno
            const { error } = await db.from('alunos').delete().eq('id', alunoId);
            if (error) {
                mostrarAlerta(`Erro ao remover aluno: ${error.message}`);
                return;
            }
            await carregarAlunos();
            await carregarAlunosDiario();
            await atualizarDashboard();
            mostrarAlerta('Aluno removido do sistema com sucesso!', 'Sucesso');
        }
    );
}

async function abrirModalAluno(alunoId) {
    try {
        // Busca o aluno com todos os dados, incluindo documento_rg e email_sintetico
        const { data: aluno, error } = await db
            .from('alunos')
            .select('*, documento_rg, email_sintetico, matriculas(*, cursos(nome))')
            .eq('id', alunoId)
            .single();

        if (error) throw error;
        if (!aluno) return;

        alunoEditando = aluno;

        // Helper para campos de texto simples
        const setValue = (id, value) => {
            const el = document.getElementById(id);
            if (el) {
                el.textContent = value && String(value).trim() !== '' ? value : 'Pendente';
                el.style.color = (value && String(value).trim() !== '') ? 'var(--txt-dark)' : 'var(--txt-light)';
            }
        };

        // Dados Acadêmicos
        setValue('ficha-nome', aluno.nome);
        // Exibe RA da matrícula mais recente na ficha (campo ficha-ra) formatado
        const primeiraMatricula = (aluno.matriculas || []).find(m => m.ra);
        setValue('ficha-ra', primeiraMatricula ? formatarRA(primeiraMatricula.ra) : (aluno.ra ? formatarRA(aluno.ra) : ''));
        setValue('ficha-cpf', aluno.cpf);

        // Cursos — renderiza lista completa de matrículas (histórico)
        const raMatriculas = aluno.matriculas || [];
        const fichaEl = document.getElementById('ficha-curso');
        if (fichaEl) {
            if (raMatriculas.length > 0) {
                const cursosHtml = raMatriculas.map((m, idx) => {
                    const nomeCurso = m.cursos ? m.cursos.nome : 'Curso não identificado';
                    const raFormatado = m.ra ? `<span style="font-family:monospace; font-size:0.78em; color:var(--txt-light); margin-left:6px;">RA: ${formatarRA(m.ra)}</span>` : '';
                    const turmaInfo = m.codigo_turma || m.turma ? ` — Turma: ${m.codigo_turma || m.turma}` : '';
                    return `<div style="display:flex; align-items:center; gap:4px; margin-bottom:${idx < raMatriculas.length - 1 ? '4px' : '0'};"><span class="curso-chip" style="margin:0;">${nomeCurso}${turmaInfo}</span>${raFormatado}</div>`;
                }).join('');
                fichaEl.innerHTML = cursosHtml;
                fichaEl.style.color = 'var(--txt-dark)';
            } else {
                const fallback = aluno.curso_nome || '';
                fichaEl.textContent = fallback || 'Pendente';
                fichaEl.style.color = fallback ? 'var(--txt-dark)' : 'var(--txt-light)';
            }
        }

        // Contato
        setValue('ficha-telefone', aluno.telefone);
        setValue('ficha-telefone2', aluno.telefone_secundario);

        // E-mail: exibe o e-mail de contato pessoal quando preenchido.
        // Se estiver vazio, exibe o e-mail sintético (login do portal) como referência,
        // com indicação visual de que é o e-mail de acesso, não o pessoal.
        const emailContato = aluno.email && String(aluno.email).trim() !== '' ? aluno.email : null;
        const emailEl = document.getElementById('ficha-email');
        if (emailEl) {
            if (emailContato) {
                emailEl.textContent = emailContato;
                emailEl.style.color = 'var(--txt-dark)';
            } else if (aluno.email_sintetico) {
                emailEl.innerHTML = `
                    <span style="color: var(--txt-light); font-style: italic;">${aluno.email_sintetico}</span>
                    <span style="display:inline-block; margin-left:6px; font-size:0.72rem; background:rgba(99,102,241,0.1);
                          color:#6366f1; border:1px solid rgba(99,102,241,0.3); border-radius:4px;
                          padding:1px 6px; font-weight:600; white-space:nowrap;">e-mail de acesso</span>`;
            } else {
                emailEl.textContent = 'Pendente';
                emailEl.style.color = 'var(--txt-light)';
            }
        }

        // Endereço
        setValue('ficha-cep', aluno.cep);
        setValue('ficha-logradouro', aluno.logradouro);
        setValue('ficha-numero', aluno.numero);
        setValue('ficha-bairro', aluno.bairro);
        setValue('ficha-cidade', aluno.cidade_uf);

        // ── Seção Documentos — RG / CNH ──────────────────────────────
        const fichaDocEl = document.getElementById('ficha-documento-rg');
        if (fichaDocEl) {
            if (aluno.documento_rg && aluno.documento_rg.trim() !== '') {
                // Documento disponível: exibe botão para abrir/baixar
                fichaDocEl.innerHTML = `
                    <a
                        href="${aluno.documento_rg}"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="btn-action"
                        style="display:inline-flex; align-items:center; gap:6px; padding:8px 16px; text-decoration:none; font-size:0.85rem;"
                        title="Abrir/baixar o documento de identidade"
                    >
                        📄 Ver Documento
                    </a>`;
            } else {
                // Documento pendente
                fichaDocEl.innerHTML = `<span class="badge" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.3); padding: 6px 12px; border-radius: 6px; font-size: 0.8rem; font-weight: 600;">⏳ Pendente de Envio</span>`;
            }
        }

        // ── Banner de Alerta Onboarding ───────────────────────────────
        // Considera onboarding completo quando o aluno preencheu ao menos
        // o telefone principal E o CEP (dados essenciais de contato/endereço).
        // O e-mail de contato pessoal é opcional — não bloqueia a conclusão.
        const temTelefone = aluno.telefone && String(aluno.telefone).trim() !== '';
        const temCep      = aluno.cep      && String(aluno.cep).trim()      !== '';
        const onboardingCompleto = temTelefone && temCep;

        const alerta = document.getElementById('alerta-onboarding');
        if (alerta) {
            alerta.style.display = onboardingCompleto ? 'none' : 'flex';
        }

        document.getElementById('modal-aluno').classList.add('active');

    } catch (e) {
        console.error('Erro ao abrir ficha do aluno:', e);
        mostrarAlerta(`Erro ao carregar ficha do aluno: ${e.message}`);
    }
}


function fecharModalAluno() {
    document.getElementById('modal-aluno').classList.remove('active');
}

async function salvarEdicaoAluno() {
    if (!alunoEditando) return;

    const updateData = {
        nome: document.getElementById('nome-aluno-editar').value.trim(),
        cpf: document.getElementById('cpf-aluno-editar').value.trim(),
        valor: parseFloat(document.getElementById('valor-aluno-editar').value)
    };

    // Edição de curso e turma removida, pois agora os cursos e turmas são gerenciados através das matrículas.

    const { error } = await db
        .from('alunos')
        .update(updateData)
        .eq('id', alunoEditando.id);

    if (error) {
        mostrarAlerta(`Erro ao salvar: ${error.message}`);
        return;
    }

    fecharModalAluno();
    await carregarAlunos();
    await atualizarDashboard();
    mostrarAlerta('Ficha do aluno atualizada com sucesso!', 'Sucesso');
}

function verContratoMatricula(matriculaId) {
    if (!alunoEditando || !alunoEditando.matriculas) return;
    const matricula = alunoEditando.matriculas.find(m => m.id === matriculaId);
    if (!matricula || !matricula.contrato_url) {
        mostrarAlerta('Nenhum contrato anexado para este curso.');
        return;
    }
    const pdfWindow = window.open();
    if (pdfWindow) {
        pdfWindow.document.write(`<iframe src="${matricula.contrato_url}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%; position:absolute;" allowfullscreen></iframe>`);
        pdfWindow.document.close();
    } else {
        mostrarAlerta('O bloqueador de pop-ups impediu a abertura do contrato.');
    }
}

async function darBaixaParcelaModal(parcelaId, btnElement) {
    const hoje = new Date().toISOString().split('T')[0];
    const { error } = await db
        .from('financeiro')
        .update({ paga: true, data_pagamento: hoje })
        .eq('id', parcelaId);

    if (error) {
        mostrarAlerta(`Erro ao dar baixa: ${error.message}`);
        return;
    }

    // Sincroniza com a tabela pagamentos
    if (alunoEditando && alunoEditando.financeiro) {
        const parcela = alunoEditando.financeiro.find(p => p.id === parcelaId);
        if (parcela) {
            const valorParcela = parcela.valor || 0;
            const nomeCurso = alunoEditando.curso_nome || 'Curso';

            const { error: erroPag } = await db.from('pagamentos').insert({
                aluno_id: alunoEditando.id,
                curso_id: alunoEditando.curso_id || null,
                valor_pago: valorParcela,
                forma_pagamento: 'Boleto',
                data_pagamento: hoje,
                status: 'Pago',
                observacao: `Baixa de parcela referente a ${nomeCurso}`,
                criado_por: usuarioLogado ? usuarioLogado.id : null
            });

            if (erroPag) {
                console.error('Erro ao registrar pagamento na baixa:', erroPag);
            } else if (typeof carregarPagamentos === 'function') {
                await carregarPagamentos();
            }
        }
    }

    // Atualiza o card visualmente sem recarregar toda a modal
    const card = btnElement ? btnElement.closest('.parcela-card') : null;
    if (card) {
        const badge = card.querySelector('.badge');
        if (badge) {
            badge.className = 'badge badge-pago';
            badge.textContent = 'Pago';
        }
        btnElement.remove();
    }

    await atualizarDashboard();
}

// ==================== DIÁRIO DE CLASSE ====================
async function carregarAlunosDiario() {
    try {
        const tbody = document.getElementById('lista-diario');
        const filtroCursoEl = document.getElementById('curso-diario');
        if (!tbody) return;

        let query = db
            .from('matriculas')
            .select('*, alunos(nome, cpf, ra), cursos(nome)')
            .order('alunos(nome)');

        const filtroCurso = filtroCursoEl ? filtroCursoEl.value : '';
        if (filtroCurso) query = query.eq('curso_id', filtroCurso);

        const { data: matriculas, error } = await query;

        if (error) throw error;

        const listaMatriculas = matriculas || [];

        tbody.innerHTML = '';

        const filtroTurmaEl = document.getElementById('turma-diario');
        const filtroTurma = filtroTurmaEl ? filtroTurmaEl.value.toLowerCase() : '';

        const filtrados = filtroTurma
            ? listaMatriculas.filter(m => {
                const nomeTurma = m.turma ? m.turma.toLowerCase() : '';
                const nomeAluno = (m.alunos && m.alunos.nome) ? m.alunos.nome.toLowerCase() : '';
                const raAluno = (m.alunos && m.alunos.ra) ? String(m.alunos.ra) : '';
                return nomeTurma.includes(filtroTurma) || nomeAluno.includes(filtroTurma) || raAluno.includes(filtroTurma);
            })
            : listaMatriculas;

        filtrados.forEach(m => {
            const nomeAluno = m.alunos ? m.alunos.nome : '-';
            const nomeCurso = m.cursos ? m.cursos.nome : '-';

            const n1 = m.nota1 !== null && m.nota1 !== undefined ? m.nota1 : null;
            const n2 = m.nota2 !== null && m.nota2 !== undefined ? m.nota2 : null;
            const media = m.media !== null && m.media !== undefined ? m.media : null;

            // Status: Aprovado (≥7) ou Reprovado (<7). "Em Recuperação" foi descontinuado.
            const status = media !== null ? (media >= 7 ? 'Aprovado' : 'Reprovado') : '-';
            const badgeClass = media !== null ? (media >= 7 ? 'badge-aprovado' : 'badge-reprovado') : '';

            // Exibe o RA da matrícula (composto) ou o RA legado do aluno
            const raExibido = m.ra || (m.alunos && m.alunos.ra) || '-';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${nomeAluno}<br><span style="font-size:0.78em; color:var(--txt-light); font-family:monospace;">RA: ${raExibido}</span></td>
                <td>${nomeCurso}</td>
                <td>${m.codigo_turma || m.turma || '-'}</td>
                <td>${n1 !== null ? n1 : '-'}</td>
                <td>${n2 !== null ? n2 : '-'}</td>
                <td><strong>${media !== null ? parseFloat(media).toFixed(1) : '-'}</strong></td>
                <td>${media !== null ? `<span class="badge ${badgeClass}">${status}</span>` : '-'}</td>
                <td>
                    <button type="button" class="btn-action" onclick="abrirModalNotas('${m.id}', '${nomeAluno.replace(/'/g, "\\'")}', '${nomeCurso.replace(/'/g, "\\'")}')">Lançar Notas</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        console.error('Erro geral ao carregar alunos no diário:', e);
    }
}

async function abrirModalNotas(matriculaId, nomeAluno, nomeCurso) {
    // Busca o registro de matrícula
    const { data: matricula } = await db
        .from('matriculas')
        .select('nota1, nota2')
        .eq('id', matriculaId)
        .single();

    alunoNotasId = matriculaId; // Mantendo o mesmo nome de variável por legado para evitar crashes em outros lugares que possam usá-la
    document.getElementById('aluno-id-notas').value = matriculaId;

    // Atualiza subtítulo do modal
    const subtitle = document.getElementById('notas-aluno-curso-subtitle');
    if (subtitle) {
        subtitle.innerHTML = `<strong>Aluno:</strong> ${nomeAluno} &nbsp;|&nbsp; <strong>Curso:</strong> ${nomeCurso}`;
    }

    document.getElementById('nota1-input').value = matricula && matricula.nota1 !== null ? matricula.nota1 : '';
    document.getElementById('nota2-input').value = matricula && matricula.nota2 !== null ? matricula.nota2 : '';

    // Exibe o botão "Limpar Notas" APENAS para usuários com perfil de Secretaria
    const btnLimpar = document.getElementById('btn-limpar-notas');
    if (btnLimpar) {
        const isSecretaria = usuarioLogado && usuarioLogado.tipo === 'secretaria';
        btnLimpar.style.display = isSecretaria ? 'inline-flex' : 'none';
    }

    document.getElementById('modal-notas').classList.add('active');
}

function fecharModalNotas() {
    document.getElementById('modal-notas').classList.remove('active');
    alunoNotasId = null;
}

async function salvarNotasModal() {
    if (alunoNotasId === null) return; // Aqui alunoNotasId armazena o ID da Matrícula

    const nota1Str = document.getElementById('nota1-input').value.trim();
    const nota2Str = document.getElementById('nota2-input').value.trim();

    // Campos vazios são convertidos para null (não para 0)
    const n1 = nota1Str !== '' ? parseFloat(nota1Str) : null;
    const n2 = nota2Str !== '' ? parseFloat(nota2Str) : null;

    // Validação de intervalo somente quando os campos não são nulos
    if (n1 !== null && (isNaN(n1) || n1 < 0 || n1 > 10)) {
        mostrarAlerta('N1 inválido. Insira um valor entre 0 e 10, ou deixe em branco para limpar.');
        return;
    }
    if (n2 !== null && (isNaN(n2) || n2 < 0 || n2 > 10)) {
        mostrarAlerta('N2 inválido. Insira um valor entre 0 e 10, ou deixe em branco para limpar.');
        return;
    }

    // Envia APENAS nota1 e nota2.
    // A coluna `media` é GENERATED ALWAYS AS no PostgreSQL — o banco a calcula
    // automaticamente. Enviá-la causaria: "column media can only be updated to DEFAULT"
    const { error } = await db
        .from('matriculas')
        .update({ nota1: n1, nota2: n2 })
        .eq('id', alunoNotasId);

    if (error) {
        mostrarAlerta(`Erro ao salvar notas: ${error.message}`);
        return;
    }

    fecharModalNotas();
    await carregarAlunosDiario();
    mostrarAlerta(
        n1 === null && n2 === null
            ? 'Notas removidas. Situação do aluno voltou para Pendente.'
            : 'As notas do aluno foram salvas com sucesso!',
        'Sucesso'
    );
}

/**
 * Limpa (reseta) as notas de uma matrícula específica.
 * Exclusivo para Secretaria. Envia nota1: null e nota2: null.
 * NUNCA envia o campo `media` — é GENERATED ALWAYS no PostgreSQL.
 */
async function limparNotasModal() {
    if (alunoNotasId === null) return;

    // Guarda seguro: apenas secretaria pode executar esta ação
    if (!usuarioLogado || usuarioLogado.tipo !== 'secretaria') {
        mostrarAlerta('Acesso negado. Apenas a Secretaria pode limpar notas.');
        return;
    }

    // Usa o modal de confirmação customizado do sistema (sem window.confirm nativo)
    mostrarConfirmacao(
        'N1 e N2 serão apagadas e a média voltará para "pendente". Esta ação não pode ser desfeita.',
        async () => {
            // Envia APENAS nota1 e nota2 como null.
            // NÃO enviar `media` — é coluna GENERATED ALWAYS.
            const { error } = await db
                .from('matriculas')
                .update({ nota1: null, nota2: null })
                .eq('id', alunoNotasId);

            if (error) {
                mostrarAlerta(`Erro ao limpar notas: ${error.message}`);
                return;
            }

            fecharModalNotas();
            await carregarAlunosDiario();
            mostrarAlerta('Notas removidas com sucesso. Situação voltou para Pendente.', 'Sucesso');
        },
        'Limpar Notas do Aluno',
        '🗑️ Sim, Limpar'
    );
}


// ==================== DASHBOARD ====================
async function atualizarDashboard() {
    const { count: totalAlunos } = await db
        .from('alunos')
        .select('*', { count: 'exact', head: true });

    const { count: totalCursos } = await db
        .from('cursos')
        .select('*', { count: 'exact', head: true });

    const totalAlunosEl = document.getElementById('total-alunos');
    const totalCursosEl = document.getElementById('total-cursos');
    if (totalAlunosEl) totalAlunosEl.textContent = totalAlunos ?? 0;
    if (totalCursosEl) totalCursosEl.textContent = totalCursos ?? 0;

    // Estatísticas financeiras são exclusivas da Secretaria
    if (usuarioLogado && usuarioLogado.tipo === 'secretaria') {
        const { count: pendentes } = await db
            .from('financeiro')
            .select('*', { count: 'exact', head: true })
            .eq('paga', false);

        const { count: pagas } = await db
            .from('financeiro')
            .select('*', { count: 'exact', head: true })
            .eq('paga', true);

        const parcelasPendentesEl = document.getElementById('parcelas-pendentes');
        const parcelasPagasEl = document.getElementById('parcelas-pagas');
        if (parcelasPendentesEl) parcelasPendentesEl.textContent = pendentes ?? 0;
        if (parcelasPagasEl) parcelasPagasEl.textContent = pagas ?? 0;

        // Total recebido via tabela pagamentos
        const { data: pgtos } = await db
            .from('pagamentos')
            .select('valor_pago')
            .eq('status', 'Pago');

        const totalRecebido = (pgtos || []).reduce((sum, p) => sum + parseFloat(p.valor_pago || 0), 0);
        const totalRecebidoEl = document.getElementById('total-recebido');
        if (totalRecebidoEl) {
            totalRecebidoEl.textContent = `R$ ${totalRecebido.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }
    }
}

// ==================== MÓDULO FINANCEIRO ====================

/**
 * Carrega todos os pagamentos do Supabase e renderiza a tabela.
 * Também atualiza os cards de resumo.
 */
async function carregarFinanceiro() {
    // Mostra estado de carregamento na tabela
    const tbody = document.getElementById('lista-pagamentos');
    const emptyMsg = document.getElementById('fin-empty-msg');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align:center; padding:32px; color:var(--txt-light);">
                    <span class="spinner" style="display:inline-block; margin-right:10px;"></span>
                    Carregando pagamentos...
                </td>
            </tr>`;
    }
    if (emptyMsg) emptyMsg.style.display = 'none';

    try {
        // pagamentos: JOIN matriculas→cursos para nome e RA corretos por registro.
        // Fallback via curso_id→cursos(nome) para pagamentos sem matricula_id.
        const { data: pagamentos, error: errPag } = await db
            .from('pagamentos')
            .select('*, alunos(nome), matriculas(id, ra, cursos(nome)), cursos(nome)');

        if (errPag) throw errPag;

        const pagamentosNormalizados = (pagamentos || []).map(p => {
            // Prioridade: curso via matricula vinculada (mais preciso)
            // Fallback: cursos direto via curso_id (para registros antigos sem matricula_id)
            const mat = Array.isArray(p.matriculas) ? p.matriculas[0] : p.matriculas;
            const nomeCurso = mat?.cursos?.nome || p.cursos?.nome || '-';
            const raMatricula = mat?.ra || null;

            return {
                ...p,
                _tabela: 'pagamentos',
                _ra:     raMatricula,
                cursos:  { nome: nomeCurso }
            };
        });

        // boletos: lê curso_id e matricula_id para resolver nome do curso correto
        const { data: boletos, error: errBol } = await db
            .from('financeiro')
            .select('*, alunos(nome), matriculas(ra, cursos(nome)), cursos(nome)');

        if (errBol) throw errBol;

        const hoje = new Date().toISOString().split('T')[0];

        const boletosNormalizados = (boletos || []).map(b => {
            let statusBol = b.paga ? 'Pago' : (b.vencimento < hoje ? 'Atrasado' : 'Pendente');

            const mat = Array.isArray(b.matriculas) ? b.matriculas[0] : b.matriculas;
            // Prioridade: nome via matricula→cursos (preciso) → cursos direto → campo legado
            const nomeCurso = mat?.cursos?.nome || b.cursos?.nome || b.alunos?.curso_nome || '-';
            const raMatricula = mat?.ra || null;

            return {
                id:              b.id,
                _tabela:         'financeiro',
                aluno_id:        b.aluno_id,
                valor_pago:      b.valor,
                forma_pagamento: 'Boleto',
                data_pagamento:  b.vencimento,
                status:          statusBol,
                observacao:      `Parcela ${b.numero_parcela}/${b.total_parcelas}`,
                alunos:          { nome: b.alunos?.nome },
                cursos:          { nome: nomeCurso },
                _ra:             raMatricula
            };
        });

        const unificado = [...pagamentosNormalizados, ...boletosNormalizados];
        unificado.sort((a, b) => new Date(b.data_pagamento) - new Date(a.data_pagamento));

        pagamentosCache = unificado;
        atualizarCardsPagamentos(pagamentosCache);
        renderizarTabelaPagamentos(pagamentosCache);
    } catch (e) {
        console.error('Erro ao carregar pagamentos:', e);
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align:center; padding:32px; color:var(--vermelho);">
                        ⚠️ Erro ao carregar pagamentos: ${e.message}
                    </td>
                </tr>`;
        }
    }
}

/**
 * Atualiza os cards de resumo financeiro.
 */
function atualizarCardsPagamentos(lista) {
    const somentePagos = lista.filter(p => p.status === 'Pago');
    const totalRecebido = somentePagos.reduce((s, p) => s + parseFloat(p.valor_pago || 0), 0);
    const totalPix = somentePagos.filter(p => p.forma_pagamento === 'Pix').reduce((s, p) => s + parseFloat(p.valor_pago || 0), 0);
    const totalCartao = somentePagos
        .filter(p => p.forma_pagamento === 'Cartão de Crédito' || p.forma_pagamento === 'Cartão de Débito')
        .reduce((s, p) => s + parseFloat(p.valor_pago || 0), 0);

    const fmt = v => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const el = id => document.getElementById(id);
    if (el('fin-total-recebido')) el('fin-total-recebido').textContent = fmt(totalRecebido);
    if (el('fin-total-count')) el('fin-total-count').textContent = lista.length;
    if (el('fin-total-pix')) el('fin-total-pix').textContent = fmt(totalPix);
    if (el('fin-total-cartao')) el('fin-total-cartao').textContent = fmt(totalCartao);
}

/**
 * Renderiza (ou re-renderiza) a tabela de pagamentos com a lista fornecida.
 */
function renderizarTabelaPagamentos(lista) {
    const tbody = document.getElementById('lista-pagamentos');
    const emptyMsg = document.getElementById('fin-empty-msg');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (lista.length === 0) {
        if (emptyMsg) emptyMsg.style.display = 'block';
        return;
    }
    if (emptyMsg) emptyMsg.style.display = 'none';

    lista.forEach(pag => {
        const nomeAluno = pag.alunos ? pag.alunos.nome : '-';
        const nomeCurso = pag.cursos ? pag.cursos.nome : '-';

        // Tenta resolver o RA da matrícula vinculada ao pagamento
        // pagamentos novos trazem matriculas!left(ra); boletos usam _ra
        const raRaw = pag._ra ?? pag.matriculas?.ra ?? null;
        const raFormatado = raRaw ? formatarRA(raRaw) : null;
        const cursoExibido = raFormatado
            ? `${nomeCurso} <span style="font-family:monospace;font-size:0.78em;color:var(--txt-light);">(RA: ${raFormatado})</span>`
            : nomeCurso;

        const valor = parseFloat(pag.valor_pago || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const data = pag.data_pagamento
            ? (() => { const [y, m, d] = pag.data_pagamento.split('-'); return `${d}/${m}/${y}`; })()
            : '-';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${nomeAluno}</strong></td>
            <td>${cursoExibido}</td>
            <td class="valor-pago-cell">R$ ${valor}</td>
            <td>${getBadgeForma(pag.forma_pagamento)}</td>
            <td>${data}</td>
            <td>${getBadgeStatus(pag.status)}</td>
            <td>${pag.observacao ? `<span title="${pag.observacao}" style="cursor:help">${pag.observacao.length > 30 ? pag.observacao.substring(0, 30) + '...' : pag.observacao}</span>` : '<em style="color:var(--txt-light)">—</em>'}</td>
            <td style="display: flex; gap: 8px; justify-content: flex-start;">
                <button type="button" class="btn-editar" onclick="abrirModalEditarPagamento('${pag.id}', '${pag._tabela || 'pagamentos'}')">Editar</button>
                <button type="button" class="btn-editar" style="background: transparent; color: var(--vermelho); border-color: var(--vermelho);" onclick="estornarPagamento('${pag.id}', '${pag._tabela || 'pagamentos'}')">Estornar</button>
                <button type="button" class="btn-excluir" onclick="excluirPagamento('${pag.id}', '${pag._tabela || 'pagamentos'}')">Apagar</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

/** Retorna badge HTML para forma de pagamento */
function getBadgeForma(forma) {
    const mapa = {
        'Pix': { cls: 'badge-pix', icone: '⚡' },
        'Cartão de Crédito': { cls: 'badge-cartao', icone: '💳' },
        'Cartão de Débito': { cls: 'badge-cartao', icone: '💳' },
        'Boleto': { cls: 'badge-boleto', icone: '🏦' },
        'Dinheiro': { cls: 'badge-dinheiro', icone: '💵' },
        'Transferência': { cls: 'badge-transferencia', icone: '🏛️' }
    };
    const info = mapa[forma] || { cls: '', icone: '' };
    return `<span class="${info.cls}">${info.icone} ${forma || '-'}</span>`;
}

/** Retorna badge HTML para status do pagamento */
function getBadgeStatus(status) {
    const mapa = {
        'Pago': { cls: 'badge-status-pago', icone: '✅' },
        'Pendente': { cls: 'badge-status-pendente', icone: '⏳' },
        'Atrasado': { cls: 'badge-status-atrasado', icone: '🔴' },
        'Cancelado': { cls: 'badge-status-cancelado', icone: '❌' }  // legado
    };
    const info = mapa[status] || { cls: '', icone: '' };
    return `<span class="${info.cls}">${info.icone} ${status || '-'}</span>`;
}

/**
 * Filtra os pagamentos do cache local conforme os campos de filtro.
 */
function filtrarPagamentos() {
    const busca = (document.getElementById('fin-busca')?.value || '').toLowerCase().trim();
    const cursofiltro = document.getElementById('fin-filtro-curso')?.value || '';
    const formafiltro = document.getElementById('fin-filtro-forma')?.value || '';
    const statusfiltro = document.getElementById('fin-filtro-status')?.value || '';

    const filtrados = pagamentosCache.filter(p => {
        const nomeAluno = (p.alunos?.nome || '').toLowerCase();
        const raAluno = p._ra ? String(p._ra) : (p.alunos?.ra ? String(p.alunos.ra) : '');
        // Curso: compara o nome do curso (normalizado) com o valor do filtro
        const nomeCurso = p.cursos?.nome || '';
        const forma = p.forma_pagamento || '';
        const status = p.status || '';

        return (
            (!busca || nomeAluno.includes(busca) || raAluno.includes(busca)) &&
            (!cursofiltro || nomeCurso === cursofiltro) &&
            (!formafiltro || forma === formafiltro) &&
            (!statusfiltro || status === statusfiltro)
        );
    });

    atualizarCardsPagamentos(filtrados);
    renderizarTabelaPagamentos(filtrados);
}

/**
 * Abre o modal de novo pagamento.
 * Popula o select de alunos dinamicamente.
 */
async function abrirModalPagamento() {
    if (!usuarioLogado || usuarioLogado.tipo !== 'secretaria') {
        mostrarAlerta('Acesso negado. Apenas a Secretaria pode registrar pagamentos.');
        return;
    }

    // IMPORTANTE: resetar o form ANTES de popular os selects,
    // pois form.reset() apagaria os options recém-inseridos.
    document.getElementById('form-pagamento').reset();

    // Define data de hoje
    document.getElementById('pag-data').value = new Date().toISOString().split('T')[0];

    // Reseta select de curso
    const selectCurso = document.getElementById('pag-curso');
    selectCurso.innerHTML = '<option value="">Selecione o aluno primeiro</option>';

    // Popula select de alunos com loading
    const selectAluno = document.getElementById('pag-aluno');
    selectAluno.innerHTML = '<option value="" disabled selected>⏳ Carregando alunos...</option>';
    selectAluno.disabled = true;

    const { data: alunos, error } = await db
        .from('alunos')
        .select('id, nome')
        .order('nome');

    selectAluno.disabled = false;

    if (error) {
        selectAluno.innerHTML = '<option value="">⚠️ Erro ao carregar alunos</option>';
        console.error('Erro ao carregar alunos:', error);
    } else {
        selectAluno.innerHTML = '<option value="">Selecione o aluno</option>';
        (alunos || []).forEach(a => {
            const opt = document.createElement('option');
            opt.value = a.id;
            opt.textContent = a.nome;
            selectAluno.add(opt);
        });
    }

    document.getElementById('modal-pagamento').classList.add('active');
}

function fecharModalPagamento() {
    document.getElementById('modal-pagamento').classList.remove('active');
}

/**
 * Ao selecionar um aluno no modal de pagamento,
 * carrega os cursos desse aluno (via tabela matriculas).
 */
async function carregarCursosDoAluno(alunoId) {
    const selectCurso = document.getElementById('pag-curso');
    selectCurso.innerHTML = '<option value="" disabled selected>⏳ Carregando cursos...</option>';
    selectCurso.disabled = true;

    if (!alunoId) {
        selectCurso.innerHTML = '<option value="">Selecione o aluno primeiro</option>';
        selectCurso.disabled = false;
        return;
    }

    // Busca matrículas do aluno na tabela matriculas
    const { data: matriculas, error } = await db
        .from('matriculas')
        .select('curso_id, cursos(nome)')
        .eq('aluno_id', alunoId);

    selectCurso.disabled = false;

    if (error) {
        console.error('Erro ao carregar cursos do aluno:', error);
        selectCurso.innerHTML = '<option value="">⚠️ Erro ao carregar cursos</option>';
        return;
    }

    selectCurso.innerHTML = '<option value="">Sem curso específico</option>';

    if (matriculas && matriculas.length > 0) {
        matriculas.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.curso_id;
            opt.textContent = m.cursos ? m.cursos.nome : m.curso_id;
            selectCurso.add(opt);
        });
    } else {
        // Fallback: busca curso_id direto do aluno (registro legado sem entrada em matriculas)
        const { data: aluno } = await db
            .from('alunos')
            .select('curso_id, curso_nome')
            .eq('id', alunoId)
            .single();
        if (aluno && aluno.curso_id) {
            const opt = document.createElement('option');
            opt.value = aluno.curso_id;
            opt.textContent = aluno.curso_nome || aluno.curso_id;
            selectCurso.add(opt);
        }
    }
}

/**
 * Salva um novo pagamento no Supabase.
 * Desabilita o botão durante o envio para evitar duplo clique.
 */
async function registrarPagamento() {
    const alunoId = document.getElementById('pag-aluno').value;
    const cursoId = document.getElementById('pag-curso').value;
    // Lê o valor do campo mascarado e converte para float
    const valor = parseMoeda(document.getElementById('pag-valor').value);
    const forma = document.getElementById('pag-forma').value;
    const data = document.getElementById('pag-data').value;
    const status = document.getElementById('pag-status').value;
    const obs = document.getElementById('pag-obs').value.trim();

    // Validações
    if (!alunoId) { mostrarAlerta('Selecione um aluno!'); return; }
    if (!forma) { mostrarAlerta('Selecione a forma de pagamento!'); return; }
    if (!data) { mostrarAlerta('Informe a data do pagamento!'); return; }
    if (isNaN(valor) || valor <= 0) { mostrarAlerta('Informe um valor válido (maior que zero)!'); return; }

    // Estado de loading no botão
    const btnSalvar = document.getElementById('btn-salvar-pagamento');
    const textoOriginal = btnSalvar.textContent;
    btnSalvar.disabled = true;
    btnSalvar.innerHTML = '<span class="spinner"></span> Salvando...';

    const { error } = await db.from('pagamentos').insert({
        aluno_id: alunoId,
        curso_id: cursoId || null,
        valor_pago: valor,
        forma_pagamento: forma,
        data_pagamento: data,
        status: status,
        observacao: obs || null,
        criado_por: usuarioLogado.id
    });

    btnSalvar.disabled = false;
    btnSalvar.textContent = textoOriginal;

    if (error) {
        mostrarAlerta(`Erro ao registrar pagamento: ${error.message}`);
        return;
    }

    fecharModalPagamento();
    await carregarFinanceiro();
    await atualizarDashboard();
    mostrarAlerta('Pagamento registrado com sucesso! 💰', 'Sucesso');
}

/**
 * Edição e Estorno de Pagamentos
 */
async function abrirModalEditarPagamento(id, tabela) {
    const pag = pagamentosCache.find(p => p.id === id && (p._tabela || 'pagamentos') === tabela);
    if (!pag) return;

    document.getElementById('edit-pag-id').value = id;
    document.getElementById('edit-pag-tabela').value = tabela;
    document.getElementById('edit-pag-valor').value = parseFloat(pag.valor_pago || 0).toFixed(2);
    
    const selectStatus = document.getElementById('edit-pag-status');
    if (selectStatus) {
        selectStatus.value = pag.status || 'Pendente';
    }

    document.getElementById('modal-editar-pagamento').classList.add('active');
}

function fecharModalEditarPagamento() {
    document.getElementById('modal-editar-pagamento').classList.remove('active');
}

async function salvarEdicaoPagamento() {
    const id = document.getElementById('edit-pag-id').value;
    const tabela = document.getElementById('edit-pag-tabela').value;
    const valor = parseMoeda(document.getElementById('edit-pag-valor').value);
    const statusStr = document.getElementById('edit-pag-status').value;

    const btn = document.getElementById('btn-salvar-pagamento');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '⏳ Salvando...';

    try {
        if (tabela === 'financeiro') {
            const isPago = statusStr === 'Pago';
            // Se for marcado como cancelado na tabela financeiro, a gente marca paga como falso?
            // Vamos deixar paga = false para pendente/atrasado/cancelado.
            const { error } = await db.from('financeiro').update({
                valor: valor,
                paga: isPago
            }).eq('id', id);
            if (error) throw error;
        } else {
            const { error } = await db.from('pagamentos').update({
                valor_pago: valor,
                status: statusStr
            }).eq('id', id);
            if (error) throw error;
        }

        fecharModalEditarPagamento();
        await carregarFinanceiro();
        await atualizarDashboard();
        mostrarAlerta('Pagamento atualizado com sucesso!', 'Sucesso');
    } catch (e) {
        mostrarAlerta(`Erro ao atualizar pagamento: ${e.message}`);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

function estornarPagamento(pagId, tabela) {
    mostrarConfirmacao(
        'Deseja realmente estornar/cancelar este pagamento?',
        async () => {
            try {
                if (tabela === 'financeiro') {
                    // Para parcelas, marcamos paga como false
                    const { error } = await db.from('financeiro').update({ paga: false }).eq('id', pagId);
                    if (error) throw error;
                } else {
                    const { error } = await db.from('pagamentos').update({ status: 'Cancelado' }).eq('id', pagId);
                    if (error) throw error;
                }
                await carregarFinanceiro();
                await atualizarDashboard();
                mostrarAlerta('Pagamento estornado com sucesso!', 'Sucesso');
            } catch (e) {
                mostrarAlerta(`Erro ao estornar pagamento: ${e.message}`);
            }
        }
    );
}

/**
 * Remove um pagamento com confirmação.
 */
function excluirPagamento(pagId, tabela = 'pagamentos') {
    mostrarConfirmacao(
        'Tem certeza que deseja excluir este registro de pagamento? Esta ação não pode ser desfeita.',
        async () => {
            const { error } = await db.from(tabela).delete().eq('id', pagId);
            if (error) {
                mostrarAlerta(`Erro ao excluir pagamento: ${error.message}`);
                return;
            }
            await carregarFinanceiro();
            await atualizarDashboard();
            mostrarAlerta('Pagamento excluído com sucesso!', 'Sucesso');
        }
    );
}

// Backup removido: dados gerenciados pelo Supabase na nuvem.

// ==================== CADASTRO DE PROFESSOR ====================

/**
 * Abre o modal de cadastro de professor.
 * Protegido por permissão: só usuários com tipo 'secretaria' podem usar.
 */
function abrirModalProfessor() {
    if (!usuarioLogado || usuarioLogado.tipo !== 'secretaria') {
        mostrarAlerta('Acesso negado. Apenas usuários da Secretaria podem cadastrar professores.');
        return;
    }
    // Limpa o formulário e feedback ao abrir
    document.getElementById('form-professor').reset();
    ocultarFeedbackProfessor();
    document.getElementById('modal-professor').classList.add('active');
}

function fecharModalProfessor() {
    document.getElementById('modal-professor').classList.remove('active');
    ocultarFeedbackProfessor();
}

// --- Helpers de feedback visual ---
function mostrarFeedbackProfessor(tipo, mensagem) {
    const el = document.getElementById('professor-feedback');
    el.className = `professor-feedback professor-feedback--${tipo}`;
    el.innerHTML = mensagem;
    el.style.display = 'flex';
}

function ocultarFeedbackProfessor() {
    const el = document.getElementById('professor-feedback');
    el.style.display = 'none';
    el.className = 'professor-feedback';
}

/**
 * Cadastra um novo professor:
 * 1. Cria o usuário no Supabase Auth (via signUp com anon key).
 * 2. Salva na tabela public.perfis com tipo = 'professor'.
 *
 * IMPORTANTE: Como o frontend usa a anon key (não a service_role),
 * usamos db.auth.signUp que respeita as políticas de "Allow new users to sign up".
 * O perfil é inserido logo após a criação do usuário.
 */
async function cadastrarProfessor() {
    // 1. Verifica permissão novamente (defesa em profundidade)
    if (!usuarioLogado || usuarioLogado.tipo !== 'secretaria') {
        mostrarAlerta('Acesso negado.');
        return;
    }

    const nome = document.getElementById('prof-nome').value.trim();
    const email = document.getElementById('prof-email').value.trim();
    const senha = document.getElementById('prof-senha').value;

    // 2. Valida campos
    if (!nome || !email || !senha) {
        mostrarFeedbackProfessor('erro', '⚠️ Preencha todos os campos antes de continuar.');
        return;
    }
    if (senha.length < 6) {
        mostrarFeedbackProfessor('erro', '⚠️ A senha deve ter no mínimo 6 caracteres.');
        return;
    }

    // 3. Estado de carregamento
    const btnSalvar = document.getElementById('btn-salvar-professor');
    btnSalvar.disabled = true;
    mostrarFeedbackProfessor('loading',
        '<span class="spinner"></span> Criando conta do professor, aguarde...');

    // 4. Cria usuário no Supabase Auth.
    // nome e tipo são enviados em options.data (raw_user_meta_data) para que
    // a trigger do banco possa lê-los e preencher a tabela public.perfis
    // automaticamente — sem qualquer chamada extra de insert/upsert no JS.
    const { data: authData, error: authError } = await db.auth.signUp({
        email,
        password: senha,
        options: {
            data: {
                nome: nome,
                tipo: 'professor'
            }
        }
    });

    btnSalvar.disabled = false;

    if (authError) {
        // Monta mensagem amigável conforme o tipo de erro
        let mensagem = authError.message;
        if (
            mensagem.includes('already registered') ||
            mensagem.includes('already been registered') ||
            mensagem.includes('User already registered')
        ) {
            mensagem = 'Este e-mail já está cadastrado no sistema. Use outro e-mail.';
        }
        mostrarFeedbackProfessor('erro', `❌ ${mensagem}`);
        return;
    }

    // 5. Verifica se o usuário foi criado ou se aguarda confirmação por e-mail
    if (!authData?.user?.id) {
        // Confirmação por e-mail habilitada no Supabase — o id só fica disponível
        // após o professor clicar no link enviado para a caixa de entrada.
        mostrarFeedbackProfessor('aviso',
            '✉️ Cadastro solicitado! Um e-mail de confirmação foi enviado ao professor. ' +
            'O perfil será criado automaticamente após a confirmação.');
        return;
    }

    // 6. Sucesso — a trigger do banco já cuidou do perfil
    mostrarFeedbackProfessor('sucesso',
        `✅ Professor <strong>${nome}</strong> cadastrado com sucesso! ` +
        `O acesso está pronto com o e-mail <strong>${email}</strong>.`);

    // Limpa o formulário e fecha o modal automaticamente após 3 segundos
    document.getElementById('form-professor').reset();
    setTimeout(() => {
        fecharModalProfessor();
    }, 3000);
}

// ==================== EVENT LISTENERS ====================
function configurarEventos() {
    const btnLogin = document.getElementById('btn-login');
    if (btnLogin) btnLogin.addEventListener('click', verificarLogin);

    const btnSair = document.getElementById('sair');
    if (btnSair) btnSair.addEventListener('click', sairSistema);

    const btnSalvarCurso = document.getElementById('btn-salvar-curso');
    if (btnSalvarCurso) btnSalvarCurso.addEventListener('click', salvarCurso);

    const btnSalvarDisciplina = document.getElementById('btn-salvar-disciplina');
    if (btnSalvarDisciplina) btnSalvarDisciplina.addEventListener('click', salvarDisciplina);

    const btnMatricular = document.getElementById('btn-matricular');
    if (btnMatricular) btnMatricular.addEventListener('click', matricularAluno);

    // --- Auto-fill por CPF ---
    // Dispara SEMPRE no blur (ao sair do campo), sem restricao de tamanho.
    // O listener de `input` foi removido pois causava disparos prematuros e
    // a busca dupla dentro de buscarAlunoPorCpf() ja cobre todos os formatos.
    const cpfInput = document.getElementById('cpf-aluno');
    if (cpfInput) {
        cpfInput.addEventListener('blur', buscarAlunoPorCpf);
    }

    const btnSalvarAviso = document.getElementById('btn-salvar-aviso');
    if (btnSalvarAviso) btnSalvarAviso.addEventListener('click', salvarAviso);

    const btnVincular = document.getElementById('btn-vincular-professor');
    if (btnVincular && typeof vincularProfessor === 'function') {
        btnVincular.addEventListener('click', vincularProfessor);
    }

    const radiosTipoAviso = document.querySelectorAll('input[name="tipo-aviso"]');
    radiosTipoAviso.forEach(radio => {
        radio.addEventListener('change', (e) => {
            const isTurma = e.target.value === 'turma';
            const inputRa = document.getElementById('aviso-ra');
            const selectTurma = document.getElementById('aviso-turma');
            const labelDestino = document.getElementById('label-aviso-destino');

            if (isTurma) {
                if (inputRa) inputRa.style.display = 'none';
                if (inputRa) inputRa.required = false;
                if (selectTurma) selectTurma.style.display = 'block';
                if (selectTurma) selectTurma.required = true;
                if (labelDestino) labelDestino.textContent = 'Turma Destino:';
            } else {
                if (inputRa) inputRa.style.display = 'block';
                if (inputRa) inputRa.required = true;
                if (selectTurma) selectTurma.style.display = 'none';
                if (selectTurma) selectTurma.required = false;
                if (labelDestino) labelDestino.textContent = 'RA do Aluno Destino:';
            }
        });
    });

    document.getElementById('forma-pagamento')?.addEventListener('change', function () {
        const containerParcelas = document.getElementById('parcelas-container');
        const containerMetodo = document.getElementById('metodo-pagamento-container');
        if (containerParcelas) containerParcelas.style.display = this.value === 'parcelado' ? 'flex' : 'none';
        if (containerMetodo) containerMetodo.style.display = this.value === 'a-vista' ? 'flex' : 'none';
    });

    document.getElementById('curso-crm')?.addEventListener('change', carregarAlunos);
    document.getElementById('turma-crm')?.addEventListener('input', carregarAlunos);

    document.getElementById('curso-diario')?.addEventListener('change', carregarAlunosDiario);
    document.getElementById('turma-diario')?.addEventListener('input', carregarAlunosDiario);

    document.getElementById('btn-salvar-edicao')?.addEventListener('click', salvarEdicaoAluno);

    document.getElementById('btn-confirmar-action')?.addEventListener('click', confirmarAcao);

    document.getElementById('password')?.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') verificarLogin();
    });

    // --- Modal de Professor ---
    document.getElementById('btn-abrir-modal-professor')?.addEventListener('click', abrirModalProfessor);
    document.getElementById('btn-salvar-professor')?.addEventListener('click', cadastrarProfessor);

    // Toggle mostrar/ocultar senha
    document.getElementById('btn-toggle-senha')?.addEventListener('click', function () {
        const input = document.getElementById('prof-senha');
        if (input.type === 'password') {
            input.type = 'text';
            this.textContent = '🙈';
        } else {
            input.type = 'password';
            this.textContent = '👁';
        }
    });

    // --- Módulo Financeiro ---
    document.getElementById('btn-novo-pagamento')?.addEventListener('click', abrirModalPagamento);
    document.getElementById('btn-salvar-pagamento')?.addEventListener('click', registrarPagamento);

    // Ao selecionar aluno no modal de pagamento, filtra cursos
    document.getElementById('pag-aluno')?.addEventListener('change', function () {
        carregarCursosDoAluno(this.value);
    });

    // Filtros do módulo financeiro (reage ao digitar/alterar)
    document.getElementById('fin-busca')?.addEventListener('input', filtrarPagamentos);
    document.getElementById('fin-filtro-curso')?.addEventListener('change', filtrarPagamentos);
    document.getElementById('fin-filtro-forma')?.addEventListener('change', filtrarPagamentos);
    document.getElementById('fin-filtro-status')?.addEventListener('change', filtrarPagamentos);

    // --- Múltiplos Cursos e Máscara de moeda --- 
    document.getElementById('btn-add-curso')?.addEventListener('click', adicionarLinhaCurso);
    document.querySelector('.valor-input')?.addEventListener('input', function () {
        aplicarMascaraMoeda(this);
    });

    // Listener: quando o curso muda no primeiro entry, filtra turmas
    const primeiroCursoSelect = document.querySelector('.curso-select');
    const primeiroTurmaSelect = document.querySelector('.turma-select');
    primeiroCursoSelect?.addEventListener('change', function () {
        popularTurmaSelect(primeiroTurmaSelect, this.value);
    });

    // Listener: forma de pagamento do primeiro entry
    const primeiroEntry = document.querySelector('.curso-entry');
    if (primeiroEntry) {
        configurarListenersEntry(primeiroEntry);
    }

    // --- Gestão de Turmas ---
    document.getElementById('btn-salvar-turma')?.addEventListener('click', salvarTurma);

    // Campo "Valor" no modal de pagamento
    document.getElementById('pag-valor')?.addEventListener('input', function () {
        aplicarMascaraMoeda(this);
    });
}

function configurarListenersEntry(entry) {
    // Listener: forma-pagamento-select alterna os campos visíveis
    const fpSel = entry.querySelector('.forma-pagamento-select');
    if (fpSel) {
        fpSel.addEventListener('change', function () {
            const isParcelado = this.value === 'parcelado';
            const ataContainer = entry.querySelector('.metodo-avista-container');
            const parContainer = entry.querySelector('.metodo-parcelado-container');
            const numContainer = entry.querySelector('.numero-parcelas-container');
            if (ataContainer) ataContainer.style.display = isParcelado ? 'none' : '';
            if (parContainer) parContainer.style.display = isParcelado ? '' : 'none';
            if (numContainer) numContainer.style.display = isParcelado ? '' : 'none';
        });
    }
}

function adicionarLinhaCurso() {
    const container = document.getElementById('cursos-container');
    const template = container.querySelector('.curso-entry').cloneNode(true);

    // Reseta valores
    const cursoSel = template.querySelector('.curso-select');
    if (cursoSel) cursoSel.value = '';

    // Reseta e re-popula o turma-select
    const turmaSel = template.querySelector('.turma-select');
    popularTurmaSelect(turmaSel, null);

    // Reseta campos de pagamento
    const fpSel2 = template.querySelector('.forma-pagamento-select');
    if (fpSel2) fpSel2.value = 'a-vista';
    template.querySelector('.metodo-avista-container')?.style.setProperty('display', '');
    template.querySelector('.metodo-parcelado-container')?.style.setProperty('display', 'none');
    template.querySelector('.numero-parcelas-container')?.style.setProperty('display', 'none');

    // Reseta valor e máscara
    const valorInput = template.querySelector('.valor-input');
    valorInput.value = '';
    valorInput.addEventListener('input', function () {
        aplicarMascaraMoeda(this);
    });

    // Reseta contrato
    const contratoInput = template.querySelector('.contrato-input');
    if (contratoInput) contratoInput.value = '';

    // Listeners: curso → filtrar turmas
    cursoSel?.addEventListener('change', function () {
        popularTurmaSelect(turmaSel, this.value);
    });

    // Listeners: forma de pagamento
    configurarListenersEntry(template);

    // Botão de remover
    const btnRemover = document.createElement('button');
    btnRemover.type = 'button';
    btnRemover.textContent = '🗑️ Remover este curso';
    btnRemover.style.cssText = 'margin-top: 8px; background: transparent; border: 1px dashed var(--borda); border-radius: var(--r-sm); color: var(--txt-mid); cursor: pointer; font-size: 0.82em; font-weight: 600; padding: 6px 14px; transition: var(--t-fast);';
    btnRemover.onmouseover = () => { btnRemover.style.color = 'var(--vermelho)'; btnRemover.style.borderColor = 'var(--vermelho)'; };
    btnRemover.onmouseout  = () => { btnRemover.style.color = 'var(--txt-mid)'; btnRemover.style.borderColor = 'var(--borda)'; };
    btnRemover.onclick = () => template.remove();
    template.appendChild(btnRemover);

    container.appendChild(template);
}

// ==================== DISPARO DE AVISOS ====================
async function salvarAviso() {
    const btn = document.getElementById('btn-salvar-aviso');
    const originalText = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '⏳ Disparando...';
    }

    try {
        const titulo = document.getElementById('aviso-titulo').value.trim();
        const mensagem = document.getElementById('aviso-mensagem').value.trim();

        const tipoRadio = document.querySelector('input[name="tipo-aviso"]:checked');
        const tipo = tipoRadio ? tipoRadio.value : 'aluno';

        if (!titulo || !mensagem) {
            throw new Error('Por favor, preencha o título e a mensagem.');
        }

        if (tipo === 'aluno') {
            const aluno_ra = document.getElementById('aviso-ra').value.trim();
            if (!aluno_ra) throw new Error('Por favor, informe o RA do aluno.');

            const { error } = await db.from('avisos').insert({
                titulo,
                aluno_ra,
                mensagem,
                autor: usuarioLogado ? usuarioLogado.id : null
            });
            if (error) throw error;
            mostrarToastAdmin('Aviso disparado com sucesso para o aluno!', 'sucesso');

        } else {
            const turma = document.getElementById('aviso-turma').value;
            if (!turma) throw new Error('Por favor, selecione uma turma.');

            // Busca os alunos da turma
            const { data: alunos, error: errMat } = await db.from('alunos')
                .select('ra, matriculas!inner(id)')
                .eq('matriculas.turma', turma);

            if (errMat) throw errMat;

            if (!alunos || alunos.length === 0) {
                throw new Error('Nenhum aluno encontrado nesta turma.');
            }

            // Extrai e filtra RAs válidos
            const rasUnicos = [...new Set(alunos.map(a => a.ra).filter(Boolean))];

            if (rasUnicos.length === 0) {
                throw new Error('Os alunos desta turma não possuem RA válido.');
            }

            const avisosLote = rasUnicos.map(ra => ({
                titulo,
                aluno_ra: String(ra),
                mensagem,
                autor: usuarioLogado ? usuarioLogado.id : null
            }));

            const { error: errInsert } = await db.from('avisos').insert(avisosLote);
            if (errInsert) throw errInsert;

            mostrarToastAdmin(`Aviso enviado para ${rasUnicos.length} alunos da turma ${turma}!`, 'sucesso');
        }

        document.getElementById('form-aviso').reset();

        // Reseta UI de destino
        document.getElementById('aviso-ra').style.display = 'block';
        document.getElementById('aviso-ra').required = true;
        document.getElementById('aviso-turma').style.display = 'none';
        document.getElementById('aviso-turma').required = false;
        document.getElementById('label-aviso-destino').textContent = 'RA do Aluno Destino:';

    } catch (e) {
        console.error('Erro ao disparar aviso:', e);
        mostrarToastAdmin('Erro ao disparar aviso: ' + e.message, 'erro');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }
}

// Helper para Toast no Admin
function mostrarToastAdmin(mensagem, tipo = 'sucesso') {
    let container = document.getElementById('toast-container-admin');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container-admin';
        container.style.position = 'fixed';
        container.style.bottom = '30px';
        container.style.right = '30px';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.gap = '10px';
        container.style.zIndex = '999999';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${tipo}`;
    toast.style.background = 'white';
    toast.style.padding = '15px 25px';
    toast.style.borderRadius = '8px';
    toast.style.boxShadow = '0 4px 15px rgba(0,0,0,0.1)';
    toast.style.display = 'flex';
    toast.style.alignItems = 'center';
    toast.style.gap = '12px';
    toast.style.borderLeft = `5px solid ${tipo === 'sucesso' ? '#28a745' : '#dc3545'}`;
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.4s ease';

    const icon = tipo === 'sucesso'
        ? '<span style="color: #28a745; font-size: 1.5em;">✔</span>'
        : '<span style="color: #dc3545; font-size: 1.5em;">⚠</span>';

    toast.innerHTML = `
        ${icon}
        <span style="font-weight: 500; font-size: 0.95em; color: #333;">${mensagem}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(0)';
    }, 10);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 400);
    }, 4000);
}

// ==================== VINCULAR PROFESSOR ====================
async function carregarOpcoesVinculo() {
    try {
        const { data: professores, error: errProf } = await db.from('perfis').select('id, nome').eq('tipo', 'professor');
        if (errProf) throw errProf;

        const selectProf = document.getElementById('vinculo-professor');
        if (selectProf) {
            selectProf.innerHTML = '<option value="">Selecione um professor</option>' +
                (professores || []).map(p => `<option value="${p.id}">${p.nome}</option>`).join('');
        }

        const { data: cursos, error: errCursos } = await db.from('cursos').select('id, nome');
        if (errCursos) throw errCursos;

        const selectCurso = document.getElementById('vinculo-curso');
        if (selectCurso) {
            selectCurso.innerHTML = '<option value="">Selecione um curso</option>' +
                (cursos || []).map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
        }
    } catch (e) {
        console.error("Erro ao carregar opções de vínculo:", e);
    }
}

async function vincularProfessor() {
    const btn = document.getElementById('btn-vincular-professor');
    if (!btn) return;

    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '⏳ Vinculando...';

    try {
        const professorId = document.getElementById('vinculo-professor')?.value;
        const cursoId = document.getElementById('vinculo-curso')?.value;
        const turmaInput = document.getElementById('vinculo-turma');
        const turma = turmaInput ? turmaInput.value.trim() : '';

        if (!professorId || !cursoId) {
            throw new Error("Selecione o professor e o curso.");
        }

        let query = db.from('turma_professores')
            .select('id')
            .eq('professor_id', professorId)
            .eq('curso_id', cursoId);

        if (turma) {
            query = query.eq('turma_nome', turma);
        } else {
            query = query.is('turma_nome', null);
        }

        const { data: existente, error: errCheck } = await query.maybeSingle();

        if (errCheck) throw new Error(`Erro ao verificar vínculo: ${errCheck.message}`);
        if (existente) throw new Error("Esse professor já está vinculado a essa turma/curso.");

        const { error } = await db.from('turma_professores').insert({
            professor_id: professorId,
            curso_id: cursoId,
            turma_nome: turma || null
        });

        if (error) throw new Error(`Erro de conexão ao salvar: ${error.message}`);

        mostrarToastAdmin("Professor vinculado com sucesso!", "sucesso");
        const formVinculo = document.getElementById('form-vinculo-professor');
        if (formVinculo) formVinculo.reset();
        await carregarVinculos();
    } catch (e) {
        console.error("Erro ao vincular:", e);
        mostrarToastAdmin(e.message, "erro");
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

async function carregarVinculos() {
    try {
        const { data, error } = await db
            .from('turma_professores')
            .select(`
                id,
                turma_nome,
                perfis (nome),
                cursos (nome)
            `);

        if (error) throw error;

        const tbody = document.getElementById('lista-vinculos-professores');
        if (!tbody) return;

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--txt-mid);">Nenhum vínculo encontrado.</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(v => {
            const prof = v.perfis ? v.perfis.nome : '-';
            const curso = v.cursos ? v.cursos.nome : '-';
            const turma = v.turma_nome || 'Todas as Turmas';
            return `
                <tr>
                    <td>${prof}</td>
                    <td>${curso}</td>
                    <td>${turma}</td>
                    <td>
                        <button class="btn-action" style="background: var(--vermelho); color: white;" onclick="removerVinculo('${v.id}')">Remover</button>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (e) {
        console.error("Erro ao carregar vínculos:", e);
        const tbody = document.getElementById('lista-vinculos-professores');
        if (tbody) tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--vermelho);">Erro ao carregar vínculos.</td></tr>';
    }
}

window.removerVinculo = async function (id) {
    if (!confirm('Deseja realmente remover este vínculo?')) return;

    try {
        const { error } = await db.from('turma_professores').delete().eq('id', id);
        if (error) throw error;

        mostrarToastAdmin("Vínculo removido com sucesso!", "sucesso");
        await carregarVinculos();
    } catch (e) {
        console.error("Erro ao remover vínculo:", e);
        mostrarToastAdmin("Erro ao remover vínculo: " + e.message, "erro");
    }
}

// ==================== CARREGAR TURMAS ====================
async function carregarTurmasDisponiveis() {
    try {
        // Usa a tabela turmas como fonte única de verdade
        const { data, error } = await db
            .from('turmas')
            .select('id, nome, codigo_turma, cursos(nome)')
            .order('nome');

        if (error) throw error;

        const turmasDisponiveis = data || [];

        const toOption = t =>
            `<option value="${t.id}">${t.nome} — ${t.cursos ? t.cursos.nome : ''} (${t.codigo_turma})</option>`;

        // Preenche o Select de Vínculos de Professor
        const selectVinculo = document.getElementById('vinculo-turma');
        if (selectVinculo) {
            selectVinculo.innerHTML = '<option value="">Todas as Turmas (Geral)</option>' +
                turmasDisponiveis.map(toOption).join('');
        }

        // Preenche o Select de Disparo de Avisos
        const selectAviso = document.getElementById('aviso-turma');
        if (selectAviso) {
            selectAviso.innerHTML = '<option value="">Selecione a Turma</option>' +
                turmasDisponiveis.map(toOption).join('');
        }
    } catch (e) {
        console.error('Erro ao carregar turmas disponíveis:', e);
    }
}

// ==========================================
// CACHE PARA FILTROS DE CONTRATOS E CERTIFICADOS
// ==========================================
let contratosCache = [];
let certificadosCache = [];

/**
 * Função genérica de filtro em tempo real para tabelas de Contratos e Certificados.
 * @param {string} cacheKey - 'contratos-data' | 'certificados-data'
 * @param {string} busca - texto do campo de busca
 * @param {string} tbodyId - id do tbody na página
 */
function filtrarTabela(cacheKey, busca, tbodyId) {
    const lista = cacheKey === 'contratos-data' ? contratosCache : certificadosCache;
    const tbody = document.getElementById(tbodyId);
    if (!tbody || !lista) return;

    const termo = busca.toLowerCase().trim();
    const filtrados = lista.filter(item => {
        const nome = (item._nomeAluno || '').toLowerCase();
        const ra = String(item._raAluno || '').toLowerCase();
        const cpf = String(item._cpfAluno || '').toLowerCase();
        const curso = (item._nomeCurso || '').toLowerCase();
        return !termo || nome.includes(termo) || ra.includes(termo) || cpf.includes(termo) || curso.includes(termo);
    });

    if (filtrados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: var(--txt-light); padding: 24px;">Nenhum resultado para "${busca}".</td></tr>`;
        return;
    }

    // Re-renderiza as linhas filtradas
    tbody.innerHTML = '';
    filtrados.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = item._htmlRow;
        tbody.appendChild(tr);
    });
}

// ==========================================
// 1. MÓDULO DE CERTIFICADOS
// ==========================================
async function carregarCertificados() {
    const tbody = document.getElementById('lista-certificados');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 24px;">Carregando certificados...</td></tr>';
    certificadosCache = [];

    try {
        const { data: matriculas, error } = await db
            .from('matriculas')
            .select(`
                id,
                status_conclusao,
                certificado_url,
                cursos ( nome, duracao ),
                alunos ( id, nome, ra, cpf )
            `);
            // Nota: matriculas não tem coluna created_at — ordenamos pelo id (desc) no cliente

        if (error) throw error;

        // Ordena decrescente por id (substitui .order('created_at') que não existe na tabela)
        const sortedMatriculas = (matriculas || []).sort((a, b) => b.id > a.id ? 1 : -1);

        tbody.innerHTML = '';

        if (sortedMatriculas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color: var(--txt-mid); padding: 24px;">Nenhuma matrícula encontrada.</td></tr>';
            return;
        }

        sortedMatriculas.forEach(m => {

            const aluno = Array.isArray(m.alunos) ? m.alunos[0] : m.alunos;
            const curso = Array.isArray(m.cursos) ? m.cursos[0] : m.cursos;
            const alunoNome = aluno?.nome ?? 'Aluno não informado';
            const alunoRa = aluno?.ra ?? '-';
            const alunoCpf = aluno?.cpf ?? '';
            const cursoNome = curso?.nome ?? '-';
            const cargaHoraria = curso?.duracao ?? '-';

            const aprovado = m.status_conclusao === 'Aprovado';
            const badgeClasse = m.certificado_url ? 'badge-pago' : (aprovado ? 'badge-azul' : 'badge-pendente');
            const statusTexto = m.certificado_url ? '✅ Emitido' : (aprovado ? '🟡 Pronto p/ Emissão' : '⏳ Aguardando Professor');

            let uploadHtml = '';
            if (m.certificado_url) {
                uploadHtml = `<a href="${m.certificado_url}" target="_blank" class="badge badge-azul" style="text-decoration:none; padding: 6px 12px;">Ver Certificado</a>`;
            } else if (aprovado) {
                uploadHtml = `
                    <div style="display:flex; gap:8px; align-items:center;">
                        <input type="file" accept=".pdf" id="cert-upload-${m.id}" style="font-size: 0.8em; max-width: 160px;">
                        <button type="button" class="btn-action" onclick="enviarCertificado('${m.id}')">Enviar</button>
                    </div>
                `;
            } else {
                uploadHtml = '<span style="color: #64748b; font-size: 0.9em;">Aguardando Validação do Professor</span>';
            }

            const rowHtml = `
                <td>
                    <strong>${alunoNome}</strong><br>
                    <span style="font-size: 0.8em; color: gray;">RA: ${alunoRa}</span>
                </td>
                <td>${cursoNome}</td>
                <td>-</td>
                <td>${cargaHoraria}</td>
                <td><span class="badge ${badgeClasse}">${statusTexto}</span></td>
                <td>${uploadHtml}</td>
            `;

            // Guarda no cache para filtro em tempo real
            certificadosCache.push({
                _nomeAluno: alunoNome,
                _raAluno: alunoRa,
                _cpfAluno: alunoCpf,
                _nomeCurso: cursoNome,
                _htmlRow: rowHtml
            });

            const tr = document.createElement('tr');
            tr.innerHTML = rowHtml;
            tbody.appendChild(tr);
        });

    } catch (e) {
        console.error('Erro ao carregar certificados:', e);
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: red; padding: 24px;">Erro ao carregar certificados: ${e.message}</td></tr>`;
    }
}

// Upload de PDF
window.enviarCertificado = async function (matriculaId) {
    const input = document.getElementById(`cert-upload-${matriculaId}`);
    if (!input || !input.files || input.files.length === 0) {
        mostrarAlerta('Selecione um arquivo PDF válido.');
        return;
    }

    const file = input.files[0];
    const fileName = `${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
    const filePath = `certificados/${matriculaId}_${fileName}`;

    try {
        const { error: uploadError } = await db.storage
            .from('certificados')
            .upload(filePath, file, { upsert: true });

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = db.storage
            .from('certificados')
            .getPublicUrl(filePath);

        const { error: updateError } = await db
            .from('matriculas')
            .update({ certificado_url: publicUrlData.publicUrl })
            .eq('id', matriculaId);

        if (updateError) throw updateError;

        mostrarAlerta('Certificado enviado com sucesso!', 'Sucesso');
        await carregarCertificados();

    } catch (error) {
        console.error('Erro no upload:', error);
        mostrarAlerta(`Erro ao enviar o certificado: ${error.message}`);
    }
};

// ==========================================
// 2. MÓDULO DE CONTRATOS
// ==========================================

/**
 * Formata um timestamp ISO (TIMESTAMPTZ do Supabase) para o padrão brasileiro.
 * Usa Intl.DateTimeFormat nativo — sem dependência externa.
 * @param {string|null} isoString  - Ex: "2026-08-31T18:30:00+00:00"
 * @returns {string}               - Ex: "31/08/2026 às 15:30" (fuso de Brasília)
 */
function formatarDataAssinatura(isoString) {
    if (!isoString) return null;
    try {
        const dt = new Date(isoString);
        if (isNaN(dt.getTime())) return null;

        const formatador = new Intl.DateTimeFormat('pt-BR', {
            day:      '2-digit',
            month:    '2-digit',
            year:     'numeric',
            hour:     '2-digit',
            minute:   '2-digit',
            timeZone: 'America/Sao_Paulo'
        });

        // "31/08/2026, 15:30" → adaptamos para "31/08/2026 às 15:30"
        return formatador.format(dt).replace(', ', ' às ');
    } catch (_) {
        return null;
    }
}

async function carregarContratos() {
    const tbody = document.getElementById('lista-contratos');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 24px;">Carregando contratos...</td></tr>';
    contratosCache = [];

    try {
        const { data: matriculas, error } = await db
            .from('matriculas')
            .select(`
                id,
                contrato_url,
                contrato_assinado,
                data_assinatura_contrato,
                cursos ( nome ),
                alunos ( id, nome, ra, cpf )
            `);
            // Nota: matriculas não tem coluna created_at — sem ordem explícita (usa a default do banco)

        if (error) throw error;
        tbody.innerHTML = '';

        if (!matriculas || matriculas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color: var(--txt-mid); padding: 24px;">Nenhum contrato encontrado.</td></tr>';
            return;
        }

        matriculas.forEach(m => {
            const aluno = Array.isArray(m.alunos) ? m.alunos[0] : m.alunos;
            const curso = Array.isArray(m.cursos) ? m.cursos[0] : m.cursos;
            const alunoNome = aluno?.nome ?? 'Aluno não informado';
            const alunoRaRaw = aluno?.ra ?? null;
            // Aplica a máscara de RA (ex: 250.2500.00001)
            const alunoRaExibido = alunoRaRaw ? formatarRA(alunoRaRaw) : '-';
            const alunoCpf = aluno?.cpf ?? '';
            const cursoNome = curso?.nome ?? '-';

            // Lê o booleano contrato_assinado; só exibe "ASSINADO" se for true
            const assinado = m.contrato_assinado === true;

            // ── Monta a célula de status (badge + carimbo de tempo) ──
            let statusCelulaHtml;
            if (assinado) {
                const dataFormatada = formatarDataAssinatura(m.data_assinatura_contrato);
                statusCelulaHtml = `
                    <div class="contrato-status-assinado">
                        <span class="badge badge-pago contrato-badge-assinado">✅ ASSINADO</span>
                        ${dataFormatada
                            ? `<span class="contrato-timestamp">
                                   <span class="contrato-timestamp-icon">📅</span>
                                   Assinado digitalmente em: <strong>${dataFormatada}</strong>
                               </span>`
                            : `<span class="contrato-timestamp contrato-timestamp-sem-data">
                                   ⚠️ Data não registrada
                               </span>`
                        }
                    </div>`;
            } else {
                statusCelulaHtml = `<span class="badge badge-pendente">⏳ Aguardando Assinatura</span>`;
            }

            const acaoContrato = m.contrato_url
                ? `<button type="button" class="btn-action" onclick="abrirContrato('${m.contrato_url}')">Ver Contrato</button>`
                : `<span style="color: #64748b; font-size: 0.9em;">Sem arquivo</span>`;

            const rowHtml = `
                <td>
                    <strong>${alunoNome}</strong><br>
                    <span style="font-family:monospace;font-size:0.8em;color:gray;">RA: ${alunoRaExibido}</span>
                </td>
                <td>${cursoNome}</td>
                <td>${statusCelulaHtml}</td>
                <td>${acaoContrato}</td>
            `;

            // Guarda no cache para filtro em tempo real
            contratosCache.push({
                _nomeAluno: alunoNome,
                _raAluno: alunoRaRaw ?? '-',
                _cpfAluno: alunoCpf,
                _nomeCurso: cursoNome,
                _htmlRow: rowHtml
            });

            const tr = document.createElement('tr');
            tr.innerHTML = rowHtml;
            tbody.appendChild(tr);
        });

    } catch (e) {
        console.error('Erro ao carregar contratos:', e);
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color: red; padding: 24px;">Erro ao carregar contratos: ${e.message}</td></tr>`;
    }
}

// Abertura segura do Blob PDF ou Link Externo
window.abrirContrato = function (contratoUrl) {
    if (!contratoUrl) {
        alert("Contrato indisponível.");
        return;
    }

    try {
        if (contratoUrl.startsWith('http://') || contratoUrl.startsWith('https://')) {
            window.open(contratoUrl, '_blank');
            return;
        }

        const base64Content = contratoUrl.includes(',') ? contratoUrl.split(',')[1] : contratoUrl;
        const byteCharacters = atob(base64Content);
        const byteNumbers = new Array(byteCharacters.length);

        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }

        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'application/pdf' });
        const blobUrl = URL.createObjectURL(blob);

        window.open(blobUrl, '_blank');
    } catch (e) {
        console.error("Erro ao abrir contrato:", e);
        alert("Não foi possível abrir o contrato.");
    }
};
