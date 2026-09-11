import cv2
import mediapipe as mp
import numpy as np
import time

mp_pose = mp.solutions.pose
pose = mp_pose.Pose(min_detection_confidence=0.7, min_tracking_confidence=0.7)

def calcular_angulo(p1, p2, p3):
    a, b, c = np.array(p1), np.array(p2), np.array(p3)
    rad = np.arctan2(c-b, c-b) - np.arctan2(a-b, a-b)
    ang = np.abs(rad * 180.0 / np.pi)
    return 360.0 - ang if ang > 180.0 else ang

def calcular_inclinacion_horizontal(p1, p2):
    """Calcula el ángulo de una línea respecto a la horizontal (ej. hombro a hombro)."""
    delta_x = p2[0] - p1[0]
    delta_y = p2[1] - p1[1]
    angulo = np.arctan2(delta_y, delta_x) * 180.0 / np.pi
    return np.abs(angulo) # 0 grados significa perfectamente nivelado

estado_equilibrio = "BIPEDESTACIÓN"
tiempo_inicio = 0
tiempo_total = 0

cap = cv2.VideoCapture(0)

while cap.isOpened():
    ret, frame = cap.read()
    if not ret: break

    frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    results = pose.process(frame_rgb)

    if results.pose_landmarks:
        lm = results.pose_landmarks.landmark
        
        # Puntos clave (Hombros, Caderas, Rodillas, Tobillos)
        hombro_izq = [lm[mp_pose.PoseLandmark.LEFT_SHOULDER].x, lm[mp_pose.PoseLandmark.LEFT_SHOULDER].y]
        hombro_der = [lm[mp_pose.PoseLandmark.RIGHT_SHOULDER].x, lm[mp_pose.PoseLandmark.RIGHT_SHOULDER].y]
        
        cadera_izq  = [lm[mp_pose.PoseLandmark.LEFT_HIP].x, lm[mp_pose.PoseLandmark.LEFT_HIP].y]
        cadera_der  = [lm[mp_pose.PoseLandmark.RIGHT_HIP].x, lm[mp_pose.PoseLandmark.RIGHT_HIP].y]
        
        rodilla_der = [lm[mp_pose.PoseLandmark.RIGHT_KNEE].x, lm[mp_pose.PoseLandmark.RIGHT_KNEE].y]
        tobillo_der = [lm[mp_pose.PoseLandmark.RIGHT_ANKLE].x, lm[mp_pose.PoseLandmark.RIGHT_ANKLE].y]
        
        rodilla_izq = [lm[mp_pose.PoseLandmark.LEFT_KNEE].x, lm[mp_pose.PoseLandmark.LEFT_KNEE].y]
        tobillo_izq = [lm[mp_pose.PoseLandmark.LEFT_ANKLE].x, lm[mp_pose.PoseLandmark.LEFT_ANKLE].y]

        # --- Métricas Biomecánicas ---
        # 1. Ángulo de la rodilla de apoyo (ejemplo: evaluando pierna derecha como apoyo)
        ang_rodilla_apoyo = calcular_angulo(cadera_der, rodilla_der, tobillo_der)
        
        # 2. Desalineación o balanceo (Inclinación de la línea de los hombros y caderas)
        balanceo_hombros = calcular_inclinacion_horizontal(hombro_der, hombro_izq)
        balanceo_caderas = calcular_inclinacion_horizontal(cadera_der, cadera_izq)
        
        # 3. Detectar si el pie izquierdo se levantó (Evaluamos la altura relativa de los tobillos)
        # En MediaPipe, un valor menor de 'y' significa que está más arriba en la pantalla.
        pie_izq_elevado = tobillo_izq[1] < (tobillo_der[1] - 0.04) # Umbral de tolerancia de elevación

        # --- MÁQUINA DE ESTADOS PARA EQUILIBRIO ---
        
        if estado_equilibrio == "BIPEDESTACIÓN":
            if pie_izq_elevado and ang_rodilla_apoyo > 165:
                estado_equilibrio = "ESTABILIZANDO"
                tiempo_inicio = time.time() # Iniciar conteo

        elif estado_equilibrio == "ESTABILIZANDO":
            # Si logra quedarse quieto (balanceo bajo) por más de 1 segundo, pasa a mantenimiento
            if balanceo_hombros < 6.0 and balanceo_caderas < 6.0:
                if (time.time() - tiempo_inicio) > 1.0:
                    estado_equilibrio = "MANTENIMIENTO ESTÁTICO"

        elif estado_equilibrio == "MANTENIMIENTO ESTÁTICO":
            # Calcular tiempo acumulado en equilibrio
            tiempo_total = time.time() - tiempo_inicio
            
            # CRITERIOS DE FALLO (Pérdida de equilibrio):
            # Si el pie vuelve a tocar el suelo O si hay un balanceo lateral exagerado (compensación mecánica)
            if not pie_izq_elevado or balanceo_hombros > 15.0 or balanceo_caderas > 12.0 or ang_rodilla_apoyo < 150:
                estado_equilibrio = "PÉRDIDA DE EQUILIBRIO"
                print(f"Prueba terminada. Tiempo logrado: {round(tiempo_total, 2)} segundos.")

        elif estado_equilibrio == "PÉRDIDA DE EQUILIBRIO":
            # Resetear al apoyar ambos pies de forma estable
            if not pie_izq_elevado and balanceo_hombros < 5.0:
                estado_equilibrio = "BIPEDESTACIÓN"
                tiempo_total = 0

        # --- Renderizar Interfaz ---
        color_texto = (0, 255, 0) if estado_equilibrio == "MANTENIMIENTO ESTÁTICO" else (0, 0, 255)
        cv2.putText(frame, f"Estado: {estado_equilibrio}", (30, 45), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color_texto, 2)
        cv2.putText(frame, f"Tiempo: {round(tiempo_total, 1)}s", (30, 85), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255, 255, 255), 2)
        cv2.putText(frame, f"Oscilacion Hombros: {int(balanceo_hombros)} deg", (30, 120), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)

    cv2.imshow("Test de Equilibrio Unipodal", frame)
    if cv2.waitKey(1) & 0xFF == ord('q'): break

cap.release()
cv2.destroyAllWindows()