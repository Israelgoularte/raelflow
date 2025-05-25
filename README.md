# RaelFlow

Este repositório contém a configuração Docker Compose e scripts necessários para executar o sistema RaelFlow localmente em Linux (Ubuntu 22.04).

## Estrutura

- `docker-compose.yml` - definição dos serviços
- `Makefile` - comandos auxiliares (`up`, `down`, `logs`)
- `.gitignore` - arquivos/diretórios ignorados pelo Git
- `backup.sh` - script para gerar backups de bancos e assets
- `akaunting.env.example` - template de variáveis de ambiente para Akaunting
- `firefly.env.example` - template para Firefly III
- `microservice/.env.example` - template para o microserviço de Nota Fiscal
- `microservice/Dockerfile` - define a imagem do microserviço de NF-e
- `microservice/app/` - código-fonte inicial do microserviço

## Configuração Inicial

1. Duplicar arquivos `.example` para `.env` e preencher credenciais.
2. `make up` para subir todos os serviços.
3. Configurar cada aplicação via interface web na porta apropriada.

## Backup

Executar `./backup.sh` para criar dumps dos bancos de dados e compactar assets.

## Customização Visual

Inclua seus arquivos de branding em `branding/` e monte nos containers conforme necessidade.
