-- ============================================================
-- MIND RECALL — Migração: Autenticação de Alunos via CPF
-- Execute no: Supabase Dashboard → SQL Editor → New Query → Run
-- ============================================================

-- 1. Adicionar colunas de autenticação própria na tabela alunos
ALTER TABLE public.alunos
    ADD COLUMN IF NOT EXISTS primeiro_acesso BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS senha_hash       TEXT;

COMMENT ON COLUMN public.alunos.primeiro_acesso IS
    'true = aluno ainda não trocou a senha (usa RA como senha inicial). false = já definiu senha própria.';
COMMENT ON COLUMN public.alunos.senha_hash IS
    'Senha definida pelo aluno no primeiro acesso. Armazenada como texto (plain). Nulo enquanto primeiro_acesso=true.';

-- 2. Garantir que a coluna cpf existe e terá índice para buscas rápidas
ALTER TABLE public.alunos
    ADD COLUMN IF NOT EXISTS cpf TEXT;

CREATE INDEX IF NOT EXISTS idx_alunos_cpf ON public.alunos (cpf);

COMMENT ON COLUMN public.alunos.cpf IS
    'CPF do aluno em formato numérico puro (apenas dígitos, sem pontuação).';

-- ============================================================
-- 3. RLS POLICY: permitir que o role ANON busque alunos pelo CPF
--    Necessário para autenticação de alunos sem Supabase Auth JWT.
-- ============================================================
DROP POLICY IF EXISTS "anon_select_aluno_por_cpf" ON public.alunos;

CREATE POLICY "anon_select_aluno_por_cpf"
    ON public.alunos
    FOR SELECT
    TO anon
    USING (true);

-- ============================================================
-- 4. Verificação — execute após o script para confirmar:
-- ============================================================
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name = 'alunos'
--   AND column_name IN ('primeiro_acesso', 'senha_hash', 'cpf')
-- ORDER BY column_name;
