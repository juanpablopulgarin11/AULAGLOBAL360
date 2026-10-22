# Manual de Usuario Oficial: Aula Global 360 🏃‍♂️✨

**Plataforma Web de Inteligencia Biomecánica y Curricular para la Educación Física Escolar**  
*Enlace Oficial en la Nube:* [https://aulaglobal360-528391102571.us-central1.run.app](https://aulaglobal360-528391102571.us-central1.run.app)

---

## 1. Introducción y Propósito
**Aula Global 360** es una plataforma tecnológica integral diseñada para docentes de Educación Física en preescolar y básica primaria (estudiantes de 5 a 11 años). Su propósito central es transformar la evaluación tradicional en un proceso ágil, científico y pedagógicamente aplicable:

1. **Diagnóstico Biomecánico Computarizado:** Analiza videos y fotos de los estudiantes mediante visión artificial (MediaPipe / OpenCV) basándose en la batería validada de *González Palacio & Montoya Grisales* y en los estadios de desarrollo motor de *David L. Gallahue* (Inicial, Elemental y Maduro).
2. **Generación Automática de Unidades Didácticas:** Convierte los fallos motrices detectados en planeaciones pedagógicas personalizadas listas para la clase.
3. **Exportación a Documentos Word (.docx):** Entrega reportes individuales para padres e historial escolar, así como planeaciones curriculares completas con distribución espacial y guion docente.

---

## 2. Acceso y Gestión de Cuentas

### 2.1. Ingreso a la Plataforma (Landing Page)
Al ingresar al enlace oficial [https://aulaglobal360-528391102571.us-central1.run.app](https://aulaglobal360-528391102571.us-central1.run.app), encontrarás la página de presentación que resume la tecnología, la batería validada y los módulos del sistema.

- **Botón "Dashboard":** En la esquina superior derecha o en el centro de la pantalla, te conduce al entorno de trabajo docente.

### 2.2. Registro de Docente
Cualquier docente puede crear su cuenta de forma libre y gratuita:
- **Enlace de Registro:** [https://aulaglobal360-528391102571.us-central1.run.app/cuentas/registro/](https://aulaglobal360-528391102571.us-central1.run.app/cuentas/registro/)
- **Campos requeridos:**
  - *Nombre de usuario* (ej: `jorge_perez`)
  - *Nombres y Apellidos*
  - *Correo electrónico*
  - *Contraseña segura* (mínimo 8 caracteres)
- Al presionar **"Crear cuenta"**, la sesión se inicia automáticamente y el sistema te dirige a tu panel principal.

### 2.3. Inicio de Sesión
Para visitas posteriores, puedes ingresar directamente con tus credenciales:
- **Enlace de Inicio de Sesión:** [https://aulaglobal360-528391102571.us-central1.run.app/cuentas/ingresar/](https://aulaglobal360-528391102571.us-central1.run.app/cuentas/ingresar/)

---

## 3. La Barra de Navegación del Docente

En la parte superior de la pantalla de trabajo docente encontrarás las cuatro secciones principales:

| Botón | Sección | Función Principal |
| :--- | :--- | :--- |
| **`Evaluar`** | Módulo de Diagnóstico | Centro de análisis biomecánico por video o fotografía (individual o colectivo). |
| **`Historial`** | Registro de Evaluaciones | Listado cronológico de evaluaciones realizadas, estadios alcanzados y reportes guardados. |
| **`Salones`** | Gestión de Grupos | Administración de grupos escolares (grados), carga de estudiantes y control de consentimientos informados. |
| **`Planeaciones`** | Unidades Didácticas | Banco de planeaciones generadas, editor de sesiones, montaje 3D del espacio y descarga en Word. |

Adicionalmente, en el centro de la barra superior encontrarás el **Selector de Motor de Análisis** (Análisis rápido local vs. Análisis detallado con IA) y el botón **Configurar clase** en el extremo derecho.

---

## 4. Configuración de Clase (Panel Lateral Drawer)

Antes de iniciar una evaluación, es fundamental definir el contexto pedagógico haciendo clic en el botón **"Configurar clase"** (icono de engranaje en la esquina superior derecha). La inteligencia artificial utilizará estos datos para adaptar la planeación a tus necesidades reales:

1. **Grado y Edad:** Desde 5 años (Transición) hasta 11 años (5º grado). La batería compara el movimiento contra el patrón maduro correspondiente a la edad.
2. **Formato Didáctico:**
   - *Cuento Motor:* Genera una narración lúdica de aventuras para los más pequeños.
   - *Circuito de Estaciones:* Organiza la cancha por postas con retos rotativos.
   - *Retos Cooperativos:* Desafíos grupales donde el éxito depende del trabajo en equipo.
   - *Juego Libre Dirigido:* Actividades con pautas flexibles orientadas al descubrimiento.
3. **Metodología Pedagógica:**
   - *Descubrimiento Guiado:* El guion docente formula preguntas para que el niño descubra la técnica adecuada.
   - *Resolución de Problemas:* Plantea situaciones problema que exigen ajuste corporal.
   - *Asignación de Tareas / Mando Directo:* Instrucciones claras y estructuradas paso a paso.
4. **Tiempos y Frecuencia:** Define la duración de la clase (ej: 45 o 60 minutos), el período académico y las clases programadas. El sistema divide los tiempos con precisión (Calentamiento, Parte Central, Vuelta a la calma).
5. **Filtro de Materiales Disponibles:** Marca únicamente los recursos que tienes en tu colegio (aros, conos, balones, cuerdas, colchonetas). **La IA nunca sugerirá materiales que hayas desmarcado.**
6. **Modo de Evaluación:**
   - *Individual (un estudiante):* Análisis minucioso e individualizado.
   - *Colectivo (salón completo):* Flujo secuencial para evaluar a todo el grupo y generar un plan consolidado para el salón.
7. **Selector de Motor (IA):**
   - *Análisis rápido (motor local):* Rápido, procesado directamente en el servidor, no consume créditos de API.
   - *Análisis detallado (con Google Gemini):* Diagnóstico biomecánico profundo y enriquecido mediante visión de inteligencia artificial.

---

## 5. Proceso de Evaluación Paso a Paso

El flujo de evaluación consta de sencillos pasos guiados:

### Paso 1: Selección de Habilidad Motriz Básica (HMB)
- Puedes dejar seleccionada la opción **"Detección automática"** para que el algoritmo identifique el movimiento por sí mismo.
- O seleccionar directamente la habilidad que vas a calificar entre las tres categorías fundamentales:
  - **Locomoción:** Carrera, Salto horizontal, Salto vertical, Galope, Marcha.
  - **Manipulación:** Lanzamiento sobre hombro, Atrapar, Patear, Bateo/Golpeo.
  - **Estabilidad:** Equilibrio dinámico, Equilibrio estático.

### Paso 2: Guía de Grabación y Subida de Video
- Haz clic en **"Ver guía de grabación"** para verificar las condiciones óptimas:
  - *Duración ideal:* 3 a 5 segundos (iniciar 1 segundo antes del movimiento y terminar 1 segundo después).
  - *Distancia y Encuadre:* Cuerpo completo visible de pies a cabeza (a 3 o 4 metros de distancia).
  - *Ángulo recomendado:* **Perfil** (plano lateral) para saltos y carreras; **Frente** (plano frontal) para lanzamientos, atrapar y equilibrios.
- Sube el archivo haciendo clic en el recuadro o arrastrándolo desde tu galería o explorador.
- *(Opcional)* Agrega **observaciones del docente** (ej: *"El estudiante reporta molestia en rodilla derecha"*, *"Calzado suelto"*).

### Paso 3: Extracción de Fotogramas Clave
- El motor procesará el video y extraerá de 6 a 8 fotogramas representativos donde se observa el esqueleto biomecánico (líneas y puntos anatómicos de hombros, cadera, rodillas y tobillos).
- Espera a que los fotogramas se desplieguen en pantalla y presiona el botón verde **"Analizar movimiento"**.

### Paso 4: Resultados y Diagnóstico
En cuestión de segundos, la pantalla te presentará:
- **Puntaje y Nivel de Madurez:** Porcentaje global alcanzado sobre 100%.
- **Estadio de Desarrollo Motor (Gallahue):** Clasificación en *Inicial*, *Elemental* o *Maduro*.
- **Desglose de Criterios Biomecánicos:** Tabla detallada de cada criterio evaluado (ángulo de despegue, balanceo de brazos, flexión de rodillas, apoyo del pie) con indicación de superado o por mejorar.

---

## 6. Módulo de Salones y Grupos Escolares

En la pestaña **`Salones`**:
1. **Crear Grupos:** Registra tus grados escolares (ej: *Grado 1A*, *Grado 3B*).
2. **Registro de Estudiantes:** Ingresa a los estudiantes de cada grado con su fecha de nacimiento y género.
3. **Gestión de Consentimientos (Ley 1581 de Datos):** Marca el estado del consentimiento de los padres o acudientes para el registro de imágenes y video con fines estrictamente académicos.
4. **Evaluación Grupal Consolidada:** Al evaluar a los estudiantes de un mismo salón, el sistema calcula la matriz de deficiencias colectivas y elabora una **planeación grupal unificada** enfocada en los errores más frecuentes del salón.

---

## 7. Módulo de Historial y Seguimiento

En la pestaña **`Historial`**:
- Consulta la lista completa de evaluaciones históricas de tu colegio.
- Filtra por estudiante, salón, fecha o habilidad evaluada.
- Accede nuevamente al reporte, los fotogramas capturados y la evolución motriz del estudiante a lo largo del año escolar.

---

## 8. Módulo de Planeaciones y Exportación a Word (.docx)

En la pestaña **`Planeaciones`** o directamente desde el resultado de una evaluación:
- Podrás visualizar la **Unidad Didáctica** completa dividida en sesiones de clase.
- **Edición en vivo:** Puedes modificar los ejercicios, objetivos y consignas de cada sesión.
- **Montaje 3D de la Cancha:** Visualiza la distribución espacial recomendada para la clase con conos, estaciones y áreas de seguridad.

### Descargas en Microsoft Word (.docx):
Haciendo clic en los botones de exportación podrás obtener archivos editables e imprimibles:
- 📄 **Descargar Reporte Biomecánico:** Formato institucional con los datos del alumno, gráficos, tabla de criterios y espacio para firma del docente de Educación Física.
- 📘 **Descargar Planeación Docente:** Planeación curricular completa lista para anexar a tu plan de aula institucional, incluyendo objetivos de aprendizaje, guion pedagógico *"El Lenguaje del Profe"*, pautas de prevención de accidentes y adaptaciones para inclusión (DUA).

---

## 9. Recomendaciones Finales para el Docente
- **Uso en Dispositivos Móviles:** La plataforma funciona de forma óptima en teléfonos inteligentes y tabletas. Puedes llevar tu dispositivo a la cancha deportiva, grabar al estudiante directamente y obtener el diagnóstico en el mismo momento de la clase.
- **Iluminación:** Se recomienda grabar en espacios abiertos o con buena luz natural, evitando contraluces fuertes para facilitar la detección precisa de las articulaciones.
- **Seguridad:** Los videos procesados son privados y de acceso restringido exclusivamente para el docente titular de la cuenta.
