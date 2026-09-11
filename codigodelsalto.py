import numpy as np

def calcular_angulo(a, b, c):
    # a, b, c son listas o arrays con coordenadas [x, y] de los landmarks
    a = np.array(a) # Ejemplo: Cadera (Landmark 24)
    b = np.array(b) # Ejemplo: Rodilla (Landmark 26)
    c = np.array(c) # Ejemplo: Tobillo (Landmark 28)
    
    radianes = np.arctan2(c[1]-b[1], c[0]-b[0]) - np.arctan2(a[1]-b[1], a[0]-b[0])
    angulo = np.abs(radianes * 180.0 / np.pi)
    
    if angulo > 180.0:
        angulo = 360 - angulo
    return angulo
# Inicialización de variables de estado
estado_salto = "REPOSO"
y_cadera_inicial = None

# ... Dentro de tu bucle de MediaPipe Pose ...
# Extrae las coordenadas de la pierna (ejemplo: lado derecho)
cadera = [landmarks[24].x, landmarks[24].y]
rodilla = [landmarks[26].x, landmarks[26].y]
tobillo = [landmarks[28].x, landmarks[28].y]

angulo_rodilla = calcular_angulo(cadera, rodilla, tobillo)
y_actual_cadera = landmarks[24].y  # En MediaPipe, menor 'y' significa más alto en pantalla

# --- MÁQUINA DE ESTADOS ---

# 1. Detectar inicio del Contramovimiento
if estado_salto == "REPOSO":
    if y_cadera_inicial is None:
        y_cadera_inicial = y_actual_cadera
    
    # Si la rodilla se flexiona significativamente por debajo del estado normal (170°)
    if angulo_rodilla < 140:
        estado_salto = "CONTRAMOVIMIENTO (BAJANDO)"

# 2. Detectar la zona de máxima flexión (Amortiguación)
elif estado_salto == "CONTRAMOVIMIENTO (BAJANDO)":
    if 85 <= angulo_rodilla <= 105:
        print("Ángulo óptimo de flexión detectado:", angulo_rodilla)
    
    # Si la cadera empieza a subir y la rodilla empieza a extenderse
    if angulo_rodilla > 110 and y_actual_cadera < y_cadera_inicial:
        estado_salto = "PROPULSIÓN (SUBIENDO)"

# 3. Detectar la Fase de Vuelo (Despegue efectivo)
elif estado_salto == "PROPULSIÓN (SUBIENDO)":
    # Cuando ocurre la triple extensión en el aire y la cadera supera la altura inicial
    if angulo_rodilla > 170 and y_actual_cadera < (y_cadera_inicial - 0.05): # Ajusta el umbral 0.05 según la distancia de la cámara
        estado_salto = "EN EL AIRE (VUELO)"
        print("¡El atleta está saltando!")

# 4. Detectar la Caída / Aterrizaje
elif estado_salto == "EN EL AIRE (VUELO)":
    # Si la cadera empieza a bajar y la rodilla se flexiona bruscamente para amortiguar
    if y_actual_cadera > y_cadera_inicial and angulo_rodilla < 150:
        estado_salto = "ATERRIZAJE"
        print("Salto completado con éxito.")
        # Reiniciar para el siguiente salto
        estado_salto = "REPOSO"
