# Crons automáticos (GitHub Actions)

Avisos de **usuários** (WhatsApp) e **admin** (WhatsApp + e-mail) rodam sozinhos.
Não dependem de login nem do botão “Verificar alertas”.

| Workflow | Frequência | Function |
| --- | --- | --- |
| `operational-reminders.yml` | a cada 1 h | lembretes dos postos (Meta templates) |
| `admin-management-alerts.yml` | a cada 1 h | cotas / domínio / Resend do admin |

## Secrets no GitHub (obrigatório)

Repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

| Nome no GitHub | Mesmo valor do secret no Supabase |
| --- | --- |
| `OPERATIONAL_CRON_SECRET` | `OPERATIONAL_CRON_SECRET` |
| `ADMIN_MGMT_CRON_SECRET` | `ADMIN_MGMT_CRON_SECRET` |

Depois: aba **Actions** → rodar **Run workflow** uma vez em cada para testar.
