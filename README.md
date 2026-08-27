<div align="center">
  <img src="logo.jpg" alt="Mind Recall Logo" width="120" />
  
  <h1>🧠 Mind Recall</h1>
  <p><strong>Plataforma de Gestão Educacional Inteligente (ERP)</strong></p>

  <p>
    <img src="https://img.shields.io/badge/Status-Em_Desenvolvimento-blue?style=for-the-badge" alt="Status" />
    <img src="https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white" alt="HTML5" />
    <img src="https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white" alt="CSS3" />
    <img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" alt="JavaScript" />
    <img src="https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase" />
  </p>
  
  <p><em>Um sistema completo e responsivo para simplificar fluxos operacionais, integrar dados e otimizar a experiência de gestão escolar.</em></p>
</div>

<br>

## 📌 Índice
- [Sobre o Projeto](#-sobre-o-projeto)
- [Demonstração](#-demonstração)
- [Funcionalidades por Módulo](#-funcionalidades-por-módulo)
- [Arquitetura e Tecnologias](#-arquitetura-e-tecnologias)
- [Como Rodar o Projeto](#-como-rodar-o-projeto)
- [Contato](#-contato)

<br>

## 📖 Sobre o Projeto
O **Mind Recall** é uma plataforma educacional (ERP) completa, desenvolvida para gerenciar de forma inteligente o fluxo de dados entre Secretaria, Professores e Alunos. O sistema conta com regras de negócio robustas, controle de acesso seguro e armazenamento em nuvem de ponta a ponta, garantindo velocidade e agilidade na certificação e gestão de contratos.

---

## 📸 Demonstração

*Abaixo você pode ver partes importantes do sistema em pleno funcionamento:*

<div align="center">
  <img src="Secretaria%20Painel.png" alt="Painel da Secretaria" width="48%">
  <img src="Professor%20Painel.png" alt="Painel do Professor" width="48%">
</div>

---

## 🚀 Funcionalidades por Módulo

| Módulo | Funcionalidades Principais |
|:---:|---|
| **👩‍💼 Secretaria** | 📄 **Gestão de Contratos:** Auditoria centralizada de contratos de alunos com visualização de PDFs.<br>🎓 **Certificados:** Upload integrado via Storage, bloqueado até aprovação final pelo docente.<br>📋 **Onboarding:** Acompanhamento de cadastro inicial. |
| **👨‍🏫 Professor** | 📊 **Diário de Classe:** Visualização rápida de turmas, alunos e lançamento de notas.<br>✅ **Validação Docente:** Sistema de aprovação/reprovação de conclusão, acionando a liberação na secretaria. |
| **🎓 Aluno** | 📝 **Onboarding Inteligente:** Autopreenchimento e conferência de dados pessoais e endereço via API.<br>📂 **Área Privada:** Visualização de notas, contratos ativos e download de certificados (quando liberados pela gestão). |

---

## 🛠️ Arquitetura e Tecnologias

- **Frontend:** Desenvolvido em HTML5, CSS3 e JavaScript Vanilla, priorizando uma interface moderna, responsiva e *clean*.
- **Backend/BaaS:** Supabase (PostgreSQL).
  - **Database:** Tabelas relacionais (`alunos`, `matriculas`, `cursos`) com JOINs complexos.
  - **Storage:** Gerenciamento e hospedagem de arquivos estáticos (Buckets para PDFs de contratos e certificados).
  - **Security:** RLS (Row-Level Security) para proteção de dados sensíveis.

---

## ⚙️ Como Rodar o Projeto (Localmente)

Siga os passos abaixo para testar o Mind Recall na sua máquina local.

**1. Clone o repositório**
```bash
git clone https://github.com/seu-usuario/Projeto-Mind-Recall.git
cd Projeto-Mind-Recall
```

**2. Configuração do Supabase**
No arquivo de configuração JS, localize as chaves de conexão e substitua pelos seus dados do Supabase:
```javascript
const SUPABASE_URL = 'https://SEU_PROJETO.supabase.co';
const SUPABASE_ANON_KEY = 'SUA_CHAVE_ANONIMA';
```
> **Nota:** Certifique-se de aplicar o arquivo SQL de migrações (`supabase_migration_v2.sql`) no seu projeto Supabase para gerar as tabelas.

**3. Inicializando o Frontend**
Como o projeto é em HTML/JS Vanilla, ele necessita ser rodado sob o protocolo HTTP/HTTPS (não `file://`).
- Usando a extensão **Live Server** (VS Code): Clique com o botão direito no `index.html` e selecione **"Open with Live Server"**.
- Ou usando Python:
```bash
python -m http.server 3000
```
- Acesse no navegador: `http://localhost:3000`

---

## 👨‍💻 Desenvolvedor e Suporte

Sistema arquitetado e desenvolvido por **Danyel Moreira**.

Para solicitações de manutenção, suporte técnico ou orçamento para desenvolvimento de novos módulos e integrações, entre em contato através dos canais abaixo:

- ✉️ **E-mail:** [danyelmoreira99@gmail.com](mailto:danyelmoreira99@gmail.com)
- 💼 **LinkedIn:** [Danyel Moreira](https://www.linkedin.com/in/danyelmoreira/)
