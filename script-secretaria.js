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

function mostrarConfirmacao(mensagem, callback, titulo = 'Confirmar Ação') {
    document.getElementById('confirmacao-titulo').textContent = titulo;
    document.getElementById('confirmacao-mensagem').textContent = mensagem;
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

                const tr = document.createElement('tr');
                tr.innerHTML = `
                <td>${curso.nome}</td>
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

        // Atualiza todos os <select> de curso na página
        const selectsIds = [
            'curso-crm',
            'curso-disciplina',
            'curso-diario',
            'curso-aluno-editar',
            'fin-filtro-curso'
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
    } catch (e) {
        console.error('Erro ao carregar cursos:', e);
    }
}

async function salvarCurso() {
    const nome = document.getElementById('nome-curso').value.trim();
    const duracao = document.getElementById('duracao-curso').value.trim();

    if (!nome || !duracao) {
        mostrarAlerta('Preencha todos os campos do curso!');
        return;
    }

    const { error } = await db.from('cursos').insert({
        nome,
        duracao,
        criado_por: usuarioLogado.id
    });

    if (error) {
        mostrarAlerta(`Erro ao salvar curso: ${error.message}`);
        return;
    }

    document.getElementById('nome-curso').value = '';
    document.getElementById('duracao-curso').value = '';
    await carregarCursos();
    mostrarAlerta('Curso salvo com sucesso!', 'Sucesso');
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
    const { data: curso, error } = await db
        .from('cursos')
        .select('*')
        .eq('id', cursoId)
        .single();

    if (error || !curso) return;

    cursoEditandoId = cursoId;
    document.getElementById('curso-index-editar').value = cursoId;
    document.getElementById('curso-nome-editar').value = curso.nome;
    document.getElementById('curso-duracao-editar').value = curso.duracao;
    document.getElementById('modal-curso').classList.add('active');
}

function fecharModalCurso() {
    document.getElementById('modal-curso').classList.remove('active');
    cursoEditandoId = null;
}

async function salvarCursoModal() {
    if (!cursoEditandoId) return;

    const novoNome = document.getElementById('curso-nome-editar').value.trim();
    const novaDuracao = document.getElementById('curso-duracao-editar').value.trim();

    if (!novoNome || !novaDuracao) {
        mostrarAlerta('Preencha todos os campos!');
        return;
    }

    const { error } = await db
        .from('cursos')
        .update({ nome: novoNome, duracao: novaDuracao })
        .eq('id', cursoEditandoId);

    if (error) {
        mostrarAlerta(`Erro ao atualizar curso: ${error.message}`);
        return;
    }

    await carregarCursos();
    fecharModalCurso();
    mostrarAlerta('Curso atualizado com sucesso!', 'Sucesso');
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

// ==================== ALUNOS ====================
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
            const turma = entry.querySelector('.turma-input').value.trim();
            const valorInputVal = entry.querySelector('.valor-input').value;
            const valor = parseMoeda(valorInputVal);

            const contratoInput = entry.querySelector('.contrato-input');
            const arquivoContrato = contratoInput && contratoInput.files[0] ? contratoInput.files[0] : null;

            if (!cursoId || !turma || isNaN(valor) || !valorInputVal) {
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
                    reader.onerror = error => reject(error);
                    reader.readAsDataURL(arquivoContrato);
                });
            } catch (e) {
                throw new Error('Falha ao ler o arquivo PDF anexado. Tente enviar novamente.');
            }

            cursosSelecionados.push({ cursoId, turma, valor, contratoBase64 });
            valorTotal += valor;
        }

        if (cursosSelecionados.length === 0) {
            throw new Error('Adicione pelo menos um curso para realizar a matrícula.');
        }

        const formaPagamento = document.getElementById('forma-pagamento').value;
        const numeroParcelas = formaPagamento === 'parcelado'
            ? parseInt(document.getElementById('numero-parcelas').value)
            : 1;

        // Verifica CPF duplicado
        const { data: cpfExiste, error: errCpf } = await db.from('alunos').select('id').eq('cpf', cpf).maybeSingle();
        if (errCpf) throw new Error(`Erro de conexão ao verificar CPF: ${errCpf.message}`);
        if (cpfExiste) throw new Error('Já existe um aluno cadastrado com este CPF.');

        const dataMatricula = new Date().toISOString().split('T')[0];

        // Para legado, pegar dados do primeiro curso para salvar na tabela principal "alunos"
        const primeiroCurso = cursosSelecionados[0];
        const { data: cursoData, error: errCursoData } = await db
            .from('cursos')
            .select('nome')
            .eq('id', primeiroCurso.cursoId)
            .single();

        if (errCursoData) throw new Error(`Erro ao buscar dados do curso: ${errCursoData.message}`);

        // 1. Insere o aluno
        const { data: novoAluno, error: erroAluno } = await db
            .from('alunos')
            .insert({
                nome,
                cpf,
                curso_id: primeiroCurso.cursoId,
                curso_nome: cursoData ? cursoData.nome : '',
                turma: primeiroCurso.turma,
                valor: valorTotal,
                forma_pagamento: formaPagamento,
                data_matricula: dataMatricula,
                criado_por: usuarioLogado ? usuarioLogado.id : null
            })
            .select()
            .single();

        if (erroAluno) throw new Error(`Erro de conexão ao cadastrar aluno: ${erroAluno.message}`);

        // 2. Insere na tabela matriculas
        for (const item of cursosSelecionados) {
            const { error: erroMatricula } = await db.from('matriculas').insert({
                aluno_id: novoAluno.id,
                curso_id: item.cursoId,
                turma: item.turma,
                contrato_url: item.contratoBase64,
                data_matricula: dataMatricula,
                criado_por: usuarioLogado ? usuarioLogado.id : null
            });
            if (erroMatricula) throw new Error(`Erro ao criar vínculo de matrícula: ${erroMatricula.message}`);
        }

        // 3. Insere as parcelas na tabela financeiro
        const parcelas = gerarParcelas(valorTotal, numeroParcelas, dataMatricula, novoAluno.id);

        if (parcelas.length > 0) {
            const { error: erroFin } = await db.from('financeiro').insert(parcelas);
            if (erroFin) throw new Error(`Erro ao gerar parcelas no financeiro: ${erroFin.message}`);
        }

        // Lançamento Automático se for "À Vista"
        if (formaPagamento === 'a-vista') {
            const metodo = document.getElementById('metodo-pagamento').value;
            const { error: erroPag } = await db.from('pagamentos').insert({
                aluno_id: novoAluno.id,
                curso_id: primeiroCurso.cursoId,
                valor_pago: valorTotal,
                forma_pagamento: metodo,
                status: 'Pago',
                data_pagamento: dataMatricula,
                criado_por: usuarioLogado ? usuarioLogado.id : null
            });
            if (erroPag) throw new Error(`Erro ao lançar pagamento à vista: ${erroPag.message}`);
        }

        // 4. Limpeza da UI e Atualização Real-Time
        document.getElementById('form-secretaria').reset();
        document.getElementById('parcelas-container').style.display = 'none';
        document.getElementById('metodo-pagamento-container').style.display = 'flex';

        // Remove os cursos adicionais, deixando apenas o original limpo
        const container = document.getElementById('cursos-container');
        const extraEntries = container.querySelectorAll('.curso-entry:not(:first-child)');
        extraEntries.forEach(el => el.remove());

        // Recarrega as tabelas para refletir o novo aluno imediatamente
        await carregarAlunos();

        mostrarAlerta('Aluno cadastrado e matriculado com sucesso!', 'Sucesso');

    } catch (e) {
        console.error('Erro no fluxo de matrícula:', e);
        mostrarAlerta(e.message || 'Ocorreu um erro ao efetivar a matrícula.', 'Erro de Validação/Conexão');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
    }
}

function gerarParcelas(valorTotal, numeroParcelas, dataMatricula, alunoId) {
    const parcelas = [];
    const valorParcela = valorTotal / numeroParcelas;

    for (let i = 0; i < numeroParcelas; i++) {
        const vencimento = new Date(dataMatricula + 'T12:00:00');
        vencimento.setDate(vencimento.getDate() + (i * 30));

        parcelas.push({
            aluno_id: alunoId,
            numero_parcela: i + 1,
            total_parcelas: numeroParcelas,
            valor: parseFloat(valorParcela.toFixed(2)),
            vencimento: vencimento.toISOString().split('T')[0],
            paga: false
        });
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

                // Monta chips de cursos (via tabela matriculas)
                const matriculas = aluno.matriculas || [];
                let cursosHtml;
                if (matriculas.length > 0) {
                    cursosHtml = `<div class="cursos-chips">${matriculas.map(m => `<span class="curso-chip">${m.cursos ? m.cursos.nome : '-'}</span>`).join('')
                        }</div>`;
                } else {
                    cursosHtml = aluno.curso_nome || '-';
                }

                const tr = document.createElement('tr');
                const raText = aluno.ra ? ` - RA: ${aluno.ra}` : '';
                tr.innerHTML = `
                <td><strong>${aluno.nome}</strong><span style="color:var(--txt-light); font-size: 0.85em;">${raText}</span></td>
                <td>${aluno.cpf || '-'}</td>
                <td>${cursosHtml}</td>
                <td>${aluno.turma || '-'}</td>
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

                // Monta lista de cursos da secretaria
                const matriculas = aluno.matriculas || [];
                let cursosTexto;
                if (matriculas.length > 0) {
                    cursosTexto = `<div class="cursos-chips">${matriculas.map(m => `<span class="curso-chip">${m.cursos ? m.cursos.nome : '-'}</span>`).join('')
                        }</div>`;
                } else {
                    cursosTexto = aluno.curso_nome || '-';
                }

                const tr = document.createElement('tr');
                const raText = aluno.ra ? ` - RA: ${aluno.ra}` : '';
                tr.innerHTML = `
                <td><strong>${aluno.nome}</strong><span style="color:var(--txt-light); font-size: 0.85em;">${raText}</span></td>
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
    // Busca o aluno com todos os dados
    const { data: aluno, error } = await db
        .from('alunos')
        .select('*, matriculas(*, cursos(nome))')
        .eq('id', alunoId)
        .single();

    if (error || !aluno) return;

    // Elementos da Ficha
    const setValue = (id, value) => {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = value && value.trim() !== '' ? value : 'Pendente';
            el.style.color = (value && value.trim() !== '') ? 'var(--txt-dark)' : 'var(--txt-light)';
        }
    };

    // Dados Acadêmicos
    setValue('ficha-nome', aluno.nome);
    setValue('ficha-ra', aluno.ra ? String(aluno.ra) : '');
    setValue('ficha-cpf', aluno.cpf);
    
    // Cursos - junta todos em string caso haja múltiplos
    const matriculas = aluno.matriculas || [];
    let nomesCursos = matriculas.map(m => m.cursos ? m.cursos.nome : '').filter(Boolean).join(', ');
    if (!nomesCursos) nomesCursos = aluno.curso_nome || ''; // Legado fallback
    setValue('ficha-curso', nomesCursos);

    // Contato
    setValue('ficha-telefone', aluno.telefone);
    setValue('ficha-telefone2', aluno.telefone_secundario);
    setValue('ficha-email', aluno.email);

    // Endereço
    setValue('ficha-cep', aluno.cep);
    setValue('ficha-logradouro', aluno.logradouro);
    setValue('ficha-numero', aluno.numero);
    setValue('ficha-bairro', aluno.bairro);
    setValue('ficha-cidade', aluno.cidade_uf);

    // Lógica do Banner de Alerta Onboarding
    const alerta = document.getElementById('alerta-onboarding');
    const estaPendente = !aluno.telefone || !aluno.cep || !aluno.email;
    if (alerta) {
        alerta.style.display = estaPendente ? 'flex' : 'none';
    }

    document.getElementById('modal-aluno').classList.add('active');
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

            const status = media !== null ? (media >= 7 ? 'Aprovado' : 'Em Recuperação') : '-';
            const badgeClass = media !== null ? (media >= 7 ? 'badge-aprovado' : 'badge-recuperacao') : '';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${nomeAluno}</td>
                <td>${nomeCurso}</td>
                <td>${m.turma || '-'}</td>
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
    document.getElementById('modal-notas').classList.add('active');
}

function fecharModalNotas() {
    document.getElementById('modal-notas').classList.remove('active');
    alunoNotasId = null;
}

async function salvarNotasModal() {
    if (alunoNotasId === null) return; // Aqui alunoNotasId armazena o ID da Matrícula

    const nota1Str = document.getElementById('nota1-input').value;
    const nota2Str = document.getElementById('nota2-input').value;

    if (nota1Str === '' || nota2Str === '') {
        mostrarAlerta('Preencha os dois campos de notas!');
        return;
    }

    const n1 = parseFloat(nota1Str);
    const n2 = parseFloat(nota2Str);

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
    mostrarAlerta('As notas do aluno foram salvas com sucesso!', 'Sucesso');
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
        const { data: pagamentos, error: errPag } = await db
            .from('pagamentos')
            .select('*, alunos(nome, ra), cursos(nome)');

        const pagamentosNormalizados = (pagamentos || []).map(p => ({ ...p, _tabela: 'pagamentos' }));

        const { data: boletos, error: errBol } = await db
            .from('financeiro')
            .select('*, alunos(nome, ra, curso_nome)');

        if (errBol) throw errBol;

        const hoje = new Date().toISOString().split('T')[0];
        
        const boletosNormalizados = (boletos || []).map(b => {
            let statusBol = b.paga ? 'Pago' : (b.vencimento < hoje ? 'Atrasado' : 'Pendente');

            // Resolve o nome do curso: tenta via matriculas (novo schema) ou curso_nome (legado)
            let nomeCurso = '-';
            if (b.alunos?.curso_nome) {
                nomeCurso = b.alunos.curso_nome;
            }
            
            return {
                id: b.id,
                _tabela: 'financeiro',
                aluno_id: b.aluno_id,
                curso_id: null,
                valor_pago: b.valor,
                forma_pagamento: 'Boleto',
                data_pagamento: b.vencimento,
                status: statusBol,
                observacao: `Parcela ${b.numero_parcela}/${b.total_parcelas}`,
                alunos: {
                    nome: b.alunos?.nome,
                    ra: b.alunos?.ra
                },
                cursos: {
                    nome: nomeCurso
                }
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
        const valor = parseFloat(pag.valor_pago || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const data = pag.data_pagamento
            ? (() => { const [y, m, d] = pag.data_pagamento.split('-'); return `${d}/${m}/${y}`; })()
            : '-';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${nomeAluno}</strong></td>
            <td>${nomeCurso}</td>
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
        const raAluno = p.alunos?.ra ? String(p.alunos.ra) : '';
        const cursoId = p.curso_id || '';
        const forma = p.forma_pagamento || '';
        const status = p.status || '';

        return (
            (!busca || nomeAluno.includes(busca) || raAluno.includes(busca)) &&
            (!cursofiltro || cursoId === cursofiltro) &&
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

    // Campo "Valor" no modal de pagamento
    document.getElementById('pag-valor')?.addEventListener('input', function () {
        aplicarMascaraMoeda(this);
    });
}

function adicionarLinhaCurso() {
    const container = document.getElementById('cursos-container');
    const template = container.querySelector('.curso-entry').cloneNode(true);

    // Reseta valores e adiciona máscara
    template.querySelector('.curso-select').value = '';
    template.querySelector('.turma-input').value = '';
    const valorInput = template.querySelector('.valor-input');
    valorInput.value = '';
    valorInput.addEventListener('input', function () {
        aplicarMascaraMoeda(this);
    });

    // Adiciona botão de remover
    const btnRemover = document.createElement('button');
    btnRemover.type = 'button';
    btnRemover.textContent = '🗑️ Remover';
    btnRemover.style.cssText = 'background: transparent; border: none; color: var(--txt-mid); cursor: pointer; font-size: 0.85em; font-weight: 600; padding-bottom: 12px; transition: var(--t-fast); height: 48px;';
    btnRemover.onmouseover = () => { btnRemover.style.color = 'var(--vermelho)'; btnRemover.style.textDecoration = 'underline'; };
    btnRemover.onmouseout = () => { btnRemover.style.color = 'var(--txt-mid)'; btnRemover.style.textDecoration = 'none'; };
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
        // Busca as turmas que os alunos já estão matriculados
        const { data, error } = await db.from('matriculas').select('turma');
        if (error) throw error;

        // Filtra valores vazios/nulos e remove duplicatas
        const turmasUnicas = [...new Set(data.map(d => d.turma).filter(Boolean))].sort();

        const optionsHTML = '<option value="">Selecione a Turma</option>' +
            turmasUnicas.map(t => `<option value="${t}">${t}</option>`).join('');

        // Preenche o Select de Vínculos de Professor
        const selectVinculo = document.getElementById('vinculo-turma');
        if (selectVinculo) {
            selectVinculo.innerHTML = '<option value="">Todas as Turmas (Geral)</option>' +
                turmasUnicas.map(t => `<option value="${t}">${t}</option>`).join('');
        }

        // Preenche o Select de Disparo de Avisos
        const selectAviso = document.getElementById('aviso-turma');
        if (selectAviso) {
            selectAviso.innerHTML = optionsHTML;
        }
    } catch (e) {
        console.error("Erro ao carregar turmas:", e);
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
            const alunoRa = aluno?.ra ?? '-';
            const alunoCpf = aluno?.cpf ?? '';
            const cursoNome = curso?.nome ?? '-';

            const temContrato = !!m.contrato_url;
            const badgeClasse = temContrato ? 'badge-pago' : 'badge-pendente';
            const statusTexto = temContrato ? '✅ Assinado' : 'Pendente';

            const acaoContrato = temContrato
                ? `<button type="button" class="btn-action" onclick="abrirContrato('${m.contrato_url}')">Ver Contrato</button>`
                : `<span style="color: #64748b; font-size: 0.9em;">Pendente</span>`;

            const rowHtml = `
                <td>
                    <strong>${alunoNome}</strong><br>
                    <span style="font-size: 0.8em; color: gray;">RA: ${alunoRa}</span>
                </td>
                <td>${cursoNome}</td>
                <td><span class="badge ${badgeClasse}">${statusTexto}</span></td>
                <td>${acaoContrato}</td>
            `;

            // Guarda no cache para filtro em tempo real
            contratosCache.push({
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
