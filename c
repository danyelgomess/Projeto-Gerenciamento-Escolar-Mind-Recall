/* ===== GESTÃO DE ALUNOS - SCRIPT PRINCIPAL ===== */

document.addEventListener('DOMContentLoaded', () => {
    // Elementos do DOM
    const studentForm = document.getElementById('studentForm');
    const studentsTableBody = document.getElementById('studentsTableBody');
    const emptyState = document.getElementById('emptyState');
    const searchInput = document.getElementById('searchInput');
    const courseSelect = document.getElementById('course');
    const customCourseGroup = document.getElementById('customCourseGroup');
    const customCourseInput = document.getElementById('customCourse');
    const paymentTypeRadios = document.querySelectorAll('input[name="paymentType"]');
    const installmentsGroup = document.getElementById('installmentsGroup');
    const installmentsInput = document.getElementById('installments');
    const dueDateGroup = document.getElementById('dueDateGroup');
    const dueDateInput = document.getElementById('dueDate');
    const courseTotalInput = document.getElementById('courseTotal');
    const modal = document.getElementById('studentModal');
    const modalBody = document.getElementById('modalBody');
    const modalClose = document.querySelector('.modal-close');

    // Estado
    let students = [];
    let searchTerm = '';

    // ===== INICIALIZAÇÃO =====
    init();

    function init() {
        loadFromLocalStorage();
        renderStudents();
        setupEventListeners();
    }

    // ===== EVENT LISTENERS =====
    function setupEventListeners() {
        // Submissão do formulário
        studentForm.addEventListener('submit', handleFormSubmit);

        // Busca dinâmica
        searchInput.addEventListener('input', (e) => {
            searchTerm = e.target.value.toLowerCase();
            renderStudents();
        });

        // Mostrar/ocultar campo de curso personalizado
        courseSelect.addEventListener('change', () => {
            if (courseSelect.value === 'Outro') {
                customCourseGroup.style.display = 'block';
                customCourseInput.required = true;
            } else {
                customCourseGroup.style.display = 'none';
                customCourseInput.required = false;
                customCourseInput.value = '';
            }
        });

        // Mostrar/ocultar campos de pagamento (parcelas e vencimento)
        paymentTypeRadios.forEach(radio => {
            radio.addEventListener('change', () => {
                if (radio.value === 'parcelado') {
                    installmentsGroup.style.display = 'block';
                    installmentsInput.required = true;
                    dueDateGroup.style.display = 'block';
                    dueDateInput.required = true;
                } else {
                    installmentsGroup.style.display = 'none';
                    installmentsInput.required = false;
                    dueDateGroup.style.display = 'none';
                    dueDateInput.required = false;
                }
            });
        });

        // Fechar modal
        modalClose.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
    }

    // ===== FUNÇÕES DE FORMULÁRIO =====
    function handleFormSubmit(e) {
        e.preventDefault();

        // Capturar valores do formulário
        const fullName = document.getElementById('fullName').value.trim();
        const cpf = document.getElementById('cpf').value.trim();
        const phone = document.getElementById('phone').value.trim();
        const address = document.getElementById('address').value.trim();
        const course = courseSelect.value;
        const customCourse = customCourseInput.value.trim();
        const contractFile = document.getElementById('contract').files[0];
        const paymentType = document.querySelector('input[name="paymentType"]:checked')?.value;
        const installments = parseInt(installmentsInput.value);
        const courseTotal = parseFloat(courseTotalInput.value);
        const dueDate = parseInt(dueDateInput.value);

        // Validações
        if (!fullName || !cpf || !phone || !address || !course || !contractFile || !paymentType) {
            showAlert('Por favor, preencha todos os campos obrigatórios.', 'error');
            return;
        }

        // Curso personalizado
        const finalCourse = course === 'Outro' ? customCourse : course;
        if (course === 'Outro' && !customCourse) {
            showAlert('Por favor, especifique o nome do curso.', 'error');
            return;
        }

        // Validação de valor total
        if (!courseTotal || courseTotal <= 0) {
            showAlert('Por favor, informe um valor total do curso válido.', 'error');
            return;
        }

        // Validação de parcelas
        let numInstallments = 1;
        if (paymentType === 'parcelado') {
            if (!installments || installments < 2) {
                showAlert('Para pagamento parcelado, informe pelo menos 2 parcelas.', 'error');
                return;
            }
            numInstallments = installments;

            // Validação de dia de vencimento
            if (!dueDate || dueDate < 1 || dueDate > 31) {
                showAlert('Por favor, informe um dia de vencimento válido (1 a 31).', 'error');
                return;
            }
        }

        // Calcular valor da parcela
        const installmentValue = courseTotal / numInstallments;

        // Ler arquivo do contrato
        const reader = new FileReader();
        reader.onload = function(e) {
            const contractData = {
                name: contractFile.name,
                type: contractFile.type,
                data: e.target.result,
                size: formatFileSize(contractFile.size)
            };

            // Criar objeto do aluno
            const student = {
                id: Date.now().toString(),
                fullName,
                cpf,
                phone,
                address,
                course: finalCourse,
                contract: contractData,
                paymentType,
                installments: numInstallments,
                courseTotal: courseTotal,
                dueDate: dueDate || null,
                installmentValue: installmentValue,
                installmentsList: generateInstallments(numInstallments, paymentType, dueDate, installmentValue),
                createdAt: new Date().toISOString()
            };

            // Salvar e renderizar
            students.push(student);
            saveToLocalStorage();
            renderStudents();
            resetForm();
            showAlert(`Aluno "${fullName}" cadastrado com sucesso!`, 'success');
        };
        reader.readAsDataURL(contractFile);
    }

    function resetForm() {
        studentForm.reset();
        customCourseGroup.style.display = 'none';
        installmentsGroup.style.display = 'none';
        dueDateGroup.style.display = 'none';
        customCourseInput.value = '';
        customCourseInput.required = false;
        installmentsInput.required = false;
        installmentsInput.value = '2';
        dueDateInput.required = false;
        dueDateInput.value = '5';
    }

    // ===== GERAÇÃO DE PARCELAS =====
    function generateInstallments(numInstallments, paymentType, dueDateDay, installmentValue) {
        if (paymentType === 'vista') {
            return [{
                id: '1',
                number: 1,
                total: numInstallments,
                status: 'pending',
                dueDate: new Date().toISOString().split('T')[0],
                value: installmentValue
            }];
        }

        const installmentsList = [];
        const today = new Date();
        const day = dueDateDay || 5;

        for (let i = 1; i <= numInstallments; i++) {
            const dueDate = new Date(today);
            dueDate.setMonth(today.getMonth() + (i - 1));
            // Ajustar o dia do mês, considerando meses com menos dias
            const daysInMonth = new Date(dueDate.getFullYear(), dueDate.getMonth() + 1, 0).getDate();
            dueDate.setDate(Math.min(day, daysInMonth));

            installmentsList.push({
                id: i.toString(),
                number: i,
                total: numInstallments,
                status: 'pending',
                dueDate: dueDate.toISOString().split('T')[0],
                value: installmentValue
            });
        }

        return installmentsList;
    }

    // ===== RENDERIZAÇÃO DA TABELA =====
    function renderStudents() {
        const filteredStudents = students.filter(student => {
            const matchesName = student.fullName.toLowerCase().includes(searchTerm);
            const matchesCourse = student.course.toLowerCase().includes(searchTerm);
            return matchesName || matchesCourse;
        });

        if (filteredStudents.length === 0) {
            emptyState.style.display = 'block';
            studentsTableBody.innerHTML = '';
            return;
        }

        emptyState.style.display = 'none';

        studentsTableBody.innerHTML = filteredStudents.map(student => {
            const paymentLabel = student.paymentType === 'vista' ? 'À vista' : 'Parcelado';
            const paidCount = student.installmentsList.filter(i => i.status === 'paid').length;
            const totalCount = student.installmentsList.length;
            const allPaid = paidCount === totalCount;

            let statusClass = 'status-pending';
            let statusText = `${paidCount}/${totalCount} pendentes`;

            if (allPaid) {
                statusClass = 'status-full-paid';
                statusText = 'Todas Pagas';
            } else if (paidCount > 0) {
                statusClass = 'status-paid';
                statusText = `${paidCount}/${totalCount} pagas`;
            }

            const courseTotalFormatted = formatCurrency(student.courseTotal || 0);
            const dueDateFormatted = student.dueDate ? `Dia ${student.dueDate}` : '-';

            return `
                <tr data-id="${student.id}">
                    <td><strong>${escapeHtml(student.fullName)}</strong></td>
                    <td>${escapeHtml(student.course)}</td>
                    <td>${escapeHtml(student.phone)}</td>
                    <td>${escapeHtml(student.cpf)}</td>
                    <td><span class="course-value">${courseTotalFormatted}</span></td>
                    <td><span class="due-date">${dueDateFormatted}</span></td>
                    <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                    <td>${paymentLabel} (${totalCount})</td>
                    <td>
                        <div class="action-buttons">
                            <button class="action-btn action-btn-view" onclick="viewStudent('${student.id}')">👁️ Ver</button>
                            <button class="action-btn action-btn-delete" onclick="deleteStudent('${student.id}')">🗑️ Excluir</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // ===== MODAL DE DETALHES =====
    window.viewStudent = function(id) {
        const student = students.find(s => s.id === id);
        if (!student) return;

        const paymentLabel = student.paymentType === 'vista' ? 'À vista' : 'Parcelado';
        const contractIcon = student.contract.type.includes('pdf') ? '📄' : '🖼️';
        const courseTotalFormatted = formatCurrency(student.courseTotal || 0);
        const installmentValueFormatted = formatCurrency(student.installmentValue || 0);
        const dueDateFormatted = student.dueDate ? `Dia ${student.dueDate}` : '-';

        let installmentsHtml = '';
        if (student.installmentsList.length > 0) {
            installmentsHtml = `
                <div class="installments-section">
                    <h4>💰 Parcelas (${student.installmentsList.length})</h4>
                    <p style="margin-bottom: 12px; color: var(--gray); font-size: 0.9rem;">
                        Valor de cada parcela: <strong>${installmentValueFormatted}</strong>
                    </p>
                    ${student.installmentsList.map(inst => {
                        const isPaid = inst.status === 'paid';
                        const instValueFormatted = formatCurrency(inst.value || 0);
                        return `
                            <div class="installment-item ${isPaid ? 'paid' : 'pending'}">
                                <div class="installment-info">
                                    <span class="installment-number">Parcela ${inst.number} de ${inst.total}</span>
                                    <span class="installment-date">Vencimento: ${formatDate(inst.dueDate)}</span>
                                    <span class="installment-value">Valor: ${instValueFormatted}</span>
                                </div>
                                <div class="installment-status">
                                    <span class="status-label ${isPaid ? 'status-paid-label' : 'status-pending-label'}">
                                        ${isPaid ? '✅ Paga' : '⏳ Pendente'}
                                    </span>
                                    <button class="action-btn btn-sm ${isPaid ? 'btn-secondary' : 'btn-primary'}" 
                                            onclick="toggleInstallment('${student.id}', '${inst.id}')">
                                        ${isPaid ? 'Desmarcar' : 'Marcar como Paga'}
                                    </button>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        }

        modalBody.innerHTML = `
            <div class="modal-info">
                <div class="modal-info-item">
                    <label>Nome Completo</label>
                    <div class="value">${escapeHtml(student.fullName)}</div>
                </div>
                <div class="modal-info-item">
                    <label>CPF</label>
                    <div class="value">${escapeHtml(student.cpf)}</div>
                </div>
                <div class="modal-info-item">
                    <label>Telefone</label>
                    <div class="value">${escapeHtml(student.phone)}</div>
                </div>
                <div class="modal-info-item">
                    <label>Curso</label>
                    <div class="value">${escapeHtml(student.course)}</div>
                </div>
                <div class="modal-info-item">
                    <label>Tipo de Pagamento</label>
                    <div class="value">${paymentLabel}</div>
                </div>
                <div class="modal-info-item">
                    <label>Valor Total do Curso</label>
                    <div class="value">${courseTotalFormatted}</div>
                </div>
                <div class="modal-info-item">
                    <label>Dia de Vencimento</label>
                    <div class="value">${dueDateFormatted}</div>
                </div>
                <div class="modal-info-item">
                    <label>Valor da Parcela</label>
                    <div class="value">${installmentValueFormatted}</div>
                </div>
                <div class="modal-info-item">
                    <label>Data de Cadastro</label>
                    <div class="value">${formatDate(student.createdAt)}</div>
                </div>
                <div class="modal-info-item full-width">
                    <label>Endereço</label>
                    <div class="value">${escapeHtml(student.address)}</div>
                </div>
                <div class="modal-info-item full-width">
                    <label>Contrato: ${contractIcon} ${student.contract.name}</label>
                    <div class="value">
                        <a href="${student.contract.data}" 
                           download="${student.contract.name}" 
                           class="btn-download">
                            📥 Baixar Contrato
                        </a>
                    </div>
                </div>
            </div>
            ${installmentsHtml}
        `;

        modal.classList.add('show');
    };

    window.toggleInstallment = function(studentId, installmentId) {
        const student = students.find(s => s.id === studentId);
        if (!student) return;

        const installment = student.installmentsList.find(i => i.id === installmentId);
        if (!installment) return;

        installment.status = installment.status === 'paid' ? 'pending' : 'paid';
        saveToLocalStorage();
        renderStudents();

        // Atualizar o modal mantendo-o aberto
        const modalBodyClone = modalBody.cloneNode(false);
        modalBodyClone.innerHTML = modalBody.innerHTML;
        modal.replaceChild(modalBodyClone, modalBody);

        // Reabrir o modal com os dados atualizados
        viewStudent(studentId);
    };

    function closeModal() {
        modal.classList.remove('show');
    }

    // ===== EXCLUIR ALUNO =====
    window.deleteStudent = function(id) {
        const student = students.find(s => s.id === id);
        if (!student) return;

        if (confirm(`Tem certeza que deseja excluir o aluno "${student.fullName}"?\nEsta ação não pode ser desfeita.`)) {
            students = students.filter(s => s.id !== id);
            saveToLocalStorage();
            renderStudents();
            closeModal();
            showAlert(`Aluno "${student.fullName}" excluído com sucesso!`, 'success');
        }
    };

    // ===== ARMAZENAMENTO LOCAL =====
    function saveToLocalStorage() {
        try {
            localStorage.setItem('students', JSON.stringify(students));
        } catch (error) {
            console.error('Erro ao salvar no localStorage:', error);
            showAlert('Erro ao salvar dados. Verifique o armazenamento do navegador.', 'error');
        }
    }

    function loadFromLocalStorage() {
        try {
            const data = localStorage.getItem('students');
            if (data) {
                students = JSON.parse(data);
            }
        } catch (error) {
            console.error('Erro ao carregar do localStorage:', error);
            students = [];
        }
    }

    // ===== FUNÇÕES AUXILIARES =====
    function formatDate(dateString) {
        if (!dateString) return 'N/A';
        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return 'Data inválida';
            return date.toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });
        } catch (error) {
            return 'Data inválida';
        }
    }

    function formatCurrency(value) {
        if (value === null || value === undefined || isNaN(value)) return 'R$ 0,00';
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(value);
    }

    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ===== ALERTAS CUSTOMIZADOS =====
    function showAlert(message, type = 'success') {
        // Remover alertas existentes
        const existingAlerts = document.querySelectorAll('.custom-alert');
        existingAlerts.forEach(alert => alert.remove());

        const alert = document.createElement('div');
        alert.className = `custom-alert alert-${type}`;
        alert.innerHTML = `
            <div class="alert-content">
                <span class="alert-icon">${type === 'success' ? '✅' : '❌'}</span>
                <span class="alert-message">${escapeHtml(message)}</span>
            </div>
        `;

        // Estilos do alerta
        alert.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
            z-index: 2000;
            max-width: 400px;
            animation: slideIn 0.3s ease;
            background: ${type === 'success' ? 'rgba(16, 185, 129, 0.95)' : 'rgba(239, 68, 68, 0.95)'};
            color: white;
            backdrop-filter: blur(10px);
        `;

        document.body.appendChild(alert);

        // Remover após 4 segundos
        setTimeout(() => {
            alert.style.opacity = '0';
            alert.style.transition = 'opacity 0.5s ease';
            setTimeout(() => alert.remove(), 500);
        }, 4000);
    }

    // Adicionar estilos de animação do alerta
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from { opacity: 0; transform: translateX(100%); }
            to { opacity: 1; transform: translateX(0); }
        }
        .custom-alert .alert-content {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .custom-alert .alert-icon {
            font-size: 1.2rem;
        }
    `;
    document.head.appendChild(style);
});
