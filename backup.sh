#!/bin/bash
# Backup dos bancos e uploads do RaelFlow

TIMESTAMP=$(date +%F_%H%M)
BACKUP_DIR="./backup/$TIMESTAMP"
mkdir -p "$BACKUP_DIR"

echo "Fazendo backup do banco Akaunting..."
docker exec raelflow_akaunting_db mysqldump -uakaunting -p"$MYSQL_PASSWORD" akaunting > "$BACKUP_DIR/akaunting.sql"

echo "Fazendo backup do banco Firefly..."
docker exec raelflow_firefly_db mysqldump -ufirefly -p"$MYSQL_PASSWORD" firefly > "$BACKUP_DIR/firefly.sql"

echo "Fazendo backup do banco OpenProject..."
docker exec raelflow_openproject_db pg_dump -U openproject openproject > "$BACKUP_DIR/openproject.sql"

echo "Compactando uploads e assets..."
tar czf "$BACKUP_DIR/uploads_assets.tar.gz" data/akaunting/uploads data/firefly/upload data/openproject/assets

echo "Backup concluído em $BACKUP_DIR"
