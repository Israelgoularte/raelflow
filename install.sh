#!/usr/bin/env bash
set -e

echo "=== Instalador Raelflow WhatsApp SaaS ==="

if ! command -v node &> /dev/null; then
  echo "Node.js não encontrado. Instale o Node.js (v14+) e tente novamente."
  exit 1
fi

echo "Instalando dependências do backend..."
cd backend
npm install

echo "Instalando dependências do frontend..."
cd ../frontend
npm install

echo "Construindo frontend..."
npm run build

echo "Instalação concluída!"
echo "Para iniciar o backend: cd ../backend && npm start"
echo "Para iniciar o frontend em modo dev: cd frontend && npm start"
