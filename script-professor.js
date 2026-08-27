// ============================================================
// MIND RECALL — script-professor.js
// Script ISOLADO do Portal do Professor.
// Nenhuma variável compartilhada com script-secretaria.js.
// ============================================================

/**
 * Formata o RA puro de 12 dígitos para exibição visual: CCC.TTTT.AAAAA
 * Ex.: "250250000001" → "250.2500.00001"
 */
function formatarRA(ra) {
    if (!ra) return '-';
    const s = String(ra).replace(/\D/g, '');
    if (s.length !== 12) return ra;
    return `${s.slice(0, 3)}.${s.slice(3, 7)}.${s.slice(7)}`;
}

const SUPABASE_URL = 'https://gijgocyrumhalzqhkggj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_SBbgOvJCx21UjRJucquDTQ_kWhEL8Nx';

const db = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// ==================== VARIÁVEIS DO ESCOPO PROFESSOR ====================
let professorLogado = null;      // { id, email, nome, tipo }
let minhasTurmas = [];           // turmas vinculadas ao professor
let matriculaNotasId = null;     // ID da matrícula no modal de notas

// ==================== INICIALIZAÇÃO COM GUARDA DE ROTA ====================
document.addEventListener('DOMContentLoaded', async function () {
    const { data: { session } } = await db.auth.getSession();

    if (!session) {
        window.location.href = 'index.html';
        return;
    }

    // Verifica se o tipo é 'professor'
    const { data: perfil, error } = await db
        .from('perfis')
        .select('nome, tipo')
        .eq('id', session.user.id)
        .single();

    if (error || !perfil || perfil.tipo !== 'professor') {
        await db.auth.signOut();
        window.location.href = 'index.html';
        return;
    }

    professorLogado = { id: session.user.id, email: session.user.email, ...perfil };

    // Preenche UI com dados do professor
    const nameEl = document.getElementById('prof-user-name');
    if (nameEl) nameEl.textContent = perfil.nome || 'Professor';

    const emailEl = document.getElementById('prof-user-email');
    if (emailEl) emailEl.textContent = session.user.email;

    const avatarEl = document.getElementById('prof-avatar');
    if (avatarEl && perfil.nome) avatarEl.textContent = perfil.nome.charAt(0).toUpperCase();

    const welcomeEl = document.getElementById('prof-welcome-name');
    if (welcomeEl) welcomeEl.textContent = perfil.nome || 'Professor';

    configurarEventosProfessor();
    await carregarDadosProfessor();

    // Ouve logout
    db.auth.onAuthStateChange(async (event) => {
        if (event === 'SIGNED_OUT') {
            professorLogado = null;
            window.location.href = 'index.html';
        }
    });
});

// ==================== AUTENTICAÇÃO ====================
async function sairSistema() {
    try {
        await db.auth.signOut();
    } catch (e) {
        console.error("Erro ao deslogar:", e);
    }
    window.location.href = 'index.html';
}

// ==================== NAVEGAÇÃO POR ABAS ====================
function openProfTab(tabId) {
    // Oculta todas as tabs
    document.querySelectorAll('.prof-tabcontent').forEach(el => {
        el.style.display = 'none';
        el.classList.remove('active');
    });

    // Remove active de todos os itens do menu
    document.querySelectorAll('.prof-nav-item').forEach(el => {
        el.classList.remove('active');
    });

    // Mostra tab selecionada
    const tab = document.getElementById(tabId);
    if (tab) {
        tab.style.display = 'block';
        tab.classList.add('active');
    }

    // Marca item ativo
    const navItem = document.querySelector(`.prof-nav-item[data-tab="${tabId}"]`);
    if (navItem) navItem.classList.add('active');

    // Ações ao navegar
    if (tabId === 'prof-diario') carregarDiarioProfessor();
    if (tabId === 'prof-aprovacao') carregarAprovacaoCertificados();
}

// ==================== CARREGAR DADOS DO PROFESSOR ====================
async function carregarDadosProfessor() {
    try {
        // Busca vínculos do professor
        const { data: vinculos, error } = await db
            .from('turma_professores')
            .select('id, turma_nome, curso_id, cursos(nome)')
            .eq('professor_id', professorLogado.id);

        if (error) throw error;

        minhasTurmas = vinculos || [];

        // Atualiza estatísticas do dashboard
        // Conta cada vínculo como uma entrada: turmas específicas + vínculos gerais (NULL)
        const turmasEspecificas = [...new Set(minhasTurmas.map(v => v.turma_nome).filter(Boolean))];
        const cursosUnicos = [...new Set(minhasTurmas.map(v => v.curso_id))];

        // Total de turmas = turmas específicas + vínculos gerais (1 por curso sem turma específica)
        const vinculosGerais = minhasTurmas.filter(v => !v.turma_nome);
        const totalTurmasCard = turmasEspecificas.length + vinculosGerais.length;
        document.getElementById('prof-total-turmas').textContent = totalTurmasCard;
        document.getElementById('prof-total-cursos').textContent = cursosUnicos.length;

        // Conta alunos nas turmas específicas do professor
        let totalAlunos = 0;
        for (const turma of turmasEspecificas) {
            const { count } = await db
                .from('matriculas')
                .select('*', { count: 'exact', head: true })
                .eq('turma', turma);
            totalAlunos += (count || 0);
        }
        // Para vínculos gerais (NULL), conta por curso (evitando duplicatas de alunos já contados)
        const cursosJaContados = new Set(
            minhasTurmas.filter(v => v.turma_nome).map(v => v.curso_id)
        );
        for (const v of vinculosGerais) {
            if (cursosJaContados.has(v.curso_id)) continue;
            const { count } = await db
                .from('matriculas')
                .select('*', { count: 'exact', head: true })
                .eq('curso_id', v.curso_id);
            totalAlunos += (count || 0);
            cursosJaContados.add(v.curso_id);
        }

        document.getElementById('prof-total-alunos').textContent = totalAlunos;

        // Renderiza turmas no dashboard (cards rápidos)
        renderizarTurmasRapidas();

        // Popular selects de turma com todos os vínculos (específicos + gerais)
        popularSelectsTurma();

    } catch (e) {
        console.error('Erro ao carregar dados do professor:', e);
    }
}

function renderizarTurmasRapidas() {
    const container = document.getElementById('prof-lista-turmas-rapida');
    if (!container) return;

    if (minhasTurmas.length === 0) {
        container.innerHTML = '<p style="color: var(--txt-navy-sub);">Nenhuma turma vinculada ao seu perfil.</p>';
        return;
    }

    container.innerHTML = minhasTurmas.map(vinculo => {
        const nomeCurso = vinculo.cursos ? vinculo.cursos.nome : '-';
        const nomeTurma = vinculo.turma_nome || null;
        // Valor composto para identificar o vínculo: curso_id::turma_nome (ou curso_id:: para gerais)
        const valorVinculo = `${vinculo.curso_id}::${nomeTurma || ''}`;
        const labelExibicao = nomeTurma
            ? `${nomeTurma} — ${nomeCurso}`
            : `Todas as Turmas — ${nomeCurso}`;

        return `
            <div class="prof-turma-card" onclick="abrirTurmaRapida('${valorVinculo}')">
                <div class="prof-turma-card-header">
                    <span class="prof-turma-card-icon">📚</span>
                    <strong>${nomeTurma || 'Todas as Turmas'}</strong>
                </div>
                <div class="prof-turma-card-body">
                    <span class="prof-turma-card-curso">${nomeCurso}</span>
                </div>
                <div class="prof-turma-card-footer">
                    <span>Ver alunos →</span>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Popula os <select> de turma com todos os vínculos do professor.
 * O value de cada <option> é um valor composto: "curso_id::turma_nome"
 * Para vínculos gerais (NULL), o valor fica "curso_id::" (turma_nome vazia).
 */
function popularSelectsTurma() {
    // Monta as opções a partir de minhasTurmas (já carregado globalmente)
    const opcoesHTML = minhasTurmas.map(v => {
        const nomeCurso = v.cursos ? v.cursos.nome : `Curso ${v.curso_id}`;
        const nomeTurma = v.turma_nome || null;
        const valor = `${v.curso_id}::${nomeTurma || ''}`;
        const label = nomeTurma
            ? `${nomeTurma} — ${nomeCurso}`
            : `Todas as Turmas — ${nomeCurso}`;
        return `<option value="${valor}">${label}</option>`;
    }).join('');

    // Atualiza select da aba "Minhas Turmas"
    const selectTurmas = document.getElementById('prof-turma-select');
    if (selectTurmas) {
        selectTurmas.innerHTML = '<option value="">Selecione uma turma...</option>' + opcoesHTML;
    }

    // Atualiza select do Diário de Classe (mantém opção "Todas")
    const selectDiario = document.getElementById('prof-diario-turma');
    if (selectDiario) {
        selectDiario.innerHTML = '<option value="">Todas as turmas</option>' + opcoesHTML;
    }

    // Atualiza select de Avisos (mantém opção inicial)
    const selectAviso = document.getElementById('prof-aviso-turma');
    if (selectAviso) {
        selectAviso.innerHTML = '<option value="">Selecione a turma...</option>' + opcoesHTML;
    }
}

// Atalho para abrir turma pelo card do dashboard
// 'valorVinculo' é o valor composto "curso_id::turma_nome"
window.abrirTurmaRapida = function (valorVinculo) {
    openProfTab('prof-turmas');
    const select = document.getElementById('prof-turma-select');
    if (select) {
        select.value = valorVinculo;
        carregarAlunosDaTurma(valorVinculo);
    }
}

// ==================== MINHAS TURMAS ====================
/**
 * Carrega os alunos da turma/vínculo selecionado.
 * @param {string} valorVinculo - Valor composto no formato "curso_id::turma_nome".
 *   Se turma_nome estiver vazia (vínculo geral), filtra apenas por curso_id.
 */
async function carregarAlunosDaTurma(valorVinculo) {
    const container = document.getElementById('prof-turma-alunos-container');
    const tbody = document.getElementById('prof-lista-alunos-turma');
    const titulo = document.getElementById('prof-turma-titulo');

    if (!valorVinculo) {
        if (container) container.style.display = 'none';
        return;
    }

    // Decompõe o valor composto "curso_id::turma_nome"
    const separador = valorVinculo.indexOf('::');
    const cursoId = separador !== -1 ? valorVinculo.substring(0, separador) : valorVinculo;
    const turmaNome = separador !== -1 ? valorVinculo.substring(separador + 2) : '';
    const ehVinculoGeral = !turmaNome; // turma_nome vazia = vínculo para o curso inteiro

    // Busca o nome do curso para exibição
    const vinculo = minhasTurmas.find(v =>
        String(v.curso_id) === String(cursoId) &&
        (ehVinculoGeral ? !v.turma_nome : v.turma_nome === turmaNome)
    );
    const nomeCurso = vinculo && vinculo.cursos ? vinculo.cursos.nome : `Curso ${cursoId}`;
    const labelTitulo = ehVinculoGeral
        ? `Todas as Turmas — ${nomeCurso}`
        : `${turmaNome} — ${nomeCurso}`;

    if (container) container.style.display = 'block';
    if (titulo) titulo.textContent = `Alunos: ${labelTitulo}`;
    if (tbody) tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--txt-light);"><span class="spinner"></span> Carregando...</td></tr>';

    try {
        // Query: traz ra diretamente da matrícula (não de alunos)
        let query = db
            .from('matriculas')
            .select('id, ra, turma, alunos(nome, cpf), cursos(nome)')
            .eq('curso_id', cursoId);

        // Se não for vínculo geral, filtra também pela turma_nome exata
        if (!ehVinculoGeral) {
            query = query.eq('turma', turmaNome);
        }

        const { data: matriculas, error } = await query;

        if (error) throw error;

        if (!matriculas || matriculas.length === 0) {
            if (tbody) tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--txt-mid);">Nenhum aluno encontrado nesta seleção.</td></tr>';
            return;
        }

        if (tbody) tbody.innerHTML = matriculas.map(m => {
            const nome  = m.alunos ? m.alunos.nome : '-';
            const cpf   = m.alunos ? (m.alunos.cpf || '-') : '-';
            const curso = m.cursos ? m.cursos.nome : '-';
            // RA vem da linha da matrícula (específico por curso)
            const ra    = formatarRA(m.ra);

            return `
                <tr>
                    <td><strong>${nome}</strong></td>
                    <td>${cpf}</td>
                    <td>${curso}</td>
                    <td style="font-family:monospace;">${ra}</td>
                </tr>
            `;
        }).join('');

    } catch (e) {
        console.error('Erro ao carregar alunos da turma:', e);
        if (tbody) tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--vermelho);">Erro ao carregar alunos.</td></tr>';
    }
}

// ==================== DIÁRIO DE CLASSE ====================
async function carregarDiarioProfessor() {
    const tbody = document.getElementById('prof-lista-diario');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--txt-light);"><span class="spinner"></span> Carregando...</td></tr>';

    try {
        // Busca turmas do professor
        const turmasDoProf = minhasTurmas.map(v => v.turma_nome).filter(Boolean);
        const cursosDoProf = minhasTurmas.filter(v => !v.turma_nome).map(v => v.curso_id);

        if (turmasDoProf.length === 0 && cursosDoProf.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--txt-mid);">Nenhuma turma vinculada.</td></tr>';
            return;
        }

        // Busca matrículas das turmas do professor — traz ra da matrícula
        let allMatriculas = [];

        if (turmasDoProf.length > 0) {
            const { data: matTurmas, error: errT } = await db
                .from('matriculas')
                .select('*, ra, alunos(nome, cpf), cursos(nome)')
                .in('turma', turmasDoProf);
            if (errT) throw errT;
            allMatriculas = allMatriculas.concat(matTurmas || []);
        }

        if (cursosDoProf.length > 0) {
            const { data: matCursos, error: errC } = await db
                .from('matriculas')
                .select('*, ra, alunos(nome, cpf), cursos(nome)')
                .in('curso_id', cursosDoProf);
            if (errC) throw errC;
            // Evita duplicatas
            const idsExistentes = new Set(allMatriculas.map(m => m.id));
            (matCursos || []).forEach(m => {
                if (!idsExistentes.has(m.id)) allMatriculas.push(m);
            });
        }

        // Aplicar filtros
        // O valor do select é composto: "curso_id::turma_nome" (turma_nome vazia = vínculo geral)
        const filtroValor = document.getElementById('prof-diario-turma')?.value || '';
        const filtroBusca = (document.getElementById('prof-diario-busca')?.value || '').toLowerCase().trim();

        let filtrados = allMatriculas;

        if (filtroValor) {
            const sepIdx = filtroValor.indexOf('::');
            const filtroCursoId = sepIdx !== -1 ? filtroValor.substring(0, sepIdx) : filtroValor;
            const filtroTurmaNome = sepIdx !== -1 ? filtroValor.substring(sepIdx + 2) : '';
            const filtroEhGeral = !filtroTurmaNome;

            filtrados = filtrados.filter(m => {
                const mesmosCurso = String(m.curso_id) === String(filtroCursoId);
                if (!mesmosCurso) return false;
                // Se for vínculo geral, basta o curso_id bater
                if (filtroEhGeral) return true;
                // Se for específico, filtra também pela turma_nome
                return m.turma === filtroTurmaNome;
            });
        }

        if (filtroBusca) {
            filtrados = filtrados.filter(m => {
                const nomeAluno = (m.alunos?.nome || '').toLowerCase();
                // Busca pelo RA da matrícula (não mais de alunos.ra)
                const raAluno = m.ra ? String(m.ra) : '';
                return nomeAluno.includes(filtroBusca) || raAluno.includes(filtroBusca);
            });
        }

        if (filtrados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--txt-mid);">Nenhum aluno encontrado.</td></tr>';
            return;
        }

        tbody.innerHTML = filtrados.map(m => {
            const nomeAluno = m.alunos ? m.alunos.nome : '-';
            const nomeCurso = m.cursos ? m.cursos.nome : '-';
            // RA vem da linha da matrícula específica
            const raFormatado = formatarRA(m.ra);

            const n1 = m.nota1 !== null && m.nota1 !== undefined ? m.nota1 : null;
            const n2 = m.nota2 !== null && m.nota2 !== undefined ? m.nota2 : null;
            const media = m.media !== null && m.media !== undefined ? m.media : null;

            // Situacao: só definida quando há média calculada
            const isAprovado  = media !== null && media >= 7;
            const isReprovado = media !== null && media < 7;
            const status    = isAprovado ? 'Aprovado' : (isReprovado ? 'Reprovado' : 'Pendente');
            const badgeClass = isAprovado ? 'badge-aprovado' : (isReprovado ? 'badge-reprovado' : '');
            const badgeHtml  = media !== null
                ? `<span class="badge ${badgeClass}">${status}</span>`
                : `<span style="color:var(--txt-light);font-size:0.85em;">Pendente</span>`;

            const temNotas = n1 !== null && n2 !== null;
            const btnClass = temNotas ? 'btn-editar' : 'btn-action';
            const btnTexto = temNotas ? '✏️ Editar Notas' : '📝 Lançar Notas';

            // Botão certificado: SOMENTE se Situacao === 'Aprovado'
            const btnCertificado = isAprovado
                ? `<button type="button" class="btn-action" style="background:var(--verde);color:#fff;border-color:var(--verde);" onclick="enviarCertificado('${m.id}')">&#127891; Certificado</button>`
                : '';

            return `
                <tr>
                    <td>${nomeAluno}</td>
                    <td>${nomeCurso}</td>
                    <td style="font-family:monospace;font-size:0.85em;">${raFormatado}</td>
                    <td>${n1 !== null ? n1 : '-'}</td>
                    <td>${n2 !== null ? n2 : '-'}</td>
                    <td><strong>${media !== null ? parseFloat(media).toFixed(1) : '-'}</strong></td>
                    <td>${badgeHtml}</td>
                    <td style="display:flex;gap:6px;flex-wrap:wrap;">
                        <button type="button" class="${btnClass}" onclick="abrirModalNotasProf('${m.id}', '${nomeAluno.replace(/'/g, "\\'")}', '${nomeCurso.replace(/'/g, "\\'")}', ${temNotas})">${btnTexto}</button>
                        ${btnCertificado}
                    </td>
                </tr>
            `;
        }).join('');

    } catch (e) {
        console.error('Erro ao carregar diário:', e);
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--vermelho);">Erro ao carregar diário.</td></tr>';
    }
}

// ==================== MODAL DE NOTAS (PROFESSOR) ====================
/**
 * Abre o modal de notas.
 * @param {string} matriculaId - ID da matrícula
 * @param {string} nomeAluno   - Nome do aluno (para exibição)
 * @param {string} nomeCurso   - Nome do curso (para exibição)
 * @param {boolean} modoEdicao - true se o aluno já possui notas cadastradas
 */
window.abrirModalNotasProf = async function (matriculaId, nomeAluno, nomeCurso, modoEdicao = false) {
    // Busca as notas atuais no Supabase para pré-preencher o modal
    const { data: matricula, error } = await db
        .from('matriculas')
        .select('nota1, nota2')
        .eq('id', matriculaId)
        .single();

    if (error) {
        mostrarAlerta('Erro ao buscar dados da matrícula. Tente novamente.');
        return;
    }

    matriculaNotasId = matriculaId;
    document.getElementById('prof-matricula-id-notas').value = matriculaId;

    // Atualiza título e botão do modal conforme o modo (lançamento ou edição)
    const modalTitulo = document.querySelector('#prof-modal-notas .modal-header h3');
    if (modalTitulo) {
        modalTitulo.textContent = modoEdicao ? '✏️ Editar Notas' : '📝 Lançamento de Notas';
    }
    const btnSalvar = document.getElementById('prof-btn-salvar-notas');
    if (btnSalvar) {
        btnSalvar.textContent = modoEdicao ? 'Salvar Alterações' : 'Salvar Boletim';
    }

    const subtitle = document.getElementById('prof-notas-subtitle');
    if (subtitle) {
        subtitle.innerHTML = `<strong>Aluno:</strong> ${nomeAluno} &nbsp;|&nbsp; <strong>Curso:</strong> ${nomeCurso}`;
    }

    // Pré-preenche os campos com os valores existentes (ou vazio se ainda não foram lançadas)
    document.getElementById('prof-nota1-input').value = matricula && matricula.nota1 !== null ? matricula.nota1 : '';
    document.getElementById('prof-nota2-input').value = matricula && matricula.nota2 !== null ? matricula.nota2 : '';
    document.getElementById('prof-modal-notas').classList.add('active');
}

function fecharModalNotasProf() {
    document.getElementById('prof-modal-notas').classList.remove('active');
    matriculaNotasId = null;
}

async function salvarNotasProf() {
    if (matriculaNotasId === null) return;

    const nota1Str = document.getElementById('prof-nota1-input').value.trim();
    const nota2Str = document.getElementById('prof-nota2-input').value.trim();

    // Campos vazios são permitidos: resetam a nota para null
    const n1 = nota1Str !== '' ? parseFloat(nota1Str) : null;
    const n2 = nota2Str !== '' ? parseFloat(nota2Str) : null;

    // Validação de intervalo (0-10) somente quando não são nulos
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
    // automaticamente a partir de nota1 e nota2. Enviá-la causaria:
    // "column media can only be updated to DEFAULT"
    const { error } = await db
        .from('matriculas')
        .update({ nota1: n1, nota2: n2 })
        .eq('id', matriculaNotasId);

    if (error) {
        mostrarAlerta(`Erro ao salvar notas: ${error.message}`);
        return;
    }

    fecharModalNotasProf();
    await carregarDiarioProfessor();
    mostrarAlerta(
        n1 === null && n2 === null
            ? 'Notas removidas. Situação do aluno voltou para Pendente.'
            : 'Notas salvas com sucesso!',
        'Sucesso'
    );
}

// ==================== DISPARO DE AVISOS (PROFESSOR) ====================
async function enviarAvisoProfessor() {
    const btn = document.getElementById('prof-btn-enviar-aviso');
    const originalText = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '⏳ Disparando...';
    }

    try {
        const titulo = document.getElementById('prof-aviso-titulo').value.trim();
        const mensagem = document.getElementById('prof-aviso-mensagem').value.trim();

        const tipoRadio = document.querySelector('input[name="prof-tipo-aviso"]:checked');
        const tipo = tipoRadio ? tipoRadio.value : 'aluno';

        if (!titulo || !mensagem) {
            throw new Error('Preencha o título e a mensagem.');
        }

        if (tipo === 'aluno') {
            const aluno_ra = document.getElementById('prof-aviso-ra').value.trim();
            if (!aluno_ra) throw new Error('Informe o RA do aluno.');

            const { error } = await db.from('avisos').insert({
                titulo,
                aluno_ra,
                mensagem,
                autor: professorLogado.id
            });
            if (error) throw error;
            mostrarToast('Aviso enviado com sucesso!', 'sucesso');

        } else {
            const turma = document.getElementById('prof-aviso-turma').value;
            if (!turma) throw new Error('Selecione uma turma.');

            // Busca alunos dessa turma
            const { data: alunos, error: errMat } = await db.from('alunos')
                .select('ra, matriculas!inner(id)')
                .eq('matriculas.turma', turma);

            if (errMat) throw errMat;

            if (!alunos || alunos.length === 0) {
                throw new Error('Nenhum aluno encontrado nesta turma.');
            }

            const rasUnicos = [...new Set(alunos.map(a => a.ra).filter(Boolean))];

            if (rasUnicos.length === 0) {
                throw new Error('Os alunos desta turma não possuem RA válido.');
            }

            const avisosLote = rasUnicos.map(ra => ({
                titulo,
                aluno_ra: String(ra),
                mensagem,
                autor: professorLogado.id
            }));

            const { error: errInsert } = await db.from('avisos').insert(avisosLote);
            if (errInsert) throw errInsert;

            mostrarToast(`Aviso enviado para ${rasUnicos.length} alunos da turma ${turma}!`, 'sucesso');
        }

        document.getElementById('prof-form-aviso').reset();

        // Reset UI
        document.getElementById('prof-aviso-ra').style.display = 'block';
        document.getElementById('prof-aviso-ra').required = true;
        document.getElementById('prof-aviso-turma').style.display = 'none';
        document.getElementById('prof-aviso-turma').required = false;
        document.getElementById('prof-label-aviso-destino').textContent = 'RA do Aluno:';

    } catch (e) {
        console.error('Erro ao disparar aviso:', e);
        mostrarToast('Erro: ' + e.message, 'erro');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }
}

// ==================== MODAIS E UTILITÁRIOS ====================
function mostrarAlerta(mensagem, titulo = 'Atenção') {
    document.getElementById('alerta-titulo').textContent = titulo;
    document.getElementById('alerta-mensagem').textContent = mensagem;
    document.getElementById('modal-alerta').classList.add('active');
}

function fecharModalAlerta() {
    document.getElementById('modal-alerta').classList.remove('active');
}

function mostrarToast(mensagem, tipo = 'sucesso') {
    let container = document.getElementById('prof-toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'prof-toast-container';
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

    toast.innerHTML = `${icon}<span style="font-weight: 500; font-size: 0.95em; color: #333;">${mensagem}</span>`;

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

// ==================== EVENT LISTENERS ====================
function configurarEventosProfessor() {
    // Logout
    document.getElementById('prof-btn-sair')?.addEventListener('click', sairSistema);

    // Navegação sidebar
    document.querySelectorAll('.prof-nav-item').forEach(item => {
        item.addEventListener('click', function () {
            const tabId = this.dataset.tab;
            if (tabId) openProfTab(tabId);
        });
    });

    // Selecionar turma — passa o valor composto "curso_id::turma_nome"
    document.getElementById('prof-turma-select')?.addEventListener('change', function () {
        carregarAlunosDaTurma(this.value);
    });

    // Filtros do diário
    // O filtro de turma no diário também usa valor composto; a função carregarDiarioProfessor já lida com isso
    document.getElementById('prof-diario-turma')?.addEventListener('change', carregarDiarioProfessor);
    document.getElementById('prof-diario-busca')?.addEventListener('input', carregarDiarioProfessor);

    // Salvar notas
    document.getElementById('prof-btn-salvar-notas')?.addEventListener('click', salvarNotasProf);

    // Avisos — tipo de destinatário
    const radiosTipoAviso = document.querySelectorAll('input[name="prof-tipo-aviso"]');
    radiosTipoAviso.forEach(radio => {
        radio.addEventListener('change', (e) => {
            const isTurma = e.target.value === 'turma';
            const inputRa = document.getElementById('prof-aviso-ra');
            const selectTurma = document.getElementById('prof-aviso-turma');
            const labelDestino = document.getElementById('prof-label-aviso-destino');

            if (isTurma) {
                if (inputRa) { inputRa.style.display = 'none'; inputRa.required = false; }
                if (selectTurma) { selectTurma.style.display = 'block'; selectTurma.required = true; }
                if (labelDestino) labelDestino.textContent = 'Turma Destino:';
            } else {
                if (inputRa) { inputRa.style.display = 'block'; inputRa.required = true; }
                if (selectTurma) { selectTurma.style.display = 'none'; selectTurma.required = false; }
                if (labelDestino) labelDestino.textContent = 'RA do Aluno:';
            }
        });
    });

    // Enviar aviso
    document.getElementById('prof-btn-enviar-aviso')?.addEventListener('click', enviarAvisoProfessor);
}
// ==================== APROVA��O DE CERTIFICADOS ====================
async function carregarAprovacaoCertificados() {
    try {
        if (!minhasTurmas || minhasTurmas.length === 0) {
            const tbody = document.getElementById('lista-alunos-aprovacao');
            if (tbody) tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--txt-mid);">Nenhuma turma encontrada.</td></tr>';
            return;
        }

        const selectTurma = document.getElementById('prof-aprovacao-turma');
        if (!selectTurma) return;

        // Popula o select de turmas se estiver vazio
        if (selectTurma.options.length <= 1) {
            selectTurma.innerHTML = '<option value="">Selecione uma turma...</option>';
            minhasTurmas.forEach(v => {
                const opt = document.createElement('option');
                opt.value = v.curso_id;
                opt.textContent = v.cursos?.nome || 'Curso Desconhecido';
                selectTurma.appendChild(opt);
            });

            // Adiciona o listener uma �nica vez
            selectTurma.onchange = carregarTabelaAprovacao;
        }

        carregarTabelaAprovacao();

    } catch (e) {
        console.error('Erro ao preparar tela de aprova��o:', e);
        const tbody = document.getElementById('lista-alunos-aprovacao');
        if (tbody) tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--txt-mid);">Erro ao carregar dados.</td></tr>';
    }
}

async function carregarTabelaAprovacao() {
    const selectTurma = document.getElementById('prof-aprovacao-turma');
    const cursoId = selectTurma ? selectTurma.value : null;

    // Usa o tbody correto: dentro da tabela da aba de aprovação
    const tbody = document.getElementById('lista-alunos-aprovacao');
    if (!tbody) return;

    if (!cursoId) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--txt-mid); padding: 24px;">Selecione uma turma acima para ver os alunos.</td></tr>';
        return;
    }

    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--txt-mid); padding: 24px;">⏳ Carregando alunos...</td></tr>';

    try {
        const { data: matriculas, error } = await db
            .from('matriculas')
            .select(`
                id,
                status_conclusao,
                alunos ( id, nome, ra )
            `)
            .eq('curso_id', cursoId);

        if (error) throw error;

        tbody.innerHTML = '';

        if (!matriculas || matriculas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--txt-mid); padding: 24px;">Nenhum aluno matriculado neste curso.</td></tr>';
            return;
        }

        matriculas.forEach(m => {
            const tr = document.createElement('tr');

            const isAprovado = m.status_conclusao === 'Aprovado';
            const isReprovado = m.status_conclusao === 'Reprovado';

            let statusBadge = '<span class="badge badge-pendente">Em Andamento</span>';
            if (isAprovado) statusBadge = '<span class="badge badge-pago">✅ Aprovado</span>';
            if (isReprovado) statusBadge = '<span class="badge badge-atrasado">❌ Reprovado</span>';

            const aluno = Array.isArray(m.alunos) ? m.alunos[0] : m.alunos;
            const raAluno = aluno?.ra ?? '-';
            const nomeAluno = aluno?.nome ?? 'Aluno não identificado';

            // Desabilita botões se já aprovado ou reprovado
            const disableAprovar = isAprovado ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : '';
            const disableReprovar = isReprovado ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : '';

            tr.innerHTML = `
                <td>${raAluno}</td>
                <td><strong>${nomeAluno}</strong></td>
                <td>${statusBadge}</td>
                <td style="display: flex; gap: 8px;">
                    <button type="button" class="btn-action prof-btn-aprovar" ${disableAprovar} onclick="aprovarAluno('${m.id}')">
                        ✅ Aprovar
                    </button>
                    <button type="button" class="btn-action prof-btn-reprovar" ${disableReprovar} onclick="reprovarAluno('${m.id}')">
                        ❌ Reprovar
                    </button>
                </td>
            `;

            tbody.appendChild(tr);
        });
    } catch (e) {
        console.error('Erro ao carregar tabela de aprovados:', e);
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: red; padding: 24px;">⚠️ Erro ao carregar alunos.</td></tr>';
    }
}

window.aprovarAluno = async function (matriculaId) {
    // Usa modal customizado em vez de window.confirm nativo
    mostrarProfConfirmacao(
        'Deseja realmente aprovar este aluno? Ele será liberado para a Secretaria emitir o certificado.',
        async () => {
            try {
                const { error } = await db
                    .from('matriculas')
                    .update({ status_conclusao: 'Aprovado', concluido: true })
                    .eq('id', matriculaId);

                if (error) throw error;

                // ✅ INFO: Ao aprovar, o status_conclusao é marcado como 'Aprovado' na tabela `matriculas`.
                // A Secretaria pode, então, verificar os certificados pendentes e emitir o certificado para o aluno.
                mostrarProfToast('✅ Aluno aprovado! A Secretaria foi notificada para emitir o certificado.');
                await carregarTabelaAprovacao();
            } catch (e) {
                console.error('Erro ao aprovar aluno:', e);
                mostrarProfToast('Erro ao aprovar aluno.', true);
            }
        }
    );
};

window.reprovarAluno = async function (matriculaId) {
    // Usa modal customizado em vez de window.confirm nativo
    mostrarProfConfirmacao(
        'Deseja reprovar este aluno? Ele ficará bloqueado de receber o certificado.',
        async () => {
            try {
                const { error } = await db
                    .from('matriculas')
                    .update({ status_conclusao: 'Reprovado', concluido: false })
                    .eq('id', matriculaId);

                if (error) throw error;

                mostrarProfToast('Aluno marcado como reprovado.');
                await carregarTabelaAprovacao();
            } catch (e) {
                console.error('Erro ao reprovar aluno:', e);
                mostrarProfToast('Erro ao reprovar aluno.', true);
            }
        }
    );
};

/**
 * Modal de confirmação leve para o Portal do Professor.
 * Cria um overlay dinâmico sem depender do sistema da Secretaria.
 */
function mostrarProfConfirmacao(mensagem, onConfirmar) {
    // Remove overlay anterior se existir
    const old = document.getElementById('prof-confirm-overlay');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.id = 'prof-confirm-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;';
    overlay.innerHTML = `
        <div style="background:#fff;border-radius:12px;padding:32px;max-width:420px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
            <p style="font-size:1rem;color:#1e293b;margin:0 0 24px 0;line-height:1.5;">${mensagem}</p>
            <div style="display:flex;gap:12px;justify-content:flex-end;">
                <button id="prof-confirm-cancel" style="padding:10px 20px;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc;color:#475569;cursor:pointer;font-weight:500;">Cancelar</button>
                <button id="prof-confirm-ok" style="padding:10px 20px;border:none;border-radius:8px;background:#f59e0b;color:#fff;cursor:pointer;font-weight:600;">Confirmar</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('prof-confirm-cancel').onclick = () => overlay.remove();
    document.getElementById('prof-confirm-ok').onclick = () => {
        overlay.remove();
        onConfirmar();
    };
}