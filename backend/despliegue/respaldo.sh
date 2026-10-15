#!/bin/sh
# Respaldo de la base de datos y de los videos/fotogramas privados. Conserva 7 días.
# Uso: despliegue/respaldo.sh   (instalar.sh lo programa a diario a las 3:00)
set -eu
cd "$(dirname "$0")/.."

DESTINO=${AULA360_RESPALDOS:-$HOME/respaldos-aula360}
FECHA=$(date +%Y%m%d-%H%M)
mkdir -p "$DESTINO"

docker compose exec -T db pg_dump -U aula -d aulaglobal360 -Fc > "$DESTINO/bd-$FECHA.dump"
docker compose exec -T web tar czf - -C /app/privado . > "$DESTINO/privado-$FECHA.tgz"

find "$DESTINO" -name 'bd-*.dump' -mtime +7 -delete
find "$DESTINO" -name 'privado-*.tgz' -mtime +7 -delete
echo "Respaldo listo en $DESTINO ($FECHA)"
