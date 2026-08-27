-- ============================================================
-- MIND RECALL — Escola — Script de Evolução do Banco de Dados
-- Projeto: gijgocyrumhalzqhkggj.supabase.co
-- Execute no: Supabase Dashboard → SQL Editor → New Query → Run
-- ============================================================

-- ============================================================
-- TABELA: matriculas
-- Vínculo N:N entre alunos e cursos.
-- Permite que um mesmo aluno tenha múltiplos cursos matriculados.
-- aluno_id → references public.alunos(id) que por sua vez
--            é o mesmo UUID de auth.users(id)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.matriculas (
    id              UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    aluno_id        UUID        NOT NULL REFERENCES public.alunos(id)  ON DELETE CASCADE,
    curso_id        UUID        NOT NULL REFERENCES public.cursos(id)  ON DELETE RESTRICT,
    turma           TEXT,
    data_matricula  DATE        NOT NULL DEFAULT CURRENT_DATE,
    criado_por      UUID        REFERENCES auth.users(id),
    criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Impede matrícula duplicada do mesmo aluno no mesmo curso
    CONSTRAINT uq_matricula_aluno_curso UNIQUE (aluno_id, curso_id)
);

-- Índices para performance nas queries mais comuns
CREATE INDEX IF NOT EXISTS idx_matriculas_aluno  ON public.matriculas (aluno_id);
CREATE INDEX IF NOT EXISTS idx_matriculas_curso  ON public.matriculas (curso_id);
CREATE INDEX IF NOT EXISTS idx_matriculas_data   ON public.matriculas (data_matricula DESC);

COMMENT ON TABLE  public.matriculas              IS 'Vínculo N:N entre alunos e cursos (múltiplas matrículas por aluno)';
COMMENT ON COLUMN public.matriculas.aluno_id     IS 'FK → public.alunos.id (mesmo UUID de auth.users.id)';
COMMENT ON COLUMN public.matriculas.curso_id     IS 'FK → public.cursos.id';
COMMENT ON COLUMN public.matriculas.turma        IS 'Nome/código da turma';
COMMENT ON COLUMN public.matriculas.data_matricula IS 'Data em que a matrícula foi realizada';
COMMENT ON COLUMN public.matriculas.criado_por   IS 'UUID do usuário que realizou o cadastro (auth.users)';

-- ============================================================
-- TABELA: pagamentos
-- Registros financeiros de pagamentos dos alunos.
-- aluno_id → references public.alunos(id)
-- curso_id → nullable (pagamento pode não estar vinculado a curso)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pagamentos (
    id               UUID          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    aluno_id         UUID          NOT NULL REFERENCES public.alunos(id)  ON DELETE CASCADE,
    curso_id         UUID                   REFERENCES public.cursos(id)  ON DELETE SET NULL,
    valor_pago       NUMERIC(10,2) NOT NULL CHECK (valor_pago >= 0),
    forma_pagamento  TEXT          NOT NULL CHECK (
                         forma_pagamento IN (
                             'Pix',
                             'Cartão de Crédito',
                             'Cartão de Débito',
                             'Boleto',
                             'Dinheiro',
                             'Transferência'
                         )
                     ),
    data_pagamento   DATE          NOT NULL DEFAULT CURRENT_DATE,
    status           TEXT          NOT NULL DEFAULT 'Pago' CHECK (
                         status IN ('Pago', 'Pendente', 'Atrasado', 'Cancelado')
                     ),
    observacao       TEXT,
    criado_por       UUID          REFERENCES auth.users(id),
    criado_em        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SE A TABELA pagamentos JÁ EXISTIR: atualize o CHECK do status
-- Execute apenas se o script anterior já foi rodado antes:
-- ============================================================
-- ALTER TABLE public.pagamentos DROP CONSTRAINT IF EXISTS pagamentos_status_check;
-- ALTER TABLE public.pagamentos ADD CONSTRAINT pagamentos_status_check
--     CHECK (status IN ('Pago', 'Pendente', 'Atrasado', 'Cancelado'));
-- ============================================================

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_pagamentos_aluno  ON public.pagamentos (aluno_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_curso  ON public.pagamentos (curso_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_data   ON public.pagamentos (data_pagamento DESC);
CREATE INDEX IF NOT EXISTS idx_pagamentos_forma  ON public.pagamentos (forma_pagamento);
CREATE INDEX IF NOT EXISTS idx_pagamentos_status ON public.pagamentos (status);

COMMENT ON TABLE  public.pagamentos                 IS 'Registros de pagamentos realizados pelos alunos';

-- ============================================================
-- NOVA COLUNA: contrato_url e Dados do Aluno (Onboarding)
-- ============================================================
ALTER TABLE public.alunos ADD COLUMN IF NOT EXISTS contrato_url TEXT;

ALTER TABLE public.alunos 
ADD COLUMN IF NOT EXISTS telefone TEXT,
ADD COLUMN IF NOT EXISTS telefone_secundario TEXT,
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS cep TEXT,
ADD COLUMN IF NOT EXISTS logradouro TEXT,
ADD COLUMN IF NOT EXISTS numero TEXT,
ADD COLUMN IF NOT EXISTS bairro TEXT,
ADD COLUMN IF NOT EXISTS cidade_uf TEXT;

-- Adiciona suporte a notas diretas por matrícula (Curso/Aluno)
ALTER TABLE public.matriculas 
ADD COLUMN IF NOT EXISTS nota1 NUMERIC(4,2),
ADD COLUMN IF NOT EXISTS nota2 NUMERIC(4,2),
ADD COLUMN IF NOT EXISTS media NUMERIC(4,2) GENERATED ALWAYS AS ((nota1 + nota2) / 2) STORED;

COMMENT ON COLUMN public.pagamentos.curso_id        IS 'FK → public.cursos.id (nullable)';
COMMENT ON COLUMN public.pagamentos.valor_pago      IS 'Valor monetário pago em R$';
COMMENT ON COLUMN public.pagamentos.forma_pagamento IS 'Meio: Pix | Cartão de Crédito | Cartão de Débito | Boleto | Dinheiro | Transferência';
COMMENT ON COLUMN public.pagamentos.data_pagamento  IS 'Data em que o pagamento foi realizado';
COMMENT ON COLUMN public.pagamentos.status          IS 'Situação: Pago | Pendente | Cancelado';
COMMENT ON COLUMN public.pagamentos.observacao      IS 'Observações opcionais da secretaria';

-- ============================================================
-- HABILITAR ROW LEVEL SECURITY (RLS)
-- Obrigatório no Supabase para controle de acesso por linha
-- ============================================================
ALTER TABLE public.matriculas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagamentos ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- POLÍTICAS RLS — TABELA: matriculas
-- Secretaria: acesso completo (SELECT, INSERT, UPDATE, DELETE)
-- Professor  : somente SELECT nos alunos que ele criou
-- ============================================================

-- Secretaria: Ler matrículas
CREATE POLICY "secretaria_select_matriculas"
    ON public.matriculas
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.perfis
            WHERE perfis.id = auth.uid()
              AND perfis.tipo = 'secretaria'
        )
    );

-- Secretaria: Inserir matrículas
CREATE POLICY "secretaria_insert_matriculas"
    ON public.matriculas
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.perfis
            WHERE perfis.id = auth.uid()
              AND perfis.tipo = 'secretaria'
        )
    );

-- Secretaria: Atualizar matrículas
CREATE POLICY "secretaria_update_matriculas"
    ON public.matriculas
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.perfis
            WHERE perfis.id = auth.uid()
              AND perfis.tipo = 'secretaria'
        )
    );

-- Secretaria: Excluir matrículas
CREATE POLICY "secretaria_delete_matriculas"
    ON public.matriculas
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.perfis
            WHERE perfis.id = auth.uid()
              AND perfis.tipo = 'secretaria'
        )
    );

-- Professor: Ler apenas matrículas de alunos que ele criou
CREATE POLICY "professor_select_matriculas"
    ON public.matriculas
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.alunos
            WHERE alunos.id        = matriculas.aluno_id
              AND alunos.criado_por = auth.uid()
        )
    );

-- ============================================================
-- POLÍTICAS RLS — TABELA: pagamentos
-- Secretaria: acesso completo
-- ============================================================

-- Secretaria: Ler pagamentos
CREATE POLICY "secretaria_select_pagamentos"
    ON public.pagamentos
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.perfis
            WHERE perfis.id = auth.uid()
              AND perfis.tipo = 'secretaria'
        )
    );

-- Secretaria: Inserir pagamentos
CREATE POLICY "secretaria_insert_pagamentos"
    ON public.pagamentos
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.perfis
            WHERE perfis.id = auth.uid()
              AND perfis.tipo = 'secretaria'
        )
    );

-- Secretaria: Atualizar pagamentos
CREATE POLICY "secretaria_update_pagamentos"
    ON public.pagamentos
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.perfis
            WHERE perfis.id = auth.uid()
              AND perfis.tipo = 'secretaria'
        )
    );

-- Secretaria: Excluir pagamentos
CREATE POLICY "secretaria_delete_pagamentos"
    ON public.pagamentos
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.perfis
            WHERE perfis.id = auth.uid()
              AND perfis.tipo = 'secretaria'
        )
    );

-- ============================================================
-- MIGRAÇÃO DE DADOS EXISTENTES
-- Popula a tabela matriculas com os vínculos já existentes
-- na tabela alunos (campo curso_id legado).
-- ON CONFLICT garante idempotência: seguro re-executar.
-- ============================================================
INSERT INTO public.matriculas (aluno_id, curso_id, turma, data_matricula, criado_por)
SELECT
    a.id                                        AS aluno_id,
    a.curso_id                                  AS curso_id,
    a.turma                                     AS turma,
    COALESCE(a.data_matricula, CURRENT_DATE)    AS data_matricula,
    a.criado_por                                AS criado_por
FROM public.alunos a
WHERE a.curso_id IS NOT NULL
ON CONFLICT (aluno_id, curso_id) DO NOTHING;

-- ============================================================
-- VERIFICAÇÃO — Rode estas queries APÓS executar o script:
-- ============================================================
-- 1. Contar registros migrados:
--    SELECT COUNT(*) AS total_matriculas FROM public.matriculas;
--
-- 2. Confirmar tabela pagamentos vazia (nova):
--    SELECT COUNT(*) AS total_pagamentos FROM public.pagamentos;
--
-- 3. Confirmar políticas RLS criadas:
--    SELECT tablename, policyname, cmd
--    FROM pg_policies
--    WHERE tablename IN ('matriculas', 'pagamentos')
--    ORDER BY tablename, cmd;
--
-- 4. Ver estrutura das tabelas:
--    \d public.matriculas
--    \d public.pagamentos
-- ============================================================

-- ============================================================
-- MÓDULO DE CURSOS E DISCIPLINAS
-- ============================================================

-- Garantir que a tabela CURSOS existe e tem a coluna 'duracao'
CREATE TABLE IF NOT EXISTS public.cursos (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    nome TEXT NOT NULL,
    duracao TEXT,
    criado_por UUID REFERENCES auth.users(id),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Habilitar RLS em Cursos e criar políticas
ALTER TABLE public.cursos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_cursos" ON public.cursos FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_cursos" ON public.cursos FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.perfis WHERE perfis.id = auth.uid() AND perfis.tipo = 'secretaria')
);

-- ============================================================
-- TABELA: disciplinas
-- ============================================================
CREATE TABLE IF NOT EXISTS public.disciplinas (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    curso_id UUID NOT NULL REFERENCES public.cursos(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    carga_horaria INTEGER NOT NULL CHECK (carga_horaria > 0),
    criado_por UUID REFERENCES auth.users(id),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Habilitar RLS em Disciplinas
ALTER TABLE public.disciplinas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_disciplinas" ON public.disciplinas FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_disciplinas" ON public.disciplinas FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.perfis WHERE perfis.id = auth.uid() AND perfis.tipo = 'secretaria')
);

-- ============================================================
-- TABELA: financeiro (Controle de Parcelas / Boletos)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.financeiro (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    aluno_id UUID NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
    numero_parcela INTEGER NOT NULL,
    total_parcelas INTEGER NOT NULL,
    valor NUMERIC(10,2) NOT NULL,
    vencimento DATE NOT NULL,
    paga BOOLEAN NOT NULL DEFAULT false,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Habilitar RLS em Financeiro
ALTER TABLE public.financeiro ENABLE ROW LEVEL SECURITY;

CREATE POLICY "secretaria_select_financeiro" ON public.financeiro FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.perfis WHERE perfis.id = auth.uid() AND perfis.tipo = 'secretaria')
);
CREATE POLICY "secretaria_insert_financeiro" ON public.financeiro FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.perfis WHERE perfis.id = auth.uid() AND perfis.tipo = 'secretaria')
);
CREATE POLICY "secretaria_update_financeiro" ON public.financeiro FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.perfis WHERE perfis.id = auth.uid() AND perfis.tipo = 'secretaria')
);
CREATE POLICY "secretaria_delete_financeiro" ON public.financeiro FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.perfis WHERE perfis.id = auth.uid() AND perfis.tipo = 'secretaria')
);
