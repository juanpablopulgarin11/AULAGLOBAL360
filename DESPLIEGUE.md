# Despliegue de AULA GLOBAL 360 en Oracle Cloud (gratis)

Guía para quien administre el servidor. Explica qué se va a desplegar, por qué en Oracle Cloud, qué ya está probado y cómo instalarlo, operarlo y respaldarlo.

**Estado (14 oct 2026):** la configuración está lista y probada en Docker local. Falta crear el servidor en Oracle y ejecutar la instalación (secciones 4 a 7).

---

## 1. Qué se despliega

AULA GLOBAL 360 evalúa las Habilidades Motrices Básicas de niños de 5 a 11 años a partir de un video o una foto, y genera planeaciones de clase en Word. Lo usan docentes de educación física.

El repositorio tiene dos versiones:

| Versión | Dónde está | Qué es | ¿Se despliega aquí? |
|---|---|---|---|
| **Django (completa)** | [`backend/`](backend/README.md) | El servidor analiza el video (OpenCV + MediaPipe) y guarda docentes, salones, estudiantes, evaluaciones e historial. Exporta `.docx`. | **Sí** |
| Estática (original) | `index.html` + `script.js` | Todo corre en el navegador, sin cuentas ni datos guardados. Se sirve hoy en GitHub Pages. | No (ver sección 11) |

Arquitectura del despliegue: seis contenedores en un solo servidor, definidos en `backend/docker-compose.yml` más `backend/docker-compose.oracle.yml`.

```
Internet ──443/80──► caddy ──► web (gunicorn, Django) ──► db (PostgreSQL 17)
                    (HTTPS)        │                  └─► redis
                                   └── encola ──► worker (Celery: análisis de video, Gemini)
                                                  beat   (Celery: purga diaria de videos vencidos)
```

| Servicio | Imagen | Función | Persistencia |
|---|---|---|---|
| `caddy` | `caddy:2.10-alpine` | HTTPS automático con Let's Encrypt; único servicio expuesto (puertos 80 y 443) | volumen `caddy_data` (certificados) |
| `web` | se construye desde `backend/Dockerfile` | Django + gunicorn (3 workers). Al arrancar migra la BD, sincroniza el catálogo y descarga el modelo de pose | volúmenes `privado` y `modelos` |
| `worker` | la misma | Celery (2 procesos): procesa videos y fotos con MediaPipe en CPU | ídem |
| `beat` | la misma | Celery beat: borra a diario los videos vencidos | — |
| `db` | `postgres:17` | Base de datos | volumen `pgdata` |
| `redis` | `redis:7-alpine` | Cola de Celery | — |

Todos tienen `restart: unless-stopped`, así que vuelven a levantarse solos tras un reinicio del servidor.

---

## 2. Por qué Oracle Cloud Always Free

Se buscaba una opción **gratis**, en la que **no se pierdan los datos** y que **no sea demasiado limitada**. Se evaluaron estas:

| Opción | Resultado |
|---|---|
| GitHub Pages / Netlify | Solo sirven la versión estática. No hay base de datos ni análisis en servidor. |
| Hugging Face Spaces | Tiene CPU y RAM suficientes, pero el disco se borra con cada reinicio y se pierden los datos. |
| Render / Koyeb (gratis) | Solo 512 MB de RAM: MediaPipe y OpenCV no caben. Además se apagan cuando no se usan. |
| PythonAnywhere (gratis) | 512 MB de disco y las librerías ocupan **747 MB** (medido). Además, 100 s de CPU al día y sin tareas programadas. El plan de 10 USD/mes sí serviría. |
| Google Cloud Run | Pide tarjeta, exige una base de datos externa y obliga a correr Celery de forma síncrona. |
| **Oracle Cloud Always Free** | **Elegida.** Una VM ARM de 4 OCPU y 24 GB de RAM, con hasta 200 GB de disco, gratis de forma permanente. Corre el docker-compose sin cambios y los datos persisten. |

---

## 3. Qué ya está probado

Pruebas hechas en Docker local (Linux x86_64) con la configuración exacta de producción, Caddy incluido:

| Prueba | Resultado |
|---|---|
| Primer arranque: migraciones, catálogo (9 habilidades, 45 criterios, 36 plantillas) y descarga del modelo | OK |
| HTTPS; HTTP redirige con 308 a HTTPS | OK |
| Registro de docente e inicio de sesión (CSRF detrás del proxy) | OK |
| Evaluación de una foto en `/evaluar/` → Celery con MediaPipe en CPU | OK, 0,7 s. Resultado "Estadio Maduro, 80/100" |
| `docker compose down` + `up`: los datos persisten | OK |
| Respaldo (`despliegue/respaldo.sh`): el dump contiene las 22 tablas | OK. La restauración no se probó |
| Construir la imagen para **ARM64** (la arquitectura de Oracle), emulando ARM | OK. MediaPipe detecta los 33 puntos con los mismos ángulos que en x86 |

**Pendiente:** confirmar todo en el servidor ARM real (sección 6, último paso) y probar con un video, no solo con una foto.

Cambios que se hicieron en el repositorio para este despliegue:
- `backend/Dockerfile` instala las versiones probadas de `requirements/lock.txt`. Sin eso, `pip` habría instalado MediaPipe 1.1.1 en lugar de la 1.0.1 probada, y los resultados pueden cambiar entre versiones.
- Nuevos: `backend/docker-compose.oracle.yml`, `backend/despliegue/Caddyfile`, `backend/despliegue/instalar.sh` y `backend/despliegue/respaldo.sh`.
- `.gitattributes` obliga a usar finales de línea LF en los `.sh`, para que no se rompan si alguien edita desde Windows.

---

## 4. Crear la cuenta de Oracle

1. Regístrate en <https://www.oracle.com/cloud/free/>. Piden una tarjeta solo para verificar la identidad; el plan Always Free no cobra.
2. **Región de origen:** no se puede cambiar después. Elige una cercana con capacidad ARM, por ejemplo *Colombia Central (Bogotá)* o *Brazil East (São Paulo)*.
3. **Muy recomendado:** en *Billing → Upgrade and Manage Payment*, pasa la cuenta a **Pay As You Go**. Sigue sin costo mientras uses solo recursos Always Free, y evita dos problemas:
   - Oracle **recupera instancias Always Free inactivas**: si durante 7 días el uso de CPU, red y memoria está por debajo del 20 %, puede apagarlas. Con poco uso de prueba, eso puede pasar. En las cuentas Pay As You Go no aplica.
   - Hay más probabilidad de conseguir capacidad ARM.
4. Crea una alerta de presupuesto en *Billing → Budgets* (por ejemplo, de 1 USD) para enterarte si algo empieza a cobrar.

## 5. Crear el servidor y abrir puertos

**Instancia:** *Compute → Instances → Create instance*

| Campo | Valor |
|---|---|
| Image | **Canonical Ubuntu 24.04** (al elegir la forma ARM se usa la variante aarch64) |
| Shape | *Ampere* → **VM.Standard.A1.Flex**, **4 OCPU** y **24 GB** de RAM |
| Networking | VCN nueva con subred pública; marcar **Assign a public IPv4 address** |
| SSH keys | **Generate a key pair**: descarga la clave privada y guárdala bien |
| Boot volume | 100 GB (gratis hasta 200 GB en total) |

Si aparece *Out of host capacity*, prueba otro *Availability domain* o reintenta más tarde.

Anota la **IP pública**.

**Puertos:** *Networking → Virtual cloud networks →* (tu VCN) *→ Subnets →* (subred pública) *→ Default Security List → Add Ingress Rules*

| Source CIDR | IP Protocol | Destination port range |
|---|---|---|
| `0.0.0.0/0` | TCP | `80` |
| `0.0.0.0/0` | TCP | `443` |

El puerto 22 (SSH) ya viene abierto. No abras el 8000.

## 6. Instalar

```bash
ssh -i /ruta/ssh-key.key ubuntu@IP_PUBLICA
```

En el servidor:

```bash
git clone https://github.com/juanpablopulgarin11/AULAGLOBAL360.git
cd AULAGLOBAL360/backend
bash despliegue/instalar.sh
```

`instalar.sh` hace lo siguiente. Se puede volver a ejecutar sin problema.
1. Comprueba que el servidor tenga al menos 4 GB de RAM.
2. Instala Docker con `get.docker.com` y agrega al usuario al grupo `docker`.
3. Abre los puertos 80 y 443 en el iptables del sistema (Ubuntu de Oracle los trae cerrados aunque la Security List esté abierta) y guarda las reglas con `netfilter-persistent`.
4. Genera `backend/.env` con un `DJANGO_SECRET_KEY` y una contraseña de PostgreSQL aleatorios. Si el archivo ya existe, no lo toca.
5. Ejecuta `docker compose up --build -d`. La primera vez tarda unos 10 minutos.
6. Programa en el crontab del usuario el respaldo diario a las 3:00.

**Dominio:** por defecto usa `IP-CON-GUIONES.sslip.io` (por ejemplo `129-146-10-20.sslip.io`), un DNS gratuito que resuelve a la IP, así que no hace falta comprar dominio. Si hay un dominio propio, crea un registro A hacia la IP y ejecuta `DOMINIO=aula.midominio.com bash despliegue/instalar.sh`.

**Después de instalar:**

```bash
sudo docker compose ps                                        # 6 servicios en estado Up
sudo docker compose exec web python manage.py createsuperuser # administrador de Django (/admin/)
```

**Verificación final (pendiente):** entra a `https://DOMINIO`, registra un docente en `/cuentas/registro/`, ve a `/evaluar/` y sube una foto y luego un video corto (3 a 5 s) de una persona. Debe aparecer el resultado con estadio y porcentaje. Si falla, revisa `sudo docker compose logs --tail 100 worker`.

## 7. Configuración (`backend/.env`)

`instalar.sh` lo genera con permisos `600`. Contiene secretos: no lo subas al repositorio (ya está en `.gitignore`).

| Variable | Valor generado | Notas |
|---|---|---|
| `COMPOSE_FILE` | `docker-compose.yml:docker-compose.oracle.yml` | Gracias a esta variable, `docker compose` usa los dos archivos sin pasar `-f` |
| `DOMINIO` | `x-x-x-x.sslip.io` | Lo usa Caddy |
| `DJANGO_SETTINGS_MODULE` | `config.settings.prod` | |
| `DJANGO_SECRET_KEY` | aleatorio (60 caracteres) | No cambiarlo: cierra todas las sesiones |
| `DJANGO_ALLOWED_HOSTS` / `DJANGO_CSRF_TRUSTED_ORIGINS` | el dominio / `https://dominio` | Si cambias de dominio, actualiza las tres variables del dominio |
| `POSTGRES_PASSWORD` | aleatoria (32 caracteres) | **No cambiarla** después del primer arranque: la base ya quedó creada con ella |
| `AULA360_POSE_GPU` | `false` | El servidor no tiene GPU |
| `GEMINI_API_KEY` | vacía | Opcional (IA en la nube). Sin clave se usa el motor local |

Otras variables opcionales están documentadas en [backend/README.md](backend/README.md#configuración-variables-de-entorno), por ejemplo `AULA360_DIAS_RETENCION_VIDEO` (30) y `AULA360_MAX_SUBIDA_MB` (60).

Después de editar `.env`, aplica los cambios con `sudo docker compose up -d`.

## 8. Operación

Todos los comandos se ejecutan en `~/AULAGLOBAL360/backend`.

| Tarea | Comando |
|---|---|
| Estado | `sudo docker compose ps` |
| Logs | `sudo docker compose logs --tail 100 web worker caddy` |
| Actualizar a la última versión de `main` | `git pull && sudo docker compose up --build -d` |
| Reiniciar todo | `sudo docker compose restart` |
| Respaldo manual | `sh despliegue/respaldo.sh` |
| Shell de Django | `sudo docker compose exec web python manage.py shell` |

Las migraciones corren solas al arrancar `web`.

**No ejecutes `docker compose down -v`:** la opción `-v` borra los volúmenes y, con ellos, la base de datos y los videos.

## 9. Respaldos y restauración

Cada día a las 3:00 se guardan en `~/respaldos-aula360/` dos archivos:
- `bd-FECHA.dump`: la base de datos (`pg_dump -Fc`).
- `privado-FECHA.tgz`: los videos y fotogramas.

Se conservan los últimos 7 días. El log queda en `~/respaldos-aula360.log`.

Los respaldos quedan **en el mismo servidor**, así que conviene copiarlos fuera de vez en cuando:

```bash
scp -i /ruta/ssh-key.key -r ubuntu@IP_PUBLICA:respaldos-aula360 .
```

Restaurar (cambia `FECHA`):

```bash
sudo docker compose exec -T db pg_restore -U aula -d aulaglobal360 --clean --if-exists < ~/respaldos-aula360/bd-FECHA.dump
sudo docker compose exec -T web tar xzf - -C /app/privado < ~/respaldos-aula360/privado-FECHA.tgz
```

## 10. Seguridad y privacidad

- **Datos de menores (Ley 1581):** los videos se guardan en almacenamiento privado, solo los ve el docente que los subió y se borran a los 30 días; las métricas se conservan. Los respaldos también contienen videos: guárdalos con el mismo cuidado.
- Solo están abiertos los puertos 22, 80 y 443. Django, PostgreSQL y Redis no se exponen.
- HTTPS obligatorio: HSTS de 30 días y cookies `Secure`.
- Conviene mantener el sistema actualizado: `sudo apt update && sudo apt upgrade` una vez al mes.

## 11. Otros archivos del repositorio

Estos archivos son de la **versión estática** y no intervienen en el despliegue en Oracle:

- `package.json`, `scripts/build.mjs`: `npm start` genera `dist/` (solo los archivos web, sin la carpeta `Data/` de 68 MB) y lo sirve en el puerto 8080.
- `netlify.toml`: por si se quiere publicar la versión estática en Netlify.
- `.github/workflows/deploy-pages.yml`: publica `dist/` en GitHub Pages. **Solo se ejecuta a mano**, porque reemplazaría la demo que GitHub Pages sirve hoy desde la rama.
- `.github/workflows/pruebas.yml`: la CI del backend (pytest, paridad con `script.js` y chequeo de producción). Corre sola en cada push.

## 12. Si algo falla

| Síntoma | Causa probable |
|---|---|
| El sitio no abre (timeout) | Falta la regla de entrada de la sección 5, o un contenedor no está `Up` (`sudo docker compose ps`) |
| Error de certificado | Caddy lo pide en el primer acceso; espera un minuto y revisa `sudo docker compose logs caddy`. Let's Encrypt limita las solicitudes por dominio; si sslip.io llega al límite, usa un dominio propio |
| `Bad Request (400)` | El dominio con el que entras no está en `DJANGO_ALLOWED_HOSTS` |
| `CSRF verification failed` | Falta `https://dominio` en `DJANGO_CSRF_TRUSTED_ORIGINS` |
| La evaluación se queda "procesando" | `sudo docker compose logs worker`: revisa si el worker se cayó o si el video es demasiado largo (el límite es de 5 minutos por tarea) |
| `permission denied` con `docker` sin `sudo` | El grupo `docker` se aplica al volver a entrar por SSH; mientras tanto, usa `sudo` |
| La instancia se apagó sola | Oracle la recuperó por inactividad. Pasa la cuenta a Pay As You Go (sección 4) y restaura desde el respaldo |
