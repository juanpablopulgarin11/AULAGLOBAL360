#!/bin/bash
# Instala AULA GLOBAL 360 en un servidor Ubuntu nuevo (pensado para Oracle Cloud Always Free, ARM).
# Uso, desde backend/:   ./despliegue/instalar.sh
# Dominio propio (opcional): DOMINIO=aula.midominio.com ./despliegue/instalar.sh
# Se puede volver a ejecutar: no sobrescribe un .env existente.
set -euo pipefail
cd "$(dirname "$0")/.."

ram_gb=$(awk '/MemTotal/ {printf "%d", $2/1024/1024}' /proc/meminfo)
if [ "$ram_gb" -lt 4 ]; then
    echo "Este servidor tiene ${ram_gb} GB de RAM; MediaPipe y PostgreSQL necesitan al menos 4 GB."
    echo "En Oracle usa la forma VM.Standard.A1.Flex (ARM) con 4 OCPU y 24 GB."
    exit 1
fi

echo "== 1/5 Docker"
if ! command -v docker >/dev/null; then
    curl -fsSL https://get.docker.com | sudo sh
fi
sudo usermod -aG docker "$USER"
DOCKER="sudo docker"

echo "== 2/5 Cortafuegos del sistema (puertos 80 y 443)"
# Las imágenes Ubuntu de Oracle traen iptables cerrado salvo SSH.
if ! sudo iptables -C INPUT -p tcp -m multiport --dports 80,443 -j ACCEPT 2>/dev/null; then
    sudo iptables -I INPUT 1 -p tcp -m multiport --dports 80,443 -j ACCEPT
fi
if command -v netfilter-persistent >/dev/null; then
    sudo netfilter-persistent save
fi

echo "== 3/5 Configuración (.env)"
if [ ! -f .env ]; then
    if [ -z "${DOMINIO:-}" ]; then
        ip=$(curl -fsS https://api.ipify.org)
        DOMINIO="${ip//./-}.sslip.io"      # dominio gratuito que apunta a la IP pública
    fi
    aleatorio() { tr -dc 'A-Za-z0-9' </dev/urandom | head -c "$1"; }
    cat > .env <<EOF
COMPOSE_FILE=docker-compose.yml:docker-compose.oracle.yml
DOMINIO=$DOMINIO
DJANGO_SETTINGS_MODULE=config.settings.prod
DJANGO_SECRET_KEY=$(aleatorio 60)
DJANGO_ALLOWED_HOSTS=$DOMINIO
DJANGO_CSRF_TRUSTED_ORIGINS=https://$DOMINIO
POSTGRES_PASSWORD=$(aleatorio 32)
AULA360_POSE_GPU=false
# GEMINI_API_KEY=
EOF
    chmod 600 .env
    echo "Creado .env para https://$DOMINIO"
else
    echo ".env ya existe; se conserva."
fi
DOMINIO=$(grep '^DOMINIO=' .env | cut -d= -f2)

echo "== 4/5 Construir e iniciar (la primera vez tarda varios minutos)"
$DOCKER compose up --build -d

echo "== 5/5 Respaldo diario a las 3:00"
# Crontab del usuario: cron le aplica el grupo docker asignado arriba.
tarea="0 3 * * * /bin/sh $(pwd)/despliegue/respaldo.sh >> \$HOME/respaldos-aula360.log 2>&1"
( crontab -l 2>/dev/null | grep -v 'despliegue/respaldo.sh' || true; echo "$tarea" ) | crontab -

cat <<EOF

Listo. Abre https://$DOMINIO (el certificado puede tardar un minuto).
Crea tu usuario administrador con:
  sudo docker compose exec web python manage.py createsuperuser
EOF
