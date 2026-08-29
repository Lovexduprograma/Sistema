# Biblioteca Escolar

Aplicacao web simples para cadastro de livros, emprestimo/devolucao, relatorios, catalogo,
cadastro de alunos, reservas e multa por atraso.

## Como rodar

1. Instale dependencias:
   - `npm install`
2. Inicie o servidor:
   - `npm run dev`
3. Acesse:
   - `http://localhost:3000`

## Usuario inicial

Na primeira execucao, o sistema cria um usuario administrador.

- Usuario padrao: `admin`
- Senha padrao: `admin123`

Voce pode trocar criando variaveis de ambiente antes de iniciar:

- `ADMIN_USER`
- `ADMIN_PASS`
- `SESSION_SECRET`
- `LOAN_DAYS` (padrao: 30 dias)
- `FINE_PER_DAY` (padrao: 1)
- `GMAIL_USER` (email do Gmail)
- `GMAIL_APP_PASS` (senha de app do Gmail)

## Login de aluno

Ao cadastrar um aluno, informe email e senha. O aluno entra usando email + senha no login.
Nao e possivel ver a senha atual (ela fica criptografada), mas o admin pode alterar definindo
uma nova senha no cadastro do aluno.

## Notificacoes por email

Use um app password do Gmail para `GMAIL_APP_PASS`. Depois use o botao "Enviar email de atraso"
no relatorio para disparar notificacoes dos emprestimos vencidos.

## Open Library (sinopse)

No cadastro de livro, use o botao "Buscar na Open Library" para preencher dados e sinopse
via internet usando ISBN ou titulo/autor.

## Avaliacoes (Open Library)

No modal do livro, o sistema busca a avaliacao pela Open Library usando o `work key`.

Exemplo no Windows (PowerShell):

```
$env:ADMIN_USER="biblioteca"
$env:ADMIN_PASS="senha_forte"
$env:SESSION_SECRET="troque_este_valor"
npm run dev
```

O banco de dados fica no arquivo `data.sqlite` na raiz do projeto.
