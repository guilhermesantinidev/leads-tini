# Leads — STN Consultoria

PWA de controle de prospecção (Instagram/WhatsApp): Kanban com 5 colunas
(Contatado → Respondeu → Em conversa → Fechado / Perdido), instalável no
celular e no computador, dados ao vivo no Firestore.

## 1. Criar o projeto Firebase

Recomendo um projeto **separado** do `tinisportsreplay` — dados de negócio
diferentes, sem motivo pra misturar.

1. [console.firebase.google.com](https://console.firebase.google.com) → Adicionar projeto → nome sugerido: `stn-leads`
2. Não precisa do Google Analytics, pode desligar na criação
3. Plano **Spark (gratuito)** é suficiente — não precisa de Blaze pra isso

## 2. Ativar Authentication

1. No menu lateral: **Build > Authentication** → Get started
2. Aba "Sign-in method" → ativa **E-mail/senha**
3. Aba "Users" → **Add user** → cria SEU login (o único que vai existir, já que é só você usando)

## 3. Ativar Firestore

1. **Build > Firestore Database** → Create database
2. Modo de produção (não "test mode")
3. Localização: `southamerica-east1` (São Paulo) — mais rápido pro Brasil

### Regras de segurança

Em **Firestore > Regras**, cola isto e publica:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /leads/{leadId} {
      allow read, write: if request.auth != null;
    }
  }
}
```

Isso garante que só quem estiver logado (você) lê/escreve — sem login, zero acesso.

## 4. Pegar o config do app

1. **Configurações do projeto** (ícone de engrenagem) → geral
2. Em "Seus apps", clica no ícone `</>` (Web) → registra um app (nome: "leads-web")
3. Copia o objeto `firebaseConfig` que aparece
4. Cola dentro de `firebase-config.js`, substituindo os placeholders

## 5. Testar localmente

Não dá pra abrir o `index.html` direto no navegador (módulos ES + PWA
exigem servidor). Formas rápidas de servir localmente:

```bash
npx serve .
```
ou, se tiver Python:
```bash
python3 -m http.server 8080
```

Abre `http://localhost:8080`, loga com o usuário criado no passo 2.

## 6. Deploy

Mais simples: **Vercel** (mesmo fluxo que você já usa no site principal) —
é só um site estático, sem build step nenhum.

1. Sobe essa pasta num repositório GitHub novo (ex: `stn-leads`)
2. No Vercel: New Project → importa o repo → Framework Preset: **Other** → Deploy

Alternativa: **Firebase Hosting**, já que o projeto já é Firebase:
```bash
npm install -g firebase-tools
firebase login
firebase init hosting
firebase deploy
```

## 7. Instalar como app

No celular (Chrome/Safari), abre a URL do deploy → menu do navegador →
"Adicionar à tela inicial" / "Instalar app". No computador, o Chrome mostra
um ícone de instalação na barra de endereço.

## Estrutura de dados (Firestore, coleção `leads`)

| Campo | Tipo | Descrição |
|---|---|---|
| `nome` | string | Nome/referência do lead |
| `instagramHandle` | string | @ sem o arroba |
| `status` | string | `contatado` \| `respondeu` \| `conversa` \| `fechado` \| `perdido` |
| `mensagemUsada` | string | Qual abordagem/template foi usado |
| `tipoResposta` | string | `interessado` \| `pediu_info` \| `nao_interessado` \| `sem_resposta` |
| `dataContato` | string (YYYY-MM-DD) | Preenchido automaticamente na criação |
| `proximaAcao` | string (YYYY-MM-DD) \| null | Data de follow-up |
| `notas` | string | Texto livre |
| `createdAt` / `updatedAt` | Timestamp | Gerados pelo servidor |

## Próximos passos possíveis (não implementados agora, de propósito)

- Vincular ao webhook de auto-DM do Instagram que você já tem, pra criar o
  lead automaticamente quando alguém responde
- Exportar pra CSV
- Lembrete/notificação quando "próxima ação" vence
